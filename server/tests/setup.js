process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.RATE_LIMIT_MAX = "1000";
process.env.RATE_LIMIT_WINDOW_MS = String(15 * 60 * 1000);
