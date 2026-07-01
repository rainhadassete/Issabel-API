const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const WHISPER_BIN = process.env.WHISPER_BIN || path.join(__dirname, '..', '..', 'whisper', 'whisper-cli');
const MODELS_DIR = process.env.WHISPER_MODELS_DIR || path.join(__dirname, '..', '..', 'whisper', 'models');
const MODEL_NAME = process.env.WHISPER_MODEL || 'ggml-base.bin';
const TEMP_DIR = path.join(__dirname, '..', '..', 'tmp');

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  return TEMP_DIR;
}

/**
 * Convert GSM audio buffer to WAV using ffmpeg
 */
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = execFile('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-sample_fmt', 's16',
      outputPath
    ], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg error: ${error.message}\n${stderr}`));
      } else {
        resolve(outputPath);
      }
    });
    ffmpeg.stderr.on('data', () => {}); // ffmpeg logs to stderr, suppress
  });
}

/**
 * Run whisper.cpp on a WAV file and return parsed result
 */
function runWhisper(wavPath) {
  return new Promise((resolve, reject) => {
    const modelPath = path.join(MODELS_DIR, MODEL_NAME);
    const outputPath = wavPath.replace(/\.wav$/, '');

    if (!fs.existsSync(modelPath)) {
      reject(new Error(`Model not found: ${modelPath}. Download it first.`));
      return;
    }

    if (!fs.existsSync(WHISPER_BIN)) {
      reject(new Error(`whisper binary not found: ${WHISPER_BIN}`));
      return;
    }

    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-otxt',            // output plain text
      '-of', outputPath,  // output file path (without extension)
      '--no-prints',      // less verbose
      '-l', 'auto',       // auto-detect language
    ];

    execFile(WHISPER_BIN, args, { timeout: 300000 }, (error, stdout, stderr) => {
      if (error && !error.killed) {
        reject(new Error(`whisper error: ${error.message}`));
        return;
      }

      // Read the output text file
      const txtFile = outputPath + '.txt';
      let text = '';
      if (fs.existsSync(txtFile)) {
        text = fs.readFileSync(txtFile, 'utf8').trim();
      }

      resolve({
        text,
        language: null, // whisper.cpp auto-detect not exposed in txt output
        segments: [],
      });
    });
  });
}

/**
 * Transcribe an audio file from a local path
 * @param {string} audioPath - Path to the GSM/WAV audio file
 * @returns {Promise<{text: string, segments: Array, language: string|null}>}
 */
async function transcribeFile(audioPath) {
  const ext = path.extname(audioPath).toLowerCase();
  const baseName = path.basename(audioPath, ext);
  const tmpDir = ensureTempDir();
  const wavPath = path.join(tmpDir, `${baseName}_${Date.now()}.wav`);

  try {
    // Convert to WAV if not already
    if (ext !== '.wav') {
      await convertToWav(audioPath, wavPath);
    } else {
      // Copy and ensure correct format
      await convertToWav(audioPath, wavPath);
    }

    // Transcribe
    const result = await runWhisper(wavPath);
    return result;
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      const txtFile = wavPath.replace(/\.wav$/, '.txt');
      if (fs.existsSync(txtFile)) fs.unlinkSync(txtFile);
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

module.exports = { transcribeFile, convertToWav };
