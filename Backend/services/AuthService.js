/**
 * AuthService — Simple in-memory user session management.
 * In production, integrate with JWT or OAuth providers.
 */
class AuthService {
  constructor() {
    // Simple in-memory user store
    // In production: integrate with database and JWT tokens
    this.sessions = new Map(); // sessionId -> { userId, name, createdAt }
    this.users = new Map(); // userId -> { name, createdAt }
  }

  /**
   * Create or retrieve a user session
   * Returns: { sessionId, userId, name, isNewUser }
   */
  createSession(userId, name) {
    if (!userId || !name) {
      throw new Error("User ID and name are required");
    }

    const isNewUser = !this.users.has(userId);

    // Create session
    const sessionId = this._generateSessionId();
    this.sessions.set(sessionId, {
      userId,
      name,
      createdAt: new Date(),
    });

    // Register user if new
    if (isNewUser) {
      this.users.set(userId, {
        name,
        createdAt: new Date(),
      });
    }

    return {
      sessionId,
      userId,
      name,
      isNewUser,
    };
  }

  /**
   * Validate a session
   */
  validateSession(sessionId) {
    return this.sessions.has(sessionId);
  }

  /**
   * Get user info
   */
  getUser(userId) {
    return this.users.get(userId) || null;
  }

  /**
   * Get session info
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Invalidate a session
   */
  invalidateSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all users
   */
  getAllUsers() {
    const users = [];
    this.users.forEach((user, userId) => {
      users.push({ userId, ...user });
    });
    return users;
  }

  /**
   * Cleanup old sessions (older than maxAgeMs)
   */
  cleanupOldSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    this.sessions.forEach((session, sessionId) => {
      if (now - session.createdAt.getTime() > maxAgeMs) {
        toDelete.push(sessionId);
      }
    });

    toDelete.forEach((sessionId) => {
      this.sessions.delete(sessionId);
    });

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} old sessions`);
    }

    return toDelete.length;
  }

  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton
module.exports = new AuthService();
