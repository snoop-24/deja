/**
 * Prove that searching Snowflake and searching the committed files return the
 * same passages.
 *
 *   cd secondrun && npm run corpus:verify
 *
 * WHY THIS EXISTS. corpus.ts falls back to local files when Snowflake is
 * unreachable, so a run could silently use a different retrieval path than the
 * one the demo claims. That is only acceptable if the two paths are the same
 * search. This asserts it — hit for hit, in order — on the queries the agent
 * actually issues.
 *
 * Exits non-zero on any divergence. Run it after touching the scoring, and
 * before recording a run.
 */

import { searchCorpus, searchCorpusLocal, corpusSource } from '../secondrun/lib/corpus.ts';
import { closeSnowflake } from '../secondrun/lib/snowflake.ts';

if (corpusSource() !== 'snowflake') {
  console.error(
    'CORPUS_SOURCE resolves to "local", so there is nothing to compare.\n' +
      'Configure Snowflake credentials, or unset CORPUS_SOURCE=local.',
  );
  process.exit(1);
}

/**
 * Real queries. The first eight are the ones measured runs actually issued;
 * the rest probe the facts in the answer key and the ranking edges (rare terms,
 * heading matches, numbers, hyphenation, a term in every chunk, a miss).
 */
const QUERIES = [
  'telematics vendor comparison Meridian',
  'ECTR 2026 annex cross-border certification',
  'Kestrel FleetLink firmware certified build',
  'p95 telemetry latency benchmark',
  'hardware lead time 400 units',
  'pricing schedule per truck per month tier',
  'Orbaline outage incident reliability',
  'Vantor data residency system of record',
  'Drayfoss lead time',
  'cross-border corridor supplement',
  'Columbus Ohio',
  '14 hours unplanned outage 3 March 2026',
  '4.7.2',
  '16.90',
  'compliance status hard constraints',
  'vendor',
  'quantum blockchain sardines',
];

const TOP_K = 2; // what the agent is allowed per query

/**
 * WHAT IS ASSERTED, AND WHAT IS NOT.
 *
 * Asserted: the two paths return the same passages in the same order. That is
 * the whole of what the agent consumes — formatHits shows it the document, the
 * section and the text, never a score, and no score reaches the demo. If the
 * ordered passage list matches, the agent could not have told the two apart.
 *
 * Not asserted: bit-identical scores. Snowflake and V8 accumulate the same sum
 * of logarithms in different orders, so they disagree around the last digit.
 * Both paths round to SCORE_DP (see lib/corpus.ts), which keeps genuine ties
 * tied so the chunk-order tiebreak decides identically on both sides — but a
 * value landing exactly on a rounding boundary can still round opposite ways.
 * Observed drift is printed below so nobody has to assume it is zero.
 *
 * Checking one more hit than the agent is allowed also catches a near-boundary
 * disagreement about which passage just missed the cut.
 */
let failures = 0;
let worstDrift = 0;

for (const q of QUERIES) {
  const [remote, local] = [
    await searchCorpus(q, TOP_K + 1),
    searchCorpusLocal(q, TOP_K + 1),
  ];

  const order = (hits) =>
    hits.map((h) => `${h.doc}::${h.section}`).join(' | ') || '(none)';
  const shown = (hits) =>
    hits.slice(0, TOP_K).map((h) => `${h.doc}::${h.section}`).join(' | ') || '(none)';

  if (remote.length === local.length) {
    for (let i = 0; i < remote.length; i += 1) {
      worstDrift = Math.max(worstDrift, Math.abs(remote[i].score - local[i].score));
    }
  }

  if (order(remote) !== order(local)) {
    failures += 1;
    console.log(`FAIL  ${q}`);
    console.log(`      snowflake  ${order(remote)}`);
    console.log(`      local      ${order(local)}`);
  } else {
    console.log(`ok    ${q}  ->  ${shown(remote)}`);
  }
}

console.log(
  failures === 0
    ? `\nPARITY HOLDS across ${QUERIES.length} queries — same passages, same order.` +
        `\nWorst score disagreement ${worstDrift.toExponential(2)}, which changed no ranking.` +
        `\nSnowflake and the committed files are the same search, so the offline fallback` +
        `\ncannot change what the agent sees.`
    : `\n${failures}/${QUERIES.length} queries DIVERGED. Do not record a run until this is zero.`,
);

await closeSnowflake();
process.exit(failures === 0 ? 0 : 1);
