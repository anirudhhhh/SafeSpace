const User = require("../models/User");
const { signToken } = require("../middleware/auth");

function logAuthTiming(action, startTime, email) {
  const durationMs = Date.now() - startTime;
  console.log(
    `[auth:${action}] ${email || "unknown"} completed in ${durationMs}ms`,
  );
}

// ================= REGISTER =================
async function register(req, res) {
  const startTime = Date.now();

  try {
    const { email, password, displayName, whatBringsYou } = req.body;
    const lowerEmail = email ? email.toLowerCase() : "";

    console.log(`[auth:register] start ${email || "unknown"}`);

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const existingUser = await User.findOne({ email: lowerEmail }).lean();
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const user = await User.create({
      email: lowerEmail,
      password,
      displayName: displayName || "Anonymous",
      whatBringsYou: whatBringsYou || "",
    });

    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        whatBringsYou: user.whatBringsYou,
      },
    });

    logAuthTiming("register", startTime, email);
  } catch (err) {
    console.error("[auth:register] error", err.message);
    res.status(500).json({ error: "Registration failed" });
  }
}

// ================= LOGIN =================
async function login(req, res) {
  const startTime = Date.now();

  try {
    const { email, password } = req.body;
    const lowerEmail = email ? email.toLowerCase() : "";

    console.log(`[auth:login] start ${email || "unknown"}`);

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // ⚠️ need full doc (no lean) because comparePassword is a method
    const user = await User.findOne({ email: lowerEmail }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔥 make this NON-BLOCKING (no await)
    User.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } },
    ).catch(() => {});

    const token = signToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        preferences: user.preferences,
        whatBringsYou: user.whatBringsYou,
      },
    });

    logAuthTiming("login", startTime, email);
  } catch (err) {
    console.error("[auth:login] error", err.message);
    res.status(500).json({ error: "Login failed" });
  }
}

// ================= PROFILE =================
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user._id)
      .select("_id email displayName preferences whatBringsYou")
      .lean();

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
}

// ================= UPDATE PREFERENCES =================
async function updatePreferences(req, res) {
  try {
    const { preferredPersonality, theme } = req.body;

    const update = {};

    if (preferredPersonality) {
      update["preferences.preferredPersonality"] = preferredPersonality;
    }

    if (theme) {
      update["preferences.theme"] = theme;
    }

    // 🔥 direct update (no req.user.save)
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true, select: "preferences" },
    ).lean();

    res.json({ preferences: user.preferences });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updatePreferences,
};
