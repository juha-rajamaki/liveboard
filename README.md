# YouTube Dashboard

A web application with an API listener that receives YouTube URLs and plays them in real-time using WebSockets.

## Features

- Real-time video playback via WebSocket communication
- REST API endpoint to receive YouTube URLs
- Clean, responsive dashboard interface
- Built with vanilla JavaScript, HTML, and CSS
- Node.js/Express backend with Socket.io

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to:
```
http://localhost:666
```

3. Send a YouTube URL to the API:
```bash
curl -X POST http://localhost:666/api/play \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## API Endpoints

### POST /api/play
Sends a YouTube URL to all connected dashboards.

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Video URL sent to dashboard",
  "clients": 1
}
```

### GET /api/health
Check server status and connected clients.

**Response:**
```json
{
  "status": "ok",
  "connectedClients": 1
}
```

## Supported URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- Direct video ID: `VIDEO_ID`

## Development

Run with auto-reload:
```bash
npm run dev
```

## Architecture

- **Backend**: Node.js with Express and Socket.io for WebSocket communication
- **Frontend**: Vanilla HTML/CSS/JavaScript with YouTube IFrame API
- **Communication**: Real-time bidirectional WebSocket connection

## License

ISC
