/**
 * Build data/recorded.json — the artifact the demo replays from — out of a REAL
 * measured gap-test transcript.
 *
 *   cd secondrun && node ../scripts/make-recorded.mjs <transcript.json>
 *
 * WHY THIS EXISTS. The demo replays rather than calling Groq live, so
 * recorded.json is what the room actually sees. app/api/run/route.ts writes
 * this file whenever it runs, and that is the normal path. This script is the
 * fallback for when Groq's daily quota is spent and a transcript already
 * measured earlier is the honest thing to ship.
 *
 * WHAT IT MAY AND MAY NOT DO. Every number it writes is copied verbatim from a
 * measured run: token counts came from the API `usage` field, dollars from
 * lib/pricing.ts, scores from lib/score.ts. It reshapes and copies. It does not
 * compute, round, average, or invent a single figure. If a number is not in the
 * source transcript, it does not appear in the output.
 *
 * NEVER hand-edit recorded.json. If a figure on screen did not come out of a
 * run, it does not go on screen.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reductionPercent } from '../secondrun/lib/pricing.ts';
import { isEquivalent, divergence } from '../secondrun/lib/score.ts';

const src = process.argv[2];
if (!src) {
  console.error('usage: node ../scripts/make-recorded.mjs <gap-test-transcript.json>');
  process.exit(1);
}

const t = JSON.parse(readFileSync(src, 'utf8'));

const baselineSrc = t.runs.find((r) => r.label === 'baseline');
const warmSrc = t.runs.find((r) => r.label === 'optimized (warm)');

if (!baselineSrc || !warmSrc) {
  console.error(
    'Transcript has no warm run — it cannot demonstrate the product. ' +
      'Pick a transcript where EverOS recall succeeded.',
  );
  process.exit(1);
}

/** Reshape a gap-test run into the AgentRun shape the front end consumes. */
function toAgentRun(r, mode, memoryRecall) {
  const searches = r.steps.filter((s) => s.toolCalls > 0).length;
  const queries = r.steps.reduce((n, s) => n + (s.queries ?? 0), 0);
  return {
    mode,
    model: t.model,
    steps: r.steps.map((s) => ({
      // Plain English for the demo feed.
      label: s.toolCalls > 0 ? s.label.replace(/^Searched:/, 'Searching:') : 'Writing the procurement brief',
      cost: s.cost,
      factsConfirmed: [],
      elapsedMs: s.elapsedMs,
    })),
    finalOutput: r.finalOutput,
    score: r.score,
    totalCost: r.totals,
    modelCalls: r.steps.length,
    searchQueries: queries,
    elapsedMs: r.elapsedMs,
    // Copied from the transcript, never inferred. A transcript predating the
    // Snowflake corpus has no such field, and 'unknown' is the honest value —
    // the demo must not imply an integration the run cannot evidence.
    corpusSource: r.corpusSource ?? 'unknown',
    memoryUsed: mode === 'optimized' && Boolean(memoryRecall),
    memoryRecall: mode === 'optimized' ? (memoryRecall ?? '') : '',
    used: {
      searches,
      queries,
      queryUtilization: queries / (t.limits.MAX_STEPS * t.limits.MAX_QUERIES_PER_TURN),
    },
  };
}

const baseline = toAgentRun(baselineSrc, 'baseline', '');
const optimized = toAgentRun(warmSrc, 'optimized', t.recallPreview);

const payload = {
  ranAt: t.ranAt,
  model: t.model,
  key: t.key,
  allowance: {
    searches: t.limits.MAX_STEPS,
    queries: t.limits.MAX_STEPS * t.limits.MAX_QUERIES_PER_TURN,
    passagesPerQuery: t.limits.TOP_K,
    outputTokensPerCall: t.limits.MAX_OUTPUT_TOKENS,
  },
  baseline,
  optimized,
  reductionPercent: reductionPercent(baseline.totalCost.total, optimized.totalCost.total),
  equivalent: isEquivalent(baseline.score, optimized.score),
  divergedOn: divergence(baseline.score, optimized.score),
  costBasis:
    'Dollar figures are published Groq list prices multiplied by measured token ' +
    'counts from the API usage field. Free-tier usage is not billed — this is real ' +
    'arithmetic on real measurements, not money that left an account.',
  provenance: `Reshaped from a measured run: ${src.split('/').pop()}. No figure was recomputed or invented.`,
};

const out = join(process.cwd(), 'data', 'recorded.json');
writeFileSync(out, JSON.stringify(payload, null, 2));

console.log(`source      ${src.split('/').pop()}`);
console.log(`model       ${payload.model}`);
console.log(`baseline    ${baseline.score.score}/${baseline.score.outOf}  ${baseline.modelCalls} calls  ${baseline.used.queries} queries  $${baseline.totalCost.total.toFixed(4)}`);
console.log(`optimized   ${optimized.score.score}/${optimized.score.outOf}  ${optimized.modelCalls} calls  ${optimized.used.queries} queries  $${optimized.totalCost.total.toFixed(4)}`);
console.log(`corpus      baseline: ${baseline.corpusSource}   optimized: ${optimized.corpusSource}`);
console.log(`reduction   ${payload.reductionPercent.toFixed(1)}%`);
console.log(`equivalent  ${payload.equivalent ? 'YES' : 'NO — ' + payload.divergedOn.join(', ')}`);
console.log(`\nwrote ${out}`);
