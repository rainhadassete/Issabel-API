const { Client } = require('ssh2');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

const RECORDINGS_PATH = process.env.RECORDINGS_PATH || '/var/spool/asterisk/monitor';
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp');

/**
 * Parse date from recording filename like `exten-7728-7742-20260701-143232-1782927152.266154.gsm`
 * Returns { year, month, day } or null if not parseable.
 */
function parseDateFromFilename(filename) {
  const match = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return { year: match[1], month: match[2], day: match[3] };
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.gsm': 'audio/x-gsm',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wma': 'audio/x-ms-wma',
    '.sln': 'audio/sln',
    '.alaw': 'audio/x-alaw-basic',
    '.ulaw': 'audio/x-ulaw-basic',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Get the remote path for a recording file
 */
function getRemotePath(recordingFile) {
  const file = recordingFile.trim();
  if (file.startsWith('/')) return file;
  const dateInfo = parseDateFromFilename(file);
  if (dateInfo) {
    return path.posix.join(RECORDINGS_PATH, dateInfo.year, dateInfo.month, dateInfo.day, file);
  }
  return path.posix.join(RECORDINGS_PATH, file);
}

/**
 * Download a recording file from Issabel via SFTP and save to local path
 * @param {object} call - CDR row with recordingfile
 * @param {string} localPath - Where to save the file
 * @returns {Promise<string>} The local path
 */
exports.downloadRecording = function downloadRecording(call, localPath) {
  return new Promise((resolve, reject) => {
    const remotePath = getRemotePath(call.recordingfile);
    const conn = new Client();

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(new Error('Failed to open SFTP connection')); return; }

        const writeStream = fs.createWriteStream(localPath);
        const readStream = sftp.createReadStream(remotePath);

        readStream.on('error', (e) => {
          sftp.end(); conn.end(); writeStream.destroy();
          reject(new Error(`Error reading remote file: ${e.message}`));
        });

        writeStream.on('error', (e) => {
          sftp.end(); conn.end();
          reject(new Error(`Error writing local file: ${e.message}`));
        });

        writeStream.on('finish', () => {
          sftp.end(); conn.end();
          resolve(localPath);
        });

        readStream.pipe(writeStream);
      });
    });

    conn.on('error', (e) => reject(new Error(`SSH connection error: ${e.message}`)));

    conn.connect({
      host: process.env.SSH_HOST || '192.168.70.3',
      port: parseInt(process.env.SSH_PORT || '22'),
      username: process.env.SSH_USER || 'root',
      password: process.env.SSH_PASSWORD,
      readyTimeout: 10000,
    });
  });
};

/**
 * Locate ffmpeg binary across platforms.
 * Checks FFMPEG_PATH env var first, then common install locations.
 * @returns {string|null} - Path to ffmpeg or null if not found
 */
function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const candidates = [
    'ffmpeg', // PATH lookup (works on Docker: /usr/bin/ffmpeg)
    'ffmpeg.exe',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  ];

  for (const candidate of candidates) {
    try {
      // Synchronous check — runs once at startup, not in hot path
      const result = require('child_process').spawnSync(candidate, ['-version'], {
        stdio: 'ignore',
        timeout: 2000,
      });
      if (result.status === 0 || (result.error && result.error.code !== 'ENOENT')) {
        return candidate;
      }
    } catch (e) {
      // not found, try next
    }
  }
  return null;
}

// Resolve ffmpeg once at module load
const FFMPEG_BIN = findFfmpeg();

/**
 * Convert audio file using ffmpeg (milliseconds for typical call recordings)
 * @param {string} inputPath  - Source file path (GSM/WAV)
 * @param {string} outputPath - Destination file path
 * @param {string} format     - 'mp3' or 'wav'
 * @returns {Promise<string>} - Output path on success
 */
function convertAudio(inputPath, outputPath, format) {
  if (!FFMPEG_BIN) {
    return Promise.reject(new Error('FFMPEG_NOT_FOUND'));
  }

  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-ar', '8000', '-ac', '1'];

    if (format === 'mp3') {
      args.push('-b:a', '64k', outputPath);
    } else if (format === 'wav') {
      args.push('-sample_fmt', 's16', outputPath);
    } else {
      args.push(outputPath);
    }

    const proc = execFile(FFMPEG_BIN, args, { timeout: 30000 }, (error) => {
      if (error) {
        reject(new Error(`ffmpeg conversion error: ${error.message}`));
      } else {
        resolve(outputPath);
      }
    });
    proc.stderr.on('data', () => {}); // ffmpeg logs to stderr, suppress
  });
}

/**
 * Ensure tmp directory exists
 */
function ensureTempDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  return TMP_DIR;
}

/**
 * GET /api/calls/:id/recording
 * Downloads recording from Issabel via SFTP, converts to MP3 (or WAV),
 * and streams the converted audio so browsers can play it natively via <audio> tag.
 *
 * Query params:
 *   ?format=mp3       (default) MP3  — audio/mpeg
 *   ?format=wav       PCM WAV 16-bit — audio/wav
 *   ?format=original  Raw file without conversion (GSM, etc.)
 */
exports.download = async (req, res, next) => {
  const tempFiles = [];

  try {
    const { id } = req.params;
    const format = (req.query.format || 'mp3').toLowerCase();

    const formatMap = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      original: null,
    };

    if (!(format in formatMap)) {
      return res.status(400).json({ error: 'Invalid format. Use mp3, wav, or original.' });
    }

    const [rows] = await pool.query(
      'SELECT uniqueid, recordingfile, src, dst FROM asteriskcdrdb.cdr WHERE uniqueid = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    const call = rows[0];
    if (!call.recordingfile || call.recordingfile.trim() === '') {
      return res.status(404).json({ error: 'No recording available for this call' });
    }

    const recordingFile = call.recordingfile.trim();
    const originalExt = path.extname(recordingFile) || '.gsm';
    const baseName = path.basename(recordingFile, originalExt);
    const tmpDir = ensureTempDir();

    // Step 1: Download from SFTP to temp file
    const rawPath = path.join(tmpDir, `${baseName}_${Date.now()}${originalExt}`);
    tempFiles.push(rawPath);
    await exports.downloadRecording(call, rawPath);

    // format=original → stream raw file as-is
    if (format === 'original') {
      const stat = fs.statSync(rawPath);
      res.setHeader('Content-Type', getMimeType(recordingFile));
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${recordingFile}"`);

      const readStream = fs.createReadStream(rawPath);
      readStream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      readStream.on('close', () => {
        try { if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath); } catch (e) { /* ignore */ }
      });
      return readStream.pipe(res);
    }

    // Step 2: Convert to MP3/WAV via ffmpeg (or fallback to original if ffmpeg unavailable)
    if (FFMPEG_BIN) {
      const convertedFilename = `${baseName}.${format}`;
      const convertedPath = path.join(tmpDir, `${baseName}_${Date.now()}.${format}`);
      tempFiles.push(convertedPath);

      await convertAudio(rawPath, convertedPath, format);

      const stat = fs.statSync(convertedPath);

      res.setHeader('Content-Type', formatMap[format]);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${convertedFilename}"`);

      const readStream = fs.createReadStream(convertedPath);
      readStream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      readStream.on('close', () => {
        for (const f of tempFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { /* ignore */ }
        }
      });
      readStream.pipe(res);
    } else {
      // ffmpeg not available — stream original file with a warning header
      console.warn('[recording] ffmpeg not found — streaming original file without conversion. Install ffmpeg for MP3 support.');
      const stat = fs.statSync(rawPath);
      res.setHeader('Content-Type', getMimeType(recordingFile));
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${recordingFile}"`);
      res.setHeader('X-Converted', 'false'); // frontend can detect this

      const readStream = fs.createReadStream(rawPath);
      readStream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      readStream.on('close', () => {
        for (const f of tempFiles) {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { /* ignore */ }
        }
      });
      readStream.pipe(res);
    }
  } catch (err) {
    // Cleanup temp files on error
    for (const f of tempFiles) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { /* ignore */ }
    }
    next(err);
  }
};

/**
 * GET /api/recordings/:filename
 * Download a recording directly by filename (looks up CDR to find it)
 */
exports.downloadByFilename = async (req, res, next) => {
  try {
    const { filename } = req.params;

    // Look up the recording in CDR
    const [rows] = await pool.query(
      "SELECT uniqueid, calldate, recordingfile, src, dst FROM asteriskcdrdb.cdr WHERE recordingfile = ? LIMIT 1",
      [filename]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found in CDR' });
    }

    // Reuse the download logic by setting params
    req.params.id = rows[0].uniqueid;
    return exports.download(req, res, next);
  } catch (err) {
    next(err);
  }
};
