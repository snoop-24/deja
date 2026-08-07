/**
 * Recorded-run fixtures for the demo UI.
 *
 * PLACEHOLDER. Every token count below is invented. The dollar figures are
 * NOT invented: they are produced by costOf() from those token counts and the
 * published list prices in lib/pricing.ts, exactly as the real runs will be.
 * Likewise the scores are produced by scoreAgainstKey() against the answer key
 * below — nothing here asserts a score, it computes one. So when the real
 * transcripts land, only the token counts and the prose change; the arithmetic
 * and the grading are already the code that ships.
 *
 * Flip IS_MOCK to false to drop the placeholder banner on /demo.
 */

import { costOf, type CostBreakdown } from './pricing';
import { scoreAgainstKey, type AnswerKey, type ScoreResult } from './score';

/** The one line that controls the placeholder banner. */
export const IS_MOCK = true;

export interface RunStep {
  label: string;
  cost: CostBreakdown;
  /** KeyFact ids confirmed at the end of this step. */
  factsConfirmed: string[];
  /** Duration of this step, not a cumulative clock. */
  elapsedMs: number;
}

export interface MockRun {
  mode: 'baseline' | 'optimized';
  steps: RunStep[];
  finalOutput: string;
  score: ScoreResult;
  totalCost: number;
  elapsedMs: number;
}

/** Both runs use the same model. The saving is reused work, not a cheaper model. */
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Hand-written before either run. Sourced from Groq's published pricing and
 * rate-limit docs, retrieved 6 August 2026 — the same figures lib/pricing.ts
 * cites, which is what makes the key checkable by the room.
 */
export const ANSWER_KEY: AnswerKey = {
  task: 'Report the current published list price, per million input and output tokens, for the three Groq-hosted models we run on — plus the developer-tier discount and the free-tier daily cap on the 8B model.',
  writtenAt: 'Written by hand on 6 August 2026, before either run.',
  facts: [
    {
      id: 'p70-in',
      statement: 'Llama 3.3 70B input: $0.59 per million tokens',
      accept: ['$0.59 per million', '$0.59/m'],
    },
    {
      id: 'p70-out',
      statement: 'Llama 3.3 70B output: $0.79 per million tokens',
      accept: ['$0.79 per million', '$0.79/m'],
    },
    {
      id: 'p8-in',
      statement: 'Llama 3.1 8B Instant input: $0.05 per million tokens',
      accept: ['$0.05 per million', '$0.05/m'],
    },
    {
      id: 'p8-out',
      statement: 'Llama 3.1 8B Instant output: $0.08 per million tokens',
      accept: ['$0.08 per million', '$0.08/m'],
    },
    {
      id: 'p120-in',
      statement: 'GPT-OSS 120B input: $0.15 per million tokens',
      accept: ['$0.15 per million', '$0.15/m'],
    },
    {
      id: 'p120-out',
      statement: 'GPT-OSS 120B output: $0.60 per million tokens',
      accept: ['$0.60 per million', '$0.60/m'],
    },
    {
      id: 'dev-tier',
      statement: 'The developer tier takes 25% off list price',
      accept: ['25% off', '25 percent off'],
    },
    {
      id: 'free-8b',
      statement: 'Llama 3.1 8B Instant free tier is capped at 500,000 tokens per day',
      accept: ['500,000 tokens per day', '500000 tokens per day'],
    },
  ],
};

interface StepSpec {
  label: string;
  inputTokens: number;
  outputTokens: number;
  factsConfirmed: string[];
  elapsedMs: number;
}

function buildSteps(specs: StepSpec[]): RunStep[] {
  return specs.map((s) => ({
    label: s.label,
    cost: costOf({ inputTokens: s.inputTokens, outputTokens: s.outputTokens }, MODEL),
    factsConfirmed: s.factsConfirmed,
    elapsedMs: s.elapsedMs,
  }));
}

function buildRun(
  mode: MockRun['mode'],
  specs: StepSpec[],
  finalOutput: string,
): MockRun {
  const steps = buildSteps(specs);
  return {
    mode,
    steps,
    finalOutput,
    score: scoreAgainstKey(finalOutput, ANSWER_KEY),
    totalCost: steps.reduce((sum, s) => sum + s.cost.total, 0),
    elapsedMs: steps.reduce((sum, s) => sum + s.elapsedMs, 0),
  };
}

const BASELINE_OUTPUT = `Groq published list prices, per million tokens.
Llama 3.3 70B (llama-3.3-70b-versatile): input $0.59 per million, output $0.79 per million.
Llama 3.1 8B Instant (llama-3.1-8b-instant): input $0.05 per million, output $0.08 per million.
GPT-OSS 120B (openai/gpt-oss-120b): input $0.15 per million, output $0.60 per million.
Billing: the developer tier, which requires a payment method on file, takes 25% off list on all three models.
Free tier: Llama 3.1 8B Instant is capped at 500,000 tokens per day.`;

const OPTIMIZED_OUTPUT = `Prices below are Groq list prices per million tokens, re-checked against the pricing page this run.
Llama 3.1 8B Instant: input $0.05 per million, output $0.08 per million. Free tier capped at 500,000 tokens per day.
Llama 3.3 70B: input $0.59 per million, output $0.79 per million.
GPT-OSS 120B: input $0.15 per million, output $0.60 per million.
A developer-tier account takes 25% off every one of those list prices.`;

export const baselineRun: MockRun = buildRun(
  'baseline',
  [
    {
      label: 'Reading the task and planning a search',
      inputTokens: 1_200,
      outputTokens: 380,
      factsConfirmed: [],
      elapsedMs: 3_800,
    },
    {
      label: 'Searching the provider docs for a pricing page',
      inputTokens: 4_800,
      outputTokens: 520,
      factsConfirmed: [],
      elapsedMs: 7_400,
    },
    {
      label: 'Reading the pricing page for the 70B model',
      inputTokens: 9_400,
      outputTokens: 610,
      factsConfirmed: ['p70-in', 'p70-out'],
      elapsedMs: 8_900,
    },
    {
      label: 'Reading the pricing page for the 8B model',
      inputTokens: 8_900,
      outputTokens: 540,
      factsConfirmed: ['p8-in', 'p8-out'],
      elapsedMs: 8_200,
    },
    {
      label: 'Reading the pricing page for the 120B model',
      inputTokens: 9_100,
      outputTokens: 500,
      factsConfirmed: ['p120-in', 'p120-out'],
      elapsedMs: 8_600,
    },
    {
      label: 'Checking the rate-limit page for tier discounts and daily caps',
      inputTokens: 11_200,
      outputTokens: 720,
      factsConfirmed: ['dev-tier', 'free-8b'],
      elapsedMs: 6_900,
    },
    {
      label: 'Writing up the eight findings',
      inputTokens: 14_600,
      outputTokens: 1_150,
      factsConfirmed: [],
      elapsedMs: 5_300,
    },
  ],
  BASELINE_OUTPUT,
);

export const optimizedRun: MockRun = buildRun(
  'optimized',
  [
    {
      label: 'Recalled previous run from memory',
      inputTokens: 1_400,
      outputTokens: 260,
      factsConfirmed: ['p70-in', 'p70-out', 'p8-in', 'p8-out'],
      elapsedMs: 900,
    },
    {
      label: 'Re-checking only the figures that move most often',
      inputTokens: 6_200,
      outputTokens: 430,
      factsConfirmed: ['p120-in', 'p120-out'],
      elapsedMs: 5_200,
    },
    {
      label: 'Assembling the same eight findings',
      inputTokens: 6_900,
      outputTokens: 780,
      factsConfirmed: ['dev-tier', 'free-8b'],
      elapsedMs: 4_600,
    },
  ],
  OPTIMIZED_OUTPUT,
);

/**
 * Display formatter for the side-by-side figures.
 *
 * formatUSD() switches to cents above $0.01, which is right for a single
 * figure but wrong for two panels compared at a glance: the baseline would
 * render at cent precision while the optimized run rendered at four decimals,
 * and the counter would change width mid-animation. Run totals therefore use
 * a fixed four decimals everywhere on /demo. Per-step costs, all well under a
 * cent, use formatUSD directly.
 */
export function formatRunCost(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
