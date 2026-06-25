function requestLogger(req, res, next) {
  if (req.path === "/api/health") return next();

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;

    console.log(
      `[perf] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(2)}ms`,
    );
  });

  next();
}

module.exports = requestLogger;
