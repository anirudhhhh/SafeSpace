# Redis impact benchmark — how to run

These files measure two different things, deliberately:

1. **Latency under load**, with Redis up vs Redis down (k6 + this README)
2. **Redis's actual isolated overhead** per rate-limit check (server patch)

Read `server-patch-instructions.md` first for an important caveat: on a
single server instance, Redis is _unlikely_ to make requests faster than
in-memory — its real job here is cross-instance consistency, not speed.
Decide which story your metrics need to tell before you run this.

## Files

- `redis-bench.js` — the k6 script (register + login + feed, 500 VU ramp)
- `seed-accounts.js` — creates real accounts so the login scenario has
  valid credentials to authenticate against (k6 can't hash bcrypt passwords
  itself, it needs accounts that already exist)
- `server-patch-instructions.md` — server-side timing patch + the
  multi-instance test idea for showing Redis's _actual_ benefit

## Step 0 — set a sane rate limit and clear stale state

Before running anything, in your **server's** `.env`:

```
RATE_LIMIT_MAX=5000
```

Why 5000 and not the default (1000) or something huge (50000):

- Too low (e.g. default 1000) → the limiter saturates almost instantly under
  concurrent load and **every single request gets rejected with 429 for the
  rest of the run** — you end up comparing "100% rejected" against "100%
  rejected," which tells you nothing about Redis.
- Too high (e.g. 50000) → the limiter stops filtering meaningfully, so nearly
  all traffic reaches your real route handlers. Since `bcrypt` hashing is
  CPU-bound and blocks Node's single-threaded event loop, flooding it with
  thousands of concurrent hash operations causes requests to queue behind
  each other so badly that latency balloons into the **tens of seconds**
  (this happened in testing — `curl` itself timed out while the server was
  technically still "up"). At that point you're measuring bcrypt's CPU
  saturation, not Redis.
- A moderate value lets enough traffic through to produce real concurrent
  DB/bcrypt work, while still leaving the rate limiter doing its actual job
  (some 429s, not 0% and not 100%).

Restart your server **fully** (Ctrl+C, not nodemon's `rs` or auto-reload —
nodemon does not watch `.env` for changes) after editing this.

Then flush any rate-limit counters left over from previous test runs —
otherwise a stale count from an earlier run (possibly at the old, lower
`max`) will make a "fresh" run look saturated from request #1:

```bash
redis-cli FLUSHALL
redis-cli KEYS "*"   # should print (empty array)
```

## Step 1 — install k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# or via Docker, no install needed:
# docker run --rm -i grafana/k6 run - <redis-bench.js
```

## Step 2 — seed login accounts (once per test run you want fresh data for)

```bash
node seed-accounts.js --count=200 --base=http://localhost:3001
```

This writes `seeded-accounts.json` next to it. k6 reads this file directly.

## Step 3 — apply the timing patch

Follow `server-patch-instructions.md` — wrap `sendCommand` in
`middleware/rateLimiter.js` so Redis round-trip time gets logged per call.
Restart your server after applying it.

## Step 4 — run WITH Redis (baseline "Redis on")

Make sure Redis is running and your server logs `Redis connected successfully`
and `[rate-limit] Using Redis store` on boot. While the test runs, keep an
eye on `top`/`htop` for the `node` process — if CPU pins at 100% and request
durations climb past a second or two, that's the bcrypt/event-loop ceiling,
not Redis; consider lowering VU targets in `redis-bench.js` further if so.

```bash
cd k6-redis-bench
BASE_URL=http://localhost:3001 SCENARIO=all k6 run redis-bench.js \
  --summary-export=results-redis-on.json | tee redis-on.log
```

## Step 5 — run WITHOUT Redis ("Redis off" / in-memory fallback)

Stop Redis (`redis-cli shutdown`, or stop the service/container), restart your
Node server so it falls back to the in-memory rate limit store (your code
already does this gracefully — watch for `[rate-limit] Using memory store`
in the server log). The in-memory store starts at zero on every restart, so
no flush step is needed here — but if you're alternating Redis on/off
multiple times across a session, restart cleanly each time so neither store
carries stale counts into the next run.

```bash
BASE_URL=http://localhost:3001 SCENARIO=all k6 run redis-bench.js \
  --summary-export=results-redis-off.json | tee redis-off.log
```

## Step 6 — compare

k6's summary output (printed to stdout and the exported JSON) gives you, per
named request tag (`register`, `login`, `feed`):

- `http_req_duration` — avg / p90 / p95 / p99
- `http_reqs` — total throughput
- your custom `rate_limited_429_total` counter — how many requests got
  rate-limited in each run (this number itself is a finding: if Redis-off
  shows fewer 429s at the same load, that's a sign the in-memory limiter is
  failing to cap correctly, e.g. if you load test against multiple instances)

Pull the two JSON summaries into a quick table:

```bash
echo "metric,redis_on,redis_off"
for f in http_req_duration:avg http_req_duration:p(95) rate_limited_429_total:count; do
  metric="${f%%:*}"; stat="${f##*:}"
  on=$(jq ".metrics[\"$metric\"][\"$stat\"]" results-redis-on.json)
  off=$(jq ".metrics[\"$metric\"][\"$stat\"]" results-redis-off.json)
  echo "$metric.$stat,$on,$off"
done
```

(requires `jq`; adjust field paths if your k6 version's JSON summary schema
differs — check with `jq . results-redis-on.json | less` first)

Also grep the `[redis-timing]` lines from your server log during the
Redis-on run per `server-patch-instructions.md` — that's your isolated
"Redis overhead per check" number, independent of the k6 totals.

## A note on what this load profile actually stresses

At 150 concurrent VUs hitting `/register` and `/login`, `bcrypt`'s hashing
cost (intentionally slow, CPU-bound, blocks Node's single event-loop thread)
will still be the dominant cost in total latency — more so than Redis. This
was confirmed directly while building this test: at 500 VUs with a high rate
limit, request latency ballooned to 18-22 _seconds_ and `curl` itself timed
out, because hundreds of bcrypt calls were queuing behind each other on one
CPU core. 150 VUs is a deliberately chosen ceiling meant to stay below that
collapse point on typical dev hardware — if your numbers still show
multi-second latencies or timeouts, lower the `target` values in
`redis-bench.js`'s `stages` further.

If your goal is a clean, low-noise read on Redis's _own_ overhead specifically
(isolated from bcrypt), use `SCENARIO=feed` with a long-lived token obtained
once outside the loop — that exercises the rate limiter on a route that
doesn't touch bcrypt at all, giving you a more surgical comparison.
