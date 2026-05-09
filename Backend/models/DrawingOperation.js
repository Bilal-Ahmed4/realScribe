const mongoose = require('mongoose');

const drawingOperationSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // strokeId (UUID)
  roomId: { type: String, required: true, index: true },
  operationType: { type: String, default: 'stroke' },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
});

module.exports = mongoose.model('DrawingOperation', drawingOperationSchema);
