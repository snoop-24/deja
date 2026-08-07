# secondrun — working context

Hackathon: Snowflake × Beta Fund × Evermind, Agent & Token Economy.
Friday 7 Aug 2026, Menlo Park. Solo. 3-minute demo, **audience vote, no judges**.
Full design doc: `DESIGN.md`.

## What the product is

An agent does a hard research job. The first run pays full price. EverOS stores
what the agent did, so the **second run reuses that work instead of redoing it**
— same answer, a fraction of the cost.

"Same answer" is proven against an answer key written by hand *before* either
run, scored by string matching, shown on screen so the room can count.

Track: **Cost of Intelligence** (requires a measurable cost-reduction %).

## Non-negotiable rules

These are the product's whole differentiator. Violating them silently is the
worst thing you can do here.

1. **The model never produces a number.** Not a cost, not a token count, not a
   score. Token counts come from the API `usage` field; dollars come from
   `lib/pricing.ts`; scores come from `lib/score.ts`.
2. **No LLM grades output equivalence, ever.** Equivalence is string matching
   against the committed answer key. If you find yourself asking a model
   "are these the same?", stop.
3. **Unknown model → throw, don't guess a price.** `costOf()` already does this.
4. **Placeholder numbers stay visibly labelled** until real measured runs
   replace them. `lib/mock.ts` exports `IS_MOCK` for this.
5. **Never claim novelty.** Adaptive compute allocation is a real research field
   (Ares, ZEBRA, BAGEN). We claim a working, verifiable artifact — not a new idea.
6. Costs are *published list prices × measured tokens*. Free-tier usage is not
   billed. This must be stated on screen.

## Layout

```
DESIGN.md               the plan — read this before changing direction
secondrun/              the Next.js app (app root; run npm from here)
  lib/pricing.ts        Groq list prices + deterministic cost arithmetic  DONE
  lib/score.ts          answer-key scoring, no LLM judging                DONE
  lib/everos.ts         EverOS memory client, retries on index lag        DONE
  lib/snowflake.ts      Snowflake connection for the corpus               DONE
  lib/corpus.ts         the agent's only tool — searches Snowflake        DONE
  lib/agent.ts          the agent loop, baseline vs optimized             DONE
  .env.local            Groq key (gitignored — exists locally, not in git)
.venv-everos/           Python env for the EverOS server (gitignored)
```

## Parallel work — file ownership

To avoid collisions when two instances run at once:

- **Front-end instance owns:** `app/**`, `lib/mock.ts`
- **Back-end instance owns:** `lib/agent.ts`, `app/api/**`, `data/**`
- **Shared, do not edit without saying so:** `lib/pricing.ts`, `lib/score.ts`,
  `lib/everos.ts` — the front end imports their types; changing a signature
  breaks the other instance.

## Things that took work to find out

- **Snowflake holds the corpus the agent searches.** `npm run corpus:load`
  builds `CORPUS_CHUNKS` + `CORPUS_TERMS` from `data/corpus/*.md`;
  `npm run corpus:verify` proves the SQL ranking matches the local one hit for
  hit. Run verify before recording any run — the local fallback is only
  defensible because the two paths are the same search. `CORPUS_SOURCE=local`
  forces the offline path.
- **Every run records the store it actually searched**, observed not configured
  (`AgentRun.corpusSource`, `RunResponse.corpusStore`). The demo may only claim
  Snowflake when a *recorded* run says `snowflake`. The optimized run says
  `none` — it never searches, which is the point.
- **EverOS won't boot without an LLM key** — hard `LLMNotConfiguredError` at
  startup, not a soft failure. Config lives at `~/.everos/everos.toml`.
- **`[llm]` is pointed at Groq** (OpenAI-protocol compatible). One key serves
  both EverOS extraction and the agent loop.
- **`[embedding]` also needs a key** and defaults to DeepInfra — Groq does not
  serve embeddings. Unresolved. EverOS Cloud credits from the sponsor would
  remove this problem; get them at the venue.
- **`[memorize] mode = "agent"`** is already correct — it enables agent_memory
  (cases + skills), which is the feature the whole demo depends on. Changing
  mode requires a server restart.
- **Search has an index lag.** `/add` and `/flush` write markdown synchronously
  but the LanceDB index rebuilds async — typically sub-second, worst case
  10–15s. `searchAgentMemory()` retries with backoff. Do not remove that.
- **`/flush` runs a server-side LLM call** and takes seconds. Never in a loop.
- **Groq free-tier limits are per model, per day:** `llama-3.1-8b-instant`
  500K tokens/day (build on this), `llama-3.3-70b-versatile` 100K tokens/day
  (save it for the final recorded runs).

## Still unproven

The load-bearing assumption has **not been tested**: on a genuinely hard task,
is the memory-backed run meaningfully cheaper *and* scoring identically?

Related measured facts: on an easy task the agent used ~2% of a $0.50 budget —
so an easy task shows no gap. On a hard task it used 7 of 8 allowed actions.
**The demo task must be hard**, or there is nothing to show.
