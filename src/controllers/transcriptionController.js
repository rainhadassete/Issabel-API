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
      segments LONGTEXT,
      language VARCHAR(10),
      duration DECIMAL(10,2),
      model VARCHAR(20),
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_uniqueid (uniqueid)
    )
  `);
}

/**
 * Core: download recording, transcribe, and save to DB.
 * Returns the saved transcription row. Idempotent — skips if already exists.
 * @param {string} uniqueid - Call uniqueid
 * @returns {Promise<object>} { uniqueid, text, segments, language, duration, model, from_cache }
 */
async function processAndSaveTranscription(uniqueid) {
  // Get call info
  const [calls] = await pool.query(
    `SELECT uniqueid, recordingfile, duration, billsec, calldate, src, dst
     FROM asteriskcdrdb.cdr WHERE uniqueid = ?`,
    [uniqueid]
  );

  if (calls.length === 0) {
    throw Object.assign(new Error('Call not found'), { status: 404 });
  }

  const call = calls[0];

  if (!call.recordingfile || call.recordingfile.trim() === '') {
    throw Object.assign(new Error('No recording available for this call'), { status: 404 });
  }

  // Ensure table exists
  await ensureTable();

  // Check if transcription already exists
  const [existing] = await pool.query(
    'SELECT * FROM transcriptions WHERE uniqueid = ?',
    [uniqueid]
  );

  if (existing.length > 0) {
    return {
      uniqueid: existing[0].uniqueid,
      text: existing[0].text,
      segments: existing[0].segments ? JSON.parse(existing[0].segments) : [],
      language: existing[0].language,
      duration: existing[0].duration,
      model: existing[0].model,
      from_cache: true,
    };
  }

  // Download recording to temp file
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const tempGsm = path.join(TEMP_DIR, `rec_${Date.now()}_${uniqueid}.gsm`);

  try {
    await downloadRecording(call, tempGsm);

    // Run transcription
    const result = await transcribeFile(tempGsm);

    // Save to database
    const model = process.env.WHISPER_MODEL || 'ggml-small.bin';
    const cleanModel = model.replace('ggml-', '').replace('.bin', '');

    await pool.query(
      `INSERT INTO transcriptions (uniqueid, recordingfile, text, segments, language, duration, model)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uniqueid,
        call.recordingfile,
        result.text,
        JSON.stringify(result.segments),
        result.language,
        call.duration,
        cleanModel,
      ]
    );

    return {
      uniqueid,
      text: result.text,
      segments: result.segments,
      language: result.language,
      duration: call.duration,
      model: cleanModel,
      from_cache: false,
    };
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
}

/**
 * GET /api/calls/:id/transcription
 * Returns transcription for a call. Processes if not yet transcribed.
 */
exports.getTranscription = async (req, res, next) => {
  try {
    const result = await processAndSaveTranscription(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/calls/:id/transcription
 * Trigger transcription processing for a single call.
 * Use this to auto-transcribe when a recording file is registered.
 * Returns 202 if freshly processed, 200 if already cached.
 */
exports.processTranscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await processAndSaveTranscription(id);

    if (result.from_cache) {
      return res.json(result);
    }

    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/transcriptions/process-pending
 * Batch-process all calls that have recordings but no transcription yet.
 * Query params:
 *   ?limit=10      Max calls to process (default 10, max 50)
 *   ?start_date=   Filter by calldate >= (ISO 8601)
 *   ?end_date=     Filter by calldate <= (ISO 8601)
 */
exports.processPending = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const { start_date, end_date } = req.query;

    await ensureTable();

    let query = `
      SELECT c.uniqueid, c.recordingfile, c.calldate
      FROM asteriskcdrdb.cdr c
      LEFT JOIN transcriptions t ON t.uniqueid = c.uniqueid
      WHERE c.recordingfile IS NOT NULL
        AND c.recordingfile != ''
        AND t.uniqueid IS NULL
    `;
    const params = [];

    if (start_date) {
      query += ' AND c.calldate >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND c.calldate <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY c.calldate DESC LIMIT ?';
    params.push(limit);

    const [pending] = await pool.query(query, params);

    if (pending.length === 0) {
      return res.json({ message: 'No pending transcriptions', processed: 0, results: [] });
    }

    const results = [];
    for (const call of pending) {
      try {
        const result = await processAndSaveTranscription(call.uniqueid);
        results.push({ uniqueid: call.uniqueid, status: 'ok', from_cache: result.from_cache });
      } catch (err) {
        results.push({ uniqueid: call.uniqueid, status: 'error', error: err.message });
      }
    }

    const succeeded = results.filter(r => r.status === 'ok' && !r.from_cache).length;
    const cached = results.filter(r => r.status === 'ok' && r.from_cache).length;
    const failed = results.filter(r => r.status === 'error').length;

    res.json({
      message: `Processed ${results.length}: ${succeeded} new, ${cached} cached, ${failed} errors`,
      processed: results.length,
      succeeded,
      cached,
      failed,
      results,
    });
  } catch (err) {
    next(err);
  }
};

// Expose core function for background worker
exports.processAndSaveTranscription = processAndSaveTranscription;
exports.ensureTable = ensureTable;

const transcriptionWorker = require('../services/transcriptionWorker');

/**
 * GET /api/transcriptions/worker/status
 * Returns worker stats and config.
 */
exports.getWorkerStatus = async (req, res) => {
  res.json(transcriptionWorker.getStatus());
};

/**
 * POST /api/transcriptions/worker/trigger
 * Force a worker cycle to run now.
 */
exports.triggerWorker = async (req, res, next) => {
  try {
    const result = await transcriptionWorker.triggerNow();
    res.json(result);
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

    // If not cached, process and return text
    const result = await processAndSaveTranscription(req.params.id);
    res.type('text/plain').send(result.text);
  } catch (err) {
    next(err);
  }
};
