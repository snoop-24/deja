/**
 * The agent's only tool: search over a fixed corpus held in Snowflake.
 *
 * Deliberately not a web search API. Reasons, in order of importance:
 *   1. Deterministic and repeatable — the same query returns the same passages
 *      every time, so a cost comparison between two runs is a fair test.
 *   2. A fixed corpus, so nothing changes underneath a measurement.
 *   3. No extra model.
 *
 * WHERE THE ROWS LIVE. The corpus is loaded into Snowflake by
 * scripts/load-corpus-to-snowflake.mjs and searched there: Snowflake computes
 * the inverse document frequencies, the ranking and the top-K. The committed
 * markdown in data/corpus/ is the source the loader reads from, and doubles as
 * an offline fallback (CORPUS_SOURCE=local) so a dead network cannot brick a
 * live run.
 *
 * THE TWO PATHS MUST AGREE. Having a fallback is only honest if it returns the
 * same passages, so scripts/verify-corpus-parity.mjs asserts hit-for-hit
 * equality between the SQL and local implementations. Run it after any change
 * to the scoring, and before recording a run. Every recorded run states which
 * source it used — see corpusSource().
 *
 * Scoring is plain lexical overlap. There is no model in this file.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// Explicit .ts extension: this module is imported both by the Next bundler and
// directly by Node in ../scripts, and Node's ESM loader will not guess it.
import { isSnowflakeConfigured, query } from './snowflake.ts';

export interface Chunk {
  /** Source filename, shown to the agent so it can cite. */
  doc: string;
  /** Markdown section heading this chunk came from. */
  section: string;
  text: string;
}

export interface SearchHit extends Chunk {
  score: number;
}

const CORPUS_DIR = join(process.cwd(), 'data', 'corpus');

/** Words too common to carry retrieval signal. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'at', 'is',
  'are', 'was', 'were', 'be', 'it', 'its', 'this', 'that', 'with', 'by',
  'from', 'as', 'what', 'which', 'who', 'how', 'does', 'do', 'we', 'our',
  'their', 'has', 'have', 'per', 'not', 'any', 'all', 'if', 'can',
]);

/**
 * Exported because the loader script tokenizes with this exact function when it
 * builds the inverted index in Snowflake. Reimplementing this in SQL would make
 * the two paths silently drift; sharing it makes parity structural.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.\-/]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

let cache: Chunk[] | null = null;

/** Split every document on its `##` headings. Cached — the corpus is static. */
export function loadCorpus(): Chunk[] {
  if (cache) return cache;

  const files = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.md')).sort();
  const chunks: Chunk[] = [];

  for (const file of files) {
    const raw = readFileSync(join(CORPUS_DIR, file), 'utf8');
    // Keep the H1 with every chunk so a passage is attributable on its own.
    const title = raw.match(/^#\s+(.+)$/m)?.[1] ?? file;
    // Split on ## and ### alike. Sub-splitting matters: a register or a vendor
    // assessment is one ## section holding four independent vendor entries, and
    // returning all four when the agent asked about one is retrieval noise the
    // agent then pays for on every subsequent turn.
    const parts = raw.split(/\n(?=###?\s)/);

    for (const part of parts) {
      const text = part.trim();
      if (!text) continue;
      const section = text.match(/^###?\s+(.+)$/m)?.[1] ?? 'Header';
      chunks.push({ doc: file, section, text: `# ${title}\n\n${text}` });
    }
  }

  cache = chunks;
  return chunks;
}

export type CorpusSource = 'snowflake' | 'local';

/**
 * Scores are sums of logarithms, and Snowflake and V8 accumulate them in
 * different orders — measured drift is up to ~3e-8. Real ranking differences in
 * this corpus are order 0.1 or larger, so rounding here is far below anything
 * meaningful and far above the noise.
 *
 * This is not cosmetic. Several queries produce genuine exact ties, which both
 * paths resolve by chunk order. Without rounding, floating-point noise would
 * turn a tie into a hairline score difference on one side only, and the two
 * paths could order the same two passages differently. Rounding keeps ties
 * exactly tied, so the tiebreak decides on both sides identically.
 */
const SCORE_DP = 6;

function roundScore(x: number): number {
  return Math.round(x * 10 ** SCORE_DP) / 10 ** SCORE_DP;
}

/**
 * Which store a search will hit. Recorded into every run artifact, so a replay
 * can never claim an integration the measured run did not actually use.
 * Explicit CORPUS_SOURCE wins; otherwise Snowflake when credentials exist.
 */
export function corpusSource(): CorpusSource {
  const explicit = process.env.CORPUS_SOURCE?.toLowerCase();
  if (explicit === 'local' || explicit === 'snowflake') return explicit;
  return isSnowflakeConfigured() ? 'snowflake' : 'local';
}

/**
 * Lexical search, executed by Snowflake.
 *
 * The arithmetic is identical to searchCorpusLocal below: for each query term
 * present in a chunk, add ln(N / df), and half as much again when the term also
 * appears in the section heading. Ties break on chunk_id, which matches the
 * stable sort on the local path.
 */
async function searchCorpusSnowflake(q: string, topK: number): Promise<SearchHit[]> {
  const terms = [...new Set(tokenize(q))];
  if (terms.length === 0) return [];

  const rows = await query<{
    DOC: string;
    SECTION: string;
    BODY: string;
    SCORE: number;
  }>(
    `WITH q AS (
       SELECT value::string AS term
       FROM TABLE(FLATTEN(input => PARSE_JSON(?)))
     ),
     n AS (SELECT COUNT(*) AS total FROM CORPUS_CHUNKS),
     df AS (
       SELECT t.term, COUNT(DISTINCT t.chunk_id) AS df
       FROM CORPUS_TERMS t JOIN q ON q.term = t.term
       GROUP BY t.term
     )
     SELECT c.doc AS DOC, c.section AS SECTION, c.body AS BODY,
            ROUND(SUM(
              LN(n.total / df.df)
              * IFF(CONTAINS(LOWER(c.section), t.term), 1.5, 1.0)
            ), ${SCORE_DP}) AS SCORE
     FROM CORPUS_TERMS t
     JOIN df ON df.term = t.term
     JOIN CORPUS_CHUNKS c ON c.chunk_id = t.chunk_id
     CROSS JOIN n
     GROUP BY c.chunk_id, c.doc, c.section, c.body
     HAVING SCORE > 0
     ORDER BY SCORE DESC, MIN(c.chunk_id) ASC
     LIMIT ?`,
    [JSON.stringify(terms), topK],
  );

  return rows.map((r) => ({
    doc: r.DOC,
    section: r.SECTION,
    text: r.BODY,
    score: r.SCORE,
  }));
}

/** What a run's searches were actually served by. 'none' = it never searched. */
export type SourceUsed = CorpusSource | 'mixed' | 'none';

const served = { snowflake: 0, local: 0 };

export function resetSearchStats(): void {
  served.snowflake = 0;
  served.local = 0;
}

/**
 * Which store actually answered this run's queries. Derived from what happened,
 * never from configuration — a run that fell back mid-flight must not be able
 * to report the source it intended to use.
 */
export function sourceUsed(): SourceUsed {
  if (served.snowflake > 0 && served.local > 0) return 'mixed';
  if (served.snowflake > 0) return 'snowflake';
  if (served.local > 0) return 'local';
  return 'none';
}

/**
 * The agent's search tool. Hits Snowflake unless told otherwise.
 *
 * A failed Snowflake call falls back to the committed files rather than killing
 * a run in front of an audience — but it says so on stderr, it is counted, and
 * the fallback is only defensible because parity is asserted before recording.
 */
export async function searchCorpus(q: string, topK = 3): Promise<SearchHit[]> {
  if (corpusSource() === 'local') {
    served.local += 1;
    return searchCorpusLocal(q, topK);
  }

  try {
    const hits = await searchCorpusSnowflake(q, topK);
    served.snowflake += 1;
    return hits;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[corpus] Snowflake search failed, falling back to local: ${message}`);
    served.local += 1;
    return searchCorpusLocal(q, topK);
  }
}

/**
 * Reference implementation over the committed markdown. Term presence weighted
 * by inverse document frequency, with a bonus for section-heading matches.
 */
export function searchCorpusLocal(query: string, topK = 3): SearchHit[] {
  const chunks = loadCorpus();
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  // Document frequency per term, so that a term appearing in every chunk
  // (e.g. "vendor") counts for much less than a rare one (e.g. "residency").
  const df = new Map<string, number>();
  const chunkTokens = chunks.map((c) => {
    const set = new Set(tokenize(c.text));
    for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
    return set;
  });

  const hits: SearchHit[] = chunks.map((chunk, i) => {
    const tokens = chunkTokens[i];
    const heading = chunk.section.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (!tokens.has(term)) continue;
      const idf = Math.log(chunks.length / (df.get(term) ?? 1));
      score += idf;
      if (heading.includes(term)) score += idf * 0.5;
    }
    return { ...chunk, score: roundScore(score) };
  });

  // Stable sort: exact ties keep chunk order, which is what chunk_id preserves
  // on the Snowflake side. See SCORE_DP.
  return hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Render hits as the tool-result string the model sees. */
export function formatHits(hits: SearchHit[]): string {
  if (hits.length === 0) return 'No matching passages.';
  return hits
    .map((h) => `--- ${h.doc} :: ${h.section} ---\n${h.text}`)
    .join('\n\n');
}
