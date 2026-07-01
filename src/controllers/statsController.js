const pool = require('../config/database');

const VALID_PERIODS = ['today', 'yesterday', 'this_week', 'this_month', 'last_30_days', 'custom'];

function getDateRange(period, startDate, endDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 86400000 - 1) // end of today
      };
    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 86400000);
      return {
        start: yesterday,
        end: new Date(today.getTime() - 1) // end of yesterday
      };
    }
    case 'this_week': {
      const dayOfWeek = today.getDay(); // 0=Sun
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday start
      const monday = new Date(today.getTime() - diff * 86400000);
      return {
        start: monday,
        end: new Date(today.getTime() + 86400000 - 1)
      };
    }
    case 'this_month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start: monthStart,
        end: new Date(today.getTime() + 86400000 - 1)
      };
    }
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
      return {
        start: thirtyDaysAgo,
        end: new Date(today.getTime() + 86400000 - 1)
      };
    }
    case 'custom': {
      if (!startDate || !endDate) {
        throw new Error('start_date and end_date are required when period=custom');
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format. Use ISO 8601');
      }
      return { start, end: new Date(end.getTime() + 86399999) };
    }
    default:
      throw new Error(`Period must be one of: ${VALID_PERIODS.join(', ')}`);
  }
}

exports.getStats = async (req, res, next) => {
  try {
    let { period = 'today', start_date: startDate, end_date: endDate } = req.query;
    period = period.toLowerCase();

    if (!VALID_PERIODS.includes(period)) {
      return res.status(400).json({
        error: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`
      });
    }

    const range = getDateRange(period, startDate, endDate);

    const formatDate = (d) =>
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');

    const startStr = formatDate(range.start);
    const endStr = formatDate(range.end);

    // Run all queries in parallel
    const [
      [totalResult],
      [dispositionResult],
      [durationResult],
      [topCallersResult],
      [topDestsResult]
    ] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) AS total FROM asteriskcdrdb.cdr WHERE calldate BETWEEN ? AND ?',
        [startStr, endStr]
      ),
      pool.query(
        `SELECT disposition, COUNT(*) AS count
         FROM asteriskcdrdb.cdr
         WHERE calldate BETWEEN ? AND ?
         GROUP BY disposition
         ORDER BY count DESC`,
        [startStr, endStr]
      ),
      pool.query(
        `SELECT
           SUM(duration) AS total_duration,
           SUM(billsec) AS total_billsec,
           AVG(duration) AS avg_duration,
           MAX(duration) AS max_duration
         FROM asteriskcdrdb.cdr
         WHERE calldate BETWEEN ? AND ?`,
        [startStr, endStr]
      ),
      pool.query(
        `SELECT src, COUNT(*) AS call_count, SUM(billsec) AS total_billsec
         FROM asteriskcdrdb.cdr
         WHERE calldate BETWEEN ? AND ?
         GROUP BY src
         ORDER BY call_count DESC
         LIMIT 10`,
        [startStr, endStr]
      ),
      pool.query(
        `SELECT dst, COUNT(*) AS call_count, SUM(billsec) AS total_billsec
         FROM asteriskcdrdb.cdr
         WHERE calldate BETWEEN ? AND ?
         GROUP BY dst
         ORDER BY call_count DESC
         LIMIT 10`,
        [startStr, endStr]
      )
    ]);

    const duration = durationResult[0];

    res.json({
      period: {
        start: startStr,
        end: endStr,
        label: period
      },
      summary: {
        total_calls: totalResult[0].total,
        total_duration: duration.total_duration || 0,
        total_billsec: duration.total_billsec || 0,
        avg_duration: duration.avg_duration
          ? Math.round(parseFloat(duration.avg_duration) * 10) / 10
          : 0,
        max_duration: duration.max_duration || 0
      },
      by_disposition: dispositionResult.map((r) => ({
        disposition: r.disposition,
        count: r.count
      })),
      top_callers: topCallersResult.map((r) => ({
        src: r.src,
        call_count: r.call_count,
        total_billsec: r.total_billsec || 0
      })),
      top_destinations: topDestsResult.map((r) => ({
        dst: r.dst,
        call_count: r.call_count,
        total_billsec: r.total_billsec || 0
      }))
    });
  } catch (err) {
    if (err.message.startsWith('Period must be') ||
        err.message.startsWith('start_date and end_date') ||
        err.message.startsWith('Invalid date format')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};
