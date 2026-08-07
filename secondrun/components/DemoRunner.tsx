'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { baselineRun, optimizedRun } from '@/lib/mock';
import { runStateAt, speedFor, virtualDuration } from '@/lib/runState';
import { RunPanel } from './RunPanel';
import { Receipt } from './Receipt';

const RUNS = [baselineRun, optimizedRun];
const SPEED = speedFor(RUNS);
const TOTAL_VIRTUAL_MS = virtualDuration(RUNS);

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/** The server has no media queries; assume motion is fine and correct on hydrate. */
const getReducedMotionOnServer = () => false;

/**
 * Owns the single clock both panels read from. Playback of recorded data on a
 * timer — nothing is fetched, streamed, or computed by a model at view time.
 */
export function DemoRunner() {
  const [virtualMs, setVirtualMs] = useState(0);
  const [replayKey, setReplayKey] = useState(0);

  // Honour the OS setting: show the finished state rather than animating a
  // 20-second count-up at someone who asked us not to.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionOnServer,
  );

  useEffect(() => {
    if (reducedMotion) return;

    let frame = 0;
    const started = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - started) * SPEED;
      if (elapsed >= TOTAL_VIRTUAL_MS) {
        setVirtualMs(TOTAL_VIRTUAL_MS);
        return;
      }
      setVirtualMs(elapsed);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replayKey, reducedMotion]);

  const replay = useCallback(() => setReplayKey((key) => key + 1), []);

  const clock = reducedMotion ? TOTAL_VIRTUAL_MS : virtualMs;
  const baselineState = runStateAt(baselineRun, clock);
  const optimizedState = runStateAt(optimizedRun, clock);

  return (
    <>
      <div className="grid gap-x-12 gap-y-10 border-t border-rule-strong pt-5 lg:grid-cols-2">
        <div className="lg:border-r lg:border-rule-strong lg:pr-12">
          <RunPanel
            title="First run — no memory"
            run={baselineRun}
            state={baselineState}
          />
        </div>
        <RunPanel
          title="Second run — with memory"
          run={optimizedRun}
          state={optimizedState}
        />
      </div>

      <Receipt
        baseline={baselineRun}
        optimized={optimizedRun}
        baselineState={baselineState}
        optimizedState={optimizedState}
      />

      <div className="flex">
        <button
          type="button"
          onClick={replay}
          className="inline-flex h-11 items-center gap-2.5 bg-graphite px-6 text-sm font-medium text-paper transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-graphite"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.9-4.16M13 1.5V5H9.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Replay
        </button>
      </div>
    </>
  );
}
