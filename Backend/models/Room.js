const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // 6-char room code
  userId: { type: Number, required: true },
  username: { type: String, required: true },
}, {
  timestamps: true, // auto createdAt + updatedAt
});

module.exports = mongoose.model('Room', roomSchema);
