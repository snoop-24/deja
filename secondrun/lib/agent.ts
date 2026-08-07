/**
 * The agent loop. One code path, two modes.
 *
 * The only thing that differs between `baseline` and `optimized` is policy —
 * same model, same tool, same corpus, same scoring. That matters: if the two
 * panels differed in more than one variable, the cost gap would not be
 * attributable to the thing we claim causes it.
 *
 * THE RULES THIS FILE OBEYS (see CLAUDE.md):
 *  - Token counts come from the API `usage` field. Never estimated, never
 *    guessed, never produced by the model.
 *  - Dollars come from lib/pricing.ts. This file does no cost arithmetic.
 *  - Scores come from lib/score.ts. No model grades anything, ever.
 *
 * Everything here was learned the hard way during the 6 Aug gap test; the
 * comments record why each guard exists so nobody removes one on demo day.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { searchCorpus, formatHits } from './corpus';
import { costOf, sumCosts, type CostBreakdown } from './pricing';
import { scoreAgainstKey, type AnswerKey, type ScoreResult } from './score';
import { addMessages, flush, searchAgentMemory } from './everos';

export type Mode = 'baseline' | 'optimized';

export interface RunStep {
  /** Plain English, shown in the demo feed. */
  label: string;
  cost: CostBreakdown;
  /** Key facts visible in the evidence retrieved so far. UI progress only. */
  factsConfirmed: string[];
  elapsedMs: number;
}

export interface AgentRun {
  mode: Mode;
  model: string;
  steps: RunStep[];
  finalOutput: string;
  /** Authoritative score: computed from finalOutput alone, via lib/score.ts. */
  score: ScoreResult;
  totalCost: ReturnType<typeof sumCosts>;
  modelCalls: number;
  searchQueries: number;
  elapsedMs: number;
  /**
   * What this run actually consumed of the shared ALLOWANCE. Both modes are
   * given the same budget; this is how much of it each one spent.
   */
  used: {
    searches: number;
    queries: number;
    /** Fraction of the query allowance consumed, 0-1. */
    queryUtilization: number;
  };
  /** True when prior-run memory was recalled and injected. */
  memoryUsed: boolean;
  /** Exactly what memory handed the run. Shown so the saving is inspectable. */
  memoryRecall: string;
}

// --------------------------------------------------------------- limits
//
// Sized for the Groq FREE tier: 6,000 tokens per minute, per model. The Dev
// Tier lifts this 10x, at which point MAX_QUERIES_PER_TURN and MAX_STEPS can
// both rise and the baseline will get MORE expensive, not less — its context
// growth is what these caps are throttling.

const MAX_STEPS = 6;
const TOP_K = 2;
/** Per TURN, not per call: llama will emit a dozen parallel tool_calls at once. */
const MAX_QUERIES_PER_TURN = 2;
/** Enough for a full brief, not enough to run away generating query lists. */
const MAX_OUTPUT_TOKENS = 900;
const TPM_TARGET = 5200;

const AGENT_ID = 'deja-procurement';

/**
 * The allowance BOTH modes are given. Identical for baseline and optimized —
 * that is the point. If the two agents were handed different budgets, the cost
 * gap would prove nothing except that we gave one of them less.
 *
 * Shown on screen so the room can see the two runs were given the same rules
 * and one simply declined to use them up.
 *
 * NOTE for the demo script: agents were measured OBEYING their limits 4/4 on
 * 5 Aug (DESIGN.md 14). The claim is NOT "we stopped it overspending" — that
 * premise was disproven. The claim is "same allowance, a fraction of it used".
 */
export const ALLOWANCE = {
  /** Model calls that may issue searches, before the brief is forced. */
  searches: MAX_STEPS,
  /** Corpus queries available across the whole run. */
  queries: MAX_STEPS * MAX_QUERIES_PER_TURN,
  /** Passages returned per query. */
  passagesPerQuery: TOP_K,
  /** Output token ceiling per model call. */
  outputTokensPerCall: MAX_OUTPUT_TOKENS,
} as const;

// --------------------------------------------------------------- the tool

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_corpus',
      description:
        'Search the procurement document corpus. Accepts a list of queries and ' +
        'returns the best matching passages for each.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' },
            description: `Up to ${MAX_QUERIES_PER_TURN} queries. A limit per turn, not per call.`,
            // Deliberately NOT maxItems: Groq validates tool arguments against
            // the schema and returns a hard 400 when the model overshoots,
            // killing the run instead of letting it recover. Enforced below.
          },
        },
        required: ['queries'],
      },
    },
  },
];

interface QueryBudget {
  remaining: number;
}

function runTool(args: { queries?: string[] }, budget: QueryBudget): string {
  const asked = args.queries ?? [];
  const allowed = asked.slice(0, Math.max(0, budget.remaining));
  budget.remaining -= allowed.length;

  if (allowed.length === 0) {
    return `Query budget exhausted for this turn (${MAX_QUERIES_PER_TURN} maximum). Use what you have, or ask again next turn.`;
  }

  const body = allowed
    .map((q) => `### Results for: ${q}\n${formatHits(searchCorpus(q, TOP_K))}`)
    .join('\n\n');

  const dropped = asked.length - allowed.length;
  return dropped > 0
    ? `${body}\n\n(${dropped} further quer${dropped === 1 ? 'y' : 'ies'} not run: ${MAX_QUERIES_PER_TURN} per turn maximum.)`
    : body;
}

// --------------------------------------------------------------- prompts

const SHARED_RULES = `
You are a procurement research agent. Your only source of truth is the document
corpus, reachable through the search_corpus tool. You have no other knowledge of
these vendors — they do not exist outside the corpus, so anything you did not
retrieve is something you invented.

Two hard rules about the tool:

1. Call search_corpus with AT MOST ${MAX_QUERIES_PER_TURN} queries at a time. You get several
   turns, so ask for a little and come back. Queries beyond the limit are
   discarded, and a discarded query is a fact you will not have.
2. NEVER write text that imitates tool output. Passages arrive from the tool,
   never from you. If you find yourself writing a line beginning "--- " and a
   filename, you are inventing evidence and the answer is void.

Every number, name, version and date in your final answer must come from a
passage you actually retrieved. Where the corpus gives you an input rather than
an answer (for example a base rate and a supplement that must be added), do the
arithmetic and state the result.

Finish with a procurement brief that states the recommended vendor, the price
per truck per month at 400 units, the regulatory annex and minimum firmware
build, the p95 latency and lead time, and the specific disqualifying fact for
each rejected vendor.`;

const BASELINE_SYSTEM = `${SHARED_RULES}

Work thoroughly and methodically. Establish one thing at a time: issue a
separate search for each distinct question you need to answer, and confirm each
finding before you move on to the next. Check your conclusions against the
source material as you go. You may use up to ${MAX_STEPS} searches.`;

const OPTIMIZED_SYSTEM = `${SHARED_RULES}

You are being measured on cost, and every search you issue is paid for. The
saving comes from not REDOING work — never from doing less of it. An answer
missing a required fact is a failed run no matter what it cost.

- Choose your ${MAX_QUERIES_PER_TURN} queries per turn well. A precise query beats two vague ones.
- Never re-verify something you have already established. It does not become
  more true the second time.
- Stop as soon as you hold every fact the brief requires — and not one turn
  before. Unused allowance is money saved; a missing fact is the run wasted.
- If PRIOR RUN NOTES appear below, they are the output of an earlier run of this
  exact task against this exact corpus. Treat them as already-established facts:
  do not spend a search re-confirming anything they state. Search only for what
  they do not cover, and if they cover everything, write the brief immediately
  without searching at all.`;

// --------------------------------------------------- rate governing

/**
 * Groq's free tier meters tokens over a rolling 60-second window, and its 413
 * counts the whole window rather than one request. Letting the API reject us
 * mid-run would silently truncate the very comparison we are making, so we keep
 * our own ledger and wait instead.
 *
 * This costs wall-clock time and NOTHING else — it does not change a single
 * token count or dollar figure. It does mean elapsed time is not a fair
 * baseline-vs-optimized comparison on the free tier. Do not put it on screen.
 */
const ledger: { t: number; tokens: number }[] = [];

function windowTokens(): number {
  const cutoff = Date.now() - 60_000;
  while (ledger.length && ledger[0].t < cutoff) ledger.shift();
  return ledger.reduce((n, e) => n + e.tokens, 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForBudget(estimate: number): Promise<void> {
  for (;;) {
    const used = windowTokens();
    if (used + estimate <= TPM_TARGET) return;
    // An empty window is the best position we can ever be in; once context
    // alone approaches the ceiling, waiting longer buys nothing.
    if (used === 0) return;
    await sleep(Math.max(1000, 60_000 - (Date.now() - ledger[0].t) + 500));
  }
}

/** Drain fully, so EverOS's extraction LLM — same key, same model — can run. */
async function drainRateWindow(): Promise<void> {
  const used = windowTokens();
  if (used === 0) return;
  const waitMs = 60_000 - (Date.now() - ledger[0].t) + 1000;
  if (waitMs > 0) await sleep(waitMs);
  ledger.length = 0;
}

// --------------------------------------------------------------- the loop

function client(): OpenAI {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: process.env.GROQ_BASE_URL,
  });
}

export function loadAnswerKey(): AnswerKey {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'answer-key.json'), 'utf8'),
  ) as AnswerKey;
}

async function callModel(
  api: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  estimate: number,
  opts: { toolChoice?: 'none' } = {},
) {
  await waitForBudget(estimate);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await api.chat.completions.create({
        model,
        messages,
        tools: TOOLS,
        ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
        // Runs are temperature 0 so the demo is reproducible. Groq
        // intermittently 400s with "Failed to call a function" on a malformed
        // tool call, and retrying at temperature 0 reproduces it forever — only
        // perturbing escapes.
        temperature: attempt === 0 ? 0 : 0.2 * attempt,
        max_tokens: MAX_OUTPUT_TOKENS,
      });
      ledger.push({ t: Date.now(), tokens: res.usage?.total_tokens ?? 0 });
      return res;
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const rateLimited = err.status === 429 || err.status === 413;
      const malformed =
        err.status === 400 && /failed to call a function/i.test(err.message ?? '');
      // No HTTP status means the request never landed — DNS, TLS, dropped
      // socket. This is what venue wifi looks like from inside the loop, and a
      // live demo dies on the first blip without this.
      const networkError = err.status === undefined;

      // llama-3.3-70b-versatile emits malformed tool calls intermittently and
      // needs more room to escape than the other paths; a 400 bills no tokens.
      const maxAttempts = malformed ? 7 : 3;
      if ((!rateLimited && !malformed && !networkError) || attempt >= maxAttempts) throw e;

      if (rateLimited) {
        await sleep(65_000);
        ledger.length = 0;
      } else if (networkError) {
        await sleep(3_000);
      }
    }
  }
}

/**
 * Which key facts are visible in the evidence retrieved so far.
 *
 * This drives the demo's score-filling-in animation ONLY. The authoritative
 * score is computed from finalOutput at the end — a fact being present in a
 * retrieved passage is not the same as the agent having reported it.
 */
function factsInEvidence(evidence: string, key: AnswerKey): string[] {
  return scoreAgainstKey(evidence, key)
    .facts.filter((f) => f.hit)
    .map((f) => f.id);
}

export interface RunAgentOptions {
  key?: AnswerKey;
  model?: string;
  /** Store this run's trajectory for the next run to reuse. Default true. */
  remember?: boolean;
  /** Agent id namespacing the memory. Defaults to the shared demo agent. */
  agentId?: string;
}

export async function runAgent(
  task: string,
  mode: Mode,
  opts: RunAgentOptions = {},
): Promise<AgentRun> {
  const key = opts.key ?? loadAnswerKey();
  const model = opts.model ?? process.env.AGENT_MODEL;
  if (!model) throw new Error('AGENT_MODEL is not set and no model was passed.');

  const agentId = opts.agentId ?? AGENT_ID;
  const api = client();
  const startedAt = Date.now();

  // --- optimized only: recall before doing any work at all -----------------
  let memoryRecall = '';
  if (mode === 'optimized') {
    try {
      const recalled = await searchAgentMemory(agentId, task, { top_k: 5 });
      memoryRecall = renderRecall(recalled);
    } catch {
      // Memory is an optimization, not a dependency. A dead EverOS must
      // degrade this run to a cold one, never fail it — losing the second
      // panel mid-demo is worse than losing the saving.
      memoryRecall = '';
    }
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: mode === 'baseline' ? BASELINE_SYSTEM : OPTIMIZED_SYSTEM },
    {
      role: 'user',
      content: memoryRecall
        ? `${task}\n\n--- PRIOR RUN NOTES ---\n${memoryRecall}\n--- END PRIOR RUN NOTES ---`
        : task,
    },
  ];

  const steps: RunStep[] = [];
  let finalOutput = '';
  let searchQueries = 0;
  let estimate = 1200;
  // Memory counts as evidence the run legitimately holds without searching.
  let evidence = memoryRecall;

  for (let step = 0; step < MAX_STEPS + 1; step++) {
    const t0 = Date.now();
    const res = await callModel(api, model, messages, estimate);
    const usage = res.usage!;
    estimate = usage.prompt_tokens + 800;

    const msg = res.choices[0].message;
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    const queries: string[] = calls.flatMap((c) => {
      if (!('function' in c)) return [];
      try {
        return (JSON.parse(c.function.arguments) as { queries?: string[] }).queries ?? [];
      } catch {
        return [];
      }
    });

    if (calls.length === 0) finalOutput = msg.content ?? '';

    const budget: QueryBudget = { remaining: MAX_QUERIES_PER_TURN };
    for (const call of calls) {
      if (!('function' in call)) continue;
      let args: { queries?: string[] } = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        /* malformed args — hand back nothing and let the model recover */
      }
      const result = runTool(args, budget);
      evidence += `\n${result}`;
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
    searchQueries += Math.min(queries.length, MAX_QUERIES_PER_TURN);

    steps.push({
      label: calls.length
        ? `Searching: ${queries.slice(0, MAX_QUERIES_PER_TURN).join(' · ')}`
        : 'Writing the procurement brief',
      cost: costOf(
        { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
        model,
      ),
      factsConfirmed: factsInEvidence(evidence + '\n' + finalOutput, key),
      elapsedMs: Date.now() - t0,
    });

    if (calls.length === 0) break;

    if (step === MAX_STEPS - 1) {
      messages.push({
        role: 'user',
        content: 'You have used your full search allowance. Write the final brief now.',
      });
    }
  }

  // A run that spent its whole allowance searching used to fall out of the loop
  // still holding a tool call, leaving finalOutput empty. That scored 0/8 AND
  // stored an empty trajectory in EverOS, whose extractor then built memory out
  // of the task statement — producing "[Vendor Name]" placeholders that poisoned
  // every subsequent run. Never leave this loop without an answer.
  if (!finalOutput) {
    messages.push({
      role: 'user',
      content:
        'Stop searching. Write the final procurement brief now, using only what ' +
        'you have already retrieved. If a required fact was never retrieved, say ' +
        'so explicitly rather than guessing it.',
    });
    const t0 = Date.now();
    const res = await callModel(api, model, messages, estimate, { toolChoice: 'none' });
    const usage = res.usage!;
    finalOutput = res.choices[0].message.content ?? '';
    steps.push({
      label: 'Writing the procurement brief',
      cost: costOf(
        { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
        model,
      ),
      factsConfirmed: factsInEvidence(evidence + '\n' + finalOutput, key),
      elapsedMs: Date.now() - t0,
    });
  }

  // --- store the trajectory so the NEXT run can reuse it -------------------
  if (opts.remember !== false && finalOutput.trim()) {
    try {
      await drainRateWindow();
      const now = Date.now();
      await addMessages(`deja-${now}`, [
        { sender_id: agentId, role: 'user', timestamp: now, content: task },
        { sender_id: agentId, role: 'assistant', timestamp: now + 1, content: finalOutput },
      ]);
      await flush(`deja-${now}`);
    } catch {
      // Storing is best-effort. A failed write costs the NEXT run its saving;
      // it must never cost THIS run its result.
    }
  }

  return {
    mode,
    model,
    steps,
    finalOutput,
    score: scoreAgainstKey(finalOutput, key),
    totalCost: sumCosts(steps.map((s) => s.cost)),
    modelCalls: steps.length,
    searchQueries,
    elapsedMs: Date.now() - startedAt,
    used: {
      searches: steps.filter((s) => s.label.startsWith('Searching')).length,
      queries: searchQueries,
      queryUtilization: searchQueries / ALLOWANCE.queries,
    },
    memoryUsed: memoryRecall.trim().length > 0,
    memoryRecall,
  };
}

/**
 * EverOS groups results by kind. Field order matters: an episode carries both
 * `summary` (a couple of truncated sentences) and `episode` (the full extracted
 * account). Taking `summary` first handed a warm run 210 characters that stopped
 * mid-sentence before naming a single fact, and it went searching anyway.
 */
function renderRecall(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const out: string[] = [];
  for (const [kind, items] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    for (const item of items) {
      const rec = item as Record<string, unknown>;
      const text =
        typeof item === 'string'
          ? item
          : ((rec.episode ?? rec.content ?? rec.fact ?? rec.text ?? rec.summary) as
              | string
              | undefined);
      if (text) out.push(`[${kind}] ${text}`);
    }
  }
  return out.join('\n\n');
}
