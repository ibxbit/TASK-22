const mongoose = require('mongoose');

const synonymSchema = new mongoose.Schema({
  term:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  expansions: [{ type: String, trim: true }],
});

module.exports = mongoose.model('Synonym', synonymSchema);
