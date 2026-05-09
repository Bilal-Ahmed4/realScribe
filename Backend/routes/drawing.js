const express = require('express');
const router = express.Router();
const DrawingOperation = require('../models/DrawingOperation');

// GET /api/draw/:roomId — Get all drawing operations for a room
router.get('/:roomId', async (req, res) => {
  try {
    const operations = await DrawingOperation.find({ roomId: req.params.roomId });

    // Map _id to id for frontend compatibility
    const result = operations.map(op => ({
      id: op._id,
      roomId: op.roomId,
      operationType: op.operationType,
      payload: op.payload,
    }));

    res.json(result);
  } catch (err) {
    console.error('Failed to get drawing operations:', err.message);
    res.status(500).json({ error: 'Failed to get drawing operations' });
  }
});

module.exports = router;
