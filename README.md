# Deja

**Your agent already did this job. Why pay to do it twice?**

Deja cuts the cost of agentic work through reuse. The first time an agent completes a hard research task, it pays full price. Deja stores what the agent did, so the next run reuses that work instead of redoing it, returning the same answer for a fraction of the cost.

Built solo at the Snowflake x Beta Fund x Evermind Agent and Token Economy hackathon (Menlo Park, August 2026), on the Cost of Intelligence track.

## The idea

An agent doing real research burns tokens re-deriving things it, or another agent, already figured out. Deja gives agents a memory layer: the expensive first run is recorded, and every later run that hits the same work pulls the stored result instead of paying to recompute it. Same answer, measured cost reduction.

## What makes the number trustworthy

The whole project lives or dies on the numbers being real, so nothing here is produced by a model:

- The model never produces a number. Token counts come from the API usage field. Dollars come from published list prices in the code.
- No LLM ever grades whether two answers match. Equivalence is checked by string matching against an answer key committed before either run.
- Unknown model prices throw rather than guess.
- Every cost is a published list price times measured tokens, stated on screen.

This is the same discipline that should back any tool that claims to be a source of truth: let the deterministic parts produce the verdict, never the model.

## How it works

1. An agent runs a hard task over a corpus stored in Snowflake, using search as its only tool.
2. The baseline run completes the task normally, and its cost is measured.
3. The optimized run reuses stored work from the Evermind EverOS memory layer instead of re-searching, and its cost is measured the same way.
4. The two answers are scored against a pre-committed answer key by string match, and the cost reduction is shown on screen.

## Stack

- Next.js (the app and dashboard)
- Snowflake (the corpus the agent searches)
- Evermind EverOS (the agent memory layer)
- Groq (the LLM behind the agent loop, OpenAI-protocol compatible)

## Honesty notes

Built in a hackathon. Costs are list-price estimates times measured tokens, not billed amounts. Adaptive compute reuse is an existing research area; the contribution here is a working, verifiable artifact, not a new idea.
