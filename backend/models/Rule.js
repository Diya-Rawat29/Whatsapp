const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  keyword: { type: String, required: true, unique: true },
  reply: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  matchType: { type: String, enum: ['exact', 'contains'], default: 'contains' },
  createdAt: { type: Date, default: Date.now },
  hitCount: { type: Number, default: 0 }
});

module.exports = mongoose.model('Rule', ruleSchema);
