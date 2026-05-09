/**
 * ChatService — In-memory chat message storage.
 * Direct port of the Java ChatService.
 */
class ChatService {
  constructor() {
    // roomId -> ChatMessage[]
    this.roomMessages = new Map();
    // roomId -> counter
    this.messageCounters = new Map();
    this.globalCounter = 0;
  }

  /**
   * Send a user message. Returns null if duplicate detected.
   */
  sendMessage(roomId, userId, senderName, content) {
    const messageId = this._generateMessageId(roomId);
    const now = new Date();

    const message = {
      id: messageId,
      roomId,
      userId,
      senderName,
      content,
      type: 'MESSAGE',
      timestamp: now.toISOString(),
    };

    const messages = this._getOrCreateMessages(roomId);

    // Check for duplicate (same content from same user within 1 second)
    const isDuplicate = messages.some(m =>
      m.userId === userId &&
      m.content === content &&
      Math.abs(new Date(m.timestamp) - now) < 1000
    );

    if (!isDuplicate) {
      messages.push(message);
      console.log(`Message added: ${messageId} from user: ${senderName}`);
      return message;
    } else {
      console.log(`Duplicate message detected and ignored: ${content} from user: ${senderName}`);
      return null;
    }
  }

  /**
   * Create a system message. Returns null if duplicate detected (5s window).
   */
  createSystemMessage(roomId, content) {
    const messageId = this._generateMessageId(roomId);
    const now = new Date();

    const systemMessage = {
      id: messageId,
      roomId,
      userId: 'system',
      senderName: 'System',
      content,
      type: 'SYSTEM',
      timestamp: now.toISOString(),
    };

    const messages = this._getOrCreateMessages(roomId);

    // Check for duplicate system messages (5 second window)
    const isDuplicate = messages.some(m =>
      m.type === 'SYSTEM' &&
      m.content === content &&
      Math.abs(new Date(m.timestamp) - now) < 5000
    );

    if (!isDuplicate) {
      messages.push(systemMessage);
      console.log(`System message added: ${messageId} - ${content}`);
      return systemMessage;
    } else {
      console.log(`Duplicate system message detected and ignored: ${content}`);
      return null;
    }
  }

  /**
   * Get messages for a room with optional limit.
   */
  getRoomMessages(roomId, limit = 50) {
    const messages = this.roomMessages.get(roomId) || [];
    const fromIndex = Math.max(0, messages.length - limit);
    return messages.slice(fromIndex);
  }

  /**
   * Get total message count for a room.
   */
  getMessageCount(roomId) {
    return (this.roomMessages.get(roomId) || []).length;
  }

  /**
   * Clear all messages for a room (when room is deleted).
   */
  clearRoomMessages(roomId) {
    if (this.roomMessages.has(roomId)) {
      this.roomMessages.delete(roomId);
      this.messageCounters.delete(roomId);
      console.log(`Cleared all messages for room: ${roomId}`);
    }
  }

  _getOrCreateMessages(roomId) {
    if (!this.roomMessages.has(roomId)) {
      this.roomMessages.set(roomId, []);
    }
    return this.roomMessages.get(roomId);
  }

  _generateMessageId(roomId) {
    const roomCount = (this.messageCounters.get(roomId) || 0) + 1;
    this.messageCounters.set(roomId, roomCount);
    this.globalCounter++;
    return `${roomId}_msg_${roomCount}_${this.globalCounter}_${Date.now()}`;
  }
}

// Export singleton
module.exports = new ChatService();
