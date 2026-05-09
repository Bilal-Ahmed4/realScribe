/**
 * PresenceService — In-memory user presence tracking.
 * Direct port of the Java PresenceService.
 */
class PresenceService {
  constructor() {
    // roomId -> Map<userId, Set<socketId>>
    this.roomUsers = new Map();
    // socketId -> { roomId, userId, name }
    this.sessions = new Map();

    // Periodic cleanup every 5 minutes
    this._cleanupInterval = setInterval(() => {
      this.cleanupOrphanedSessions();
    }, 300000);
  }

  /**
   * User joins a room. Returns true if this is the user's first session in the room.
   */
  join(roomId, userId, name, socketId) {
    if (!roomId || !userId || !name || !socketId) {
      console.error(`Cannot join: null parameters - roomId: ${roomId}, userId: ${userId}, name: ${name}, socketId: ${socketId}`);
      return false;
    }

    console.log(`Joining room - Room: ${roomId}, User: ${name} (ID: ${userId}), Socket: ${socketId}`);

    // Remove any existing binding for this socketId
    const existingBinding = this.sessions.get(socketId);
    if (existingBinding) {
      console.log(`Removed existing session binding for socket: ${socketId}`);
      this._cleanupSessionFromRoom(existingBinding.roomId, existingBinding.userId, socketId);
    }

    // Create new binding
    this.sessions.set(socketId, { roomId, userId, name });

    // Add to room users
    if (!this.roomUsers.has(roomId)) {
      this.roomUsers.set(roomId, new Map());
    }
    const roomMap = this.roomUsers.get(roomId);

    if (!roomMap.has(userId)) {
      roomMap.set(userId, new Set());
    }
    const userSessions = roomMap.get(userId);

    const isFirstSession = userSessions.size === 0;
    userSessions.add(socketId);

    console.log(`User ${name} now has ${userSessions.size} sessions in room ${roomId}`);
    return isFirstSession;
  }

  /**
   * Remove a socket from presence. Returns the binding if the user fully left, or null.
   */
  leaveBySocket(socketId) {
    if (!socketId) {
      console.error('Cannot leave: socketId is null');
      return null;
    }

    const binding = this.sessions.get(socketId);
    if (!binding) {
      console.log(`No binding found for socket: ${socketId}`);
      return null;
    }

    this.sessions.delete(socketId);
    console.log(`Leaving session - Room: ${binding.roomId}, User: ${binding.name} (ID: ${binding.userId}), Socket: ${socketId}`);

    const userFullyLeft = this._cleanupSessionFromRoom(binding.roomId, binding.userId, socketId);
    return userFullyLeft ? binding : null;
  }

  /**
   * List active users in a room.
   */
  list(roomId) {
    if (!roomId) return [];

    const users = this.roomUsers.get(roomId);
    if (!users) return [];

    const result = [];
    users.forEach((sessionSet, usrId) => {
      if (sessionSet.size > 0) {
        // Find name from any active session
        let userName = usrId;
        for (const [, binding] of this.sessions) {
          if (binding.roomId === roomId && binding.userId === usrId) {
            userName = binding.name;
            break;
          }
        }
        result.push({ id: usrId, name: userName });
      }
    });

    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }

  /**
   * Debug: print current state.
   */
  printState() {
    console.log('=== Presence Service State ===');
    console.log('Sessions:', this.sessions.size);
    this.sessions.forEach((binding, socketId) => {
      console.log(`  ${socketId} -> ${JSON.stringify(binding)}`);
    });
    console.log('Room Users:', this.roomUsers.size);
    this.roomUsers.forEach((users, roomId) => {
      console.log(`  Room ${roomId}:`);
      users.forEach((sessions, userId) => {
        console.log(`    User ${userId} -> [${[...sessions].join(', ')}]`);
      });
    });
    console.log('==============================');
  }

  cleanupOrphanedSessions() {
    console.log('Running orphaned session cleanup...');
    const orphaned = [];

    this.sessions.forEach((binding, socketId) => {
      const roomMap = this.roomUsers.get(binding.roomId);
      if (!roomMap || !roomMap.has(binding.userId) || !roomMap.get(binding.userId).has(socketId)) {
        orphaned.push(socketId);
      }
    });

    orphaned.forEach(socketId => {
      const removed = this.sessions.get(socketId);
      this.sessions.delete(socketId);
      if (removed) {
        console.log(`Cleaned up orphaned session: ${socketId} for user: ${removed.name}`);
      }
    });

    if (orphaned.length > 0) {
      console.log(`Cleaned up ${orphaned.length} orphaned sessions`);
    }
  }

  _cleanupSessionFromRoom(roomId, userId, socketId) {
    const users = this.roomUsers.get(roomId);
    if (!users) return true;

    const sessionsForUser = users.get(userId);
    if (sessionsForUser) {
      sessionsForUser.delete(socketId);
      console.log(`User ${userId} now has ${sessionsForUser.size} sessions in room ${roomId}`);

      if (sessionsForUser.size === 0) {
        users.delete(userId);
        console.log(`User ${userId} fully left room ${roomId}`);

        if (users.size === 0) {
          this.roomUsers.delete(roomId);
          console.log(`Room ${roomId} is now empty`);
        }
        return true; // User fully left
      }
    }
    return false; // User still has other sessions
  }
}

// Export singleton
module.exports = new PresenceService();
