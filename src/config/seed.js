require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./database');

async function seed() {
  console.log('🔧 Running seed...');

  // Create api_users table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ Table "api_users" ensured.');

  // Check if admin already exists
  const [rows] = await pool.query(
    'SELECT id FROM api_users WHERE username = ?',
    [process.env.ADMIN_USERNAME || 'admin']
  );

  if (rows.length === 0) {
    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || 'admin',
      10
    );
    await pool.query(
      'INSERT INTO api_users (username, password) VALUES (?, ?)',
      [process.env.ADMIN_USERNAME || 'admin', hashedPassword]
    );
    console.log(`✅ Admin user "${process.env.ADMIN_USERNAME || 'admin'}" created.`);
  } else {
    console.log(`ℹ️  Admin user "${process.env.ADMIN_USERNAME || 'admin'}" already exists.`);
  }

  await pool.end();
  console.log('🎉 Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
