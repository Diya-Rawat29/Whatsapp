const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, default: 'me' },
  body: { type: String, required: true },
  reply: { type: String, default: '' },
  replyType: { type: String, enum: ['keyword', 'ai', 'none'], default: 'none' },
  timestamp: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false },
  contact: { type: String, default: '' }
});

module.exports = mongoose.model('Message', messageSchema);
