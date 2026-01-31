/**
 * Floor Plan Editor - Production Server
 *
 * A lightweight Express server for serving the floor plan editor
 * in production environments.
 */

import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Enable gzip compression
app.use(compression());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve static files from dist directory
app.use(express.static(join(__dirname, 'dist'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set shorter cache for HTML files
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Floor Plan Editor',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Fallback to main HTML file for SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'floor-plan-editor.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Floor Plan Editor - Production Server           ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://${HOST}:${PORT}                    ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(42)}║
║  Press Ctrl+C to stop                                     ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
