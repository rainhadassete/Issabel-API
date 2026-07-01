require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const pool = require('./config/database');
const swaggerSpec = require('./config/swagger');
const authRoutes = require('./routes/auth');
const callsRoutes = require('./routes/calls');
const statsRoutes = require('./routes/stats');
const recordingRoutes = require('./routes/recordings');
const transcriptionRoutes = require('./routes/transcriptions');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 63072000, includeSubDomains: true } : false,
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Issabel API - Documentação'
}));

// Health check (no auth required)
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (err) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api', recordingRoutes);
app.use('/api', transcriptionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Issabel API running on ${HOST}:${PORT}`);
});
