/**
 * Load the committed corpus into Snowflake.
 *
 *   cd secondrun && npm run corpus:load
 *
 * Creates CORPUS_CHUNKS (the passages the agent reads) and CORPUS_TERMS (the
 * inverted index the ranking joins against), then fills both from
 * data/corpus/*.md.
 *
 * WHY THE INDEX IS BUILT HERE AND NOT IN SQL. Tokenization decides what the
 * agent can find. Reimplementing it in SQL would give two definitions of a word
 * that could drift apart without anyone noticing. Instead this script imports
 * the same tokenize() the local search path uses, so the two agree by
 * construction rather than by care.
 *
 * Idempotent: it recreates both tables, so running it twice is safe.
 */

import { loadCorpus, tokenize } from '../secondrun/lib/corpus.ts';
import { query, closeSnowflake, snowflakeConfig } from '../secondrun/lib/snowflake.ts';

const cfg = snowflakeConfig();
if (!cfg) {
  console.error(
    'Snowflake is not configured. Add SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER and\n' +
      'SNOWFLAKE_PASSWORD to secondrun/.env.local first.',
  );
  process.exit(1);
}

console.log(`account   ${cfg.account}`);
console.log(`target    ${cfg.database}.${cfg.schema}  (warehouse ${cfg.warehouse})`);

// Smallest size, suspends after a minute idle, starts suspended. The corpus is
// 90 rows; anything larger would only burn trial credits faster.
await query(`CREATE WAREHOUSE IF NOT EXISTS ${cfg.warehouse}
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE`);

await query(`CREATE DATABASE IF NOT EXISTS ${cfg.database}`);
await query(`CREATE SCHEMA IF NOT EXISTS ${cfg.database}.${cfg.schema}`);
await query(`USE SCHEMA ${cfg.database}.${cfg.schema}`);

await query(`CREATE OR REPLACE TABLE CORPUS_CHUNKS (
  chunk_id INT,
  doc      STRING,
  section  STRING,
  body     STRING
)`);

await query(`CREATE OR REPLACE TABLE CORPUS_TERMS (
  chunk_id INT,
  term     STRING
)`);

const chunks = loadCorpus();
console.log(`chunks    ${chunks.length} from ${new Set(chunks.map((c) => c.doc)).size} documents`);

// Multi-row INSERT in batches. The corpus is ~90 chunks; a stage or a COPY INTO
// would be overkill and would need a warehouse stage to exist first.
const BATCH = 25;

for (let i = 0; i < chunks.length; i += BATCH) {
  const slice = chunks.slice(i, i + BATCH);
  const values = slice.map(() => '(?, ?, ?, ?)').join(', ');
  const binds = slice.flatMap((c, j) => [i + j, c.doc, c.section, c.text]);
  await query(`INSERT INTO CORPUS_CHUNKS (chunk_id, doc, section, body) VALUES ${values}`, binds);
}

// Distinct terms per chunk — the local scorer uses set membership, not counts,
// so storing duplicates would change the arithmetic.
const termRows = [];
chunks.forEach((c, id) => {
  for (const term of new Set(tokenize(c.text))) termRows.push([id, term]);
});

console.log(`terms     ${termRows.length} chunk/term pairs`);

for (let i = 0; i < termRows.length; i += 500) {
  const slice = termRows.slice(i, i + 500);
  const values = slice.map(() => '(?, ?)').join(', ');
  await query(`INSERT INTO CORPUS_TERMS (chunk_id, term) VALUES ${values}`, slice.flat());
}

const [{ C }] = await query('SELECT COUNT(*) AS C FROM CORPUS_CHUNKS');
const [{ T }] = await query('SELECT COUNT(*) AS T FROM CORPUS_TERMS');

console.log(`\nloaded    CORPUS_CHUNKS ${C} rows, CORPUS_TERMS ${T} rows`);
console.log('next      npm run corpus:verify   (proves SQL and local agree)');

await closeSnowflake();
