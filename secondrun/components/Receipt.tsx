import { reductionPercent } from '@/lib/pricing';
import { formatRunCost, type MockRun } from '@/lib/mock';
import { isEquivalent } from '@/lib/score';
import type { RunState } from '@/lib/runState';

interface ReceiptProps {
  baseline: MockRun;
  optimized: MockRun;
  baselineState: RunState;
  optimizedState: RunState;
}

const HONESTY_NOTE =
  'Costs are measured token counts × Groq published list prices. Free-tier usage is not billed. No figure on this page was produced by an AI.';

export function Receipt({
  baseline,
  optimized,
  baselineState,
  optimizedState,
}: ReceiptProps) {
  const bothDone = baselineState.done && optimizedState.done;

  // Only defensible once both runs have finished; until then the panels are
  // still counting and any percentage would be an artefact of the animation.
  const reduction = bothDone
    ? reductionPercent(baseline.totalCost, optimized.totalCost)
    : null;

  const sameFacts = bothDone && isEquivalent(baseline.score, optimized.score);

  const rows: { label: string; first: string; second: string }[] = [
    {
      label: 'Cost',
      first: formatRunCost(baselineState.cost),
      second: formatRunCost(optimizedState.cost),
    },
    {
      label: 'Input tokens',
      first: baselineState.inputTokens.toLocaleString('en-US'),
      second: optimizedState.inputTokens.toLocaleString('en-US'),
    },
    {
      label: 'Output tokens',
      first: baselineState.outputTokens.toLocaleString('en-US'),
      second: optimizedState.outputTokens.toLocaleString('en-US'),
    },
    {
      label: 'Model calls',
      first: String(baselineState.modelCalls),
      second: String(optimizedState.modelCalls),
    },
    {
      label: 'Elapsed seconds',
      first: `${(baselineState.elapsedMs / 1000).toFixed(1)}s`,
      second: `${(optimizedState.elapsedMs / 1000).toFixed(1)}s`,
    },
    {
      label: 'Score',
      first: `${baselineState.score} of ${baseline.score.outOf}`,
      second: `${optimizedState.score} of ${optimized.score.outOf}`,
    },
  ];

  return (
    <section aria-labelledby="receipt-heading" className="border-t border-rule-strong pt-5">
      <h2 id="receipt-heading" className="text-label">
        The receipt
      </h2>

      {/* Withheld until both runs finish. Every figure here is a comparison,
          and a comparison of two runs that have not happened is eighteen
          zeroes — noise on arrival, and nothing the audience can read yet. */}
      {!bothDone && (
        <p className="mt-3 text-sm text-graphite-muted">
          Every measure side by side, and the cost reduction, once both runs finish.
        </p>
      )}

      <div
        className={`mt-4 grid gap-x-12 gap-y-8 lg:grid-cols-[1.6fr_1fr] ${
          bothDone ? 'step-in' : 'hidden'
        }`}
      >
        <div className="overflow-x-auto lg:border-r lg:border-rule-strong lg:pr-12">
          <table className="w-full min-w-[30rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-rule-strong">
                <th scope="col" className="text-label pb-2 font-semibold">
                  Measure
                </th>
                <th scope="col" className="text-label pb-2 text-right font-semibold">
                  First run
                </th>
                <th
                  scope="col"
                  className="text-label pb-2 text-right font-semibold text-accent"
                >
                  Second run
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-rule last:border-0">
                  <th
                    scope="row"
                    className="py-2 text-[15px] font-normal text-graphite-muted"
                  >
                    {row.label}
                  </th>
                  <td className="figure py-2 text-right text-base">{row.first}</td>
                  <td className="figure py-2 text-right text-base text-accent">
                    {row.second}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-label">Cost reduction</p>
          <p
            className="figure mt-2 text-[clamp(3rem,7vw,5.5rem)] leading-none font-semibold text-accent"
            aria-live="polite"
          >
            {reduction === null ? '—' : `${reduction.toFixed(1)}%`}
          </p>
          <p className="mt-3 text-sm text-graphite-muted">
            {reduction === null
              ? 'Waiting for both runs to finish.'
              : sameFacts
                ? `Same ${optimized.score.score} facts confirmed in both runs.`
                : 'The two runs did not confirm the same facts.'}
          </p>
        </div>
      </div>

      <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-graphite-faint">
        {HONESTY_NOTE}
      </p>
    </section>
  );
}
