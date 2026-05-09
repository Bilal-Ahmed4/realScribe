const mongoose = require('mongoose');

const textOperationSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  userId: { type: String },
  payload: { type: mongoose.Schema.Types.Mixed },
});

module.exports = mongoose.model('TextOperation', textOperationSchema);
