function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[error]', req.method, req.path, '-', err.message);

  // Mongoose schema validation
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details } });
  }

  // Mongoose CastError — invalid ObjectId or type mismatch
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: `Invalid value for '${err.path}': ${err.value}` } });
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE_KEY', message: `${field} already exists` } });
  }

  // Multer file size limit
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds size limit' } });
  }

  // Multer file filter rejection
  if (err.message === 'Unsupported file type') {
    return res.status(400).json({ success: false, error: { code: 'UNSUPPORTED_FILE_TYPE', message: err.message } });
  }

  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } });
}

module.exports = errorHandler;
