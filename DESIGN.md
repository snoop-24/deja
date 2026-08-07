# Design Doc — Same Answer, Less Spend

**Event:** Snowflake × Beta Fund — Agent & Token Economy Hackathon
**Where:** Menlo Park, CA
**When:** Friday 7 August 2026
**Builder:** Sid, solo
**Written:** Wednesday 5 August 2026
**Replaces:** the "Agent Resource Manager" doc, whose premise was empirically disproven on 5 August (see §14)

---

## Context

One-day hackathon. **Build window 11:00–16:00**, minus lunch. **Three-minute demo.** Winner decided by **audience vote — there is no judging panel.**

Verified from the event page:

| | |
|---|---|
| **Tracks** | **Cost of Intelligence** (reduce AI operating expense) · **Value of Intelligence** (demonstrated willingness-to-pay) · **Wildcard** |
| **Agenda** | 9:00 check-in · 10:00–11:00 opening + workshops · **11:00–16:00 build** · **16:00–17:00 demos AND voting** · 17:00 awards |
| **Prizes** | $600 / $500 / $400, plus a **$200 standout team** award with an UpScaleX consult |

Four facts drive every decision below:

1. **Real building time is ~3 hours**, not 5. Setup, recording, and submission eat the rest.
2. **Demos and voting share one 60-minute block.** At 3 minutes plus transitions that is **~15–18 teams**, and every voter sees every demo.
3. **The vote happens at the end, not per demo.** Nobody holds a scorecard. This is a **recall contest** — what wins is what a tired room can still picture at 17:00 after fourteen other demos.
4. **"An agent with a wallet" is the modal submission.** At a comparable event, 97% of entries had agents making financial decisions autonomously. The category is named in the event title, so the centre of the track will be crowded. Win by being an odd shape inside it, not the best execution of its middle.

Calibration — **PlainSight** (CSI Hacks, July 2026): 2 people, direction locked 12:45, shipped 15:21. ~5.2 person-hours produced the demoed version. Friday gives ~2.9 person-hours, solo, from an empty folder. **Roughly 55% of that capacity.**

**Constraint set by Sid:** nothing is built before Friday. Prep is limited to API keys, dev environment, documents, and rehearsal.

---

## 1. The product

### One line

> **Your agent gets the same answer for a quarter of the price — and shows you the receipt so you can check it.**

### The problem, plainly

Give an agent a hard job and it takes the long way round. It searches three times when one query would do. It re-reads what it already knows. It uses a big expensive model for a step a small one could handle. It re-verifies things that were settled ten steps ago.

The answer comes back fine. You just paid three or four times what it needed to cost, and nothing tells you that.

Every tool on the market watches spending **after the fact, in aggregate**. Nothing makes a single run cheaper while it happens.

### The claim, and the word that carries it

**Same result. Fewer resources.**

The load-bearing word is **same**. Anyone can spend less by doing less — that is not a product, that is a worse agent. The whole claim rests on the output being *equivalent*, and equivalence has to be **provable on screen**, not asserted.

### Why this and not the obvious version

The obvious Cost-of-Intelligence demo is "we stopped the agent from overspending." That was the previous version of this doc, and it is dead — see §14. Agents obey their limits. Tested four times, obeyed four times.

The finding that survived is the opposite one, and it is what this product is built on.

---

## 2. What the product actually does

Five concrete optimizations. Each one is small, implementable, and independently demonstrable — that matters, because on a 3-hour clock you need things you can *build*, not effects you have to *hope for*.

| # | Optimization | Why it saves | Evidence we have |
|---|---|---|---|
| 1 | **Batch related queries** into one call instead of several | Fewer round trips, less repeated context | **Observed.** The agent did this unprompted under constraint — batched two separate lookups into a single search |
| 2 | **Stop when the job is done**, not when the allowance runs out | Complex runs consume nearly the whole budget by default | **Observed.** Test C used 7 of 8 allotted actions on a hard task |
| 3 | **Route easy sub-steps to a cheaper model** | Llama 3.1 8B is ~12× cheaper than Llama 3.3 70B on input | Published Groq pricing (§7) |
| 4 | **Don't re-verify what's settled** | Re-verification is the most common redundant step | Partial — the agent named re-verification as the thing it cut first under pressure |
| 5 | **Trim what gets resent** each turn | Agents resend the whole conversation every step; context compounds | Structural, not yet measured |

**Cut order if short on time:** build 1 and 2 first. They produce the largest visible gap for the least code. 3 is the best-value addition if time allows. 4 and 5 are bonuses.

---

## 3. How "same result" is proven

**This is the most important section in the document.** It is what separates this from every "we made AI cheaper" claim in the room.

### The rule

**No model grades any output. Ever.**

The moment an LLM judges whether two answers are equivalent, the model is producing your number, and the entire thing collapses into an assertion. This is the PlainSight spine and it is non-negotiable.

### The mechanism

The demo task has a **fixed answer key, written by Sid before either run happens.**

- Pick a hard, multi-step task with **checkable facts** — 8 specific things that are either right or wrong.
- Write the key by hand. Commit it.
- Both runs are scored by **your TypeScript counting matches against the key.** Deterministic.
- **The key is shown on screen during the demo.** The room counts along.

### The line this earns you

> *"I'm not telling you it's the same answer. Here's the answer key. Count them yourself."*

Nobody else in that room will be able to say that, and it converts your honesty habit from a caveat into the strongest moment in the demo.

### The three tiers (carried from PlainSight)

| | Where it comes from |
|---|---|
| **REAL — measured** | Token counts. Straight from the API `usage` field on every response. |
| **REAL — published** | Groq's list prices, cited on screen with the model name. |
| **ARITHMETIC — deterministic** | Every dollar figure. Plain multiplication in TypeScript. **The model never emits a price, a token count, or a score.** |

### One honesty item that must be on screen

Groq's free tier **does not charge you.** So the dollar figures are *published list prices × measured token counts* — real arithmetic on real measurements, but not money that left an account.

Say it once, plainly, and put it in the footer. This is the same move as PlainSight using industry-standard CPM constants rather than its own measurements. The arithmetic stays honest; the label does the work.

---

## 4. Where the agents run

The agent is **your code, not a service you rent**:

```
ask the model what to do next
  → it says "search for X"
  → your code runs the search
  → your code feeds the result back
  → ask again … until done
```

~180 lines in `lib/agent.ts`, running in a Next.js API route on your laptop. Groq is a service the loop calls over HTTPS. It provides the thinking. **All metering, scoring and pricing live in your code.**

### Two agents = one function, two configs

```ts
type Mode = 'baseline' | 'optimized'
```

| Mode | Difference |
|---|---|
| `baseline` | Naive loop. One query per question, full context resent, big model for everything, verifies as it goes. |
| `optimized` | The five optimizations from §2. |

One code path, one flag. A third of the work, and better evidence — the only thing differing between panels is the thing you claim matters.

### What runs during the demo

See §8 — Groq is fast enough (~394 tokens/sec on a 70B) that **live is genuinely on the table** this time, which is a change from the previous plan. Recorded remains the default.

---

## 5. What gets built

One page, top to bottom.

**Section 1 — What this is** *(~10 min)*
Headline, one sentence, three bullets. Scrolled past during the demo; matters for anyone opening the link later. This replaces a separate marketing site.

**Section 2 — The task**
The hard task, stated. The answer key, visible. A **Run** button and a **Run Live** button.

**Section 3 — Two panels** *(the main event)*

| Panel | Label on screen |
|---|---|
| 1 | **Ordinary agent** |
| 2 | **Optimized** |

Each shows a plain-English feed (*"Searching for competitor pricing…"*), a running **cost** figure, and a **score** that fills in against the key as facts are confirmed.

**Section 4 — The receipt**
Side by side: cost, tokens, calls, elapsed, score. Then the saving as a percentage, computed, not typed.

---

## 6. The demo — 3 minutes

Rehearse to **2:40**. The slack is not optional.

> **The figures below are now MEASURED, not placeholders.** Replaced 6 Aug 2026 from `secondrun/data/recorded.json` — a real run on `openai/gpt-oss-120b`, reproduced three times at 86.1% / 82.8% / 88.6%.
>
> | | first run | second run |
> |---|---|---|
> | cost | **$0.0035** | **$0.0005** |
> | model calls | 6 | **1** |
> | corpus queries | 12 | **0** |
> | score | 6/8 | 6/8 — **the same six** |
>
> Sub-cent figures are hard to say and hard to read at three metres. **Pick one phrasing at rehearsal and stay with it:**
> - **(a) literal** — *"Thirty-five hundredths of a cent. Five hundredths of a cent."*
> - **(b) per thousand runs** — *"Three dollars fifty. Fifty cents."* Same arithmetic on the same measurement, scaled — say "per thousand runs" once so it is not mistaken for the per-run figure.
>
> Re-record before the demo if anything changes, and **do not say a number you have not measured that day.**

| Time | Screen | Say |
|---|---|---|
| **0:00–0:20** | Task and answer key visible | *"This is a hard research job, and these eight facts are the answer. I wrote them down before I ran anything. Two agents, same job, same model. Watch the price."* → **Run** |
| **0:20–1:10** | Both running, costs climbing | *"Left one is an ordinary agent. It searches once per question, re-reads what it already knows, uses the big model for everything. Right one does the same job — it just doesn't take the long way round."* |
| **1:10–1:40** | Both scores complete | *"Both got the same six out of eight. Not six each — the **same** six. Here's the key — count them."* **← PAUSE. Let the room look.** |
| **1:40–2:10** | Costs side by side | *"Three dollars fifty per thousand runs. Fifty cents. Same six facts, a seventh of the price. Nothing on this screen came from the AI — it counted its own tokens, I multiplied by Groq's published prices, and that's the whole calculation."* |
| **2:10–2:35** | Receipt | *"The saving isn't magic and it isn't a smarter agent. The first run made six searches. The second made none — it already knew. That's the whole product."* |
| **2:35–2:45** | Stop. Look up. | *"Everyone's trying to make AI answers better. This one makes the same answer cheaper — and shows you the arithmetic."* **Stop talking.** |

**The three moments that win it:** the pause on the answer key, the two cost figures side by side, and saying out loud that no number came from the model. If short on time, cut 2:10 — never those.

**Optional beat, if the room feels warm:** before revealing the second cost, **ask the room to guess it.** Audience participation is the strongest recall device available in a 3-minute slot, and this format votes on recall. Practise it both ways; decide live.

**If a team before you shows a cost dashboard:** *"You just saw someone measure what their agent costs. I'm going to make it cost less."*

---

## 7. Architecture

Next.js, same as PlainSight. **No streaming** — run both, collect the transcript, animate client-side. SSE plumbing eats an hour and can half-fail on stage.

```
lib/pricing.ts      Groq prices per model. arithmetic only.        ~40 lines
lib/score.ts        match run output against the committed key      ~60
lib/agent.ts        ONE loop, two configs (§4)                     ~200
data/answer-key.json  the 8 facts, written by hand                    —
app/api/run/        runs both, returns full transcript              ~70
app/page.tsx        two panels + receipt + replay                  ~280
data/recorded.json  runs recorded at 15:00 Friday                     —
```

**~650 lines.** PlainSight was 4,717 with a partner over more hours.

### Groq specifics

- Free tier: **30 RPM / 6,000 TPM / 14,400 req per day.** 6K TPM **will** rate-limit an agent loop, because context compounds every turn.
- **Add a card at zero minimum spend** → 10× the limits and 25% off. Costs nothing at this volume. Do this Thursday.
- Prices to hard-code: **Llama 3.3 70B $0.59 / $0.79** · **GPT-OSS 120B $0.15 / $0.60** · **Llama 3.1 8B $0.05 / $0.08** per million in/out.
- Open models are *more* wasteful than frontier models. That is headroom — it makes the gap bigger, not smaller.

---

## 8. The two day-of decisions

### Snowflake Cortex — decide by 10:45

Still undecided, still Sid's call on the day. Cortex gives sponsor goodwill in an audience vote and there are Snowflake engineers in the room.

**Decision rule:** use the 10:00–11:00 workshop to try one Cortex call. **Working response in under 15 minutes → take it**, as an *extra model option inside `lib/pricing.ts`*, never the only path. **Hard abandon at 11:15.**

Natural fit if it works: Cortex becomes one of the models the optimizer can route to, and "which model is cheapest for this step" is a genuine question their platform doesn't answer well.

### Run vs. Run Live — decide by 16:30

Build both buttons. Groq's speed makes live viable in a way it wasn't before.

- Between 15:30 and demo time, **run it live on venue wifi three times.** All three clean → Run Live is available.
- Any failure, any lag → recorded. No deliberation.
- **Default is recorded.** Live is the upgrade you earn.
- If demoing from a recording, say so once, in passing: *"These ran an hour ago on this laptop — I'm replaying so I'm not betting the demo on the wifi."* An adult audience reads that as professional.

---

## 9. Friday, hour by hour

| Time | Task |
|---|---|
| 09:00 | Check-in. **Set up laptop, confirm wifi, test screen mirroring now.** |
| 10:00–11:00 | Opening + workshops. Write `AGENTS.md`. **Cortex spike, 15 min max.** No feature code. |
| **11:00–11:30** | Scaffold: `create-next-app`, Tailwind, deps, `.env`, first commit, first deploy |
| **11:30–12:00** | `pricing.ts` + one real Groq agent call working end to end |
| 12:00–12:35 | Lunch |
| **12:35–13:15** | **THE LOAD-BEARING HOUR.** Write the answer key. Ugly page, no styling, both configs run, raw numbers printed. **Prove the cost gap exists.** |
| **13:15–14:15** | Scoring against the key. Optimizations 1 and 2. Then 3 if moving well. |
| **14:15–15:00** | Two panels, receipt, replay animation |
| **15:00–15:30** | **Record real runs.** Several times. Best to `data/recorded.json`. Commit. |
| **15:30–15:55** | Polish. Headline section if time. Live-wifi trials (§8). |
| **15:55–16:00** | Submit. **Do not be editing at 15:59.** |
| 16:00–17:00 | Demos + voting |

### The 13:15 checkpoint

**At 13:15 you must have two raw numbers that differ.** If baseline and optimized cost the same, stop building and fix the task — it is almost certainly too easy (see §10). Everything downstream assumes this gap exists.

### Cut list — decided now, so Friday-you doesn't negotiate

**Cut in this order if behind at 14:00:**
1. Headline / bullets section
2. Optimizations 4 and 5
3. The live-run button
4. Optimization 3 (model routing)

**Never cut:**
- The answer key on screen
- Two cost figures side by side with equal scores
- One recorded run that plays reliably
- The rehearsed 3-minute script

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **No cost gap — both agents cost the same** | **Existential** | Test before Friday (§11). Task must be **hard**; on easy tasks the agent is already frugal — measured. |
| **Optimized run scores lower** — you've built a worse agent | **Existential** | Score every run against the key from the first working build. If quality drops, cut the optimization that caused it. |
| Groq rate limits mid-run | High | Add card Thursday for 10× limits (§7) |
| Task too easy → agent already efficient | High | **Measured:** given $0.50 it used ~$0.02 on a simple task. Use a complex, multi-step task — test C used 7 of 8 actions. |
| Venue wifi | High | Recorded runs; live only if earned |
| Cortex spike overruns | Medium | Hard abandon 11:15 (§8) |
| Another team does something cost-related | Medium–High | Near-certain, given the track name. The one-line pivot in §6. |
| Someone names Ares / ZEBRA / BAGEN | Low | Agree immediately. See §12. |

**On idea collision:** *Cost of Intelligence* is a named track and "agent with a wallet" is the modal build. Expect several cost-adjacent demos. Your separation is the **answer key** — nobody else will prove equivalence, they'll assert it.

---

## 11. Prep — tonight and Thursday

**Nothing here is code.** All of it respects the no-pre-building rule.

### Tonight (Wednesday)

- [ ] **Create the Groq key** at `console.groq.com/keys`. **Add a card for the zero-minimum developer tier** — 10× rate limits, 25% off, no meaningful charge. This is the single highest-value thing on the list.
- [ ] Tell Claude where the key is so the **gap test** can run (below).

### Thursday

- [ ] **THE GAP TEST — highest-value item on this page.** On a genuinely hard task, does the optimized path cost meaningfully less *and* score identically against a fixed key? **This is untested.** If the gap isn't real, you find out Thursday with a day in hand rather than at 13:15 Friday.
- [ ] **Write the hard task and its 8-fact answer key by hand.** This is a document, not code, and it is the hardest creative work in the project. Do not leave it for Friday.
- [ ] `curl` the Groq key — confirm a 200 and confirm `usage` comes back in the response.
- [ ] **Environment cold-start ready.** Node, editor, Claude Code, git, Vercel logged in. *PlainSight lost time to a deploy-email mismatch — sort it now.*
- [ ] **Write down Groq's prices on paper** (§7).
- [ ] **Skim the Cortex quickstart** so Friday's 15-minute spike is a fair test, not a cold read.
- [ ] **Write `AGENTS.md`** — idea, build order, cut list, honesty rules.
- [ ] **Rehearse the script out loud, on a timer, three times.** Solo.
- [ ] Sleep.

### Day-of checklist

- Browser 100% zoom, one tab, notifications off, full screen
- Page pre-loaded to the right scroll position
- Laptop plugged in
- Screen mirroring tested **during a break**, not at 16:38
- **Do not take a middle demo slot** if slots are offered — end-of-contest popular voting carries a documented order bias favouring first and last

---

## 12. Reference card — say these exactly

**Open:**
> *"This is a hard research job, and these eight facts are the answer. I wrote them down before I ran anything. Two agents, same job, same model. Watch the price."*

**The turn (both scores complete):**
> *"Both got the same six out of eight. Not six each — the same six. Here's the key, count them."*

**The number:**
> *"Three dollars fifty per thousand runs. Fifty cents. Same six facts, a seventh of the price."*

**If asked why six and not eight** — concede it flatly, it costs nothing:
> *"Neither run got all eight. The second one reproduced the first exactly, gaps included — that's the point. It's not a better agent, it's the same agent not paying twice."*

**The honesty line (this is the differentiator — do not skip it):**
> *"Nothing on this screen came from the AI. It counted its own tokens, I multiplied by Groq's published prices, and that's the whole calculation."*

**Close:**
> *"Everyone's trying to make AI answers better. This one makes the same answer cheaper — and shows you the arithmetic."*

**If challenged on prior art** — this will happen, and agreeing instantly is the strong move:
> *"Yeah — adaptive compute allocation is a real research area, Ares and ZEBRA and a few others. What I haven't seen is anyone prove the answer is actually the same. That's what the key is for."*

**Never say:** "nobody has built this." Someone will name a paper and you lose the room.

---

## 13. Verification

**Before recording (Friday ~15:00):**
1. Run both configs 3× — optimized scores **equal** to baseline every time
2. Run both configs 3× — optimized costs **visibly less** every time
3. Check the arithmetic by hand once: tokens × published price = the number on screen
4. Confirm no cost, token count, or score originates from the model
5. Confirm the answer key on screen matches `data/answer-key.json`

**Before demoing:**
1. Reload fresh, play the recording start to finish, uninterrupted
2. Time it against the script
3. Full-screen it and read it from across the room — if the numbers aren't legible at 3 metres, they're too small

---

## 14. What was tested, and what it killed

Recorded so Friday-you doesn't re-litigate settled questions.

**Five controlled runs through claude.ai, 5 August:**

| Finding | Status |
|---|---|
| Agents **obey** stated constraints | **Confirmed 4/4.** Killed the "agent overruns its budget" premise the previous doc was built on. |
| Agents count their own **actions** accurately | Confirmed every run |
| Agents **never state a dollar figure** — money is invisible to them | Confirmed |
| Given $0.50 on an easy task → ~$0.02 spent, **~98% unused** | Confirmed. **This is why the demo task must be hard.** |
| On a hard task → **7 of 8 actions used** | Confirmed. This is where the headroom is. |
| Agent **batched two searches into one** unprompted | Observed. This is optimization #1, and the agent already knows how. |

**Prior art, checked:** [Ares](https://arxiv.org/pdf/2603.07915), [ZEBRA](https://arxiv.org/pdf/2605.20485), ["Spend Less, Reason Better"](https://huggingface.co/papers/2603.12634), [BAGEN](https://arxiv.org/abs/2606.00198). Adaptive compute allocation is an active research field. **You are not claiming novelty.** You are claiming a working, verifiable artifact — which none of those are.

**Still untested, and it is load-bearing:** whether the cost gap is real and large on a hard task with equal scores. See §11.

---

## Open items

- **The hard task and its 8-fact answer key** — the most important unwritten thing. Thursday.
- Product name. "Same Answer, Less Spend" is a description, not a name.
- Which Groq model as baseline — Llama 3.3 70B is the sensible default; decide after the gap test.
- Whether to include the audience-guess beat (§6) — decide after rehearsing both.
