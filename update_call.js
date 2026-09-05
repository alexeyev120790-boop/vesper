const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace createPeerConnection, handleCallAccepted, handleCallDeclined, handleCallSignal
// Since we use Jitsi, we don't need WebRTC P2P signaling anymore.

// We will do a robust regex replace for the WebRTC functions.
