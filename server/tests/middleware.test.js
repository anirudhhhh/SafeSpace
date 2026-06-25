const request = require("supertest");
const app = require("../src/index");

describe("Security middleware", () => {
  test("unknown routes return 404", async () => {
    const res = await request(app).get("/random-route");

    expect(res.statusCode).toBe(404);
  });
});
