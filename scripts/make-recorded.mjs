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

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reductionPercent } from '../secondrun/lib/pricing.ts';
import { isEquivalent, divergence } from '../secondrun/lib/score.ts';

const src = process.argv[2];
if (!src) {
  console.error('usage: node ../scripts/make-recorded.mjs <gap-test-transcript.json>');
  process.exit(1);
}

const t = JSON.parse(readFileSync(src, 'utf8'));

/**
 * THE KEY SHOWN ON SCREEN IS THE CURRENT FILE, NOT THE TRANSCRIPT'S COPY.
 *
 * A transcript freezes answer-key.json as it stood when the run happened. That
 * is right for the facts — those must be exactly what the run was scored
 * against — but wrong for the surrounding prose, which has since been corrected
 * (the file used to claim the key was written by hand by Sid; it was drafted by
 * Claude and reviewed by Sid). Replaying the frozen copy would put a correction
 * we already made back on screen.
 *
 * So: take the metadata from the live file, and refuse to run unless its facts
 * and task are byte-identical to the ones the run was actually scored against.
 * If they ever diverge, the honest move is to re-run, not to re-label.
 */
const currentKey = JSON.parse(readFileSync(join(process.cwd(), 'data', 'answer-key.json'), 'utf8'));

if (
  JSON.stringify(currentKey.facts) !== JSON.stringify(t.key.facts) ||
  currentKey.task !== t.key.task
) {
  console.error(
    'data/answer-key.json no longer matches the key this run was scored against.\n' +
      'Showing the current key beside these scores would misrepresent them.\n' +
      'Re-run the gap test against the current key instead.',
  );
  process.exit(1);
}

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

/**
 * EVERY COMPARABLE RUN, NOT JUST THIS ONE.
 *
 * The demo replays one run, and that run is the best of several. Showing it
 * without saying so would be the single most misleading thing on the page — so
 * the page carries the whole set and the audience can see the spread.
 *
 * The inclusion rule is stated rather than curated: same model as the replayed
 * run, a warm run that completed, and started at or after PROMPT_SETTLED. No
 * run meeting those conditions is omitted, including the ones that undercut the
 * claim. Earlier runs are excluded for a stated reason, not quietly dropped.
 */
const PROMPT_SETTLED = '2026-08-07T03:00:00.000Z';
const PROMPT_SETTLED_REASON =
  'Before this, the optimized prompt still invited the warm run to improve on ' +
  'the recalled answer rather than reproduce it, so those runs measure a ' +
  'different agent. Runs on other models are excluded for the same reason.';

const dir = join(process.cwd(), 'data');
const history = [];
const excluded = [];
const seenRanAt = new Set();

for (const f of readdirSync(dir).filter((x) => x.startsWith('gap-test-')).sort()) {
  const other = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  // Two filenames held the same run before the script wrote its own timestamped
  // name. Counting it twice would overstate the sample.
  if (seenRanAt.has(other.ranAt)) continue;
  seenRanAt.add(other.ranAt);

  const b = other.runs.find((r) => r.label === 'baseline');
  const w = other.runs.find((r) => r.label === 'optimized (warm)');

  const reason =
    !b || !w ? 'no completed warm run'
    : other.model !== t.model ? `different model (${other.model})`
    : other.ranAt < PROMPT_SETTLED ? 'predates the current optimized prompt'
    : null;

  if (reason) {
    excluded.push({ ranAt: other.ranAt, reason });
    continue;
  }

  history.push({
    ranAt: other.ranAt,
    baselineScore: b.score.score,
    warmScore: w.score.score,
    outOf: b.score.outOf,
    reductionPercent: reductionPercent(b.totals.total, w.totals.total),
    equivalent: isEquivalent(b.score, w.score),
    divergedOn: divergence(b.score, w.score),
    isReplayed: other.ranAt === t.ranAt,
  });
}

const equivalentCount = history.filter((r) => r.equivalent).length;

const payload = {
  ranAt: t.ranAt,
  model: t.model,
  // Current file, verified above to carry the same facts the run was scored on.
  key: currentKey,
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
  // 'unknown' for transcripts recorded before runs started reporting their
  // corpus store. The demo may not claim Snowflake on the strength of a run
  // that cannot evidence it — see AgentRun.corpusSource.
  corpusStore: baseline.corpusSource,
  /**
   * Every comparable run, replayed one included. Render this. The cost
   * reduction holds across all of them; fact-parity does not, and the page must
   * say so rather than let one run stand in for the set.
   */
  history: {
    rule:
      `Every run on ${t.model} with a completed warm run, started on or after ` +
      `${PROMPT_SETTLED}. ${PROMPT_SETTLED_REASON}`,
    runs: history,
    equivalentCount,
    total: history.length,
    excluded,
  },
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

console.log(`\nall ${history.length} comparable runs (rule: same model, warm run completed, prompt settled):`);
for (const r of history) {
  console.log(
    `  ${r.ranAt}  base ${r.baselineScore}/${r.outOf}  warm ${r.warmScore}/${r.outOf}  ` +
      `${r.reductionPercent.toFixed(1)}% cheaper  equivalent ${r.equivalent ? 'YES' : 'no'}` +
      `${r.isReplayed ? '   <- replayed by the demo' : ''}`,
  );
}
console.log(`  cost reduction held in ${history.length}/${history.length}, fact-parity in ${equivalentCount}/${history.length}`);
console.log(`  excluded: ${excluded.length} run(s)`);
console.log(`\nwrote ${out}`);
