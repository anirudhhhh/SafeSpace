const jwt = require("jsonwebtoken");
const { config } = require("../config");
const User = require("../models/User");

async function protect(req, res, next) {
  try {
    let token;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ error: "Not authorized" });
    }

    const decoded = jwt.verify(token, config.jwtSecret);

    req.user = { _id: decoded.id };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function signToken(userId) {
  return jwt.sign({ id: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

module.exports = { protect, signToken };
