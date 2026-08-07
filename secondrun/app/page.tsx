import Link from "next/link";

import { GlyphField } from "@/components/GlyphField";

/*
 * Everything on this page is measured in 64px grid cells, and the horizontal
 * padding is exactly one cell, so every left edge below — wordmark, headline,
 * body copy, each value block, the button, the footer — lands precisely on a
 * line of the background grid rather than floating over it.
 *
 *   page padding      64px   = 1 cell
 *   copy column      768px   = 12 cells
 *   value column     256px   = 4 cells  (boundaries at 64 / 320 / 576)
 *   wordmark letter  128px   = 2 cells
 */

const WORDMARK = ["D", "E", "J", "A"];

const VALUE_BLOCKS = [
  {
    heading: "Same answer, proven",
    line: "Scored against a hand-written answer key, shown on screen. No AI grading anything.",
  },
  {
    heading: "Real numbers",
    line: "Every figure is measured token counts multiplied by published list prices. The AI never reports its own cost.",
  },
  {
    heading: "Cheaper every time",
    line: "The more your agents work, the more they reuse.",
  },
];

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-paper text-graphite">
      <div aria-hidden="true" className="grid-paper absolute inset-0" />

      {/*
       * Copy and globe are siblings in a flex row, not overlaid. The globe was
       * absolutely positioned across the whole hero, which meant that at any
       * width where the copy column and the globe's circle both reached the
       * middle of the screen, glyphs rendered straight through the text. Two
       * columns cannot overlap, whatever the viewport does.
       */}
      <div className="relative flex flex-1 items-center gap-16 px-16 py-8 tall:py-16">
        <div className="w-[768px] max-w-full shrink-0">
          <div
            className="rise flex w-fit border-y border-rule-strong"
            style={{ animationDelay: "100ms" }}
          >
            {WORDMARK.map((letter, i) => (
              <span
                key={letter}
                className={`flex size-32 items-center justify-center text-[7.5rem] leading-none font-black ${
                  i > 0 ? "border-l border-rule-strong" : ""
                }`}
              >
                {letter}
              </span>
            ))}
          </div>

          <h1 className="mt-6 tall:mt-12 text-[clamp(2rem,3.8vw,3.25rem)] leading-[1.15] tracking-[-0.025em]">
            <span className="rise block" style={{ animationDelay: "500ms" }}>
              Your agent already did this job.
            </span>
            <span
              className="rise relative block w-fit"
              style={{ animationDelay: "1000ms" }}
            >
              Why are you paying twice?
              <span
                aria-hidden="true"
                className="wipe absolute -bottom-1 left-0 h-[3px] w-full bg-graphite/25"
                style={{ animationDelay: "1900ms" }}
              />
            </span>
          </h1>

          <p
            className="rise mt-6 tall:mt-12 text-pretty text-lg leading-relaxed text-graphite-muted"
            style={{ animationDelay: "1500ms" }}
          >
            Agents redo work they&rsquo;ve already done. We keep a memory of how they
            solved it &mdash; same answer, a fraction of the price.
          </p>

          <p
            className="rise mt-6 text-pretty text-lg leading-relaxed font-medium text-graphite"
            style={{ animationDelay: "1800ms" }}
          >
            Solve a hard problem once at full price. Every run after pays for recall,
            not reasoning.
          </p>

          <div
            className="rise mt-6 tall:mt-12 grid border-t border-rule-strong pt-8 sm:grid-cols-3"
            style={{ animationDelay: "2300ms" }}
          >
            {VALUE_BLOCKS.map((block) => (
              <div key={block.heading} className="pr-8 not-first:mt-8 sm:not-first:mt-0">
                <h2 className="text-base font-semibold tracking-tight">{block.heading}</h2>
                <p className="mt-2 text-sm leading-relaxed text-graphite-muted">
                  {block.line}
                </p>
              </div>
            ))}
          </div>

          <div className="rise mt-6 tall:mt-12" style={{ animationDelay: "2800ms" }}>
            <Link
              href="/demo"
              className="group inline-flex h-16 items-center gap-3 bg-graphite px-8 text-base font-medium text-paper transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-graphite"
            >
              See it run
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              >
                <path
                  d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          <p
            className="rise mt-6 tall:mt-12 font-mono text-xs tracking-tight text-graphite-faint"
            style={{ animationDelay: "3300ms" }}
          >
            Built at the Snowflake &times; Beta Fund &times; Evermind Agent &amp; Token
            Economy Hackathon.
          </p>
        </div>

        {/* The globe gets its own column and fills it; it only appears once
            there is room left over after the 768px copy column. */}
        <div className="relative hidden min-w-0 flex-1 self-stretch xl:block">
          <GlyphField />
        </div>
      </div>
    </main>
  );
}
