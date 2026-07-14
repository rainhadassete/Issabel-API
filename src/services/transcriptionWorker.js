const pool = require('../config/database');
const { processAndSaveTranscription, ensureTable } = require('../controllers/transcriptionController');

/**
 * Background worker that periodically processes pending transcriptions.
 * Runs as a setInterval inside the Node.js process — no external queue needed.
 *
 * Config via env:
 *   TRANSCRIPTION_WORKER_ENABLED=true   (default: true)
 *   TRANSCRIPTION_WORKER_INTERVAL_MS=60000   (default: 60s)
 *   TRANSCRIPTION_WORKER_BATCH_SIZE=5   (default: 5 per cycle)
 *   TRANSCRIPTION_WORKER_MIN_AGE_SECONDS=30   (default: 30s — wait before transcribing a new call)
 *   TRANSCRIPTION_WORKER_MAX_CONSECUTIVE_ERRORS=10   (default: 10 — auto-disable threshold)
 */

const config = {
  enabled: process.env.TRANSCRIPTION_WORKER_ENABLED !== 'false',
  intervalMs: parseInt(process.env.TRANSCRIPTION_WORKER_INTERVAL_MS) || 60000,
  batchSize: parseInt(process.env.TRANSCRIPTION_WORKER_BATCH_SIZE) || 5,
  minAgeSeconds: parseInt(process.env.TRANSCRIPTION_WORKER_MIN_AGE_SECONDS) || 30,
  maxConsecutiveErrors: parseInt(process.env.TRANSCRIPTION_WORKER_MAX_CONSECUTIVE_ERRORS) || 10,
};

const state = {
  running: false,
  timer: null,
  cycle: 0,
  totalProcessed: 0,
  totalErrors: 0,
  totalCached: 0,
  lastRunAt: null,
  lastError: null,
  lastErrorAt: null,
  consecutiveErrors: 0,
  busy: false,
};

/**
 * Run a single processing cycle.
 * Picks up to batchSize calls with recordings that have no transcription yet,
 * older than minAgeSeconds (to avoid racing with the recording file write).
 */
async function runCycle() {
  if (state.busy) {
    console.log('[transcription-worker] Previous cycle still running, skipping');
    return;
  }

  state.busy = true;
  state.cycle += 1;
  const cycleStart = Date.now();

  try {
    await ensureTable();

    const [pending] = await pool.query(
      `SELECT c.uniqueid, c.recordingfile, c.calldate
       FROM asteriskcdrdb.cdr c
       LEFT JOIN transcriptions t ON t.uniqueid = c.uniqueid
       WHERE c.recordingfile IS NOT NULL
         AND c.recordingfile != ''
         AND c.calldate <= (NOW() - INTERVAL ? SECOND)
         AND t.uniqueid IS NULL
       ORDER BY c.calldate ASC
       LIMIT ?`,
      [config.minAgeSeconds, config.batchSize]
    );

    if (pending.length === 0) {
      state.lastRunAt = new Date().toISOString();
      return;
    }

    console.log(`[transcription-worker] Cycle ${state.cycle}: processing ${pending.length} call(s)`);

    let cycleOk = 0;
    let cycleErr = 0;

    // Process sequentially — whisper is heavy; concurrent runs would load the box.
    for (const call of pending) {
      try {
        const result = await processAndSaveTranscription(call.uniqueid);
        if (result.from_cache) {
          state.totalCached += 1;
        } else {
          state.totalProcessed += 1;
          cycleOk += 1;
        }
        state.consecutiveErrors = 0;
        state.lastError = null;
      } catch (err) {
        cycleErr += 1;
        state.totalErrors += 1;
        state.consecutiveErrors += 1;
        state.lastError = err.message;
        state.lastErrorAt = new Date().toISOString();
        console.error(`[transcription-worker] Failed to transcribe ${call.uniqueid}: ${err.message}`);
      }
    }

    const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
    console.log(
      `[transcription-worker] Cycle ${state.cycle} done in ${elapsed}s — ${cycleOk} ok, ${cycleErr} errors`
    );

    // Auto-disable if too many consecutive errors (e.g., whisper binary missing)
    if (state.consecutiveErrors >= config.maxConsecutiveErrors) {
      console.error(
        `[transcription-worker] ${state.consecutiveErrors} consecutive errors — disabling worker. Fix the issue and restart.`
      );
      stop();
    }
  } catch (err) {
    state.consecutiveErrors += 1;
    state.lastError = err.message;
    state.lastErrorAt = new Date().toISOString();
    console.error(`[transcription-worker] Cycle error: ${err.message}`);
  } finally {
    state.lastRunAt = new Date().toISOString();
    state.busy = false;
  }
}

/**
 * Start the background worker.
 * @returns {{ started: boolean, reason?: string }}
 */
function start() {
  if (state.running) {
    return { started: false, reason: 'already running' };
  }
  if (!config.enabled) {
    console.log('[transcription-worker] Disabled via TRANSCRIPTION_WORKER_ENABLED=false');
    return { started: false, reason: 'disabled by config' };
  }

  state.running = true;
  state.consecutiveErrors = 0;
  console.log(
    `[transcription-worker] Starting — interval=${config.intervalMs}ms, batch=${config.batchSize}, minAge=${config.minAgeSeconds}s`
  );

  // Run first cycle after a short delay (let the server finish booting)
  state.timer = setTimeout(function tick() {
    runCycle().finally(() => {
      if (state.running) {
        state.timer = setTimeout(tick, config.intervalMs);
      }
    });
  }, 5000);

  return { started: true };
}

/**
 * Stop the background worker gracefully.
 */
function stop() {
  if (!state.running) return;
  state.running = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  console.log('[transcription-worker] Stopped');
}

/**
 * Worker status for monitoring endpoints.
 */
function getStatus() {
  return {
    running: state.running,
    enabled: config.enabled,
    config: {
      intervalMs: config.intervalMs,
      batchSize: config.batchSize,
      minAgeSeconds: config.minAgeSeconds,
    },
    stats: {
      cycle: state.cycle,
      totalProcessed: state.totalProcessed,
      totalCached: state.totalCached,
      totalErrors: state.totalErrors,
      consecutiveErrors: state.consecutiveErrors,
      lastRunAt: state.lastRunAt,
      lastError: state.lastError,
      lastErrorAt: state.lastErrorAt,
    },
  };
}

/**
 * Force-run a cycle immediately (admin trigger).
 */
async function triggerNow() {
  if (!state.running) {
    return { triggered: false, reason: 'worker is not running' };
  }
  await runCycle();
  return { triggered: true, status: getStatus() };
}

module.exports = { start, stop, getStatus, triggerNow, runCycle };
