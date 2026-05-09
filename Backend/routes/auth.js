const express = require("express");
const router = express.Router();
const authService = require("../services/AuthService");

// POST /api/auth/login — Create a user session
router.post("/login", (req, res) => {
  try {
    const { userId, name } = req.body;

    if (!userId || !name) {
      return res.status(400).json({
        error: "User ID and name are required",
      });
    }

    const session = authService.createSession(userId, name);
    res.json(session);
  } catch (err) {
    console.error("Failed to create session:", err.message);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// POST /api/auth/logout — Invalidate a session
router.post("/logout", (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const result = authService.invalidateSession(sessionId);
    res.json({ success: result });
  } catch (err) {
    console.error("Failed to logout:", err.message);
    res.status(500).json({ error: "Failed to logout" });
  }
});

// GET /api/auth/validate/:sessionId — Validate a session
router.get("/validate/:sessionId", (req, res) => {
  try {
    const isValid = authService.validateSession(req.params.sessionId);
    res.json({ valid: isValid });
  } catch (err) {
    console.error("Failed to validate session:", err.message);
    res.status(500).json({ error: "Failed to validate session" });
  }
});

// GET /api/auth/user/:userId — Get user info
router.get("/user/:userId", (req, res) => {
  try {
    const user = authService.getUser(req.params.userId);
    if (user) {
      res.json({ userId: req.params.userId, ...user });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error("Failed to get user:", err.message);
    res.status(500).json({ error: "Failed to get user" });
  }
});

module.exports = router;
