const request = require("supertest");
const app = require("../src");
const { resetLimiter } = require("../src/middleware/rateLimiter");

afterEach(() => {
  resetLimiter();
});

describe("Rate Limiter Middleware", () => {
  test("allows requests under limit", async () => {
    const res = await request(app).get("/api/health");
    console.log("Allowed request:", res.statusCode, res.body);
    expect(res.statusCode).toBe(200);
  });

  test("blocks excessive requests", async () => {
    resetLimiter({ windowMs: 60 * 1000, max: 5 });

    const responses = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/api/health");
      responses.push(res);
      console.log(
        `Request ${i + 1}:`,
        res.statusCode,
        res.headers["x-ratelimit-remaining"],
      );
    }

    const blocked = responses.filter((r) => r.statusCode === 429);
    console.log("Blocked requests:", blocked.length);
    expect(blocked.length).toBeGreaterThan(0);
  });
});
