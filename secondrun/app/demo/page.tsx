import type { Metadata } from 'next';
import Link from 'next/link';

import { ANSWER_KEY, IS_MOCK } from '@/lib/mock';
import { DemoRunner } from '@/components/DemoRunner';
import { PlaceholderBanner } from '@/components/PlaceholderBanner';
import { TaskCard } from '@/components/TaskCard';

export const metadata: Metadata = {
  title: 'Rote — demo',
  description:
    'The same research job run twice: once cold, once with memory of how it was solved.',
};

export default function DemoPage() {
  return (
    <main className="relative flex flex-1 flex-col bg-paper text-graphite">
      <div aria-hidden="true" className="grid-paper absolute inset-0" />

      <div className="relative flex flex-1 flex-col">
        {IS_MOCK && <PlaceholderBanner />}

        {/* Same 64px padding as the landing, so both routes share a left edge. */}
        <div className="flex w-full flex-col gap-8 px-16 py-8">
          <div className="flex items-baseline justify-between gap-8 border-b border-rule-strong pb-4">
            <h1 className="text-[clamp(1.375rem,2.2vw,1.875rem)] leading-none font-bold tracking-[-0.03em]">
              The same job, twice
            </h1>
            <Link
              href="/"
              className="shrink-0 text-sm text-graphite-muted transition-colors hover:text-graphite"
            >
              &larr; Back
            </Link>
          </div>

          <TaskCard answerKey={ANSWER_KEY} />
          <DemoRunner />
        </div>
      </div>
    </main>
  );
}
