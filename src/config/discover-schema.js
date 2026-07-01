require('dotenv').config();
const pool = require('./database');

async function discover() {
  console.log('🔍 Discovering CDR table schema...\n');

  // Get column info
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cdr'
     ORDER BY ORDINAL_POSITION`,
    [process.env.DB_NAME || 'asteriskcdrdb']
  );

  console.log('📋 Columns in cdr table:');
  console.table(columns, ['COLUMN_NAME', 'COLUMN_TYPE', 'COLUMN_KEY', 'IS_NULLABLE']);

  // Get total record count
  const [countResult] = await pool.query('SELECT COUNT(*) AS total FROM cdr');
  console.log(`\n📊 Total records: ${countResult[0].total}`);

  // Get indexes
  const [indexes] = await pool.query('SHOW INDEX FROM cdr');
  const indexSummary = {};
  for (const idx of indexes) {
    if (!indexSummary[idx.Key_name]) {
      indexSummary[idx.Key_name] = { columns: [], type: idx.Index_type, unique: !idx.Non_unique };
    }
    indexSummary[idx.Key_name].columns.push(idx.Column_name);
  }
  console.log('\n🗂️  Indexes:');
  for (const [name, info] of Object.entries(indexSummary)) {
    console.log(`   ${name}: ${info.columns.join(', ')} (${info.type}${info.unique ? ', UNIQUE' : ''})`);
  }

  // Get sample data (5 rows)
  const [sample] = await pool.query('SELECT * FROM cdr LIMIT 5');
  console.log('\n📄 Sample data (first 5 rows):');
  console.table(sample);

  await pool.end();
  process.exit(0);
}

discover().catch((err) => {
  console.error('❌ Discovery failed:', err.message);
  process.exit(1);
});
