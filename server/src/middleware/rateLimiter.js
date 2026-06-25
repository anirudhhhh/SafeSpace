const rateLimit = require("express-rate-limit");
const { config, redis } = require("../config");

let redisStore = null;
let storeInitAttempted = false;

function getRedisStore() {
  if (storeInitAttempted) return redisStore;
  storeInitAttempted = true;

  if (!redis || redis.status !== "ready") {
    console.log("[rate-limit] Redis not ready, using in-memory store");
    return null;
  }

  try {
    const { default: RedisStore } = require("rate-limit-redis");

    redisStore = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
    });

    console.log("[rate-limit] Using Redis store");
    return redisStore;
  } catch (err) {
    console.warn("[rate-limit] Redis store init failed, using in-memory:", err.message);
    return null;
  }
}

function createLimiter() {
  let limiterInstance = null;

  return (req, res, next) => {
    if (!limiterInstance) {
      const store = getRedisStore();
      limiterInstance = rateLimit({
        windowMs: config.rateLimitWindowMs,
        max: config.rateLimitMax,
        message: { error: "Too many requests, please try again later" },
        standardHeaders: true,
        legacyHeaders: false,
        ...(store ? { store } : {}),
      });
    }
    limiterInstance(req, res, next);
  };
}

module.exports = createLimiter();
