/**
 * POST /api/run — runs both agents, scores both, returns the whole thing.
 *
 * No streaming, no SSE. Both runs complete server-side and the client animates
 * the collected transcript. SSE plumbing eats an hour and can half-fail on
 * stage; a JSON blob cannot.
 *
 * Order matters and is the product:
 *   1. baseline runs cold and pays full price
 *   2. its trajectory is stored in EverOS
 *   3. optimized runs and recalls that work instead of redoing it
 *
 * Every number in the response is measured or computed — token counts from the
 * API `usage` field, dollars from lib/pricing.ts, scores from lib/score.ts.
 * The model produces none of them.
 */

import { NextResponse } from 'next/server';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runAgent, loadAnswerKey, ALLOWANCE, type AgentRun } from '@/lib/agent';
import { reductionPercent } from '@/lib/pricing';
import { isEquivalent, divergence, type AnswerKey } from '@/lib/score';

// fs and long-running fetches — this cannot run on the edge runtime.
export const runtime = 'nodejs';
// Two agent runs plus EverOS extraction, against a rate-limited free tier.
export const maxDuration = 800;

export interface RunResponse {
  ranAt: string;
  model: string;
  key: AnswerKey;
  /**
   * The resource budget BOTH agents were given — identical for the two, which
   * is what makes the cost comparison mean anything. Render this next to the
   * task: the room should be able to see the two runs played by the same rules,
   * and that the cheap one simply left most of its allowance unspent.
   *
   * Compare against `baseline.used` and `optimized.used`.
   */
  allowance: typeof ALLOWANCE;
  baseline: AgentRun;
  optimized: AgentRun;
  /** Null when the baseline cost zero — no defensible percentage exists. */
  reductionPercent: number | null;
  /** Did the cheap run return the same SET of facts? The load-bearing claim. */
  equivalent: boolean;
  /** Fact ids the two runs disagreed on. Empty when equivalent. */
  divergedOn: string[];
  /** Stated on screen: free-tier usage is not billed. */
  costBasis: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const key = loadAnswerKey();
    const task: string = body.task ?? key.task;
    const model: string | undefined = body.model;

    // Cold, no memory read. This run pays full price and teaches the next one.
    const baseline = await runAgent(task, 'baseline', { key, model });

    // Reads what the baseline just stored.
    const optimized = await runAgent(task, 'optimized', { key, model });

    const payload: RunResponse = {
      ranAt: new Date().toISOString(),
      model: baseline.model,
      key,
      allowance: ALLOWANCE,
      baseline,
      optimized,
      reductionPercent: reductionPercent(
        baseline.totalCost.total,
        optimized.totalCost.total,
      ),
      equivalent: isEquivalent(baseline.score, optimized.score),
      divergedOn: divergence(baseline.score, optimized.score),
      costBasis:
        'Dollar figures are published Groq list prices multiplied by measured token ' +
        'counts from the API usage field. Free-tier usage is not billed — this is real ' +
        'arithmetic on real measurements, not money that left an account.',
    };

    // Recorded so the demo can replay without live calls. Best-effort: failing
    // to write the replay file must not lose a run that already succeeded.
    try {
      await writeFile(
        join(process.cwd(), 'data', 'recorded.json'),
        JSON.stringify(payload, null, 2),
        'utf8',
      );
    } catch {
      /* read-only filesystem in a deployed environment — keep the response */
    }

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Surface the real failure. A demo that silently returns plausible-looking
    // zeros is far worse than one that says the rate limit was hit.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
