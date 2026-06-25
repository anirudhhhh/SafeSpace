const { redis } = require("../config");

function isRedisReady() {
  return redis && redis.status === "ready";
}

async function getCache(key) {
  if (!isRedisReady()) return null;

  try {
    const data = await redis.get(key);
    if (data) {
      console.log(`[cache] HIT ${key}`);
      return JSON.parse(data);
    }
    console.log(`[cache] MISS ${key}`);
    return null;
  } catch (err) {
    console.warn(`[cache] GET error for ${key}:`, err.message);
    return null;
  }
}

async function setCache(key, data, ttlSeconds = 60) {
  if (!isRedisReady()) return;

  try {
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
    console.log(`[cache] SET ${key} (TTL: ${ttlSeconds}s)`);
  } catch (err) {
    console.warn(`[cache] SET error for ${key}:`, err.message);
  }
}

async function invalidateCache(...keys) {
  if (!isRedisReady() || keys.length === 0) return;

  try {
    await redis.del(...keys);
    console.log(`[cache] INVALIDATED ${keys.join(", ")}`);
  } catch (err) {
    console.warn(`[cache] DEL error:`, err.message);
  }
}

const CACHE_KEYS = {
  PUBLIC_SUBSPACES: "forum:subspaces:public",
};

const CACHE_TTL = {
  PUBLIC_SUBSPACES: 60,
};

module.exports = {
  getCache,
  setCache,
  invalidateCache,
  CACHE_KEYS,
  CACHE_TTL,
};
