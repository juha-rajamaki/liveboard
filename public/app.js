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
const fullscreenBtn = document.getElementById('fullscreenBtn');
const videoContainer = document.querySelector('.video-container');

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
            rel: 0,
            hd: 1  // Enable HD playback
        },
        events: {
            onReady: onPlayerReady,
            onError: onPlayerError,
            onStateChange: onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    console.log('YouTube player is ready');
}

function onPlayerStateChange(event) {
    // Set quality to highest available when video loads or plays
    if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING) {
        try {
            const availableQualityLevels = player.getAvailableQualityLevels();
            if (availableQualityLevels && availableQualityLevels.length > 0) {
                // Set to highest quality (first in array is highest)
                player.setPlaybackQuality(availableQualityLevels[0]);
                console.log('Set video quality to:', availableQualityLevels[0]);
            }
        } catch (e) {
            console.warn('Could not set quality:', e);
        }
    }
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

// Validate YouTube URL for security
function isValidYouTubeUrl(url) {
    if (typeof url !== 'string' || url.length > 500) {
        return false;
    }

    // Only allow YouTube URLs or valid video IDs
    const validPatterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}(&.*)?$/,
        /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]{11}$/,
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]{11}$/,
        /^[a-zA-Z0-9_-]{11}$/ // Direct video ID
    ];

    return validPatterns.some(pattern => pattern.test(url));
}

// Validate history item structure
function validateHistoryItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (!isValidYouTubeUrl(item.url)) return false;
    if (typeof item.timestamp !== 'string' || item.timestamp.length > 100) return false;
    if (item.videoId && typeof item.videoId !== 'string') return false;
    return true;
}

// Add video to history
function addToHistory(url) {
    // Validate URL before adding
    if (!isValidYouTubeUrl(url)) {
        console.warn('Invalid URL rejected from history:', url);
        return;
    }

    const videoId = extractVideoId(url);
    const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

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

// Save history to localStorage with quota management
function saveHistory() {
    try {
        const historyJson = JSON.stringify(videoHistory);

        // Check size (localStorage limit is typically 5-10MB)
        const sizeInBytes = new Blob([historyJson]).size;
        const maxSizeBytes = 500000; // 500KB limit for safety

        if (sizeInBytes > maxSizeBytes) {
            console.warn('History too large, trimming...');
            // Remove oldest entries until under limit
            while (videoHistory.length > 0 &&
                   new Blob([JSON.stringify(videoHistory)]).size > maxSizeBytes) {
                videoHistory.pop();
            }
        }

        localStorage.setItem('videoHistory', JSON.stringify(videoHistory));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('localStorage quota exceeded, clearing old history');
            // Keep only 10 most recent entries
            videoHistory = videoHistory.slice(0, 10);
            try {
                localStorage.setItem('videoHistory', JSON.stringify(videoHistory));
            } catch (e2) {
                console.error('Failed to save even trimmed history');
                localStorage.removeItem('videoHistory');
            }
        } else {
            console.error('Failed to save history:', e);
        }
    }
}

// Load history from localStorage with validation
function loadHistory() {
    try {
        const saved = localStorage.getItem('videoHistory');
        if (saved) {
            const parsed = JSON.parse(saved);

            // Validate it's an array
            if (!Array.isArray(parsed)) {
                console.warn('Invalid history format - resetting');
                localStorage.removeItem('videoHistory');
                return;
            }

            // Filter and validate each item
            videoHistory = parsed
                .filter(validateHistoryItem)
                .slice(0, MAX_HISTORY); // Enforce max length

            // If we filtered out items, update localStorage
            if (videoHistory.length !== parsed.length) {
                console.warn(`Removed ${parsed.length - videoHistory.length} invalid history items`);
                saveHistory();
            }

            renderHistory();
        }
    } catch (e) {
        console.error('Failed to load history:', e);
        // Clear corrupted data
        localStorage.removeItem('videoHistory');
        videoHistory = [];
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

    // Clear existing content
    historyList.innerHTML = '';

    videoHistory.forEach((item) => {
        // Create elements programmatically to prevent XSS
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        const historyInfo = document.createElement('div');
        historyInfo.className = 'history-info';

        const historyUrl = document.createElement('div');
        historyUrl.className = 'history-url';
        historyUrl.textContent = item.url; // Safe - no HTML parsing
        historyUrl.title = item.url;

        const historyTime = document.createElement('div');
        historyTime.className = 'history-time';
        historyTime.textContent = item.timestamp;

        historyInfo.appendChild(historyUrl);
        historyInfo.appendChild(historyTime);

        const replayBtn = document.createElement('button');
        replayBtn.className = 'replay-btn';
        replayBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
        `;
        // Use addEventListener instead of onclick attribute to prevent injection
        replayBtn.addEventListener('click', () => replayVideo(item.url));

        historyItem.appendChild(historyInfo);
        historyItem.appendChild(replayBtn);
        historyList.appendChild(historyItem);
    });
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

    // Load and play video with highest quality
    player.loadVideoById({
        videoId: videoId,
        suggestedQuality: 'highres'  // Request highest quality (4K/1440p/1080p)
    });

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

// Control event handlers from API
socket.on('control-pause', () => {
    console.log('Received pause command from API');
    if (player && isPlayerReady) {
        player.pauseVideo();
    }
});

socket.on('control-resume', () => {
    console.log('Received resume command from API');
    if (player && isPlayerReady) {
        player.playVideo();
    }
});

socket.on('control-stop', () => {
    console.log('Received stop command from API');
    if (player && isPlayerReady) {
        player.stopVideo();
        placeholder.classList.remove('hidden');
        currentUrlElement.textContent = 'No video loaded';
    }
});

socket.on('control-fullscreen', () => {
    console.log('Received fullscreen command from API');
    if (!videoContainer) return;

    if (!document.fullscreenElement) {
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    }
});

socket.on('control-exitfullscreen', () => {
    console.log('Received exit fullscreen command from API');

    if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
});

// Test form handler
testButton.addEventListener('click', async () => {
    const url = testUrl.value.trim();

    if (!url) {
        alert('Please enter a YouTube URL');
        return;
    }

    // Validate URL before sending
    if (!isValidYouTubeUrl(url)) {
        alert('Please enter a valid YouTube URL');
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
            alert('Error: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending video URL:', error);
        alert('Failed to send video URL. Please try again.');
    }
});

// Allow Enter key to submit
testUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        testButton.click();
    }
});

// Fullscreen functionality
function toggleFullscreen() {
    if (!videoContainer) return;

    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen();
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// Update fullscreen button text when fullscreen state changes
function updateFullscreenButton() {
    if (!fullscreenBtn) return;

    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;

    if (isFullscreen) {
        fullscreenBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
            </svg>
            Exit Fullscreen
        `;
    } else {
        fullscreenBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
            Fullscreen
        `;
    }
}

// Listen for fullscreen changes (including ESC key)
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('msfullscreenchange', updateFullscreenButton);

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

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
}

// Clear history button
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
}

// Initialize
loadYouTubeAPI();
loadHistory();
