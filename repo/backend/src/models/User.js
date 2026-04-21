const mongoose = require('mongoose');

const ROLES = ['admin', 'manager', 'salesperson', 'finance', 'inspector'];

const userSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  role:         { type: String, enum: ROLES, required: true },
  dealershipId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
