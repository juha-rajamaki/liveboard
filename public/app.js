// YouTube Player API
let player;
let isPlayerReady = false;

// WebSocket connection
const socket = io();

// DOM elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const currentUrlElement = document.getElementById('currentUrl');
const placeholder = document.getElementById('placeholder');
const playerElement = document.getElementById('player');
const testUrl = document.getElementById('testUrl');
const testButton = document.getElementById('testButton');

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

// Play video
function playVideo(url) {
    const videoId = extractVideoId(url);

    if (!videoId) {
        console.error('Invalid YouTube URL:', url);
        alert('Invalid YouTube URL');
        return;
    }

    if (!isPlayerReady) {
        console.log('Player not ready yet, waiting...');
        setTimeout(() => playVideo(url), 500);
        return;
    }

    // Hide placeholder to show player underneath
    placeholder.classList.add('hidden');

    // Load and play video
    player.loadVideoById(videoId);

    // Update current URL display
    currentUrlElement.textContent = url;

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

// Initialize
loadYouTubeAPI();
