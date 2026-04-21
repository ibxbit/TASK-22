const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const QUARANTINE_DIR = path.join(__dirname, '../../uploads/quarantine');
const ALLOWED_MIME   = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_SIZE       = 10 * 1024 * 1024; // 10 MB

// Create quarantine directory on module load — renameSync fails if it doesn't exist
fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

// First bytes that must match for each accepted MIME type.
// Guards against content-type spoofing (e.g., an .exe renamed to .pdf).
const MAGIC = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],                                      // %PDF
  'image/jpeg':      [[0xFF, 0xD8, 0xFF]],                                             // SOI marker
  'image/png':       [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],             // PNG sig
};

function checkMagicBytes(filePath, mimetype) {
  const signatures = MAGIC[mimetype];
  if (!signatures) return false;
  const maxLen = Math.max(...signatures.map(s => s.length));
  const buf = Buffer.alloc(maxLen);
  const fd  = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, maxLen, 0);
  } finally {
    fs.closeSync(fd);
  }
  return signatures.some(sig => sig.every((byte, i) => buf[i] === byte));
}

function computeHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function quarantine(file) {
  const dest = path.join(QUARANTINE_DIR, `${Date.now()}-${path.basename(file.path)}`);
  fs.renameSync(file.path, dest);
  console.warn(`[security] File quarantined: ${dest}`);
  return dest;
}

function removeFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

/**
 * Must be placed AFTER multer's upload middleware.
 *
 * Performs (in order):
 *   1. MIME type allow-list (client-supplied — first-pass only)
 *   2. Size limit (belt-and-suspenders over multer's limits)
 *   3. Magic-byte validation — reads actual file bytes, rejects spoofed types
 *   4. SHA-256 hash comparison if client sends X-File-Hash header
 *      → mismatch moves file to quarantine and rejects the request
 */
function validateUpload(req, res, next) {
  if (!req.file) return next();

  const { file } = req;

  // 1. MIME allow-list
  if (!ALLOWED_MIME.has(file.mimetype)) {
    removeFile(file.path);
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF, JPG, and PNG files are allowed' },
    });
  }

  // 2. Size limit
  if (file.size > MAX_SIZE) {
    removeFile(file.path);
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File must be ≤ 10 MB' },
    });
  }

  // 3. Magic-byte validation — reject if file bytes don't match declared MIME
  if (!checkMagicBytes(file.path, file.mimetype)) {
    quarantine(file);
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FILE_CONTENT', message: 'File content does not match declared type — file quarantined' },
    });
  }

  // 4. Client-supplied hash integrity check
  const computed = computeHash(file.path);
  req.fileHash   = computed;

  const clientHash = (req.headers['x-file-hash'] || '').toLowerCase().trim();
  if (clientHash && clientHash !== computed) {
    quarantine(file);
    return res.status(400).json({
      success: false,
      error: { code: 'HASH_MISMATCH', message: 'File integrity check failed — file quarantined' },
    });
  }

  next();
}

module.exports = { validateUpload, computeHash };
