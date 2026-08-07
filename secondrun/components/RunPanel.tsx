import { formatUSD } from '@/lib/pricing';
import { formatRunCost, type MockRun } from '@/lib/mock';
import type { RunState } from '@/lib/runState';

interface RunPanelProps {
  title: string;
  run: MockRun;
  state: RunState;
}

/**
 * One run, mid-flight. The cost figure is still the largest thing in the
 * panel — the hierarchy is unchanged, the whole scale is just tighter, so
 * more of the page fits on a laptop screen at once.
 *
 * The two runs are told apart by weight and one accent colour, not by boxes:
 * the memory-backed run is accented, the cold run is plain ink.
 */
export function RunPanel({ title, run, state }: RunPanelProps) {
  const optimized = run.mode === 'optimized';
  const figureTone = optimized ? 'text-accent' : 'text-graphite';
  // modelCalls counts *completed* steps, so this is true only once the run has
  // produced a real measurement — not merely because the clock is ticking.
  const started = state.modelCalls > 0;

  return (
    <section aria-label={title} className="flex flex-col">
      <header className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-2.5">
        <h2 className="text-pretty text-base font-semibold tracking-tight">{title}</h2>
        <StateChip done={state.done} optimized={optimized} />
      </header>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <p
          className={`figure text-[clamp(2.25rem,4vw,3.25rem)] leading-none font-semibold ${figureTone}`}
        >
          {formatRunCost(state.cost)}
        </p>

        {/* The score is withheld until a step has actually completed, rather
            than sitting at "0 of 8" while nothing has happened yet. */}
        {started && (
          <p className="step-in flex items-baseline gap-2">
            <span className={`figure text-2xl font-semibold ${figureTone}`}>
              {state.score} of {run.score.outOf}
            </span>
            <span className="text-xs text-graphite-muted">facts confirmed</span>
          </p>
        )}
      </div>

      {/* Height is reserved so the page does not jump when the counts arrive. */}
      <dl className="mt-4 flex min-h-[3.25rem] flex-wrap gap-x-10 gap-y-2 border-t border-rule pt-3">
        {started && (
          <>
            <Stat
              label="Input tokens"
              value={state.inputTokens.toLocaleString('en-US')}
            />
            <Stat
              label="Output tokens"
              value={state.outputTokens.toLocaleString('en-US')}
            />
            <Stat label="Model calls" value={String(state.modelCalls)} />
          </>
        )}
      </dl>

      {/* Reserved height so the receipt below does not jump as steps arrive. */}
      <ol className="mt-3 min-h-[11rem] border-t border-rule pt-2">
        {run.steps.slice(0, state.visibleSteps).map((step, index) => {
          const active = state.activeIndex === index;
          return (
            <li
              key={step.label}
              className="step-in flex items-baseline gap-2.5 py-[5px] text-[13px] leading-snug"
            >
              <StepMark active={active} optimized={optimized} />
              <span className={active ? 'text-graphite' : 'text-graphite-muted'}>
                {step.label}
              </span>
              <span className="figure ml-auto shrink-0 pl-4 text-xs text-graphite-faint">
                {active ? '' : formatUSD(step.cost.total)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label">{label}</dt>
      <dd className="figure mt-0.5 text-base">{value}</dd>
    </div>
  );
}

function StateChip({ done, optimized }: { done: boolean; optimized: boolean }) {
  if (done) {
    const tone = optimized ? 'bg-accent-soft text-accent' : 'bg-panel text-graphite-muted';
    return (
      <span
        className={`shrink-0 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase ${tone}`}
      >
        Done
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1.5 bg-panel px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-graphite-muted uppercase">
      <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
      Running
    </span>
  );
}

function StepMark({ active, optimized }: { active: boolean; optimized: boolean }) {
  if (active) {
    return (
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 translate-y-[-1px] animate-pulse rounded-full bg-graphite"
      />
    );
  }
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 translate-y-[1px] ${optimized ? 'text-accent' : 'text-graphite-faint'}`}
    >
      <path
        d="M2.5 7.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
