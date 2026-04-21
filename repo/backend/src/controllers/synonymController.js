const Synonym = require('../models/Synonym');
const { clearCache } = require('../services/synonymService');

async function listSynonyms(req, res) {
  try {
    const synonyms = await Synonym.find({}).sort({ term: 1 }).lean();
    return res.json({ synonyms });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function upsertSynonym(req, res) {
  try {
    const { term, expansions } = req.body;
    if (!term || !Array.isArray(expansions)) {
      return res.status(400).json({ error: 'term (string) and expansions (array) are required' });
    }

    const key = term.toLowerCase().trim();
    const deduped = [...new Set(expansions.map(e => e.trim()).filter(Boolean))];

    const synonym = await Synonym.findOneAndUpdate(
      { term: key },
      { $set: { expansions: deduped } },
      { upsert: true, new: true }
    ).lean();

    clearCache();
    return res.status(200).json({ synonym });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function deleteSynonym(req, res) {
  try {
    const key = req.params.term.toLowerCase().trim();
    const result = await Synonym.findOneAndDelete({ term: key }).lean();
    if (!result) return res.status(404).json({ error: 'Synonym not found' });
    clearCache();
    return res.json({ deleted: true, term: key });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listSynonyms, upsertSynonym, deleteSynonym };
