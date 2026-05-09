const express = require('express');
const router = express.Router();
const TextOperation = require('../models/TextOperation');

// GET /api/text/latest/:roomId — Get latest text document for a room
router.get('/latest/:roomId', async (req, res) => {
  try {
    const doc = await TextOperation.findOne({ roomId: req.params.roomId })
      .sort({ _id: -1 }); // Latest first (equivalent to ORDER BY id DESC)

    if (doc) {
      res.json({
        exists: true,
        content: doc.payload || {},
      });
    } else {
      res.json({
        exists: false,
        content: {},
      });
    }
  } catch (err) {
    console.error('Failed to get latest text:', err.message);
    res.status(500).json({
      exists: false,
      content: {},
      error: err.message,
    });
  }
});

module.exports = router;
