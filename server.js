require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const marked = require('marked');

const app = express();
const server = http.createServer(app);

// Function to check if origin is allowed (local network or localhost)
function isOriginAllowed(origin) {
  if (!origin) return true; // Allow requests with no origin (mobile apps, Postman, etc.)

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Allow localhost and 127.0.0.1 on any port
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    // Allow private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const ipRegex = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;
    if (ipRegex.test(hostname)) {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
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
const crypto = require('crypto');

// API Keys storage file
const API_KEYS_FILE = path.join(__dirname, 'api-keys.json');

// Load API keys from JSON file
function loadApiKeys() {
  try {
    if (fs.existsSync(API_KEYS_FILE)) {
      const data = fs.readFileSync(API_KEYS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading API keys file:', error.message);
  }
  return [];
}

// Save API keys to JSON file
function saveApiKeys(keys) {
  try {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving API keys file:', error.message);
    return false;
  }
}

// Get all valid API keys (from both .env and JSON file)
function getAllApiKeys() {
  // Load from .env
  const envKeys = (process.env.API_KEYS || '')
    .split(',')
    .map(key => key.trim())
    .filter(key => key.length > 0);

  // Load from JSON file
  const fileKeys = loadApiKeys().map(k => k.key);

  // Combine and deduplicate
  return [...new Set([...envKeys, ...fileKeys])];
}

// Load API keys
let API_KEYS = getAllApiKeys();

// Validate API keys on startup
if (API_KEYS.length === 0 || API_KEYS.includes('your-secret-api-key-change-this-in-production')) {
  console.warn('⚠️  WARNING: Using default or no API keys! Please set secure API_KEYS in .env file');
  console.warn('⚠️  Generate secure keys with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

// Generate a new API key
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Authentication middleware
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    console.warn(`[AUTH] Missing API key from IP: ${req.ip}`);

    // Emit failed authentication event
    io.emit('auth-attempt', {
      success: false,
      reason: 'Missing API key',
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    return res.status(401).json({
      success: false,
      error: 'API key required. Include X-API-Key header in your request.'
    });
  }

  // Dynamically reload keys to include newly added ones
  const allKeyObjects = loadApiKeys();
  const currentKeys = getAllApiKeys();

  if (!currentKeys.includes(apiKey)) {
    console.warn(`[AUTH] Invalid API key attempt from IP: ${req.ip}`);

    // Emit failed authentication event
    io.emit('auth-attempt', {
      success: false,
      reason: 'Invalid API key',
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    return res.status(401).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  // Find the device name for this API key
  const keyObject = allKeyObjects.find(k => k.key === apiKey);
  const deviceName = keyObject ? keyObject.name : 'Unknown Device';

  console.log(`[AUTH] Authenticated request from IP: ${req.ip}, Device: ${deviceName}`);

  // Emit successful authentication event
  io.emit('auth-attempt', {
    success: true,
    deviceName: deviceName,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  next();
}

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
    if (isOriginAllowed(origin)) {
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
      "script-src 'self' 'unsafe-eval' https://www.youtube.com https://cdn.socket.io https://cdn.jsdelivr.net",
      "frame-src 'self' https://www.youtube.com",
      "connect-src 'self' ws://localhost:1212 wss://localhost:1212 https://www.youtube.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' https: data:",
      "font-src 'self' data:",
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

  // Handle control discovery messages
  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'get_controls') {
        console.log('Control discovery request received');

        // Send control definitions
        const controlsResponse = {
          type: 'controls',
          controls: [
            {
              id: 'play',
              name: 'Play YouTube Video',
              type: 'text',
              command: 'play',
              placeholder: 'Enter YouTube URL',
              description: 'Play a YouTube video by URL'
            },
            {
              id: 'pause',
              name: 'Pause',
              type: 'button',
              command: 'pause',
              description: 'Pause current video'
            },
            {
              id: 'resume',
              name: 'Resume',
              type: 'button',
              command: 'resume',
              description: 'Resume playback'
            },
            {
              id: 'stop',
              name: 'Stop',
              type: 'button',
              command: 'stop',
              description: 'Stop video and clear player'
            },
            {
              id: 'fullscreen',
              name: 'Fullscreen',
              type: 'button',
              command: 'fullscreen',
              description: 'Enter fullscreen mode'
            },
            {
              id: 'exitfullscreen',
              name: 'Exit Fullscreen',
              type: 'button',
              command: 'exitfullscreen',
              description: 'Exit fullscreen mode'
            }
          ]
        };

        socket.emit('message', JSON.stringify(controlsResponse));
        console.log('Control definitions sent');
      }

      // Handle control commands
      if (message.type === 'command') {
        console.log(`Command received: ${message.command}`, message.value);

        switch (message.command) {
          case 'play':
            if (message.value && isValidYouTubeUrl(message.value)) {
              io.emit('play-video', { url: message.value });
              console.log(`Playing video: ${message.value}`);
            } else {
              console.warn('Invalid YouTube URL');
            }
            break;

          case 'pause':
            io.emit('control-pause');
            console.log('Pausing video');
            break;

          case 'resume':
            io.emit('control-resume');
            console.log('Resuming video');
            break;

          case 'stop':
            io.emit('control-stop');
            console.log('Stopping video');
            break;

          case 'fullscreen':
            io.emit('control-fullscreen');
            console.log('Entering fullscreen');
            break;

          case 'exitfullscreen':
            io.emit('control-exitfullscreen');
            console.log('Exiting fullscreen');
            break;

          default:
            console.warn(`Unknown command: ${message.command}`);
        }
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`Client disconnected. Total clients: ${connectedClients}`);
  });
});

// API endpoint to receive YouTube URL
app.post('/api/play', requireApiKey, playLimiter, (req, res) => {
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
app.post('/api/pause', requireApiKey, playLimiter, (req, res) => {
  console.log('Pause command received');
  io.emit('control-pause');
  res.json({
    success: true,
    message: 'Pause command sent to all dashboards',
    clients: connectedClients
  });
});

// Resume/Play video endpoint
app.post('/api/resume', requireApiKey, playLimiter, (req, res) => {
  console.log('Resume command received');
  io.emit('control-resume');
  res.json({
    success: true,
    message: 'Resume command sent to all dashboards',
    clients: connectedClients
  });
});

// Stop video endpoint
app.post('/api/stop', requireApiKey, playLimiter, (req, res) => {
  console.log('Stop command received');
  io.emit('control-stop');
  res.json({
    success: true,
    message: 'Stop command sent to all dashboards',
    clients: connectedClients
  });
});

// Fullscreen endpoint
app.post('/api/fullscreen', requireApiKey, playLimiter, (req, res) => {
  console.log('Fullscreen command received');
  io.emit('control-fullscreen');
  res.json({
    success: true,
    message: 'Fullscreen command sent to all dashboards',
    clients: connectedClients
  });
});

// Exit fullscreen endpoint
app.post('/api/exitfullscreen', requireApiKey, playLimiter, (req, res) => {
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

// Admin API endpoints for key management
// Generate and save a new API key
app.post('/api/admin/keys', requireApiKey, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Name is required'
    });
  }

  // Generate a secure random key
  const newKey = generateApiKey();
  const fileKeys = loadApiKeys();

  const newKeyEntry = {
    id: crypto.randomBytes(16).toString('hex'),
    name: name.trim(),
    key: newKey,
    createdAt: new Date().toISOString()
  };

  fileKeys.push(newKeyEntry);

  if (saveApiKeys(fileKeys)) {
    res.json({
      success: true,
      message: 'API key generated and saved successfully',
      key: newKey,
      keyId: newKeyEntry.id
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save API key'
    });
  }
});

// List all API keys (masked for security)
app.get('/api/admin/keys', requireApiKey, (req, res) => {
  const fileKeys = loadApiKeys();
  const envKeys = (process.env.API_KEYS || '')
    .split(',')
    .map(key => key.trim())
    .filter(key => key.length > 0);

  const maskedKeys = fileKeys.map(k => ({
    id: k.id,
    name: k.name,
    key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4),
    createdAt: k.createdAt,
    source: 'file'
  }));

  const maskedEnvKeys = envKeys.map((key, index) => ({
    id: `env-${index}`,
    name: 'Environment Variable',
    key: key.substring(0, 8) + '...' + key.substring(key.length - 4),
    createdAt: null,
    source: 'env'
  }));

  res.json({
    success: true,
    keys: [...maskedKeys, ...maskedEnvKeys]
  });
});

// Delete an API key
app.delete('/api/admin/keys/:id', requireApiKey, (req, res) => {
  const { id } = req.params;
  const fileKeys = loadApiKeys();

  const keyIndex = fileKeys.findIndex(k => k.id === id);

  if (keyIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'API key not found or cannot be deleted (environment keys cannot be deleted via API)'
    });
  }

  fileKeys.splice(keyIndex, 1);

  if (saveApiKeys(fileKeys)) {
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the API keys list page (no auth required)
app.get('/keys', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'keys.html'));
});

// Serve the old admin/keys page (redirect to new location)
app.get('/admin/keys', (req, res) => {
  res.redirect('/keys');
});

// Serve the setup page for adding new API keys
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

// API endpoint to list all keys (no authentication required)
app.get('/api/keys/list', (req, res) => {
  const fileKeys = loadApiKeys();

  res.json({
    success: true,
    keys: fileKeys
  });
});

// API endpoint to delete a key (no authentication required for now)
app.delete('/api/keys/:keyId', (req, res) => {
  const { keyId } = req.params;
  const fileKeys = loadApiKeys();

  const keyIndex = fileKeys.findIndex(k => k.id === keyId);

  if (keyIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'API key not found'
    });
  }

  fileKeys.splice(keyIndex, 1);

  if (saveApiKeys(fileKeys)) {
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

// API endpoint to rename a key (no authentication required for now)
app.patch('/api/keys/:keyId', (req, res) => {
  const { keyId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Name is required'
    });
  }

  const fileKeys = loadApiKeys();
  const keyIndex = fileKeys.findIndex(k => k.id === keyId);

  if (keyIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'API key not found'
    });
  }

  fileKeys[keyIndex].name = name.trim();

  if (saveApiKeys(fileKeys)) {
    res.json({
      success: true,
      message: 'API key renamed successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to rename API key'
    });
  }
});

// API endpoint for setup - generate key without authentication
app.post('/api/setup/generate-key', (req, res) => {
  const { name, key } = req.body;

  if (!name || !key) {
    return res.status(400).json({
      success: false,
      error: 'Name and key are required'
    });
  }

  // Validate key format (should be 64 hex characters)
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid key format'
    });
  }

  const fileKeys = loadApiKeys();

  const newKeyEntry = {
    id: crypto.randomBytes(16).toString('hex'),
    name: name.trim(),
    key: key.toLowerCase(),
    createdAt: new Date().toISOString()
  };

  fileKeys.push(newKeyEntry);

  if (saveApiKeys(fileKeys)) {
    res.json({
      success: true,
      message: 'API key saved successfully',
      keyId: newKeyEntry.id
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save API key'
    });
  }
});

// Serve the documentation page with server-side markdown rendering
app.get('/documentation', (req, res) => {
  try {
    // Read the markdown file
    const markdownPath = path.join(__dirname, 'API_DOCUMENTATION.md');
    const markdown = fs.readFileSync(markdownPath, 'utf8');

    // Convert markdown to HTML
    const contentHtml = marked.parse(markdown);

    // Create the full HTML page
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation - Liveboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            font-size: 2em;
            margin-bottom: 5px;
        }

        .header p {
            opacity: 0.9;
            font-size: 1.1em;
        }

        .back-link {
            background: rgba(255,255,255,0.2);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            text-decoration: none;
            transition: background 0.3s;
        }

        .back-link:hover {
            background: rgba(255,255,255,0.3);
        }

        .container {
            max-width: 1200px;
            margin: 40px auto;
            padding: 0 20px;
        }

        .doc-content {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        /* Markdown Styling */
        h1 {
            color: #667eea;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
            margin-top: 0;
            margin-bottom: 30px;
        }

        h2 {
            color: #667eea;
            margin-top: 40px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
        }

        h3 {
            color: #764ba2;
            margin-top: 30px;
            margin-bottom: 15px;
        }

        h4 {
            color: #666;
            margin-top: 20px;
            margin-bottom: 10px;
        }

        p {
            margin-bottom: 15px;
        }

        ul, ol {
            margin-bottom: 15px;
            padding-left: 30px;
        }

        li {
            margin-bottom: 8px;
        }

        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            color: #d63384;
        }

        pre {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 20px;
            border-radius: 5px;
            overflow-x: auto;
            margin-bottom: 20px;
            line-height: 1.5;
        }

        pre code {
            background: transparent;
            padding: 0;
            color: #f8f8f2;
            font-size: 0.95em;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            background: white;
        }

        table th {
            background: #667eea;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }

        table td {
            padding: 12px;
            border-bottom: 1px solid #e0e0e0;
        }

        table tr:hover {
            background: #f9f9f9;
        }

        blockquote {
            border-left: 4px solid #667eea;
            padding-left: 20px;
            margin: 20px 0;
            color: #666;
            font-style: italic;
        }

        a {
            color: #667eea;
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: border-color 0.3s;
        }

        a:hover {
            border-bottom-color: #667eea;
        }

        hr {
            border: none;
            border-top: 2px solid #e0e0e0;
            margin: 40px 0;
        }

        @media (max-width: 768px) {
            .header-content {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }

            .doc-content {
                padding: 20px;
            }

            pre {
                padding: 15px;
                font-size: 0.85em;
            }

            table {
                font-size: 0.9em;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div>
                <h1>API Documentation</h1>
                <p>Complete reference for the Liveboard API</p>
            </div>
            <a href="/" class="back-link">← Back to Dashboard</a>
        </div>
    </div>

    <div class="container">
        <div class="doc-content">
            ${contentHtml}
        </div>
    </div>
</body>
</html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error rendering documentation:', error);
    res.status(500).send('Error loading documentation');
  }
});

// Serve the API documentation markdown file
app.get('/API_DOCUMENTATION.md', (req, res) => {
  res.sendFile(path.join(__dirname, 'API_DOCUMENTATION.md'));
});

// Serve OpenAPI specification (machine-readable)
app.get('/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

// Serve Swagger UI for interactive API documentation
app.get('/api-docs', (req, res) => {
  // Set custom CSP headers for Swagger UI to work properly
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' https: data:",
      "font-src 'self' https://cdn.jsdelivr.net data:",
      "connect-src 'self' https://cdn.jsdelivr.net",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')
  );

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation - Liveboard</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.5/swagger-ui.css">
    <style>
        body {
            margin: 0;
            padding: 0;
        }
        .topbar {
            display: none;
        }
        .swagger-ui .info {
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: '/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                defaultModelsExpandDepth: 1,
                defaultModelExpandDepth: 1,
                docExpansion: 'list',
                filter: true,
                tryItOutEnabled: true
            });
            window.ui = ui;
        };
    </script>
</body>
</html>
  `;
  res.send(html);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`API endpoint: POST http://localhost:${PORT}/api/play`);
  console.log(`Human docs: http://localhost:${PORT}/documentation`);
  console.log(`Machine docs: http://localhost:${PORT}/openapi.json`);
  console.log(`Interactive docs: http://localhost:${PORT}/api-docs`);
});
