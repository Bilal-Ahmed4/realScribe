const express = require('express');
const router = express.Router();
const presenceService = require('../services/PresenceService');
const chatService = require('../services/ChatService');

// GET /api/rooms/:roomId/users — Get active users in a room
router.get('/rooms/:roomId/users', (req, res) => {
  const users = presenceService.list(req.params.roomId);
  res.json(users);
});

// GET /api/rooms/:roomId/messages — Get chat history
router.get('/rooms/:roomId/messages', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = chatService.getRoomMessages(req.params.roomId, limit);
    res.json(messages);
  } catch (err) {
    console.error('Error getting room messages:', err.message);
    res.json([]);
  }
});

// GET /api/rooms/:roomId/messages/count — Get message count
router.get('/rooms/:roomId/messages/count', (req, res) => {
  res.json({
    roomId: req.params.roomId,
    messageCount: chatService.getMessageCount(req.params.roomId),
  });
});

// GET /api/presence/debug — Debug presence state
router.get('/presence/debug', (req, res) => {
  presenceService.printState();
  res.send('Check console for presence state');
});

module.exports = router;
