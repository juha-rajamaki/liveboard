// YouTube Player API
let player;
let isPlayerReady = false;

// WebSocket connection
const socket = io();

// History management
let videoHistory = [];
const MAX_HISTORY = 50;

// DOM elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const currentUrlElement = document.getElementById('currentUrl');
const placeholder = document.getElementById('placeholder');
const playerElement = document.getElementById('player');
const testUrl = document.getElementById('testUrl');
const testButton = document.getElementById('testButton');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const pauseBtn = document.getElementById('pauseBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');

// Load YouTube IFrame API
function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Called automatically when YouTube API is ready
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0
        },
        events: {
            onReady: onPlayerReady,
            onError: onPlayerError
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    console.log('YouTube player is ready');
}

function onPlayerError(event) {
    console.error('YouTube player error:', event.data);
    alert('Error loading video. Please check the URL.');
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// Add video to history
function addToHistory(url) {
    const videoId = extractVideoId(url);
    const timestamp = new Date().toLocaleString();

    // Check if URL already exists in history
    const existingIndex = videoHistory.findIndex(item => item.url === url);

    if (existingIndex !== -1) {
        // Remove existing entry
        videoHistory.splice(existingIndex, 1);
    }

    // Add to beginning of history
    videoHistory.unshift({
        url,
        videoId,
        timestamp
    });

    // Limit history size
    if (videoHistory.length > MAX_HISTORY) {
        videoHistory = videoHistory.slice(0, MAX_HISTORY);
    }

    // Save to localStorage
    saveHistory();

    // Update UI
    renderHistory();
}

// Save history to localStorage
function saveHistory() {
    try {
        localStorage.setItem('videoHistory', JSON.stringify(videoHistory));
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

// Load history from localStorage
function loadHistory() {
    try {
        const saved = localStorage.getItem('videoHistory');
        if (saved) {
            videoHistory = JSON.parse(saved);
            renderHistory();
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

// Clear history
function clearHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
        videoHistory = [];
        saveHistory();
        renderHistory();
    }
}

// Render history list
function renderHistory() {
    if (!historyList) return;

    if (videoHistory.length === 0) {
        historyList.innerHTML = '<p class="no-history">No videos played yet</p>';
        return;
    }

    historyList.innerHTML = videoHistory.map((item, index) => `
        <div class="history-item">
            <div class="history-info">
                <div class="history-url" title="${item.url}">${item.url}</div>
                <div class="history-time">${item.timestamp}</div>
            </div>
            <button class="replay-btn" onclick="replayVideo('${item.url.replace(/'/g, "\\'")}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Play
            </button>
        </div>
    `).join('');
}

// Replay video from history
function replayVideo(url) {
    playVideo(url);
}

// Play video
function playVideo(url, addToHistoryFlag = true) {
    const videoId = extractVideoId(url);

    if (!videoId) {
        console.error('Invalid YouTube URL:', url);
        alert('Invalid YouTube URL');
        return;
    }

    if (!isPlayerReady) {
        console.log('Player not ready yet, waiting...');
        setTimeout(() => playVideo(url, addToHistoryFlag), 500);
        return;
    }

    // Hide placeholder to show player underneath
    placeholder.classList.add('hidden');

    // Load and play video
    player.loadVideoById(videoId);

    // Update current URL display
    currentUrlElement.textContent = url;

    // Add to history
    if (addToHistoryFlag) {
        addToHistory(url);
    }

    console.log('Playing video:', videoId);
}

// WebSocket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    statusIndicator.classList.add('connected');
    statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    statusIndicator.classList.remove('connected');
    statusText.textContent = 'Disconnected';
});

socket.on('play-video', (data) => {
    console.log('Received play-video event:', data);
    playVideo(data.url);
});

// Test form handler
testButton.addEventListener('click', async () => {
    const url = testUrl.value.trim();

    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    try {
        const response = await fetch('/api/play', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        const result = await response.json();

        if (result.success) {
            console.log('Video URL sent successfully');
            testUrl.value = '';
        } else {
            alert('Error: ' + result.error);
        }
    } catch (error) {
        console.error('Error sending video URL:', error);
        alert('Error sending video URL');
    }
});

// Allow Enter key to submit
testUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        testButton.click();
    }
});

// Video control buttons
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.pauseVideo();
            console.log('Video paused');
        }
    });
}

if (playBtn) {
    playBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.playVideo();
            console.log('Video resumed');
        }
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.stopVideo();
            placeholder.classList.remove('hidden');
            currentUrlElement.textContent = 'No video loaded';
            console.log('Video stopped');
        }
    });
}

// Clear history button
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
}

// Initialize
loadYouTubeAPI();
loadHistory();
