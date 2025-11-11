// YouTube Player API
let player;
let isPlayerReady = false;
let qualitySetForCurrentVideo = false;
let autoplayUnlocked = false;

// Helper function for localStorage boolean values
function getLocalStorageBoolean(key, defaultValue = false) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    if (value !== 'true' && value !== 'false') {
        console.warn(`Invalid ${key} value in localStorage, resetting to ${defaultValue}`);
        localStorage.setItem(key, defaultValue.toString());
        return defaultValue;
    }
    return value === 'true';
}

// Get device name for identification
function getDeviceName() {
    // Try to get saved device name from localStorage
    let deviceName = localStorage.getItem('deviceName');

    if (!deviceName) {
        // Generate a device name based on browser and platform
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        let platform = 'Unknown';

        // Detect browser
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
        else if (ua.includes('Edg')) browser = 'Edge';

        // Detect platform
        if (ua.includes('Windows')) platform = 'Windows';
        else if (ua.includes('Mac')) platform = 'Mac';
        else if (ua.includes('Linux')) platform = 'Linux';
        else if (ua.includes('Android')) platform = 'Android';
        else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS';

        deviceName = `Dashboard (${browser} on ${platform})`;
        localStorage.setItem('deviceName', deviceName);
    }

    return deviceName;
}

// WebSocket connection
const socket = io();

// History management
let videoHistory = [];
const MAX_HISTORY = 50;

// Playlist management
let playlist = [];
let currentPlaylistIndex = -1;

// Connected clients tracking
let connectedClients = [];
let previousClientIds = [];

// DOM elements
const serverStatus = document.getElementById('serverStatus');
const apiStatus = document.getElementById('apiStatus');
const currentUrlElement = document.getElementById('currentUrl');
const placeholder = document.getElementById('placeholder');
const playerElement = document.getElementById('player');
const testUrl = document.getElementById('testUrl');
const testButton = document.getElementById('testButton');
const playNowButton = document.getElementById('playNowButton');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const playlistList = document.getElementById('playlistList');
const clearPlaylistBtn = document.getElementById('clearPlaylist');
const pauseBtn = document.getElementById('pauseBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const previousBtn = document.getElementById('previousBtn');
const nextBtn = document.getElementById('nextBtn');
const seekBackBtn = document.getElementById('seekBackBtn');
const seekForwardBtn = document.getElementById('seekForwardBtn');
const videoContainer = document.querySelector('.video-container');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const muteBtn = document.getElementById('muteBtn');

// Load YouTube IFrame API
function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Called automatically when YouTube API is ready
function onYouTubeIframeAPIReady() {
    // Load controls preference from localStorage (default: true)
    const showControls = localStorage.getItem('ytControlsEnabled') !== 'false';

    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            controls: showControls ? 1 : 0,
            modestbranding: 1,
            rel: 0
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

    // Set saved volume
    const savedVolume = parseInt(localStorage.getItem('volume') || '100', 10);
    player.setVolume(savedVolume);
    console.log('Set initial volume to:', savedVolume);

    // Update mute button icon
    updateMuteButton(savedVolume);

    // Attempt to unlock autoplay by muting and playing a silent video
    unlockAutoplay();
}

// Unlock autoplay by initiating a muted play (bypasses browser restrictions)
function unlockAutoplay() {
    if (autoplayUnlocked) return;

    try {
        // Don't try to play empty player - just mark as unlocked
        // Actual unlock happens when user clicks "Enable Playback" button
        autoplayUnlocked = false;
        console.log('Waiting for user to enable autoplay');
    } catch (e) {
        console.warn('Could not unlock autoplay automatically:', e);
    }
}

function onPlayerStateChange(event) {
    // Send status updates to server
    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('message', JSON.stringify({ type: 'status_update', status: 'playing' }));
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('message', JSON.stringify({ type: 'status_update', status: 'paused' }));
    } else if (event.data === YT.PlayerState.ENDED) {
        socket.emit('message', JSON.stringify({ type: 'status_update', status: 'stopped' }));
    }

    // Auto-play next video when current video ends
    if (event.data === YT.PlayerState.ENDED) {
        playNextInPlaylist();
    }

    // Set quality only once when video starts playing
    if (event.data === YT.PlayerState.PLAYING && !qualitySetForCurrentVideo) {
        try {
            // Validate player is ready
            if (!player || !isPlayerReady) {
                console.warn('Player not ready for quality adjustment');
                return;
            }

            const availableQualityLevels = player.getAvailableQualityLevels();

            if (!availableQualityLevels || availableQualityLevels.length === 0) {
                console.warn('No quality levels available for this video');
                qualitySetForCurrentVideo = true;
                return;
            }

            // Define quality priority (highest to lowest)
            const qualityPreference = [
                'highres',  // 4K/8K
                'hd2160',   // 4K
                'hd1440',   // 1440p
                'hd1080',   // 1080p
                'hd720',    // 720p
                'large',    // 480p
                'medium',   // 360p
                'small'     // 240p
            ];

            // Find highest available quality from our preference list
            let selectedQuality = availableQualityLevels[0]; // Fallback to first
            for (const quality of qualityPreference) {
                if (availableQualityLevels.includes(quality)) {
                    selectedQuality = quality;
                    break;
                }
            }

            player.setPlaybackQuality(selectedQuality);
            console.log('Set video quality to:', selectedQuality);
            qualitySetForCurrentVideo = true;

            // Update title in current video display and history after quality is set
            setTimeout(() => {
                const title = getVideoTitle();
                const currentUrl = player.getVideoUrl();

                if (title && currentUrlElement) {
                    currentUrlElement.setAttribute('data-url', currentUrl || currentUrlElement.textContent);
                    currentUrlElement.textContent = title;

                    // Send title update to server
                    socket.emit('message', JSON.stringify({ type: 'title_update', title: title }));
                }

                // Update the most recent history entry with the actual title
                if (title && currentUrl && videoHistory.length > 0) {
                    const videoId = extractVideoId(currentUrl);
                    if (videoId) {
                        // Find the most recent entry with this video ID
                        const historyEntry = videoHistory.find(item => item.videoId === videoId);
                        if (historyEntry && historyEntry.title === 'YouTube Video') {
                            historyEntry.title = title;
                            saveHistory();
                            renderHistory();
                            console.log('Updated history entry with title:', title);
                        }
                    }
                }
            }, 500);

        } catch (e) {
            console.warn('Could not set quality:', e);
            qualitySetForCurrentVideo = true; // Don't retry on error
        }
    } else if (event.data === YT.PlayerState.CUED || event.data === YT.PlayerState.UNSTARTED) {
        // Reset flag when a new video is loaded
        qualitySetForCurrentVideo = false;
    }
}

function onPlayerError(event) {
    console.error('YouTube player error:', event.data);

    // Map YouTube error codes to user-friendly messages
    let errorMessage = 'An unknown error occurred';
    switch (event.data) {
        case 2:
            errorMessage = 'Invalid video ID or URL';
            break;
        case 5:
            errorMessage = 'HTML5 player error';
            break;
        case 100:
            errorMessage = 'Video not found or is private';
            break;
        case 101:
        case 150:
            errorMessage = 'Video cannot be played (owner restrictions)';
            break;
    }

    showToast('Video Error', errorMessage, 'error', 5000);
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

// Get video title from player
function getVideoTitle() {
    try {
        if (player && isPlayerReady) {
            const videoData = player.getVideoData();
            return videoData && videoData.title ? videoData.title : null;
        }
    } catch (e) {
        console.warn('Could not get video title:', e);
    }
    return null;
}

// Add video to history
function addToHistory(url, title = null) {
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

    // Use provided title or try to get it from player
    const videoTitle = title || getVideoTitle() || 'YouTube Video';

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
        title: videoTitle,
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

        const titleRow = document.createElement('div');
        titleRow.className = 'history-title-row';

        const historyTitle = document.createElement('div');
        historyTitle.className = 'history-title';
        historyTitle.textContent = item.title || item.url; // Safe - no HTML parsing
        historyTitle.title = item.url;

        // Add link icon to view URL
        const urlIcon = document.createElement('button');
        urlIcon.className = 'url-icon';
        urlIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
        urlIcon.title = item.url;
        urlIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            // Copy URL to clipboard
            navigator.clipboard.writeText(item.url).then(() => {
                const originalTitle = urlIcon.title;
                urlIcon.title = 'Copied!';
                setTimeout(() => {
                    urlIcon.title = originalTitle;
                }, 2000);
            }).catch(() => {
                alert(item.url);
            });
        });

        titleRow.appendChild(historyTitle);
        titleRow.appendChild(urlIcon);

        const historyTime = document.createElement('div');
        historyTime.className = 'history-time';
        historyTime.textContent = item.timestamp;

        historyInfo.appendChild(titleRow);
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

// ========== PLAYLIST MANAGEMENT ==========

// Fetch video metadata from YouTube
async function fetchVideoMetadata(videoId) {
    try {
        // Use YouTube oEmbed API (no API key required)
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);

        if (!response.ok) {
            throw new Error('Failed to fetch video metadata');
        }

        const data = await response.json();

        return {
            title: data.title || 'YouTube Video',
            author: data.author_name || 'Unknown Channel',
            thumbnail: data.thumbnail_url || null
        };
    } catch (e) {
        console.warn('Could not fetch video metadata:', e);
        return {
            title: 'YouTube Video',
            author: 'Unknown Channel',
            thumbnail: null
        };
    }
}

// Add video to playlist
async function addToPlaylist(url, title = null, addToTop = false) {
    // Validate URL
    if (!isValidYouTubeUrl(url)) {
        console.warn('Invalid URL rejected from playlist:', url);
        return;
    }

    const videoId = extractVideoId(url);

    // Check if URL already exists in playlist
    const existingIndex = playlist.findIndex(item => item.url === url);

    if (existingIndex !== -1) {
        console.log('Video already in playlist');
        return existingIndex; // Return the existing index
    }

    // Fetch metadata if no title provided
    let metadata = {
        title: title || 'YouTube Video',
        author: 'Loading...',
        thumbnail: null
    };

    // Add to playlist immediately with loading state
    const playlistItem = {
        url,
        videoId,
        title: metadata.title,
        author: metadata.author,
        thumbnail: metadata.thumbnail,
        duration: null
    };

    if (addToTop) {
        // Add to the beginning of the playlist
        playlist.unshift(playlistItem);

        // Adjust current playlist index if needed
        if (currentPlaylistIndex >= 0) {
            currentPlaylistIndex++;
        }

        // The new item is now at index 0
    } else {
        // Add to the end of the playlist
        playlist.push(playlistItem);

        // If this is the first item in the playlist, select it by default
        if (playlist.length === 1 && currentPlaylistIndex === -1) {
            currentPlaylistIndex = 0;
        }
    }

    // Save to localStorage
    savePlaylist();

    // Update UI
    renderPlaylist();

    console.log('Added to playlist:', metadata.title, addToTop ? '(at top)' : '(at end)');

    // Fetch full metadata in background
    if (!title) {
        const fullMetadata = await fetchVideoMetadata(videoId);

        // Update the playlist item with fetched metadata
        const itemIndex = playlist.findIndex(item => item.videoId === videoId);
        if (itemIndex !== -1) {
            playlist[itemIndex].title = fullMetadata.title;
            playlist[itemIndex].author = fullMetadata.author;
            playlist[itemIndex].thumbnail = fullMetadata.thumbnail;

            // Save and re-render
            savePlaylist();
            renderPlaylist();

            console.log('Updated playlist item with metadata:', fullMetadata.title);
        }
    }

    // Return the index where the item was added
    return addToTop ? 0 : playlist.length - 1;
}

// Save playlist to localStorage
function savePlaylist() {
    try {
        localStorage.setItem('playlist', JSON.stringify(playlist));
    } catch (e) {
        console.error('Failed to save playlist:', e);
    }
}

// Load playlist from localStorage
function loadPlaylist() {
    try {
        const saved = localStorage.getItem('playlist');
        if (saved) {
            const parsed = JSON.parse(saved);

            if (Array.isArray(parsed)) {
                playlist = parsed.filter(validateHistoryItem);

                // If playlist has items and no index is set, select the first one
                if (playlist.length > 0 && currentPlaylistIndex === -1) {
                    currentPlaylistIndex = 0;
                }

                renderPlaylist();
            }
        }
    } catch (e) {
        console.error('Failed to load playlist:', e);
        localStorage.removeItem('playlist');
        playlist = [];
    }
}

// Clear playlist
function clearPlaylist() {
    if (confirm('Are you sure you want to clear the playlist?')) {
        playlist = [];
        currentPlaylistIndex = -1;
        savePlaylist();
        renderPlaylist();
    }
}

// Render playlist
function renderPlaylist() {
    if (!playlistList) return;

    if (playlist.length === 0) {
        playlistList.innerHTML = '<p class="no-playlist">No videos in playlist</p>';
        return;
    }

    // Clear existing content
    playlistList.innerHTML = '';

    playlist.forEach((item, index) => {
        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        if (index === currentPlaylistIndex) {
            playlistItem.classList.add('playing');
        }

        const itemNumber = document.createElement('div');
        itemNumber.className = 'playlist-item-number';
        itemNumber.textContent = (index + 1).toString();

        // Thumbnail (optional)
        if (item.thumbnail) {
            const itemThumbnail = document.createElement('img');
            itemThumbnail.className = 'playlist-item-thumbnail';
            itemThumbnail.src = item.thumbnail;
            itemThumbnail.alt = item.title;
            playlistItem.appendChild(itemThumbnail);
        }

        const itemInfo = document.createElement('div');
        itemInfo.className = 'playlist-item-info';

        const itemTitle = document.createElement('div');
        itemTitle.className = 'playlist-item-title';
        itemTitle.textContent = item.title;
        itemTitle.title = item.url;

        const itemMeta = document.createElement('div');
        itemMeta.className = 'playlist-item-meta';

        if (item.author) {
            const itemAuthor = document.createElement('span');
            itemAuthor.className = 'playlist-item-author';
            itemAuthor.textContent = item.author;
            itemMeta.appendChild(itemAuthor);
        }

        itemInfo.appendChild(itemTitle);
        itemInfo.appendChild(itemMeta);

        const itemActions = document.createElement('div');
        itemActions.className = 'playlist-item-actions';

        // Play button
        const playBtn = document.createElement('button');
        playBtn.className = 'playlist-item-btn';
        playBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        playBtn.title = 'Play';
        playBtn.addEventListener('click', () => playFromPlaylist(index));

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'playlist-item-btn remove';
        removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => removeFromPlaylist(index));

        itemActions.appendChild(playBtn);
        itemActions.appendChild(removeBtn);

        playlistItem.appendChild(itemNumber);
        playlistItem.appendChild(itemInfo);
        playlistItem.appendChild(itemActions);
        playlistList.appendChild(playlistItem);
    });
}

// Play video from playlist
function playFromPlaylist(index) {
    if (index < 0 || index >= playlist.length) return;

    currentPlaylistIndex = index;
    const item = playlist[index];
    playVideo(item.url, true);
    renderPlaylist();
}

// Remove video from playlist
function removeFromPlaylist(index) {
    if (index < 0 || index >= playlist.length) return;

    // If removing currently playing video, adjust index
    if (index === currentPlaylistIndex) {
        currentPlaylistIndex = -1;
    } else if (index < currentPlaylistIndex) {
        currentPlaylistIndex--;
    }

    playlist.splice(index, 1);
    savePlaylist();
    renderPlaylist();
}

// Play next video in playlist
function playNextInPlaylist() {
    if (playlist.length === 0) return;

    const nextIndex = (currentPlaylistIndex + 1) % playlist.length;
    playFromPlaylist(nextIndex);
}

// Play previous video in playlist
function playPreviousInPlaylist() {
    if (playlist.length === 0) return;

    // Handle wrapping around to the end of the playlist
    const previousIndex = currentPlaylistIndex - 1 < 0
        ? playlist.length - 1
        : currentPlaylistIndex - 1;
    playFromPlaylist(previousIndex);
}

// Play video
function playVideo(url, addToHistoryFlag = true) {
    const videoId = extractVideoId(url);

    if (!videoId) {
        console.error('Invalid YouTube URL:', url);
        showToast('Invalid URL', 'Please enter a valid YouTube URL', 'error', 4000);
        return;
    }

    if (!isPlayerReady) {
        console.log('Player not ready yet, waiting...');
        setTimeout(() => playVideo(url, addToHistoryFlag), 500);
        return;
    }

    // Hide placeholder to show player underneath
    placeholder.classList.add('hidden');

    // Load and play video at highest quality available
    player.loadVideoById({
        videoId: videoId,
        suggestedQuality: 'highres'
    });

    // Update current URL display
    currentUrlElement.textContent = url;
    currentUrlElement.setAttribute('data-url', url);

    // Show URL icon
    const currentUrlIcon = document.getElementById('currentUrlIcon');
    if (currentUrlIcon) {
        currentUrlIcon.style.display = 'inline-flex';
    }

    // Add to history
    if (addToHistoryFlag) {
        addToHistory(url);
    }

    console.log('Playing video:', videoId);
}

// WebSocket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    if (serverStatus) {
        serverStatus.classList.add('online');
        serverStatus.title = 'Server: Online';
    }

    // Show welcome message on connection
    showToast(
        'Connected to Liveboard',
        'You are now connected and ready to control playback',
        'success',
        4000
    );

    // Send device identification to server
    const deviceName = getDeviceName();
    socket.emit('message', JSON.stringify({
        type: 'identify',
        name: deviceName
    }));
    console.log('Identified as:', deviceName);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    if (serverStatus) {
        serverStatus.classList.remove('online');
        serverStatus.title = 'Server: Offline';
    }
});

// API client status handler
socket.on('api-client-status', (data) => {
    console.log('API client status:', data.active ? 'Connected' : 'Disconnected');
    if (apiStatus) {
        if (data.active) {
            apiStatus.classList.add('connected');
            apiStatus.title = 'API Client: Connected';
        } else {
            apiStatus.classList.remove('connected');
            apiStatus.title = 'API Client: Disconnected';
        }
    }
});

// Handle connected clients updates
socket.on('connected-clients', (data) => {
    console.log('Connected clients updated:', data.clients);
    if (serverStatus && data.clients) {
        const clientCount = data.clients.length;
        const clientNames = data.clients.map(c => c.name).join(', ');
        serverStatus.title = `Server: Online (${clientCount} device${clientCount !== 1 ? 's' : ''}: ${clientNames})`;

        // Update stored clients and IDs
        connectedClients = data.clients;
        previousClientIds = data.clients.map(c => c.id);

        // Update modal if it's open
        updateConnectedUsersModal();
    }
});

// Handle new client connection notification
socket.on('client-connected', (data) => {
    console.log('New client connected:', data);
    if (data.name && data.name !== 'Unknown Device') {
        showToast('New Connection', `${data.name} connected`, 'success', 4000);
    }
});

socket.on('play-video', (data) => {
    console.log('Received play-video event:', data);
    addToPlaylist(data.url);
});

// Play video now event - plays immediately (adds to top and plays)
socket.on('play-video-now', (data) => {
    console.log('Received play-video-now event:', data);
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
    console.log('Player state:', { player: !!player, isPlayerReady, hasGetPlayerState: !!(player && player.getPlayerState) });

    if (!player) {
        console.error('Player not initialized');
        return;
    }

    if (!isPlayerReady) {
        console.error('Player not ready yet');
        return;
    }

    try {
        const currentState = player.getPlayerState();
        console.log('Current player state:', currentState);

        // If no video is loaded (UNSTARTED or CUED) and we have a selected playlist item, play it
        if ((currentState === -1 || currentState === YT.PlayerState.UNSTARTED || currentState === YT.PlayerState.CUED)
            && currentPlaylistIndex >= 0 && currentPlaylistIndex < playlist.length) {
            console.log('No video loaded, playing selected playlist item at index:', currentPlaylistIndex);
            playFromPlaylist(currentPlaylistIndex);
        } else {
            // Otherwise just resume the current video
            player.playVideo();
            console.log('playVideo() called successfully');
        }
    } catch (error) {
        console.error('Error playing video:', error);
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

    // Use CSS-based "fake fullscreen" (workaround for browser security restrictions)
    if (videoContainer) {
        videoContainer.classList.add('fake-fullscreen');
        document.body.classList.add('fake-fullscreen-active');
        console.log('Entered fake fullscreen mode');
    }
});

socket.on('control-exitfullscreen', () => {
    console.log('Received exit fullscreen command from API');

    // Exit CSS-based fake fullscreen
    if (videoContainer) {
        videoContainer.classList.remove('fake-fullscreen');
        document.body.classList.remove('fake-fullscreen-active');
        console.log('Exited fake fullscreen mode');
    }
});

socket.on('control-volume', (data) => {
    console.log('Received volume command from API:', data.level);
    if (player && isPlayerReady) {
        player.setVolume(data.level);

        // Update UI
        if (volumeSlider) {
            volumeSlider.value = data.level;
        }
        if (volumeValue) {
            volumeValue.textContent = data.level;
        }

        // Update mute button icon
        updateMuteButton(data.level);
    }
});

// Listen for volume changes from other dashboards/clients
socket.on('state-volume-changed', (data) => {
    console.log('Volume changed by another client:', data.volume);
    if (player && isPlayerReady) {
        player.setVolume(data.volume);
    }

    // Update UI
    if (volumeSlider) {
        volumeSlider.value = data.volume;
    }
    if (volumeValue) {
        volumeValue.textContent = data.volume;
    }

    // Save to localStorage
    localStorage.setItem('volume', data.volume);

    // Update mute button icon
    updateMuteButton(data.volume);
});

socket.on('control-next', () => {
    console.log('Received next command from API');
    playNextInPlaylist();
});

socket.on('control-previous', () => {
    console.log('Received previous command from API');
    playPreviousInPlaylist();
});

socket.on('control-mute', () => {
    console.log('Received mute command from API');
    if (muteBtn) {
        muteBtn.click();
    }
});

socket.on('control-theater', () => {
    console.log('Received theater mode toggle command from API');
    const theaterModeBtn = document.getElementById('theaterModeBtn');
    if (theaterModeBtn) {
        theaterModeBtn.click();
    }
});

socket.on('control-seek-back', () => {
    console.log('Received seek backward command from API');
    if (seekBackBtn) {
        seekBackBtn.click();
    }
});

socket.on('control-seek-forward', () => {
    console.log('Received seek forward command from API');
    if (seekForwardBtn) {
        seekForwardBtn.click();
    }
});

// Play Now button handler - adds to top of playlist and plays immediately
if (playNowButton) {
    playNowButton.addEventListener('click', async () => {
        const url = testUrl.value.trim();

        if (!url) {
            showToast('Missing URL', 'Please enter a YouTube URL', 'warning', 3000);
            return;
        }

        // Validate URL
        if (!isValidYouTubeUrl(url)) {
            showToast('Invalid URL', 'Please enter a valid YouTube URL', 'error', 4000);
            return;
        }

        // Add to top of playlist
        const addedIndex = await addToPlaylist(url, null, true);
        testUrl.value = '';

        // Play the newly added video (it's at the top - index 0, or existing index if already in playlist)
        if (addedIndex !== undefined && addedIndex >= 0) {
            playFromPlaylist(addedIndex);
            console.log('Video added to top of playlist and playing now');
        }
    });
}

// Add to Playlist button handler - just adds to playlist
testButton.addEventListener('click', () => {
    const url = testUrl.value.trim();

    if (!url) {
        showToast('Missing URL', 'Please enter a YouTube URL', 'warning', 3000);
        return;
    }

    // Validate URL
    if (!isValidYouTubeUrl(url)) {
        showToast('Invalid URL', 'Please enter a valid YouTube URL', 'error', 4000);
        return;
    }

    // Add to playlist and start playing immediately
    playVideo(url);
    testUrl.value = '';
    console.log('Video added to playlist and playing');
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

    // Use CSS-based "fake fullscreen" (works without user gesture restrictions)
    const isFakeFullscreen = videoContainer.classList.contains('fake-fullscreen');

    if (!isFakeFullscreen) {
        // Enter fake fullscreen
        videoContainer.classList.add('fake-fullscreen');
        document.body.classList.add('fake-fullscreen-active');
        console.log('Entered fake fullscreen mode');
    } else {
        // Exit fake fullscreen
        videoContainer.classList.remove('fake-fullscreen');
        document.body.classList.remove('fake-fullscreen-active');
        console.log('Exited fake fullscreen mode');
    }

    // Update button text
    updateFullscreenButton();
}

// Update fullscreen button icon when fullscreen state changes
function updateFullscreenButton() {
    if (!fullscreenBtn) return;

    const isFullscreen = videoContainer && videoContainer.classList.contains('fake-fullscreen');

    if (isFullscreen) {
        fullscreenBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
            </svg>
        `;
        fullscreenBtn.title = 'Exit Fullscreen';
    } else {
        fullscreenBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
        `;
        fullscreenBtn.title = 'Fullscreen';
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
        console.log('Play button clicked');
        console.log('Player state:', { player: !!player, isPlayerReady });

        if (!player) {
            console.error('Player not initialized');
            return;
        }

        if (!isPlayerReady) {
            console.error('Player not ready yet');
            return;
        }

        try {
            const currentState = player.getPlayerState();
            console.log('Current player state:', currentState);
            player.playVideo();
            console.log('Video resumed');
        } catch (error) {
            console.error('Error playing video:', error);
        }
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        if (player && isPlayerReady) {
            player.stopVideo();
            placeholder.classList.remove('hidden');
            currentUrlElement.textContent = 'No video loaded';

            // Send status and title updates to server
            socket.emit('message', JSON.stringify({ type: 'status_update', status: 'stopped' }));
            socket.emit('message', JSON.stringify({ type: 'title_update', title: 'No video loaded' }));

            console.log('Video stopped');
        }
    });
}

if (previousBtn) {
    previousBtn.addEventListener('click', () => {
        playPreviousInPlaylist();
        console.log('Previous button clicked');
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        playNextInPlaylist();
        console.log('Next button clicked');
    });
}

// Seek backward 10 seconds
if (seekBackBtn) {
    seekBackBtn.addEventListener('click', () => {
        if (!player || !isPlayerReady) {
            console.log('Player not ready for seek');
            return;
        }
        const currentTime = player.getCurrentTime();
        const newTime = Math.max(0, currentTime - 10);
        player.seekTo(newTime, true);
        console.log(`Seeked backward to ${newTime.toFixed(2)}s`);
    });
}

// Seek forward 10 seconds
if (seekForwardBtn) {
    seekForwardBtn.addEventListener('click', () => {
        if (!player || !isPlayerReady) {
            console.log('Player not ready for seek');
            return;
        }
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        const newTime = Math.min(duration, currentTime + 10);
        player.seekTo(newTime, true);
        console.log(`Seeked forward to ${newTime.toFixed(2)}s`);
    });
}

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
}

// Theater mode button
const theaterModeBtn = document.getElementById('theaterModeBtn');
if (theaterModeBtn) {
    // Update button icon based on theater mode state
    function updateTheaterModeButton() {
        const isTheaterMode = document.body.classList.contains('theater-mode');
        const exitTheaterBtn = document.getElementById('exitTheaterBtn');

        if (isTheaterMode) {
            theaterModeBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect>
                </svg>
            `;
            theaterModeBtn.title = 'Exit Theater Mode';
            // Show the exit theater button when in theater mode
            if (exitTheaterBtn) {
                exitTheaterBtn.style.display = 'block';
            }
        } else {
            theaterModeBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect>
                </svg>
            `;
            theaterModeBtn.title = 'Theater Mode';
            // Hide the exit theater button when not in theater mode
            if (exitTheaterBtn) {
                exitTheaterBtn.style.display = 'none';
            }
        }
    }

    theaterModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('theater-mode');

        // Save state to localStorage
        const isTheaterMode = document.body.classList.contains('theater-mode');
        localStorage.setItem('theaterMode', isTheaterMode.toString());

        // Update ARIA attribute for accessibility
        theaterModeBtn.setAttribute('aria-pressed', isTheaterMode.toString());

        // Update button appearance
        updateTheaterModeButton();

        console.log('Theater mode:', isTheaterMode ? 'enabled' : 'disabled');
    });

    // Load saved theater mode state with validation
    const savedTheaterMode = getLocalStorageBoolean('theaterMode', false);
    if (savedTheaterMode) {
        document.body.classList.add('theater-mode');
        theaterModeBtn.setAttribute('aria-pressed', 'true');
        updateTheaterModeButton();
    }
}

// Exit Theater Mode button
const exitTheaterBtn = document.getElementById('exitTheaterBtn');
if (exitTheaterBtn) {
    exitTheaterBtn.addEventListener('click', () => {
        const theaterModeBtn = document.getElementById('theaterModeBtn');
        if (theaterModeBtn) {
            theaterModeBtn.click();
        }
    });
}

// Volume control handlers
if (volumeSlider) {
    // Load saved volume from localStorage (default: 100)
    const savedVolume = parseInt(localStorage.getItem('volume') || '100', 10);
    volumeSlider.value = savedVolume;
    if (volumeValue) {
        volumeValue.textContent = savedVolume;
    }

    // Set initial volume when player is ready
    if (player && isPlayerReady) {
        player.setVolume(savedVolume);
    }

    volumeSlider.addEventListener('input', () => {
        const volume = parseInt(volumeSlider.value, 10);

        if (player && isPlayerReady) {
            player.setVolume(volume);
        }

        if (volumeValue) {
            volumeValue.textContent = volume;
        }

        // Save to localStorage
        localStorage.setItem('volume', volume);

        // Update mute button icon
        updateMuteButton(volume);

        // Send volume update to server so control app can see current volume
        socket.emit('message', JSON.stringify({
            type: 'volume_update',
            value: volume
        }));

        console.log('Volume set to:', volume);
    });
}

if (muteBtn) {
    let previousVolume = 100;

    muteBtn.addEventListener('click', () => {
        if (!player || !isPlayerReady) return;

        const currentVolume = player.getVolume();

        if (currentVolume > 0) {
            // Mute
            previousVolume = currentVolume;
            player.setVolume(0);

            if (volumeSlider) {
                volumeSlider.value = 0;
            }
            if (volumeValue) {
                volumeValue.textContent = '0';
            }
            localStorage.setItem('volume', '0');
            updateMuteButton(0);
            console.log('Muted');
        } else {
            // Unmute
            const volumeToRestore = previousVolume || 100;
            player.setVolume(volumeToRestore);

            if (volumeSlider) {
                volumeSlider.value = volumeToRestore;
            }
            if (volumeValue) {
                volumeValue.textContent = volumeToRestore;
            }
            localStorage.setItem('volume', volumeToRestore);
            updateMuteButton(volumeToRestore);
            console.log('Unmuted to:', volumeToRestore);
        }
    });
}

// Update mute button icon based on volume level
function updateMuteButton(volume) {
    if (!muteBtn) return;

    if (volume === 0) {
        // Muted icon
        muteBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
        `;
        muteBtn.title = 'Unmute';
    } else if (volume < 50) {
        // Low volume icon
        muteBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
        `;
        muteBtn.title = 'Mute';
    } else {
        // High volume icon
        muteBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
        `;
        muteBtn.title = 'Mute';
    }
}

// Clear history button
if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
}

// Clear playlist button
if (clearPlaylistBtn) {
    clearPlaylistBtn.addEventListener('click', clearPlaylist);
}

// Current URL icon button
const currentUrlIcon = document.getElementById('currentUrlIcon');
if (currentUrlIcon) {
    currentUrlIcon.addEventListener('click', () => {
        const url = currentUrlElement.getAttribute('data-url') || currentUrlElement.textContent;
        if (url && url !== 'No video loaded') {
            navigator.clipboard.writeText(url).then(() => {
                const originalTitle = currentUrlIcon.title;
                currentUrlIcon.title = 'Copied!';
                setTimeout(() => {
                    currentUrlIcon.title = originalTitle;
                }, 2000);
            }).catch(() => {
                alert(url);
            });
        }
    });
}

// Toggle panel visibility
function setupToggleButtons() {
    const toggleCurrentVideo = document.getElementById('toggleCurrentVideo');
    const toggleHistory = document.getElementById('toggleHistory');
    const togglePlaylist = document.getElementById('togglePlaylist');
    const currentVideoContent = document.getElementById('currentVideoContent');
    const historyList = document.getElementById('historyList');
    const playlistList = document.getElementById('playlistList');

    if (!toggleCurrentVideo || !toggleHistory || !togglePlaylist) return;

    // Load saved states from localStorage
    const currentVideoCollapsed = localStorage.getItem('currentVideoCollapsed') === 'true';
    const historyCollapsed = localStorage.getItem('historyCollapsed') === 'true';
    const playlistCollapsed = localStorage.getItem('playlistCollapsed') === 'true';

    if (currentVideoCollapsed) {
        currentVideoContent.classList.add('collapsed');
        toggleCurrentVideo.classList.add('collapsed');
    }

    if (historyCollapsed) {
        historyList.classList.add('collapsed');
        toggleHistory.classList.add('collapsed');
    }

    if (playlistCollapsed) {
        playlistList.classList.add('collapsed');
        togglePlaylist.classList.add('collapsed');
    }

    // Toggle current video section
    toggleCurrentVideo.addEventListener('click', () => {
        currentVideoContent.classList.toggle('collapsed');
        toggleCurrentVideo.classList.toggle('collapsed');
        localStorage.setItem('currentVideoCollapsed', currentVideoContent.classList.contains('collapsed'));
    });

    // Toggle history section
    toggleHistory.addEventListener('click', () => {
        historyList.classList.toggle('collapsed');
        toggleHistory.classList.toggle('collapsed');
        localStorage.setItem('historyCollapsed', historyList.classList.contains('collapsed'));
    });

    // Toggle playlist section
    togglePlaylist.addEventListener('click', () => {
        playlistList.classList.toggle('collapsed');
        togglePlaylist.classList.toggle('collapsed');
        localStorage.setItem('playlistCollapsed', playlistList.classList.contains('collapsed'));
    });
}

// Toast notification system
function showToast(title, message, type = 'success', duration = 5000) {
    const toastContainer = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Choose icon based on type
    let icon = '';
    if (type === 'success') {
        icon = '✓';
    } else if (type === 'error') {
        icon = '✕';
    } else if (type === 'warning') {
        icon = '⚠';
    } else {
        icon = 'ℹ';
    }

    // Create elements programmatically to prevent XSS
    const iconDiv = document.createElement('div');
    iconDiv.className = 'toast-icon';
    iconDiv.textContent = icon;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'toast-title';
    titleDiv.textContent = title; // Safe - no HTML parsing

    const messageDiv = document.createElement('div');
    messageDiv.className = 'toast-message';
    messageDiv.textContent = message; // Safe - no HTML parsing

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(messageDiv);
    toast.appendChild(iconDiv);
    toast.appendChild(contentDiv);
    toast.appendChild(closeBtn);

    toastContainer.appendChild(toast);

    // Close button functionality
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
}

function removeToast(toast) {
    toast.classList.add('hiding');
    setTimeout(() => {
        toast.remove();
    }, 300); // Match animation duration
}

// Listen for authentication events
socket.on('auth-attempt', (data) => {
    if (data.success) {
        showToast(
            'Device Connected',
            `${data.deviceName} authenticated successfully`,
            'success'
        );
    } else {
        showToast(
            'Authentication Failed',
            `${data.reason} from ${data.ip}`,
            'error'
        );
    }
});

// Info panel toggle functionality (also toggles history and playlist)
function setupSidebarToggle() {
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const infoPanel = document.querySelector('.info-panel');
    const bottomPanels = document.querySelector('.bottom-panels');

    if (!toggleSidebarBtn || !infoPanel || !bottomPanels) return;

    // Load saved state from localStorage (default: hidden)
    const savedState = localStorage.getItem('infoPanelHidden');
    const infoPanelHidden = savedState === null ? true : savedState === 'true';

    if (infoPanelHidden) {
        infoPanel.style.display = 'none';
        bottomPanels.style.display = 'none';
        toggleSidebarBtn.classList.add('active');
    }

    // Toggle info panel, history, and playlist visibility
    toggleSidebarBtn.addEventListener('click', () => {
        const isHidden = infoPanel.style.display === 'none';
        infoPanel.style.display = isHidden ? 'block' : 'none';
        bottomPanels.style.display = isHidden ? 'grid' : 'none';
        toggleSidebarBtn.classList.toggle('active');
        localStorage.setItem('infoPanelHidden', !isHidden);
    });
}

// YouTube controls toggle functionality
function setupYTControlsToggle() {
    const toggleYTControlsBtn = document.getElementById('toggleYTControls');

    if (!toggleYTControlsBtn) return;

    // Load saved state from localStorage (default: true/enabled)
    const controlsEnabled = localStorage.getItem('ytControlsEnabled') !== 'false';

    // Update button state
    if (controlsEnabled) {
        toggleYTControlsBtn.classList.add('active');
    } else {
        toggleYTControlsBtn.classList.remove('active');
    }

    // Toggle YouTube controls
    toggleYTControlsBtn.addEventListener('click', () => {
        if (!player || !isPlayerReady) {
            console.warn('Player not ready yet');
            return;
        }

        // Get current video state
        const currentVideoUrl = player.getVideoUrl();
        const currentTime = player.getCurrentTime();
        const playerState = player.getPlayerState();

        // Toggle controls setting
        const currentSetting = localStorage.getItem('ytControlsEnabled') !== 'false';
        const newSetting = !currentSetting;
        localStorage.setItem('ytControlsEnabled', newSetting);

        // Update button state
        toggleYTControlsBtn.classList.toggle('active');

        // Destroy and recreate player with new controls setting
        player.destroy();
        isPlayerReady = false;

        // Recreate player
        player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            playerVars: {
                autoplay: 0,
                controls: newSetting ? 1 : 0,
                modestbranding: 1,
                rel: 0,
                start: Math.floor(currentTime)
            },
            events: {
                onReady: (event) => {
                    isPlayerReady = true;
                    console.log('YouTube player recreated with controls:', newSetting);

                    // Extract video ID from URL
                    if (currentVideoUrl) {
                        const videoId = extractVideoId(currentVideoUrl);
                        if (videoId) {
                            // Load video at the saved time with highest quality
                            player.loadVideoById({
                                videoId: videoId,
                                startSeconds: currentTime,
                                suggestedQuality: 'highres'
                            });

                            // Resume playback if it was playing
                            if (playerState === YT.PlayerState.PLAYING) {
                                setTimeout(() => {
                                    player.playVideo();
                                }, 500);
                            }
                        }
                    }
                },
                onError: onPlayerError,
                onStateChange: onPlayerStateChange
            }
        });

        console.log('YouTube controls toggled to:', newSetting);
    });
}

// Show autoplay enable overlay on first visit
function checkAutoplayStatus() {
    const autoplayEnabled = localStorage.getItem('autoplayEnabled');
    const overlay = document.getElementById('autoplayOverlay');
    const enableBtn = document.getElementById('enableAutoplayBtn');

    if (!autoplayEnabled && overlay && enableBtn) {
        // Show overlay after a short delay to ensure page is loaded
        setTimeout(() => {
            overlay.style.display = 'flex';
        }, 500);

        enableBtn.addEventListener('click', () => {
            // Enable autoplay by user interaction
            // Just mark as unlocked - no need to play empty player
            autoplayUnlocked = true;
            console.log('Autoplay enabled by user');

            // Save preference and hide overlay
            localStorage.setItem('autoplayEnabled', 'true');
            overlay.style.display = 'none';
        });
    } else {
        // Autoplay was previously enabled
        autoplayUnlocked = true;
    }
}

// Connected Users Modal
const connectedUsersModal = document.getElementById('connectedUsersModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const connectedUsersList = document.getElementById('connectedUsersList');

// Show connected users modal
function showConnectedUsersModal() {
    if (connectedUsersModal) {
        connectedUsersModal.style.display = 'flex';
        updateConnectedUsersModal();
    }
}

// Hide connected users modal
function hideConnectedUsersModal() {
    if (connectedUsersModal) {
        connectedUsersModal.style.display = 'none';
    }
}

// Update connected users modal content
function updateConnectedUsersModal() {
    if (!connectedUsersList || !connectedUsersModal || connectedUsersModal.style.display === 'none') {
        return;
    }

    if (connectedClients.length === 0) {
        connectedUsersList.innerHTML = '<p class="no-users-message">No users currently connected</p>';
        return;
    }

    connectedUsersList.innerHTML = '';

    connectedClients.forEach(client => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';

        // Get initials for icon
        const initials = client.name
            .split(' ')
            .map(word => word.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');

        // Format connection time
        const connectedAt = new Date(client.connectedAt);
        const now = new Date();
        const diffMinutes = Math.floor((now - connectedAt) / 60000);

        let timeText;
        if (diffMinutes < 1) {
            timeText = 'Just now';
        } else if (diffMinutes < 60) {
            timeText = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
        } else {
            const diffHours = Math.floor(diffMinutes / 60);
            timeText = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        }

        userItem.innerHTML = `
            <div class="user-icon">${initials}</div>
            <div class="user-info">
                <div class="user-name">${client.name}</div>
                <div class="user-connection-time">Connected ${timeText}</div>
            </div>
            <div class="user-status">
                <span class="status-dot"></span>
                Online
            </div>
        `;

        connectedUsersList.appendChild(userItem);
    });
}

// API status icon click handler
if (apiStatus) {
    apiStatus.style.cursor = 'pointer';
    apiStatus.addEventListener('click', () => {
        showConnectedUsersModal();
    });
}

// Close modal button
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        hideConnectedUsersModal();
    });
}

// Close modal when clicking outside
if (connectedUsersModal) {
    connectedUsersModal.addEventListener('click', (e) => {
        if (e.target === connectedUsersModal) {
            hideConnectedUsersModal();
        }
    });
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && connectedUsersModal && connectedUsersModal.style.display === 'flex') {
        hideConnectedUsersModal();
    }
});

// Initialize
loadYouTubeAPI();
loadHistory();
loadPlaylist();
setupToggleButtons();
setupSidebarToggle();
setupYTControlsToggle();
checkAutoplayStatus();
