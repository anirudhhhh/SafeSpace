const request = require("supertest");
const app = require("../src/index");

describe("Health API", () => {
  test("GET /api/health returns OK", async () => {
    const res = await request(app).get("/api/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
