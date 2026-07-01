const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const { transcribeFile } = require('../transcriber/whisper');
const { downloadRecording } = require('./recordingController');

const TEMP_DIR = path.join(__dirname, '..', '..', 'tmp');

/**
 * Create transcriptions table if not exists
 */
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uniqueid VARCHAR(32) NOT NULL UNIQUE,
      recordingfile VARCHAR(255) NOT NULL,
      text TEXT,
      segments JSON,
      language VARCHAR(10),
      duration DECIMAL(10,2),
      model VARCHAR(20),
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_uniqueid (uniqueid)
    )
  `);
}

/**
 * GET /api/calls/:id/transcription
 * Returns transcription for a call. Processes if not yet transcribed.
 */
exports.getTranscription = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get call info
    const [calls] = await pool.query(
      `SELECT uniqueid, recordingfile, duration, billsec, calldate, src, dst
       FROM asteriskcdrdb.cdr WHERE uniqueid = ?`,
      [id]
    );

    if (calls.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = calls[0];

    if (!call.recordingfile || call.recordingfile.trim() === '') {
      return res.status(404).json({ error: 'No recording available for this call' });
    }

    // Ensure table exists
    await ensureTable();

    // Check if transcription already exists
    const [existing] = await pool.query(
      'SELECT * FROM transcriptions WHERE uniqueid = ?',
      [id]
    );

    if (existing.length > 0) {
      return res.json({
        uniqueid: existing[0].uniqueid,
        text: existing[0].text,
        segments: existing[0].segments ? JSON.parse(existing[0].segments) : [],
        language: existing[0].language,
        duration: existing[0].duration,
        model: existing[0].model,
        from_cache: true
      });
    }

    // --- Process transcription ---

    // Download recording to temp file
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const tempGsm = path.join(TEMP_DIR, `rec_${Date.now()}_${id}.gsm`);

    try {
      await downloadRecording(call, tempGsm);

      // Run transcription
      const result = await transcribeFile(tempGsm);

      // Save to database
      const model = process.env.WHISPER_MODEL || 'ggml-base.bin';
      await pool.query(
        `INSERT INTO transcriptions (uniqueid, recordingfile, text, segments, language, duration, model)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          call.recordingfile,
          result.text,
          JSON.stringify(result.segments),
          result.language,
          call.duration,
          model.replace('ggml-', '').replace('.bin', '')
        ]
      );

      res.json({
        uniqueid: id,
        text: result.text,
        segments: result.segments,
        language: result.language,
        duration: call.duration,
        model: model.replace('ggml-', '').replace('.bin', ''),
        from_cache: false
      });
    } finally {
      // Cleanup temp file
      try {
        if (fs.existsSync(tempGsm)) fs.unlinkSync(tempGsm);
        const txtFile = tempGsm.replace(/\.gsm$/, '.txt');
        if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/calls/:id/transcription/text
 * Returns just the plain text of the transcription
 */
exports.getTranscriptionText = async (req, res, next) => {
  try {
    // Check cache first
    await ensureTable();
    const [existing] = await pool.query(
      'SELECT text FROM transcriptions WHERE uniqueid = ?',
      [req.params.id]
    );

    if (existing.length > 0 && existing[0].text) {
      return res.type('text/plain').send(existing[0].text);
    }

    // If not cached, use the JSON endpoint
    const json = await exports.getTranscription(req, res, next);
    // getTranscription already sent response if called directly
  } catch (err) {
    next(err);
  }
};
