/**
 * THROWAWAY. Answers exactly one question, the one the whole project rests on:
 *
 *   On a genuinely hard task, is a memory-backed run meaningfully cheaper than
 *   a naive run, AND does it score identically against a fixed answer key?
 *
 * Nothing here is production code. It exists to produce a number.
 *
 * Run from secondrun/:
 *   node --env-file=.env.local ../scripts/gap-test.mjs
 *
 * Honesty notes, because this script produces the number the demo is built on:
 *  - Token counts come only from the API `usage` field. Nothing is estimated.
 *  - Dollars come only from lib/pricing.ts. The model never emits a cost.
 *  - Scores come only from lib/score.ts. No model grades anything.
 *  - EverOS's own extraction LLM call (inside flush) burns tokens server-side
 *    that this script CANNOT see and therefore does not count. That is a real
 *    one-time cost paid by run 1 and it is not in these figures. Stated, not
 *    hidden.
 */

import OpenAI from 'openai';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { searchCorpus, formatHits } from '../secondrun/lib/corpus.ts';
import { costOf, sumCosts, reductionPercent, formatUSD } from '../secondrun/lib/pricing.ts';
import { scoreAgainstKey, isEquivalent, divergence } from '../secondrun/lib/score.ts';
import { addMessages, flush, searchAgentMemory, isUp } from '../secondrun/lib/everos.ts';

/** `--model=<id>` overrides AGENT_MODEL, so switching models costs no edit. */
const MODEL =
  process.argv.find((a) => a.startsWith('--model='))?.slice('--model='.length) ??
  process.env.AGENT_MODEL;

/**
 * Shrunk to fit the Groq FREE tier (6,000 tokens per minute, per model).
 * DESIGN.md 7 calls for the zero-minimum Dev Tier, which lifts this 10x;
 * until that card is added these three constants are what keeps the run alive.
 * Raise them once billing is live — the gap should only get bigger, because
 * the baseline's context growth is the thing being throttled here.
 */
/**
 * `--steps=N` overrides the search allowance.
 *
 * At 6 the naive baseline runs out before it investigates WHY it rejected the
 * losing vendors, so it stores a brief missing two facts — and an incomplete
 * memory makes the second run MORE expensive, not less: the notes ride along in
 * every turn while the warm run still has to search for the gaps. The baseline
 * has to finish the job for memory to be worth carrying.
 *
 * Watch the per-minute ceiling when raising this. Context compounds every turn,
 * and a SINGLE request may not exceed the model's TPM limit — 8,000 on
 * gpt-oss-120b, 12,000 on llama-3.3-70b-versatile. At 6 steps the baseline's
 * final request was already 6,495 tokens.
 */
const MAX_STEPS = Number(
  process.argv.find((a) => a.startsWith('--steps='))?.slice('--steps='.length) ?? 6,
);
const TOP_K = 2;
/**
 * Per TURN, not per call. Llama happily emits a dozen parallel tool_calls in
 * one turn — the first attempt fired 29 queries at once — and every passage
 * they return stays in context for every remaining turn. The budget is what
 * keeps a single request under the 6,000-token ceiling.
 */
const MAX_QUERIES_PER_TURN = 2;

/** Enough for a full procurement brief, not enough to run away. */
const MAX_OUTPUT_TOKENS = 900;

/**
 * Free-tier tokens per minute, PER MODEL. Read from Groq's own
 * x-ratelimit-limit-tokens header on 7 Aug 2026 — they are not all 6,000, which
 * is what this script originally assumed for every model. That assumption cost
 * roughly a minute of sleep per step on the two capable models for no reason.
 * Target leaves ~12% headroom for the pre-call estimate being wrong.
 */
const TPM_BY_MODEL = {
  'llama-3.1-8b-instant': 6000,
  'openai/gpt-oss-120b': 8000,
  'llama-3.3-70b-versatile': 12000,
};
const TPM_LIMIT = TPM_BY_MODEL[MODEL] ?? 6000;
const TPM_TARGET = Math.floor(TPM_LIMIT * 0.88);
/**
 * A fresh agent id per invocation unless --agent= pins one.
 *
 * Memory persists on disk between invocations, so a shared id would let an
 * earlier experiment's conclusions leak into a later one's "cold" run. An
 * earlier 8B run stored a hallucinated recommendation; inheriting that would
 * have quietly corrupted every measurement after it. Pin the id with --agent=
 * only when deliberately testing recall across invocations.
 */
const AGENT_ID =
  process.argv.find((a) => a.startsWith('--agent='))?.slice('--agent='.length) ??
  `secondrun-procurement-${Date.now()}`;
const SESSION = `gap-test-${Date.now()}`;

/**
 * `--only=baseline` runs just the baseline and skips the two optimized runs.
 *
 * The question "did the corpus fix stop the vendor flip?" is answered entirely
 * by the baseline: does it now reject Orbaline, and does it reach the two
 * disqualifying facts? That costs ~14K tokens instead of ~28K, which matters
 * when the daily quota refills at roughly 139 tokens a minute and the Developer
 * tier is not purchasable.
 */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

const KEY = JSON.parse(readFileSync(new URL('../secondrun/data/answer-key.json', import.meta.url), 'utf8'));

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

// ---------------------------------------------------------------- the tool

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_corpus',
      description:
        'Search the procurement document corpus. Accepts a list of queries and ' +
        'returns the best matching passages for each. Passing several queries at ' +
        'once costs one call instead of several.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' },
            description: `Up to ${MAX_QUERIES_PER_TURN} search queries. That is a limit per turn, not per call, so issuing extra parallel calls does not buy you more.`,
            // NOT maxItems: Groq validates tool arguments against the schema
            // and returns a hard 400 when the model overshoots, killing the run
            // instead of letting it recover. The limit is enforced in runTool.
          },
        },
        required: ['queries'],
      },
    },
  },
];

/**
 * `budget` is shared across every tool_call in one turn, so a model that fans
 * out ten parallel calls gets the same amount of corpus back as one that asks
 * for two queries in a single call. Anything over budget is refused with a
 * message the model can act on rather than silently dropped.
 */
function runTool(args, budget) {
  const asked = args.queries ?? [];
  const allowed = asked.slice(0, Math.max(0, budget.remaining));
  budget.remaining -= allowed.length;

  if (allowed.length === 0) {
    return `Query budget exhausted for this turn (${MAX_QUERIES_PER_TURN} queries maximum). Use what you have, or ask again next turn.`;
  }

  const body = allowed
    .map((q) => `### Results for: ${q}\n${formatHits(searchCorpus(q, TOP_K))}`)
    .join('\n\n');

  const dropped = asked.length - allowed.length;
  return dropped > 0
    ? `${body}\n\n(${dropped} further quer${dropped === 1 ? 'y was' : 'ies were'} not run: ${MAX_QUERIES_PER_TURN} queries maximum per turn.)`
    : body;
}

// --------------------------------------------------------- rate governing

/**
 * Groq's free tier meters tokens over a rolling 60-second window, and its 413
 * counts the whole window, not one request. So we keep our own ledger and wait
 * rather than letting the API reject us mid-run — a 413 halfway through the
 * baseline would silently truncate the very comparison we are trying to make.
 *
 * This costs wall-clock time and nothing else. It does not change a single
 * token count or dollar figure.
 */
const ledger = [];

function windowTokens() {
  const cutoff = Date.now() - 60_000;
  while (ledger.length && ledger[0].t < cutoff) ledger.shift();
  return ledger.reduce((n, e) => n + e.tokens, 0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForBudget(estimate) {
  for (;;) {
    const used = windowTokens();
    if (used + estimate <= TPM_TARGET) return;
    // An empty window is the best position we can ever be in. Once the
    // baseline's context alone approaches the per-minute ceiling, waiting
    // longer buys nothing — go, and let the 413 handler deal with it.
    if (used === 0) return;
    const waitMs = Math.max(1000, 60_000 - (Date.now() - ledger[0].t) + 500);
    process.stdout.write(
      `    [rate] window ${used} + est ${estimate} > ${TPM_TARGET}, waiting ${(waitMs / 1000).toFixed(0)}s\n`,
    );
    await sleep(waitMs);
  }
}

/**
 * Wait until our 60-second token window is empty, so that a THIRD party using
 * the same Groq key and model — EverOS's extraction LLM — has budget to run.
 */
async function drainRateWindow() {
  const used = windowTokens();
  if (used === 0) return;
  const waitMs = 60_000 - (Date.now() - ledger[0].t) + 1000;
  if (waitMs <= 0) return;
  console.log(
    `    [rate] draining ${used} tokens from the window so EverOS can call Groq, ${(waitMs / 1000).toFixed(0)}s`,
  );
  await sleep(waitMs);
  ledger.length = 0;
}

/** One metered model call, with the governor in front of it. */
async function callModel(messages, estimate, opts = {}) {
  await waitForBudget(estimate);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
        // Runs are temperature 0 so the comparison is reproducible. But Groq
        // intermittently 400s with "Failed to call a function" when llama emits
        // a malformed tool call, and retrying at temperature 0 reproduces the
        // same malformed output forever. Only a retry perturbs it.
        temperature: attempt === 0 ? 0 : 0.2 * attempt,
        // Without a cap llama-3.1-8b runs away: the first attempt spent its
        // entire 2,048-token output allowance emitting 297 search queries in a
        // single tool call. That is degenerate generation, not a naive agent,
        // and measuring it would not tell us anything about the real gap.
        max_tokens: MAX_OUTPUT_TOKENS,
      });
      ledger.push({ t: Date.now(), tokens: res.usage.total_tokens });
      return res;
    } catch (e) {
      const rateLimited = e.status === 429 || e.status === 413;
      const malformedToolCall =
        e.status === 400 && /failed to call a function/i.test(e.message ?? '');
      // llama-3.3-70b-versatile emits malformed tool calls intermittently and
      // failed 4 attempts straight at temperatures 0 -> 0.6 on 7 Aug. It needs
      // more room to escape than the rate-limit path does, and a retry costs
      // nothing when the request was rejected (no tokens are billed on a 400).
      // No HTTP status means the request never landed — DNS, TLS, dropped
      // socket. Transient and always worth retrying: this is what conference
      // wifi looks like from inside the loop.
      const networkError = e.status === undefined;

      const maxAttempts = malformedToolCall ? 7 : 3;
      if ((!rateLimited && !malformedToolCall && !networkError) || attempt >= maxAttempts) {
        throw e;
      }

      if (networkError) {
        process.stdout.write(`    [retry] network error (${e.message}), retrying in 3s\n`);
        await sleep(3000);
      }

      if (rateLimited) {
        process.stdout.write(`    [rate] ${e.status} from Groq, backing off 65s\n`);
        await sleep(65_000);
        ledger.length = 0; // the window has drained by now
      } else {
        process.stdout.write(
          `    [retry] malformed tool call, retrying at temperature ${(0.2 * (attempt + 1)).toFixed(1)}\n`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------- prompts

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
- If PRIOR RUN NOTES appear below, they are the ANSWER a previous run already
  produced for this exact task against this exact corpus. Your job is to
  reproduce that answer, not to improve on it.
  - If the notes name a recommended vendor and give its supporting figures,
    write the brief straight from them. Do not search at all. Not once.
  - Do not re-confirm a figure the notes already state. It does not become more
    true the second time.
  - If the notes are silent on something, say so plainly in the brief rather
    than going and looking it up. A second run that quietly researches more than
    the first is not a cheaper run — it is a different run, and the whole point
    is that it returns the same answer for less.`;

// ---------------------------------------------------------------- the loop

async function runLoop({ label, system, priorNotes }) {
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: priorNotes
        ? `${KEY.task}\n\n--- PRIOR RUN NOTES ---\n${priorNotes}\n--- END PRIOR RUN NOTES ---`
        : KEY.task,
    },
  ];

  const steps = [];
  const startedAt = Date.now();
  let finalOutput = '';

  // Conservative first guess; after step one we use the real previous prompt
  // size plus room for the tool result we are about to append.
  let estimate = 1200;

  for (let step = 0; step < MAX_STEPS + 1; step++) {
    const t0 = Date.now();
    const res = await callModel(messages, estimate);

    const usage = res.usage;
    estimate = usage.prompt_tokens + 800;
    const cost = costOf(
      { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
      MODEL,
    );
    const msg = res.choices[0].message;
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    const queries = calls.flatMap((c) => {
      try {
        return JSON.parse(c.function.arguments).queries ?? [];
      } catch {
        return [];
      }
    });

    steps.push({
      label: calls.length
        ? `Searched: ${queries.join(' · ')}`
        : 'Wrote the procurement brief',
      toolCalls: calls.length,
      queries: queries.length,
      cost,
      elapsedMs: Date.now() - t0,
    });

    process.stdout.write(
      `    step ${step + 1}: in ${usage.prompt_tokens} out ${usage.completion_tokens}` +
        ` ${calls.length ? `search[${queries.length}] ${queries.join(' | ').slice(0, 70)}` : 'FINAL ANSWER'}\n`,
    );

    if (calls.length === 0) {
      finalOutput = msg.content ?? '';
      break;
    }

    const budget = { remaining: MAX_QUERIES_PER_TURN };
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        /* malformed tool args — hand back nothing and let the model recover */
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: runTool(args, budget),
      });
    }

    // Out of allowance: stop researching and demand the brief.
    if (step === MAX_STEPS - 1) {
      messages.push({
        role: 'user',
        content: 'You have used your full search allowance. Write the final brief now.',
      });
    }
  }

  // A run that spent its whole allowance searching used to fall out of the loop
  // still holding a tool call, leaving finalOutput empty — which scored 0/8 and,
  // worse, stored an EMPTY trajectory in EverOS. The extractor then built its
  // memory out of the task statement instead, which is where the [Vendor Name]
  // and [Price] placeholders came from. So: never leave the loop without an
  // answer. Tools off, one call, write the brief from what was retrieved.
  if (!finalOutput) {
    messages.push({
      role: 'user',
      content:
        'Stop searching. Write the final procurement brief now, using only what ' +
        'you have already retrieved. If a required fact was never retrieved, say ' +
        'so explicitly rather than guessing it.',
    });

    const t0 = Date.now();
    const res = await callModel(messages, estimate, { toolChoice: 'none' });
    const usage = res.usage;
    finalOutput = res.choices[0].message.content ?? '';

    steps.push({
      label: 'Wrote the procurement brief (allowance exhausted)',
      toolCalls: 0,
      queries: 0,
      cost: costOf(
        { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
        MODEL,
      ),
      elapsedMs: Date.now() - t0,
    });

    process.stdout.write(
      `    step ${steps.length}: in ${usage.prompt_tokens} out ${usage.completion_tokens} FORCED FINAL ANSWER\n`,
    );
  }

  const totals = sumCosts(steps.map((s) => s.cost));
  const score = scoreAgainstKey(finalOutput, KEY);

  return {
    label,
    steps,
    finalOutput,
    score,
    totals,
    modelCalls: steps.length,
    searchCalls: steps.reduce((n, s) => n + s.toolCalls, 0),
    queriesIssued: steps.reduce((n, s) => n + s.queries, 0),
    elapsedMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------- reporting

function line(r) {
  return [
    r.label.padEnd(22),
    `${r.score.score}/${r.score.outOf}`.padStart(5),
    `${r.modelCalls}`.padStart(4),
    `${r.queriesIssued}`.padStart(5),
    `${r.totals.inputTokens}`.padStart(8),
    `${r.totals.outputTokens}`.padStart(7),
    formatUSD(r.totals.total).padStart(10),
    `${(r.elapsedMs / 1000).toFixed(1)}s`.padStart(7),
  ].join(' ');
}

function missed(r) {
  const m = r.score.facts.filter((f) => !f.hit).map((f) => f.id);
  return m.length ? m.join(', ') : '(none)';
}

// ---------------------------------------------------------------- main

async function main() {
  if (!MODEL) throw new Error('AGENT_MODEL is not set. Run with --env-file=.env.local');

  console.log(`model:  ${MODEL}`);
  console.log(`task:   ${KEY.task.slice(0, 90)}...`);
  console.log(`key:    ${KEY.facts.length} facts\n`);

  const everosUp = await isUp();
  console.log(`EverOS: ${everosUp ? 'up' : 'DOWN — memory run will be skipped'}\n`);

  // 1. Baseline. Naive, no memory. This is run one, and it pays full price.
  console.log('running baseline...');
  const baseline = await runLoop({ label: 'baseline', system: BASELINE_SYSTEM });

  if (ONLY === 'baseline') {
    const hits = baseline.score.facts.filter((f) => f.hit).map((f) => f.id);
    console.log('\n' + '='.repeat(60));
    console.log(`baseline: ${baseline.score.score}/${baseline.score.outOf}  cost ${formatUSD(baseline.totals.total)}  calls ${baseline.modelCalls}`);
    console.log(`hit:    ${hits.join(', ') || '(none)'}`);
    console.log(`missed: ${missed(baseline)}`);
    console.log('\n--- did the corpus fix work? ---');
    console.log(`  reaches the Orbaline outage:   ${hits.includes('orbaline_outage') ? 'YES' : 'NO'}`);
    console.log(`  reaches the Vantor residency:  ${hits.includes('vantor_residency') ? 'YES' : 'NO'}`);
    const rec = /recommend\w*[^.]*?(Kestrel|Orbaline|Vantor|Drayfoss)/i.exec(baseline.finalOutput);
    console.log(`  vendor recommended:            ${rec ? rec[1] : '(not parsed — read the transcript)'}`);
    return;
  }

  // 2. Optimized but COLD — no memory. This isolates how much of the saving
  //    comes from batching and early stopping alone, versus from memory.
  console.log('running optimized (cold, no memory)...');
  const cold = await runLoop({ label: 'optimized (cold)', system: OPTIMIZED_SYSTEM });

  // 3. Store run one's trajectory, then run again with memory. This is the
  //    product: the second run reuses the first run's work.
  let warm = null;
  let recallPreview = '';
  let memoryError = null;

  if (everosUp) {
    try {
      // EverOS extraction calls Groq with the SAME key and the SAME model as
      // the agent, so it competes for the same 6,000 TPM free-tier budget. If
      // we store immediately after a run, its LLM call gets rate-limited and
      // /memory/add returns a bare 500. Drain the window first.
      await drainRateWindow();

      console.log('storing baseline trajectory in EverOS...');
      const now = Date.now();
      await addMessages(SESSION, [
        { sender_id: AGENT_ID, role: 'user', timestamp: now, content: KEY.task },
        {
          sender_id: AGENT_ID,
          role: 'assistant',
          timestamp: now + 1,
          content: baseline.finalOutput,
        },
      ]);

      console.log('flushing (server-side LLM call, takes seconds)...');
      await flush(SESSION);
      await drainRateWindow();

      console.log('recalling from agent memory...');
      const recalled = await searchAgentMemory(AGENT_ID, KEY.task, { top_k: 5 });
      recallPreview = renderRecall(recalled);
      console.log(`recall returned ${recallPreview.length} chars\n`);
    } catch (e) {
      memoryError = e.message;
      console.log(`\nEverOS FAILED: ${e.message}\n`);
    }

    if (recallPreview.trim()) {
      console.log('running optimized (warm, memory-backed)...');
      warm = await runLoop({
        label: 'optimized (warm)',
        system: OPTIMIZED_SYSTEM,
        priorNotes: recallPreview,
      });
    } else if (!memoryError) {
      console.log('EverOS returned nothing usable — skipping the warm run.\n');
    }
  }

  // ------------------------------------------------------------ results

  const runs = [baseline, cold, warm].filter(Boolean);

  console.log('\n' + '='.repeat(84));
  console.log(
    'run'.padEnd(22) + 'score'.padStart(5) + 'calls'.padStart(5) +
    ' queries'.padStart(6) + '   in-tok'.padStart(9) + ' out-tok'.padStart(7) +
    '      cost'.padStart(11) + '   time'.padStart(8),
  );
  console.log('-'.repeat(84));
  for (const r of runs) console.log(line(r));
  console.log('='.repeat(84));

  for (const r of runs) console.log(`${r.label.padEnd(22)} missed: ${missed(r)}`);

  console.log('\n--- THE VERDICT ---');
  for (const r of runs.slice(1)) {
    const pct = reductionPercent(baseline.totals.total, r.totals.total);
    const same = isEquivalent(baseline.score, r.score);
    console.log(
      `${r.label}: ${pct === null ? 'n/a' : pct.toFixed(1) + '% cheaper'} than baseline, ` +
        `same facts as baseline: ${same ? 'YES' : 'NO (diverged on ' + divergence(baseline.score, r.score).join(', ') + ')'}`,
    );
  }

  const outDir = new URL('../secondrun/data/', import.meta.url);
  mkdirSync(outDir, { recursive: true });

  // Uniquely named per run, on purpose. Copying a fixed filename after the fact
  // silently duplicated an earlier run's results twice tonight when this script
  // died on a 429 before writing — producing a file that looked exactly like a
  // third confirming measurement. A run that does not finish must leave no
  // artifact at all.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = new URL(`gap-test-${stamp}.json`, outDir);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        model: MODEL,
        ranAt: new Date().toISOString(),
        limits: { MAX_STEPS, TOP_K, MAX_QUERIES_PER_TURN, MAX_OUTPUT_TOKENS, TPM_LIMIT },
        key: KEY,
        runs,
        recallPreview,
        memoryError,
      },
      null,
      2,
    ),
  );
  console.log(`\nfull transcript -> ${outPath.pathname}`);
}

/** EverOS groups results by kind. Flatten whatever text we find. */
function renderRecall(data) {
  if (!data || typeof data !== 'object') return '';
  const out = [];
  for (const [kind, items] of Object.entries(data)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    for (const item of items) {
      // Field order matters. An episode carries both `summary` (a couple of
      // truncated sentences) and `episode` (the full extracted account). Taking
      // `summary` first handed the warm run 210 characters that stopped
      // mid-sentence before naming a single fact — so prefer the fullest field
      // available, and fall back only when it is absent.
      const text =
        typeof item === 'string'
          ? item
          : (item.episode ??
             item.content ??
             item.fact ??
             item.text ??
             item.summary ??
             JSON.stringify(item));
      out.push(`[${kind}] ${text}`);
    }
  }
  return out.join('\n\n');
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
