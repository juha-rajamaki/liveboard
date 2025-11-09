const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 666;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
app.post('/api/play', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Received URL: ${url}`);

  // Broadcast the URL to all connected clients
  io.emit('play-video', { url });

  res.json({
    success: true,
    message: 'Video URL sent to dashboard',
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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`API endpoint: POST http://localhost:${PORT}/api/play`);
});
