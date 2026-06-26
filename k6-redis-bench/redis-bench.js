import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const SCENARIO = __ENV.SCENARIO || "all";

const loginAccounts = new SharedArray("login accounts", function () {
  return JSON.parse(open("./seeded-accounts.json"));
});

const registerDuration = new Trend("register_duration", true);
const loginDuration = new Trend("login_duration", true);
const feedDuration = new Trend("feed_duration", true);
const rateLimited429 = new Counter("rate_limited_429_total");
const authFailures = new Counter("unexpected_auth_failures");

export const options = {
  scenarios: {
    moderate_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "40s", target: 20 },
        { duration: "2m", target: 30 },
        { duration: "1m", target: 30 },
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.9"],
  },
};

const REQUEST_TIMEOUT = "5s";

function randomEmail() {
  return `loadtest_${__VU}_${__ITER}_${Date.now()}@example.com`;
}

export default function () {
  const headers = { "Content-Type": "application/json" };

  if (SCENARIO === "register" || SCENARIO === "all") {
    const res = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        email: randomEmail(),
        password: "LoadTest123!",
        displayName: `LoadTester${__VU}`,
        whatBringsYou: "k6 load test",
      }),
      { headers, timeout: REQUEST_TIMEOUT, tags: { name: "register" } },
    );
    registerDuration.add(res.timings.duration);
    if (res.status === 429) rateLimited429.add(1);
    check(res, {
      "register: 201 or 400 (dup) or 429 (rate limited)": (r) =>
        [201, 400, 429].includes(r.status),
    });
    if (![201, 400, 429].includes(res.status)) authFailures.add(1);
  }

  if (SCENARIO === "login" || SCENARIO === "all") {
    const account =
      loginAccounts[Math.floor(Math.random() * loginAccounts.length)];
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: account.email, password: account.password }),
      { headers, timeout: REQUEST_TIMEOUT, tags: { name: "login" } },
    );
    loginDuration.add(res.timings.duration);
    if (res.status === 429) rateLimited429.add(1);
    check(res, {
      "login: 200 or 429": (r) => [200, 429].includes(r.status),
    });
    if (![200, 429].includes(res.status)) authFailures.add(1);

    if (res.status === 200 && (SCENARIO === "feed" || SCENARIO === "all")) {
      const token = JSON.parse(res.body).token;
      const feedRes = http.get(`${BASE_URL}/api/forum/feed?sort=hot`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT,
        tags: { name: "feed" },
      });
      feedDuration.add(feedRes.timings.duration);
      if (feedRes.status === 429) rateLimited429.add(1);
      check(feedRes, {
        "feed: 200 or 429": (r) => [200, 429].includes(r.status),
      });
    }
  }

  sleep(Math.random() * 0.5);
}
