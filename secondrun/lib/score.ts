/**
 * Deterministic scoring against a hand-written answer key.
 *
 * THE RULE: no model grades anything, ever. The instant an LLM decides whether
 * two answers are "equivalent", the model is producing our number and the whole
 * claim collapses into an assertion.
 *
 * So equivalence is decided by string matching against acceptance patterns that
 * Sid writes BEFORE either run happens. The key is shown on screen during the
 * demo so the room can verify the score themselves.
 */

export interface KeyFact {
  id: string;
  /** Human-readable, shown on screen. */
  statement: string;
  /**
   * Any one of these appearing in the output counts as a hit.
   * Written by hand in advance. Case-insensitive, comma/whitespace tolerant.
   */
  accept: string[];
}

export interface AnswerKey {
  task: string;
  /** When and by whom the key was written — stated on screen for credibility. */
  writtenAt: string;
  facts: KeyFact[];
}

export interface FactResult {
  id: string;
  statement: string;
  hit: boolean;
  /** Which acceptance pattern matched, for the receipt. null when missed. */
  matchedOn: string | null;
}

export interface ScoreResult {
  score: number;
  outOf: number;
  facts: FactResult[];
}

/**
 * Normalize both sides identically so matching is predictable:
 * lowercase, strip thousands separators, collapse whitespace.
 * Deliberately conservative — we do not stem, synonym-expand, or fuzzy match,
 * because every one of those is a judgement call we could be accused of tuning.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[,_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score one run's output against the key. Pure function, no I/O, no model. */
export function scoreAgainstKey(output: string, key: AnswerKey): ScoreResult {
  const haystack = normalize(output);

  const facts: FactResult[] = key.facts.map((fact) => {
    const matchedOn =
      fact.accept.find((pattern) => haystack.includes(normalize(pattern))) ?? null;
    return {
      id: fact.id,
      statement: fact.statement,
      hit: matchedOn !== null,
      matchedOn,
    };
  });

  return {
    score: facts.filter((f) => f.hit).length,
    outOf: key.facts.length,
    facts,
  };
}

/**
 * The claim the demo rests on: did the cheap run return the same result?
 * Equal scores is necessary but not sufficient — two runs could hit the same
 * count on different facts. We require the exact same SET of facts.
 */
export function isEquivalent(a: ScoreResult, b: ScoreResult): boolean {
  if (a.score !== b.score) return false;
  const hitsA = new Set(a.facts.filter((f) => f.hit).map((f) => f.id));
  const hitsB = new Set(b.facts.filter((f) => f.hit).map((f) => f.id));
  if (hitsA.size !== hitsB.size) return false;
  for (const id of hitsA) if (!hitsB.has(id)) return false;
  return true;
}

/** Facts the two runs disagreed on — worth showing if equivalence fails. */
export function divergence(a: ScoreResult, b: ScoreResult): string[] {
  return a.facts
    .filter((fa) => {
      const fb = b.facts.find((x) => x.id === fa.id);
      return fb !== undefined && fb.hit !== fa.hit;
    })
    .map((f) => f.id);
}
