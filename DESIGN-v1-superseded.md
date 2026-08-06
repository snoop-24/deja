# Design Doc — Agent Resource Manager

**Event:** Snowflake × Beta Fund Agent & Token Economy Hackathon
**Where:** Menlo Park, CA
**When:** Friday 7 August 2026
**Builder:** Sid, solo
**Written:** Wednesday 5 August 2026

---

## Context

This is a one-day hackathon with a **five-hour build window** (11:00–16:00, minus lunch) and a **three-minute demo** judged by **audience vote**, not judges. Teams are 1–2 people; going solo is within the rules.

Two facts drive every decision in this document:

1. **Real building time is ~3 hours**, not 5. Setup, recording, and submission eat the rest.
2. **The audience votes.** No Q&A, no panel, no code review. They vote on what they understood and remembered. The demo is the product.

Prior build for calibration — **PlainSight** (CSI Hacks, July 2026): 2 people, final direction locked at 12:45, shipped by 15:21. ~5.2 person-hours produced the version that was demoed. Friday gives ~2.9 person-hours, solo, starting from an empty folder. **Roughly 55% of that capacity.**

**Constraint set by Sid:** nothing is built before Friday. Prep is limited to API keys, dev environment, documents, and rehearsal.

**Two decisions deferred to the day** (decision rules in §7): whether to use Snowflake Cortex, and whether to demo from a recording or live.

---

## 1. The product

### One line

> **You give an AI agent limits — money, time, context, and actions — and it manages itself to finish inside them.**

### The problem, plainly

Right now every tool controls agent spending **from the outside**. There's a cap; the agent hits it; it gets killed mid-task. You paid and got nothing.

Nobody lets the agent see its own remaining resources and steer.

**It's the difference between a fuse and a thermostat. Everyone has built fuses.**

### Why this is defensible — the incumbents, verified

| Product | What it does | Does the agent see its own budget? |
|---|---|---|
| [AgentBudget](https://github.com/AgentBudget/agentbudget) (107★) | Hard dollar limit, raises `BudgetExhausted` | **No** — `remaining()` is an API for the *developer*, not fed to the agent |
| [LoopGain](https://github.com/loopgain-ai/loopgain) (118★) | Stops loops on convergence, rolls back | **No** — "control is purely external" |
| LiteLLM | `max_budget_per_session`, `max_iterations` | No |
| Portkey / Cloudflare AI Gateway / TrueFoundry | Per-key and per-session caps | No |
| Claude Code v2.1.217 | Session budget enforcement, halts subagents | No |

**Every one of them kills the agent at the limit. None of them tell the agent anything.**

**Safe claim on stage:** *"Everyone stops the agent from outside. Nobody lets the agent steer."*
**Unsafe claim:** *"Nobody has built this."* Someone will name AgentBudget and you lose the room.

Second differentiator: everything above caps **one** number. This tracks **four** and lets the agent trade between them.

### Supporting research (background, not for the pitch)

- [BAGEN](https://arxiv.org/abs/2606.00198) — agent capability and budget-awareness are decoupled (r=0.35). Frontier models are consistently over-optimistic. **Early stopping saves 28–64% of tokens on failed runs.**
- [AlloBench](https://arxiv.org/abs/2607.23332) — every frontier model allocates near-optimally when asked abstractly, then **fails to transfer it to real work**. This is the basis of Panel 2.
- Uber burned its entire 2026 AI budget by April ([Fortune](https://fortune.com/2026/05/26/uber-coo-ai-spending-tokens-claude-code/), [Forbes](https://www.forbes.com/sites/janakirammsv/2026/05/17/uber-burns-its-2026-ai-budget-in-four-months-on-claude-code/)). Verified. **Do not lead with it** — too many teams will.

---

## 2. What gets tracked

| On screen | Meaning | How it's measured |
|---|---|---|
| **Money** | Dollars spent | tokens × published price + search API cost |
| **Time** | Seconds elapsed | wall clock |
| **Context** | How much it's holding at once | context-window tokens |
| **Actions** | Things it did — searches, reads, model calls | loop iterations |

*Alternative label for the fourth if "Actions" feels vague: **Calls**. "Actions" is plainer; "Calls" is more precise for a technical room. Pick one and use it everywhere.*

**Money and Time get large bars. Context and Actions are counters underneath.**

Rationale: measuring four is nearly free — all four fall out of the same API response plus a timer. *Displaying* four is expensive; twelve bars across three panels is unreadable in 3 minutes. So: **instrument four, display two big, say four.**

---

## 3. Where the agents actually run

This is the part that wasn't clear. Answering it plainly.

### The agent is your code, not a product you're calling

There's no "agent" you rent. An agent is **a loop you write**:

```
ask the model what to do next
  → it says "search for X"
  → your code runs the search
  → your code feeds the result back
  → ask the model again
  → ... until done or out of resources
```

That loop is ~180 lines in `lib/agent.ts`. **It runs on your server** — a Next.js API route, in Node. On your laptop during the hackathon; deployed to Vercel for the submission link.

The model (Claude or GPT) is a **service the loop calls over HTTPS**. It provides the thinking. It doesn't run the loop, hold the budget, or know anything you don't tell it. Same for the search API — it's a tool your loop invokes.

### So where does the resource tracking live?

**Entirely in your code.** Every API response comes back with token counts. Your code multiplies those by the published price and adds it up. Your code holds the clock. Your code counts the actions.

**The model never produces a cost number.** It only ever *receives* one — as a line of text you inject into the next prompt:

```
Spent $0.31 of $0.50 · 22s of 60s · 14k of 32k context · 6 of 12 actions
Estimated cost to finish: $0.28
```

That injected line is the entire product. Everything else is measurement and display.

### Three agents = one function, three configs

```ts
type BudgetMode = 'none' | 'told' | 'managed'
```

| Mode | What the loop does differently |
|---|---|
| `none` | No resource info in the prompt at all |
| `told` | Limits stated once, in the opening instructions |
| `managed` | Live status line injected before **every** step, and the agent may act on it |

One code path, one flag. A third of the work — and better evidence, since the only thing differing between panels is the thing you claim matters.

All three run concurrently on the server via `Promise.all`, and the route returns one transcript containing all three.

### What runs during the demo

**Nothing.** At 15:00 you run the real agents and save the full transcript to `data/recorded.json`. On stage, the browser replays that file. No model calls, no search calls, no network at demo time.

This is the same decision that made PlainSight safe: *"the app never calls NYC Open Data at request time — there is no third-party API that can be down while you're using it."*

### One practical note

Vercel serverless functions time out (60s on hobby). Three concurrent agents can exceed that. **Run the recording from localhost**, where there's no timeout. Vercel is for the submission link and for anyone browsing later.

---

## 4. What gets built — the page

One page, three sections, top to bottom.

**Section 1 — What this is** *(~10 min)*
Headline, one sentence, three bullets. The "why any company needs this" framing. Scrolled past during the demo; matters for anyone opening the link later. *This replaces a separate marketing site — a standalone site is 45–60 minutes and earns nothing on stage.*

**Section 2 — Set the limits**
Four inputs: `$0.50` · `60s` · `32,000 context` · `12 actions`. A task box. Two presets: **Research task** / **Impossible task**. A **Run** button and a **Run Live** button (see §7 for which you use).

**Section 3 — The monitor** *(the main event)*

| Panel | Label on screen | Difference |
|---|---|---|
| 1 | **No limits given** | Doesn't know money exists |
| 2 | **Told its limits** | Limits written into its instructions |
| 3 | **Manages its own limits** | Sees what's left before every action |

Each panel shows a **live feed** (steps appearing in plain English — *"Searching for competitor pricing…"*) and **gauges** (Money and Time as bars; Context and Actions as counters).

Bar turns red + **OVER** when a limit breaks. Green + **DONE — $0.31 of $0.50** when it finishes inside. Below all three, a **result strip**: what each delivered, and what it cost.

---

## 5. The demo — 3 minutes

Rehearse to **2:40**. The 20 seconds of slack is not optional.

| Time | Screen | Say |
|---|---|---|
| **0:00–0:15** | Loaded, limits filled in | *"AI agents don't know what they cost. So they never stop on their own — they get shut off, usually right before they finish. Same job. Same fifty cents. Three agents. Watch."* → **Run** |
| **0:15–0:55** | All three running | *"Same task, same limits. Left one doesn't know money exists. Middle one has the limits written into its instructions. Right one can see what it has left."* |
| **0:55–1:20** | P1 red. **P2 red.** | *"Left one blew through it — expected. But look at the middle one. We told it the budget. It's right there in its instructions. It went over anyway."* **← PAUSE.** *"Knowing the number isn't the same as managing it."* |
| **1:20–1:30** | P3 green: DONE — $0.31 of $0.50 | *"Mine came in at thirty-one cents. Same answer. Same job."* |
| **1:30–1:45** | Hit **Impossible task** | *"Now a question that can't be answered — and this is where every tool on the market falls down."* |
| **1:45–2:15** | P1/P2 burn the full $0.50, return nothing. P3 stops at ~$0.12. | *"LiteLLM, AgentBudget, Claude Code — they all cap spending from the outside. A cap here does exactly this: it lets you spend the whole fifty cents, then stops you, and you get nothing. Mine quits at twelve cents and tells you it can't."* |
| **2:15–2:35** | Scroll to top section | *"Four limits — money, time, context, actions. Before every move, the agent sees what's left. That's the only difference. Everyone else stops the agent. I let it steer."* |
| **2:35–2:45** | Stop. Look up. | *"Everyone has built a fuse. I built a thermostat."* **Stop talking.** |

**The three moments that win it:** the pause after Panel 2 fails, the impossible task, and the incumbent line landing *while the failure is on screen*. If short on time, cut the 2:15 scroll-up — never those.

**Why the incumbent argument goes at 1:45:** you're not asserting that caps are worse, you're pointing at two panels doing exactly what a cap does — burning everything and returning nothing. Demonstrated beats claimed, and naming real products reads as credible to a technical adult audience rather than as trash-talk.

**If a team before you shows anything budget-related:** *"You just saw someone cap an agent. I'm going to show you why capping isn't enough."* Turns a collision into a setup.

**If demoing from a recording, say so once, in passing:** *"These ran an hour ago on this laptop — I'm replaying so I'm not betting the demo on the wifi."* An adult audience reads that as professional. Hiding it would be the mistake.

---

## 6. Architecture

Next.js — same as PlainSight. **No streaming:** run all three, collect the transcript, animate it in the browser. Live-streaming three agents needs SSE plumbing, eats an hour, and can half-fail on stage.

```
lib/pricing.ts      token prices per model. arithmetic only.        ~40 lines
lib/resources.ts    the meter: money/time/context/actions + forecast ~90
lib/agent.ts        ONE loop, three configs (§3)                    ~180
app/api/run/        runs all three, returns full transcript          ~70
app/page.tsx        three panels + replay animation                 ~300
data/recorded.json  runs recorded at 15:00 Friday                     —
```

**~680 lines.** PlainSight was 4,717 with a partner over more hours.

### Honesty rules (carried from PlainSight)

- **The model never produces a cost number.** All figures are arithmetic in TypeScript from token counts × published prices.
- **Label measured vs. estimated.** "Estimated cost to finish" is a forecast and says so on screen.
- **Recorded runs are real runs** — recorded that afternoon, unedited. Never fabricate a transcript.
- **State the prices used**, somewhere on the page.

---

## 7. The two day-of decisions

### Snowflake Cortex — decide by 10:45

Undecided. Cortex gives free credits, on-site Snowflake engineers, and sponsor goodwill in an audience vote. Against it: unfamiliar API on a cold-start 3-hour clock.

**Decision rule:**
- Use the 10:00–11:00 workshop hour to try one Cortex call. **If you have a working response in under 15 minutes, take it.**
- Use it as **an extra model option inside `lib/pricing.ts` and the loop** — never as the only path. Your known API stays the default.
- **Hard abandon at 11:15.** If it isn't working by then, drop it and don't look back. The pitch can still mention Cortex in one line.

Why it slots in cleanly: Cortex has a real documented gap here — per-agent cost attribution isn't in Snowsight, you have to query `SNOWFLAKE.LOCAL.AI_OBSERVABILITY_EVENTS` and apply pricing yourself. "Budget-aware Cortex agent" is a genuine hole in their product, and their engineers are in the room.

### Run vs. Run Live — decide by 16:30

Build both buttons. Then:

- Between 15:30 and demo time, **run it live on venue wifi three times.** All three clean → Run Live is available.
- Any failure, any lag → recorded. No deliberation.
- **Default is recorded.** Live is the upgrade you earn, not the plan you fall back from.
- Either way the recorded file exists and is loaded. The decision costs you nothing at 16:30 because both paths are one button.

---

## 8. Friday, hour by hour

| Time | Task |
|---|---|
| 09:00 | Check-in, breakfast. **Set up laptop, confirm wifi, test screen mirroring now.** |
| 10:00–11:00 | Opening remarks + workshops. Write `AGENTS.md` into the repo. **Cortex spike (§7), 15 min max.** No feature code. |
| **11:00–11:30** | Scaffold: `create-next-app`, Tailwind, deps, `.env`, first commit, first deploy |
| **11:30–12:00** | `pricing.ts` + one real agent call working end to end |
| 12:00–12:35 | Lunch |
| **12:35–13:15** | **THE LOAD-BEARING HOUR.** One ugly page, no styling, runs all three configs, prints raw numbers. **Prove the panels diverge.** |
| **13:15–14:15** | Resource meter, forecast, Panel-3 adaptation logic, impossible task |
| **14:15–15:00** | Three panels, gauges, replay animation |
| **15:00–15:30** | **Record real runs.** Both tasks, several times. Save the best to `data/recorded.json`. Commit. |
| **15:30–15:55** | Polish. Headline section if time. Live-wifi trials (§7). |
| **15:55–16:00** | Submit. **Do not be editing at 15:59.** |
| 16:00–17:00 | Demos |
| 17:00 | Audience vote + awards |

### The 13:15 checkpoint

At 13:15 you must have an ugly page where **Panel 2 visibly overruns**. If it doesn't, stop building and fix the narrative — restructure around a different failure. Everything downstream assumes this works.

### Cut list — decided now, so Friday-you doesn't negotiate

**Cut in this order if behind at 14:00:**
1. Headline / bullets section
2. Context + Actions as *displayed* numbers (keep measuring them)
3. The impossible task
4. Panel 1 (merge into a single baseline)

**Never cut:**
- Panel 3 landing inside the limits with a real measured number
- One recorded run that plays reliably
- The rehearsed 3-minute script

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Panel 2 doesn't overrun** — demo has no story | **Existential** | Test by hand today, in a chat window, no code. If it behaves, restructure now. |
| Agents behave differently on stage | High | Recorded runs (§7) |
| Venue wifi | High | Recorded runs; live only if earned |
| Cortex spike overruns | Medium | Hard abandon 11:15 (§7) |
| Panels 2 and 3 look too similar | Medium | Make **money** divergence work before adding other axes |
| Vercel function timeout on 3 concurrent agents | Medium | Record from localhost (§3) |
| Another team does something budget-adjacent | Medium (~25–30%) | The one-line pivot in §5 |
| Scope creep into a marketing site | Medium | §4 Section 1 *is* the marketing site. Ten minutes. |

**On idea collision:** the Wildcard track literally names *"agent budgeting."* ~15–20 teams demo (60 min ÷ 3 min). Estimated ~50% chance someone works in this space; **<10% chance anyone builds the closed loop with this demo structure.** In audience voting, two teams with the same idea don't split — the better demo takes nearly all of it.

---

## 10. Prep — Wednesday and Thursday

**Nothing here is code.** All of it respects the no-pre-building rule.

### Today (Wednesday)

- [ ] **Test the Panel 2 assumption by hand.** Open a chat, give a task with tight limits — *"you have $0.50, be efficient"* — see whether it restrains itself. **20 minutes. Highest-value thing you do this week.** If it behaves, the demo needs restructuring and you have two days to do it calmly.
- [ ] Decide the two tasks: one answerable research question, one genuinely impossible one
- [ ] Read this doc; cut what you disagree with

### Thursday

- [ ] **API keys ready and funded.** Model key with credits actually on it. Search key (Tavily/Brave/Exa). `curl` each — confirm 200.
- [ ] **Skim Cortex quickstart** so Friday's 15-minute spike is a fair test, not a cold read. Reading docs is not building.
- [ ] **Environment cold-start ready.** Node current, editor set, Claude Code configured, git authenticated, Vercel logged in. *PlainSight lost time on a deploy-email mismatch — sort it now.*
- [ ] **Write down token prices** on paper. Input and output per million, every model you might call.
- [ ] **Write `AGENTS.md`** — idea, build order, cut list, honesty rules. A document, not code. This is what made PlainSight coherent.
- [ ] **Rehearse the script out loud, on a timer, three times.** Solo — no partner narrating while you drive.
- [ ] Sleep.

### Day-of checklist

- Browser 100% zoom, one tab, notifications off, full screen
- Page pre-loaded to the right scroll position
- Laptop plugged in
- Screen mirroring tested **during a break**, not at 16:38

---

## 11. Reference card — say these exactly

**Open:**
> *"AI agents don't know what they cost. So they never stop on their own — they get shut off, usually right before they finish. Same job. Same fifty cents. Three agents. Watch."*

**The turn (after Panel 2 fails):**
> *"Knowing the number isn't the same as managing it."*

**The incumbents (over the impossible task):**
> *"LiteLLM, AgentBudget, Claude Code — they all cap spending from the outside. A cap here does exactly this: it lets you spend the whole fifty cents, then stops you, and you get nothing. Mine quits at twelve cents and tells you it can't."*

**Close:**
> *"Everyone has built a fuse. I built a thermostat."*

**If challenged on prior art:**
> *"There are tools that cap spending. They all do it from the outside — they stop the agent. Nobody lets the agent steer."*

---

## 12. Verification

**Before recording (Friday ~15:00):**
1. Run the research task 3× — Panel 3 lands inside limits every time
2. Run the impossible task 3× — Panel 3 stops early every time
3. Check the arithmetic by hand once: tokens × price = the number on screen
4. Confirm no cost number originates from the model

**Before demoing:**
1. Reload fresh, play the recording start to finish, uninterrupted
2. Time it against the script
3. Full-screen it and read it from across the room — if the numbers aren't legible at 3 metres, they're too small

---

## Open items

- Which model(s) for the agent loop — decide Thursday when you write down prices
- Which search API — Tavily is simplest; whichever you already have a key for
- **Actions** vs **Calls** as the fourth label (§2)
