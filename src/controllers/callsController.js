const pool = require('../config/database');

const ALLOWED_SORT_COLUMNS = [
  'calldate', 'src', 'dst', 'duration', 'billsec',
  'disposition', 'clid', 'uniqueid'
];

const ALLOWED_DISPOSITIONS = [
  'ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED', 'CONGESTION'
];

exports.list = async (req, res, next) => {
  try {
    let {
      page = 1,
      limit = 50,
      start_date: startDate,
      end_date: endDate,
      search,
      disposition,
      sort_by: sortBy = 'calldate',
      sort_order: sortOrder = 'DESC'
    } = req.query;

    // Validate and parse pagination
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: 'Page must be a positive integer' });
    }
    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({ error: 'Limit must be a positive integer' });
    }
    if (limit > 500) {
      return res.status(400).json({ error: 'Limit must not exceed 500' });
    }

    // Validate sort parameters
    sortOrder = sortOrder.toUpperCase();
    if (sortOrder !== 'ASC' && sortOrder !== 'DESC') {
      sortOrder = 'DESC';
    }
    if (!ALLOWED_SORT_COLUMNS.includes(sortBy)) {
      sortBy = 'calldate';
    }

    // Validate disposition
    if (disposition) {
      const dispUpper = disposition.toUpperCase();
      if (!ALLOWED_DISPOSITIONS.includes(dispUpper)) {
        return res.status(400).json({
          error: `Invalid disposition. Allowed values: ${ALLOWED_DISPOSITIONS.join(', ')}`
        });
      }
      disposition = dispUpper;
    }

    // Validate dates
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ error: 'Invalid start_date. Use ISO 8601 format (e.g., 2026-07-01)' });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({ error: 'Invalid end_date. Use ISO 8601 format (e.g., 2026-07-01)' });
    }

    // Build WHERE clause
    const where = [];
    const params = [];

    if (startDate) {
      where.push('calldate >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('calldate <= ?');
      params.push(endDate + ' 23:59:59');
    }
    if (disposition) {
      where.push('disposition = ?');
      params.push(disposition);
    }
    if (search) {
      where.push('(src LIKE ? OR dst LIKE ? OR clid LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // Count query
    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM asteriskcdrdb.cdr ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit) || 0;
    const offset = (page - 1) * limit;

    // Data query
    const [rows] = await pool.query(
      `SELECT * FROM asteriskcdrdb.cdr ${whereClause} ORDER BY \`${sortBy}\` ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      'SELECT * FROM asteriskcdrdb.cdr WHERE uniqueid = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
};
