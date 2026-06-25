jest.mock("ioredis", () => {
  const store = new Map();

  const mockRedis = {
    get: jest.fn(async (key) => store.get(key) ?? null),
    set: jest.fn(async (key, value, ...args) => {
      store.set(key, value);
      if (args[0] === "EX" && typeof args[1] === "number") {
        setTimeout(() => store.delete(key), args[1] * 1000);
      }
      return "OK";
    }),
    del: jest.fn(async (key) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    on: jest.fn(),
    connect: jest.fn(async () => {}),
    call: jest.fn(async (...args) => {
      const [cmd, ...rest] = args;
      if (cmd === "GET") return mockRedis.get(rest[0]);
      if (cmd === "SET") return mockRedis.set(...rest);
      if (cmd === "DEL") return mockRedis.del(rest[0]);
      return null;
    }),
    _store: store,
  };

  return jest.fn(() => mockRedis);
});

const Redis = require("ioredis");

describe("Redis Cache Layer", () => {
  let client;

  beforeEach(() => {
    client = new Redis();
    client._store.clear();
  });

  test("returns null when cache key does not exist", async () => {
    const result = await client.get("nonexistent-key");
    expect(result).toBeNull();
  });

  test("stores and retrieves cached data", async () => {
    await client.set("user:1", JSON.stringify({ name: "Alice" }));
    const raw = await client.get("user:1");
    expect(JSON.parse(raw)).toEqual({ name: "Alice" });
  });

  test("overwrites existing cached data", async () => {
    await client.set("counter", "1");
    await client.set("counter", "2");
    const result = await client.get("counter");
    expect(result).toBe("2");
  });

  test("invalidates cached data", async () => {
    await client.set("session:abc", "token-xyz");
    await client.del("session:abc");
    const result = await client.get("session:abc");
    expect(result).toBeNull();
  });

  test("supports TTL expiration", async () => {
    await client.set("temp", "value", "EX", 1);
    const before = await client.get("temp");
    expect(before).toBe("value");

    await new Promise((r) => setTimeout(r, 1100));

    const after = await client.get("temp");
    expect(after).toBeNull();
  }, 5000);
});
