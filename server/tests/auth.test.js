const request = require("supertest");
const app = require("../src/index");

describe("Authentication API", () => {
  test("register requires user details", async () => {
    const res = await request(app).post("/api/auth/register").send({});

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("login requires credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({});

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
