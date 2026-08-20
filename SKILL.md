---
name: crypto-macro-agent
description: Run the daily crypto/macro analysis pipeline — fetch free market data, run 6 specialist/review agents (Macro, On-chain, Sentiment, Synthesis, Risk Reviewer, Report Writer), and publish the resulting report to Supabase for the web dashboard. Use when the user asks to run the crypto macro report, or when triggered by the daily schedule.
---

# Crypto Macro Agent

Report-only. This skill never places trades and never should. Every
run must pass through the Risk Reviewer step — do not shortcut it
even if the Synthesis draft looks confident.

## Step 1 — Fetch data

Run:

```bash
node ~/.claude/skills/crypto-macro-agent/scripts/fetch-data.mjs ~/.claude/skills/crypto-macro-agent/runs/<today's date, YYYY-MM-DD>
```

`FRED_API_KEY` must be set in the environment. This writes
`raw-data.json` under the run directory. Read that file before
dispatching any subagent below — every subagent gets only the slice
of `raw-data.json` relevant to its role, not the whole file, to keep
each agent focused.

If any field in `raw-data.json` has `"status": "unavailable"`, note
it — it must be surfaced in the final report, never silently
papered over.

## Step 2 — Specialist agents (dispatch in parallel via the Agent tool)

1. **Macro Agent** — give it `macro` (fed funds rate, dollar index,
   10y yield, M2, VIX). Ask it to classify the current regime on two
   axes: liquidity (loosening/tightening) and risk sentiment
   (risk-on/risk-off), each with a confidence level (low/med/high)
   and the specific numbers that justify the call.
2. **On-chain/Market Agent** — give it `derivatives` (funding rate +
   open interest for BTCUSDT/ETHUSDT) and `market.global` (BTC/ETH
   dominance, total market cap). Ask it whether leverage looks
   skewed long or short (squeeze risk) and how dominance is
   shifting, with confidence level.
3. **Sentiment Agent** — give it `sentiment` (Fear & Greed index +
   headline titles). Ask it whether crowd positioning looks extreme
   or neutral, and to explain *why* using the headlines — not just
   restate the index number.

Each specialist agent must return: its read, confidence level, and
the specific data points it relied on (so the Risk Reviewer can
later check whether they all leaned on the same blind spot).

## Step 3 — Synthesis agent

Give it all three specialist outputs. Ask it to write a draft
conclusion that states, per claim, which specialist(s) support it and
at what confidence — it must not introduce claims the specialists did
not make.

## Step 4 — Risk Reviewer / Devil's Advocate (mandatory, no shortcuts)

Give it the Synthesis draft and all three specialist outputs. Its
only job is to try to refute the draft: What would have to be true
for this to be wrong? Are the three specialists all leaning on the
same hidden assumption (e.g. all bullish because all three ignored
the same upcoming macro event)? It must output a **risk-budget
recommendation as a percentage** (never a dollar amount) and a
suggested stop-loss level, plus the strongest counter-case it found.

## Step 5 — Report Writer

Combine everything into one Markdown report with these sections, in
order: Executive summary, Macro read, On-chain/market read, Sentiment
read, Synthesis, Risk Reviewer's counter-case, Risk-budget
recommendation, Data availability (list any `"unavailable"` sources
from Step 1), and a fixed disclaimer:

> This is a decision-support tool, not investment advice. Final
> decisions are the user's alone.

## Step 6 — Publish

Run:

```bash
node ~/.claude/skills/crypto-macro-agent/scripts/publish-report.mjs <path-to-report.md> <YYYY-MM-DD>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be set in the
environment. Confirm the script prints `Published report for
<date>` before considering the run complete.

## Guardrails

- Never call any exchange API with trading scope. Only the read-only
  public endpoints in `fetch-data.mjs` are in scope.
- Never skip Step 4 (Risk Reviewer), regardless of how confident the
  Synthesis draft looks.
- Never invent a value for a data point marked `"unavailable"` —
  report the gap instead.
