/**
 * Token prices and cost arithmetic.
 *
 * THE RULE: the model never produces a cost number. It reports token counts
 * (via the API's `usage` field, which we treat as measured), and every dollar
 * figure on screen comes from the multiplication below.
 *
 * Prices are PUBLISHED LIST PRICES, not our own measurements — the same
 * distinction PlainSight drew between measured pedestrian counts and
 * industry-convention CPM constants. Cite them on screen.
 *
 * Source: https://console.groq.com/docs/rate-limits + Groq pricing page
 * Retrieved: 6 August 2026
 */

export type Provider = 'groq' | 'cortex';

export interface ModelPrice {
  id: string;
  label: string;
  provider: Provider;
  /** USD per 1,000,000 input tokens, list price */
  inputPerM: number;
  /** USD per 1,000,000 output tokens, list price */
  outputPerM: number;
  /** Free-tier tokens-per-day cap, for build-day budgeting. null = unknown. */
  freeTierTPD: number | null;
}

/**
 * Verified against Groq's docs on 6 Aug 2026. Model IDs should be
 * re-checked against GET https://api.groq.com/openai/v1/models before the
 * demo — providers rename these without much warning.
 */
export const MODELS: Record<string, ModelPrice> = {
  'llama-3.3-70b-versatile': {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    provider: 'groq',
    inputPerM: 0.59,
    outputPerM: 0.79,
    freeTierTPD: 100_000,
  },
  'llama-3.1-8b-instant': {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B',
    provider: 'groq',
    inputPerM: 0.05,
    outputPerM: 0.08,
    freeTierTPD: 500_000,
  },
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    provider: 'groq',
    inputPerM: 0.15,
    outputPerM: 0.6,
    freeTierTPD: null,
  },
};

/** Developer tier (payment method on file) takes 25% off list. */
export const DEVELOPER_TIER_DISCOUNT = 0.25;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  total: number;
  model: string;
  /** True when the developer-tier discount was applied. */
  discounted: boolean;
}

/**
 * Deterministic. Given measured token counts and a model, return the cost.
 * This is the only place a dollar figure is ever created.
 */
export function costOf(
  usage: Usage,
  modelId: string,
  opts: { developerTier?: boolean } = {},
): CostBreakdown {
  const price = MODELS[modelId];
  if (!price) {
    // Refuse rather than guess. An unknown model has no defensible price.
    throw new Error(
      `No published price on file for model "${modelId}". ` +
        `Add it to MODELS with a cited source, or use a known model.`,
    );
  }

  const multiplier = opts.developerTier ? 1 - DEVELOPER_TIER_DISCOUNT : 1;
  const inputCost = (usage.inputTokens / 1_000_000) * price.inputPerM * multiplier;
  const outputCost = (usage.outputTokens / 1_000_000) * price.outputPerM * multiplier;

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inputCost,
    outputCost,
    total: inputCost + outputCost,
    model: modelId,
    discounted: Boolean(opts.developerTier),
  };
}

/** Sum a list of per-step costs into one run total. */
export function sumCosts(steps: CostBreakdown[]): Omit<CostBreakdown, 'model' | 'discounted'> {
  return steps.reduce(
    (acc, s) => ({
      inputTokens: acc.inputTokens + s.inputTokens,
      outputTokens: acc.outputTokens + s.outputTokens,
      inputCost: acc.inputCost + s.inputCost,
      outputCost: acc.outputCost + s.outputCost,
      total: acc.total + s.total,
    }),
    { inputTokens: 0, outputTokens: 0, inputCost: 0, outputCost: 0, total: 0 },
  );
}

/**
 * The headline number for Track 1: percentage cost reduction.
 * Returns null when the baseline is zero — no defensible percentage exists.
 */
export function reductionPercent(baselineTotal: number, optimizedTotal: number): number | null {
  if (baselineTotal <= 0) return null;
  return ((baselineTotal - optimizedTotal) / baselineTotal) * 100;
}

/** Format for display. Sub-cent runs still need to read as money on a projector. */
export function formatUSD(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
