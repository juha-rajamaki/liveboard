const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS (defined here for reuse)
const ALLOWED_ORIGINS = [
  'http://localhost:1212',
  'http://127.0.0.1:1212'
];

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`Blocked WebSocket connection from: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 1212;

// URL validation function
function isValidYouTubeUrl(url) {
  if (typeof url !== 'string' || url.length > 500) {
    return false;
  }

  const validPatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}(&.*)?$/,
    /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]{11}$/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}$/,
    /^[a-zA-Z0-9_-]{11}$/
  ];

  return validPatterns.some(pattern => pattern.test(url));
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Security headers
app.use((req, res, next) => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://www.youtube.com https://cdn.socket.io https://cdn.jsdelivr.net",
      "frame-src 'self' https://www.youtube.com",
      "connect-src 'self' ws://localhost:1212 wss://localhost:1212 https://www.youtube.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
});

app.use(express.static('public'));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const playLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 video requests per minute per IP
  message: {
    success: false,
    error: 'Too many video requests, please slow down'
  }
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Store connected clients
let connectedClients = 0;

// WebSocket connection handling
io.on('connection', (socket) => {
  connectedClients++;
  console.log(`New client connected. Total clients: ${connectedClients}`);

  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`Client disconnected. Total clients: ${connectedClients}`);
  });
});

// API endpoint to receive YouTube URL
app.post('/api/play', playLimiter, (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  // Validate URL format
  if (!isValidYouTubeUrl(url)) {
    console.warn(`Invalid URL rejected: ${url.substring(0, 50)}`);
    return res.status(400).json({
      success: false,
      error: 'Invalid YouTube URL format'
    });
  }

  // Additional length check
  if (url.length > 500) {
    return res.status(400).json({
      success: false,
      error: 'URL too long'
    });
  }

  console.log(`Received valid URL: ${url}`);

  // Broadcast the URL to all connected clients
  io.emit('play-video', { url });

  res.json({
    success: true,
    message: 'Video URL sent to dashboard',
    clients: connectedClients
  });
});

// Pause video endpoint
app.post('/api/pause', playLimiter, (req, res) => {
  console.log('Pause command received');
  io.emit('control-pause');
  res.json({
    success: true,
    message: 'Pause command sent to all dashboards',
    clients: connectedClients
  });
});

// Resume/Play video endpoint
app.post('/api/resume', playLimiter, (req, res) => {
  console.log('Resume command received');
  io.emit('control-resume');
  res.json({
    success: true,
    message: 'Resume command sent to all dashboards',
    clients: connectedClients
  });
});

// Stop video endpoint
app.post('/api/stop', playLimiter, (req, res) => {
  console.log('Stop command received');
  io.emit('control-stop');
  res.json({
    success: true,
    message: 'Stop command sent to all dashboards',
    clients: connectedClients
  });
});

// Fullscreen endpoint
app.post('/api/fullscreen', playLimiter, (req, res) => {
  console.log('Fullscreen command received');
  io.emit('control-fullscreen');
  res.json({
    success: true,
    message: 'Fullscreen command sent to all dashboards',
    clients: connectedClients
  });
});

// Exit fullscreen endpoint
app.post('/api/exitfullscreen', playLimiter, (req, res) => {
  console.log('Exit fullscreen command received');
  io.emit('control-exitfullscreen');
  res.json({
    success: true,
    message: 'Exit fullscreen command sent to all dashboards',
    clients: connectedClients
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedClients
  });
});

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the documentation page
app.get('/documentation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'documentation.html'));
});

// Serve the API documentation markdown file
app.get('/API_DOCUMENTATION.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'API_DOCUMENTATION.md'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`API endpoint: POST http://localhost:${PORT}/api/play`);
});
