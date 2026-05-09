const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// POST /api/room — Create a new room
router.post('/', async (req, res) => {
  try {
    const { id, userId, username } = req.body;

    const room = new Room({
      _id: id,
      userId,
      username,
    });

    await room.save();
    res.json({ id, userId, username });
  } catch (err) {
    console.error('Failed to create room:', err.message);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// GET /api/room/:id — Get room by ID (for joining)
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({
      id: room._id,
      userId: room.userId,
      username: room.username,
    });
  } catch (err) {
    console.error('Failed to get room:', err.message);
    res.status(500).json({ error: 'Failed to get room' });
  }
});

module.exports = router;
