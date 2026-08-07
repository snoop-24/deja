/**
 * Playback maths for the recorded runs. Pure, no React, no clock of its own —
 * the component owns the clock and asks this what the run looked like at time t.
 *
 * Both panels are driven by ONE virtual clock, so the two runs play at the same
 * scale as their recorded durations. The cheap run genuinely finishes early and
 * sits idle while the expensive one is still working; that gap is the demo.
 */

import type { MockRun } from './mock';

export interface RunState {
  /** Steps to render in the feed, including the one in progress. */
  visibleSteps: number;
  /** Index of the step currently in progress, or null when finished. */
  activeIndex: number | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  modelCalls: number;
  /** KeyFact ids confirmed so far. */
  confirmed: string[];
  score: number;
  /** Virtual elapsed time, capped at the run's recorded duration. */
  elapsedMs: number;
  done: boolean;
}

/** Total animation length, in real milliseconds. */
export const ANIMATION_MS = 20_000;

/** Virtual milliseconds elapsed per real millisecond of animation. */
export function speedFor(runs: MockRun[]): number {
  const longest = Math.max(...runs.map((r) => r.elapsedMs));
  return longest / ANIMATION_MS;
}

/** The point at which every run has finished, in virtual milliseconds. */
export function virtualDuration(runs: MockRun[]): number {
  return Math.max(...runs.map((r) => r.elapsedMs));
}

export function runStateAt(run: MockRun, virtualMs: number): RunState {
  const state: RunState = {
    visibleSteps: 0,
    activeIndex: null,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    modelCalls: 0,
    confirmed: [],
    score: 0,
    elapsedMs: Math.min(Math.max(virtualMs, 0), run.elapsedMs),
    done: virtualMs >= run.elapsedMs,
  };

  let stepStart = 0;

  for (const [index, step] of run.steps.entries()) {
    const stepEnd = stepStart + step.elapsedMs;

    if (virtualMs >= stepEnd) {
      // Finished. Count it whole.
      state.visibleSteps = index + 1;
      state.modelCalls = index + 1;
      state.inputTokens += step.cost.inputTokens;
      state.outputTokens += step.cost.outputTokens;
      state.cost += step.cost.total;
      state.confirmed.push(...step.factsConfirmed);
    } else if (virtualMs > stepStart) {
      // In progress. Tick the figures up across the step; facts only land
      // when the step completes, so the score never over-claims mid-flight.
      const fraction = (virtualMs - stepStart) / step.elapsedMs;
      state.visibleSteps = index + 1;
      state.activeIndex = index;
      state.inputTokens += Math.round(step.cost.inputTokens * fraction);
      state.outputTokens += Math.round(step.cost.outputTokens * fraction);
      state.cost += step.cost.total * fraction;
      break;
    } else {
      break;
    }

    stepStart = stepEnd;
  }

  state.score = state.confirmed.length;
  return state;
}
