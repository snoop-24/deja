/**
 * Check before you burn: what Groq will actually let you do right now.
 *
 *   cd secondrun && npm run quota
 *
 * Sends a 1-token request per model and reads the rate-limit headers off the
 * response. Costs a handful of tokens in total.
 *
 * IMPORTANT — what this cannot tell you. Groq exposes the per-MINUTE token
 * budget in headers, but NOT the per-day one. The daily limit only becomes
 * visible in the body of a 429 once you have already hit it. So a green result
 * here means "not rate-limited this minute", NOT "you have daily budget". On
 * 6 Aug a 1-token probe returned HTTP 200 while the daily bucket sat at
 * 198,947 of 200,000 — the tiny request fit and nothing else would have.
 *
 * The daily limit is a ROLLING 24-hour window, not a midnight reset. Tokens
 * spent tonight are still counted against you this time tomorrow.
 */

const MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

const BASE = process.env.GROQ_BASE_URL;
const KEY = process.env.GROQ_API_KEY;

if (!KEY) {
  console.error('GROQ_API_KEY not set. Run with --env-file=.env.local');
  process.exit(1);
}

console.log('Per-minute token budget, live from Groq headers:\n');
console.log('model'.padEnd(26) + 'limit/min'.padStart(10) + 'remaining'.padStart(11) + '  status');
console.log('-'.repeat(60));

for (const model of MODELS) {
  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });
  } catch (e) {
    console.log(model.padEnd(26) + '  unreachable — ' + e.message);
    continue;
  }

  const limit = res.headers.get('x-ratelimit-limit-tokens') ?? '?';
  const remaining = res.headers.get('x-ratelimit-remaining-tokens') ?? '?';

  let status = 'ok';
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    // The daily figure lives here and nowhere else.
    const daily = /tokens per day \(TPD\): Limit (\d+), Used (\d+)/.exec(msg);
    status = daily
      ? `DAILY EXHAUSTED — used ${Number(daily[2]).toLocaleString()} of ${Number(daily[1]).toLocaleString()}`
      : msg.slice(0, 60);
  }

  console.log(model.padEnd(26) + String(limit).padStart(10) + String(remaining).padStart(11) + '  ' + status);
}

console.log(
  '\nA full gap test costs ~28,000 tokens; --only=baseline costs ~14,000.' +
    '\nDaily budget refills at roughly 167 tokens/min (~10K/hour) once you stop spending.' +
    '\n"ok" above means the minute is clear, NOT that the day is. See the note in this file.',
);
