import type { AnswerKey } from '@/lib/score';

/**
 * The task and the key — the part the audience is invited to check the score
 * against, so it has to stay legible, but it does not need to dominate.
 *
 * The key runs in two columns rather than one: eight facts stacked vertically
 * cost twice the height for no gain in readability.
 */
export function TaskCard({ answerKey }: { answerKey: AnswerKey }) {
  return (
    <section
      aria-labelledby="task-heading"
      className="grid gap-x-12 gap-y-6 border-t border-rule-strong pt-5 lg:grid-cols-[1fr_2fr]"
    >
      <div className="lg:border-r lg:border-rule-strong lg:pr-12">
        <h2 id="task-heading" className="text-label">
          The task
        </h2>
        <p className="mt-3 text-pretty text-[17px] leading-snug">{answerKey.task}</p>
      </div>

      <div>
        <h2 className="text-label">The answer key</h2>
        <ol className="mt-3 gap-x-12 sm:columns-2">
          {answerKey.facts.map((fact, index) => (
            <li key={fact.id} className="flex gap-3 py-[3px] text-[15px] leading-snug">
              <span className="figure w-4 shrink-0 text-right text-graphite-faint">
                {index + 1}
              </span>
              <span>{fact.statement}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-graphite-faint">{answerKey.writtenAt}</p>
      </div>
    </section>
  );
}
