# Liveboard API Documentation

Complete API reference for controlling the Liveboard remotely.

## Table of Contents
- [Getting Started](#getting-started)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [API Endpoints](#api-endpoints)
  - [Play Video](#play-video)
  - [Pause Video](#pause-video)
  - [Resume Video](#resume-video)
  - [Stop Video](#stop-video)
  - [Enter Fullscreen](#enter-fullscreen)
  - [Exit Fullscreen](#exit-fullscreen)
  - [Set Volume](#set-volume)
  - [Play Next](#play-next)
  - [Play Previous](#play-previous)
  - [Mute/Unmute](#muteunmute)
  - [Health Check](#health-check)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Code Examples](#code-examples)
- [WebSocket Connection](#websocket-connection)

---

## Getting Started

The Liveboard API allows you to remotely control video playback on connected dashboard displays. All control commands are broadcast to all connected clients in real-time via WebSocket.

### Prerequisites
- Dashboard server must be running
- At least one dashboard client must be connected to receive commands
- Network access to the server (default: http://localhost:1212)

---

## Base URL

```
http://localhost:1212
```

For production deployments, replace `localhost:1212` with your server's hostname and port.

---

## Authentication

All API control endpoints require authentication via API key.

### How It Works

Include your API key in the `X-API-Key` header with every request to control endpoints:

```bash
curl -X POST http://localhost:1212/api/play \
  -H "X-API-Key: your-secret-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### Getting Your API Key

1. Locate the `.env` file in your dashboard installation directory
2. Find or set the `API_KEYS` variable
3. Generate a secure key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Add your key to `.env`: `API_KEYS=your-generated-key-here`
5. Restart the server for changes to take effect

### Multiple API Keys

You can specify multiple API keys (comma-separated) in `.env`:
```
API_KEYS=key-for-home-automation,key-for-mobile-app,key-for-scripts
```

### Protected Endpoints

The following endpoints require authentication:
- `POST /api/play`
- `POST /api/pause`
- `POST /api/resume`
- `POST /api/stop`
- `POST /api/fullscreen`
- `POST /api/exitfullscreen`
- `POST /api/volume`
- `POST /api/next`
- `POST /api/previous`
- `POST /api/mute`

### Public Endpoints

The following endpoints do NOT require authentication:
- `GET /` (dashboard viewing)
- `GET /documentation`
- `GET /api-docs`
- `GET /openapi.json`
- `GET /api/health`
- WebSocket connections (viewing only)

### Authentication Errors

**Missing API Key:**
```json
{
  "success": false,
  "error": "API key required. Include X-API-Key header in your request."
}
```

**Invalid API Key:**
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

### Additional Security Measures

- **CORS**: Restricted to allowed origins (localhost:1212, 127.0.0.1:1212)
- **Rate Limiting**: 100 requests per 15 minutes globally, 30 video control requests per minute
- **URL Validation**: Only valid YouTube URLs are accepted
- **Request Size Limit**: Maximum 10KB request body

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

| Limit Type | Window | Max Requests |
|------------|--------|--------------|
| Global API | 15 minutes | 100 requests |
| Video Controls | 1 minute | 30 requests |

When rate limit is exceeded, you'll receive a `429 Too Many Requests` response.

---

## API Endpoints

### Play Video

Sends a YouTube URL to all connected dashboards to play the video.

**Endpoint:** `POST /api/play`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Supported URL Formats:**
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `VIDEO_ID` (11-character video ID)

**Success Response:**
```json
{
  "success": true,
  "message": "Video URL sent to dashboard",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/play \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

**Example (Python):**
```python
import requests

url = "http://localhost:1212/api/play"
payload = {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}

response = requests.post(url, json=payload)
print(response.json())
```

**Example (JavaScript):**
```javascript
fetch('http://localhost:1212/api/play', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

---

### Pause Video

Pauses the currently playing video on all connected dashboards.

**Endpoint:** `POST /api/pause`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Pause command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/pause
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/pause")
print(response.json())
```

---

### Resume Video

Resumes the paused video on all connected dashboards.

**Endpoint:** `POST /api/resume`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Resume command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/resume
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/resume")
print(response.json())
```

---

### Stop Video

Stops the video and returns to the placeholder screen on all connected dashboards.

**Endpoint:** `POST /api/stop`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Stop command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/stop
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/stop")
print(response.json())
```

---

### Enter Fullscreen

Enters fullscreen mode on all connected dashboards.

**Endpoint:** `POST /api/fullscreen`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Fullscreen command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/fullscreen
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/fullscreen")
print(response.json())
```

**Note:** Fullscreen must be triggered by user interaction in some browsers due to security restrictions. The API command may not work if there hasn't been recent user interaction with the page.

---

### Exit Fullscreen

Exits fullscreen mode on all connected dashboards.

**Endpoint:** `POST /api/exitfullscreen`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Exit fullscreen command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/exitfullscreen
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/exitfullscreen")
print(response.json())
```

---

### Set Volume

Sets the volume level on all connected dashboards.

**Endpoint:** `POST /api/volume`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "level": 50
}
```

**Parameters:**
- `level` (number, required): Volume level from 0 (muted) to 100 (maximum volume)

**Success Response:**
```json
{
  "success": true,
  "message": "Volume command sent to all dashboards",
  "level": 50,
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/volume \
  -H "Content-Type: application/json" \
  -d '{"level": 50}'
```

**Example (Python):**
```python
import requests

url = "http://localhost:1212/api/volume"
payload = {"level": 50}

response = requests.post(url, json=payload)
print(response.json())
```

**Example (JavaScript):**
```javascript
fetch('http://localhost:1212/api/volume', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ level: 50 })
})
.then(response => response.json())
.then(data => console.log(data));
```

**Validation:**
- Volume level must be a number
- Volume level must be between 0 and 100 (inclusive)

**Error Response (Invalid Volume):**
```json
{
  "success": false,
  "error": "Volume level must be a number between 0 and 100"
}
```

---

### Play Next

Plays the next video in the playlist on all connected dashboards.

**Endpoint:** `POST /api/next`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Play next command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/next
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/next")
print(response.json())
```

---

### Play Previous

Plays the previous video in the playlist on all connected dashboards.

**Endpoint:** `POST /api/previous`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Play previous command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/previous
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/previous")
print(response.json())
```

---

### Mute/Unmute

Toggles mute/unmute on all connected dashboards.

**Endpoint:** `POST /api/mute`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "success": true,
  "message": "Mute/unmute command sent to all dashboards",
  "clients": 2
}
```

**Example Request:**
```bash
curl -X POST http://localhost:1212/api/mute
```

**Example (Python):**
```python
import requests

response = requests.post("http://localhost:1212/api/mute")
print(response.json())
```

---

### Health Check

Checks server status and number of connected clients.

**Endpoint:** `GET /api/health`

**Request Headers:** None required

**Request Body:** None

**Success Response:**
```json
{
  "status": "ok",
  "connectedClients": 2
}
```

**Example Request:**
```bash
curl http://localhost:1212/api/health
```

**Example (Python):**
```python
import requests

response = requests.get("http://localhost:1212/api/health")
print(response.json())
```

---

## Response Format

All API responses are in JSON format.

### Success Response
```json
{
  "success": true,
  "message": "Description of the action",
  "clients": 2
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error description"
}
```

---

## Error Handling

### Common Error Codes

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 400 | Bad Request | Invalid URL format, missing required fields |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### Error Response Examples

**Invalid URL:**
```json
{
  "success": false,
  "error": "Invalid YouTube URL format"
}
```

**Missing URL:**
```json
{
  "success": false,
  "error": "URL is required"
}
```

**Rate Limited:**
```json
{
  "success": false,
  "error": "Too many video requests, please slow down"
}
```

---

## Code Examples

### Complete Python Example

```python
import requests
import time

class YouTubeDashboardAPI:
    def __init__(self, base_url="http://localhost:1212"):
        self.base_url = base_url

    def play_video(self, url):
        """Play a YouTube video on all dashboards"""
        response = requests.post(
            f"{self.base_url}/api/play",
            json={"url": url}
        )
        return response.json()

    def pause(self):
        """Pause the current video"""
        response = requests.post(f"{self.base_url}/api/pause")
        return response.json()

    def resume(self):
        """Resume the paused video"""
        response = requests.post(f"{self.base_url}/api/resume")
        return response.json()

    def stop(self):
        """Stop the video"""
        response = requests.post(f"{self.base_url}/api/stop")
        return response.json()

    def fullscreen(self):
        """Enter fullscreen mode"""
        response = requests.post(f"{self.base_url}/api/fullscreen")
        return response.json()

    def exit_fullscreen(self):
        """Exit fullscreen mode"""
        response = requests.post(f"{self.base_url}/api/exitfullscreen")
        return response.json()

    def set_volume(self, level):
        """Set volume level (0-100)"""
        response = requests.post(
            f"{self.base_url}/api/volume",
            json={"level": level}
        )
        return response.json()

    def play_next(self):
        """Play next video in playlist"""
        response = requests.post(f"{self.base_url}/api/next")
        return response.json()

    def play_previous(self):
        """Play previous video in playlist"""
        response = requests.post(f"{self.base_url}/api/previous")
        return response.json()

    def mute(self):
        """Toggle mute/unmute"""
        response = requests.post(f"{self.base_url}/api/mute")
        return response.json()

    def health_check(self):
        """Check server health and connected clients"""
        response = requests.get(f"{self.base_url}/api/health")
        return response.json()

# Usage example
if __name__ == "__main__":
    api = YouTubeDashboardAPI()

    # Check if server is running
    health = api.health_check()
    print(f"Server status: {health['status']}")
    print(f"Connected clients: {health['connectedClients']}")

    # Play a video
    result = api.play_video("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    print(f"Play result: {result}")

    # Wait 5 seconds
    time.sleep(5)

    # Pause the video
    result = api.pause()
    print(f"Pause result: {result}")

    # Wait 3 seconds
    time.sleep(3)

    # Resume the video
    result = api.resume()
    print(f"Resume result: {result}")
```

### Complete Node.js Example

```javascript
const axios = require('axios');

class YouTubeDashboardAPI {
    constructor(baseUrl = 'http://localhost:1212') {
        this.baseUrl = baseUrl;
    }

    async playVideo(url) {
        const response = await axios.post(`${this.baseUrl}/api/play`, { url });
        return response.data;
    }

    async pause() {
        const response = await axios.post(`${this.baseUrl}/api/pause`);
        return response.data;
    }

    async resume() {
        const response = await axios.post(`${this.baseUrl}/api/resume`);
        return response.data;
    }

    async stop() {
        const response = await axios.post(`${this.baseUrl}/api/stop`);
        return response.data;
    }

    async fullscreen() {
        const response = await axios.post(`${this.baseUrl}/api/fullscreen`);
        return response.data;
    }

    async exitFullscreen() {
        const response = await axios.post(`${this.baseUrl}/api/exitfullscreen`);
        return response.data;
    }

    async setVolume(level) {
        const response = await axios.post(`${this.baseUrl}/api/volume`, { level });
        return response.data;
    }

    async playNext() {
        const response = await axios.post(`${this.baseUrl}/api/next`);
        return response.data;
    }

    async playPrevious() {
        const response = await axios.post(`${this.baseUrl}/api/previous`);
        return response.data;
    }

    async mute() {
        const response = await axios.post(`${this.baseUrl}/api/mute`);
        return response.data;
    }

    async healthCheck() {
        const response = await axios.get(`${this.baseUrl}/api/health`);
        return response.data;
    }
}

// Usage example
(async () => {
    const api = new YouTubeDashboardAPI();

    try {
        // Check server health
        const health = await api.healthCheck();
        console.log(`Server status: ${health.status}`);
        console.log(`Connected clients: ${health.connectedClients}`);

        // Play a video
        const playResult = await api.playVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        console.log('Play result:', playResult);

        // Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Pause the video
        const pauseResult = await api.pause();
        console.log('Pause result:', pauseResult);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
})();
```

### Bash Script Example

```bash
#!/bin/bash

# Liveboard API Control Script
BASE_URL="http://localhost:1212"

# Function to play a video
play_video() {
    local url="$1"
    curl -X POST "$BASE_URL/api/play" \
        -H "Content-Type: application/json" \
        -d "{\"url\": \"$url\"}"
    echo ""
}

# Function to pause video
pause_video() {
    curl -X POST "$BASE_URL/api/pause"
    echo ""
}

# Function to resume video
resume_video() {
    curl -X POST "$BASE_URL/api/resume"
    echo ""
}

# Function to stop video
stop_video() {
    curl -X POST "$BASE_URL/api/stop"
    echo ""
}

# Function to enter fullscreen
enter_fullscreen() {
    curl -X POST "$BASE_URL/api/fullscreen"
    echo ""
}

# Function to exit fullscreen
exit_fullscreen() {
    curl -X POST "$BASE_URL/api/exitfullscreen"
    echo ""
}

# Function to set volume
set_volume() {
    local level="$1"
    curl -X POST "$BASE_URL/api/volume" \
        -H "Content-Type: application/json" \
        -d "{\"level\": $level}"
    echo ""
}

# Main script
echo "Playing video..."
play_video "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

sleep 5

echo "Pausing video..."
pause_video

sleep 3

echo "Resuming video..."
resume_video
```

---

## WebSocket Connection

For real-time updates and bidirectional communication, clients can connect via WebSocket using Socket.io.

**WebSocket URL:**
```
ws://localhost:1212
```

**Client-side Connection (JavaScript):**
```javascript
const socket = io('http://localhost:1212');

socket.on('connect', () => {
    console.log('Connected to dashboard');
});

socket.on('play-video', (data) => {
    console.log('Video URL received:', data.url);
});

socket.on('control-pause', () => {
    console.log('Pause command received');
});

socket.on('control-resume', () => {
    console.log('Resume command received');
});

socket.on('control-stop', () => {
    console.log('Stop command received');
});

socket.on('control-fullscreen', () => {
    console.log('Fullscreen command received');
});

socket.on('control-exitfullscreen', () => {
    console.log('Exit fullscreen command received');
});

socket.on('control-volume', (data) => {
    console.log('Volume control received:', data.level);
});

socket.on('control-next', () => {
    console.log('Play next command received');
});

socket.on('control-previous', () => {
    console.log('Play previous command received');
});

socket.on('control-mute', () => {
    console.log('Mute/unmute command received');
});
```

---

## Integration Examples

### Home Automation (Home Assistant)

```yaml
# configuration.yaml
rest_command:
  youtube_play:
    url: http://localhost:1212/api/play
    method: POST
    content_type: 'application/json'
    payload: '{"url": "{{ url }}"}'

  youtube_pause:
    url: http://localhost:1212/api/pause
    method: POST

  youtube_resume:
    url: http://localhost:1212/api/resume
    method: POST
```

### Webhook Integration

```python
from flask import Flask, request
import requests

app = Flask(__name__)
DASHBOARD_URL = "http://localhost:1212"

@app.route('/webhook/youtube', methods=['POST'])
def youtube_webhook():
    data = request.json
    action = data.get('action')

    if action == 'play':
        url = data.get('url')
        response = requests.post(
            f"{DASHBOARD_URL}/api/play",
            json={"url": url}
        )
    elif action == 'pause':
        response = requests.post(f"{DASHBOARD_URL}/api/pause")
    elif action == 'resume':
        response = requests.post(f"{DASHBOARD_URL}/api/resume")
    elif action == 'stop':
        response = requests.post(f"{DASHBOARD_URL}/api/stop")

    return response.json()

if __name__ == '__main__':
    app.run(port=5000)
```

---

## Support

For issues, questions, or feature requests, please visit:
- GitHub Repository: https://github.com/juha-rajamaki/dashboard

---

## Changelog

### Version 1.0.0
- Initial API release
- Play, pause, resume, stop, fullscreen controls
- WebSocket support
- Rate limiting
- Security headers and CORS restrictions
