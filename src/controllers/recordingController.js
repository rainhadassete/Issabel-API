const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

const RECORDINGS_PATH = process.env.RECORDINGS_PATH || '/var/spool/asterisk/monitor';

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
 * GET /api/calls/:id/recording
 * Stream the recording file via SFTP directly to the HTTP response
 */
exports.download = async (req, res, next) => {
  try {
    const { id } = req.params;

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

    const remotePath = getRemotePath(call.recordingfile);
    const mimeType = getMimeType(call.recordingfile);
    const recordingFile = call.recordingfile.trim();

    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return res.status(500).json({ error: 'Failed to open SFTP connection' }); }

        sftp.stat(remotePath, (err, stat) => {
          if (err) { sftp.end(); conn.end(); return res.status(404).json({ error: 'Recording file not found on server' }); }

          const readStream = sftp.createReadStream(remotePath);
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Disposition', `attachment; filename="${recordingFile}"`);

          readStream.on('error', () => { sftp.end(); conn.end(); if (!res.headersSent) res.status(500).end(); });
          readStream.on('end', () => { sftp.end(); conn.end(); });
          readStream.pipe(res);
        });
      });
    });
    conn.on('error', (e) => res.status(502).json({ error: 'SSH connection failed', details: e.message }));
    conn.connect({
      host: process.env.SSH_HOST || '192.168.70.3',
      port: parseInt(process.env.SSH_PORT || '22'),
      username: process.env.SSH_USER || 'root',
      password: process.env.SSH_PASSWORD,
      readyTimeout: 10000,
    });
  } catch (err) { next(err); }
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
