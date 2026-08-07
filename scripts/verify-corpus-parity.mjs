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
let failures = 0;

for (const q of QUERIES) {
  const [remote, local] = [await searchCorpus(q, TOP_K), searchCorpusLocal(q, TOP_K)];

  const key = (hits) => hits.map((h) => `${h.doc}::${h.section}`).join(' | ') || '(none)';
  const same = key(remote) === key(local);

  // Scores are floating point summed in a different order on each side, so
  // compare them with a tolerance rather than for exact equality. Ranking is
  // what the agent sees; identical ranking is the property that matters.
  const drift = remote.length === local.length
    ? Math.max(0, ...remote.map((h, i) => Math.abs(h.score - local[i].score)))
    : Infinity;

  if (!same || drift > 1e-9) {
    failures += 1;
    console.log(`FAIL  ${q}`);
    console.log(`      snowflake  ${key(remote)}`);
    console.log(`      local      ${key(local)}`);
    if (same) console.log(`      score drift ${drift}`);
  } else {
    console.log(`ok    ${q}  ->  ${key(remote)}`);
  }
}

console.log(
  failures === 0
    ? `\nPARITY HOLDS across ${QUERIES.length} queries. Snowflake and the committed files are the same search.`
    : `\n${failures}/${QUERIES.length} queries DIVERGED. Do not record a run until this is zero.`,
);

await closeSnowflake();
process.exit(failures === 0 ? 0 : 1);
