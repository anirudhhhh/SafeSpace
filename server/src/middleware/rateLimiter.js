const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { config, getRedis } = require("../config");

function buildLimiter(overrides = {}) {
  const liveRedis = getRedis();
  let store;

  if (liveRedis) {
    store = new RedisStore({
      sendCommand: (...args) => liveRedis.call(...args),
    });
    console.log("[rate-limit] Using Redis store");
  } else {
    console.log("[rate-limit] Using memory store");
  }

  return rateLimit({
    windowMs: overrides.windowMs ?? config.rateLimitWindowMs,
    max: overrides.max ?? config.rateLimitMax,
    message: { error: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store } : {}),
  });
}

let currentHandler = null;

function proxyMiddleware(req, res, next) {
  return currentHandler(req, res, next);
}

function initRateLimiter(overrides = {}) {
  currentHandler = buildLimiter(overrides);
}

function resetLimiter(overrides = {}) {
  currentHandler = buildLimiter(overrides);
}

module.exports = proxyMiddleware;
module.exports.initRateLimiter = initRateLimiter;
module.exports.resetLimiter = resetLimiter;
