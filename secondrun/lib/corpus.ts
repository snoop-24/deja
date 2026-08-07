/**
 * The agent's only tool: search over a committed local corpus.
 *
 * Deliberately not a web search API. Reasons, in order of importance:
 *   1. Deterministic and repeatable — the same query returns the same passages
 *      every time, so a cost comparison between two runs is a fair test.
 *   2. No third-party call during the demo, so venue wifi cannot break it.
 *   3. No extra API key.
 *
 * The cost being measured is still real: it is Groq token usage on real model
 * calls. Only the retrieval is local.
 *
 * Scoring is plain lexical overlap. There is no model in this file.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

function tokenize(text: string): string[] {
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

/**
 * Lexical search. Term frequency weighted by inverse document frequency,
 * with a small bonus for terms appearing in the section heading.
 */
export function searchCorpus(query: string, topK = 3): SearchHit[] {
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
    return { ...chunk, score };
  });

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
