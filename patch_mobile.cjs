const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const mobileCSS = `
    /* MOBILE OPTIMIZATIONS */
    @media (max-width: 768px) {
      .app-layout {
        flex-direction: column !important;
      }
      .sidebar, .channels-sidebar, .members-sidebar {
        width: 100% !important;
        position: fixed !important;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 1000;
        transform: translateX(-100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex !important;
      }
      .sidebar.mobile-open, .channels-sidebar.mobile-open, .members-sidebar.mobile-open {
        transform: translateX(0);
      }
      .server-bar {
        display: none !important; /* Hide server bar on mobile unless needed */
      }
      .chat-area {
        width: 100% !important;
      }
      .chat-header {
        padding: 0 10px !important;
        height: 60px !important;
      }
      .chat-header-actions {
        gap: 6px !important;
      }
      .icon-action-btn {
        width: 32px !important;
        height: 32px !important;
        font-size: 16px !important;
      }
      .user-profile-bar {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 1001 !important;
        background: var(--bg-card) !important;
        padding: 8px 12px !important;
        border-top: 1px solid rgba(255,255,255,0.08) !important;
      }
      .chat-window {
        margin-bottom: 70px !important;
      }
      .chat-input-bar {
        padding: 8px 10px !important;
      }
      .input-box-container {
        border-radius: 20px !important;
      }
      .chat-input {
        min-height: 40px !important;
      }
      
      /* Make sure modals fit the screen */
      .modal-card {
        width: 95% !important;
        max-height: 90vh !important;
        padding: 16px !important;
        overflow-y: auto !important;
      }
      
      .story-circle {
        width: 50px !important;
        height: 50px !important;
      }
      
      .discord-settings-card {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        border-radius: 0 !important;
        flex-direction: column !important;
      }
      .settings-sidebar-nav {
        width: 100% !important;
        border-right: none !important;
        border-bottom: 1px solid rgba(255,255,255,0.08) !important;
        flex-direction: row !important;
        overflow-x: auto !important;
        padding: 10px !important;
      }
      .settings-sidebar-nav .settings-nav-item {
        white-space: nowrap !important;
      }
      
      /* Mobile top bar for toggling menus */
      .mobile-top-bar {
        display: flex !important;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: var(--bg-card);
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .mobile-menu-btn {
        background: none;
        border: none;
        color: var(--text-main);
        font-size: 24px;
        cursor: pointer;
      }
    }
    
    @media (min-width: 769px) {
      .mobile-top-bar {
        display: none !important;
      }
      .mobile-close-sidebar-btn {
        display: none !important;
      }
    }
`;

content = content.replace('</style>', mobileCSS + '\n  </style>');

// Add a mobile header block right inside the appContainer
const mobileHeaderStr = `
  <!-- MOBILE TOP BAR -->
  <div class="mobile-top-bar">
    <button class="mobile-menu-btn" onclick="document.querySelector('.channels-sidebar').classList.add('mobile-open')">☰</button>
    <div style="font-weight: 800; color: var(--text-main); font-size: 18px;">VesperChat</div>
    <button class="mobile-menu-btn" onclick="document.querySelector('.members-sidebar').classList.add('mobile-open')">👥</button>
  </div>
`;

content = content.replace('<div class="app-layout">', mobileHeaderStr + '\n    <div class="app-layout">');

// Add close buttons inside channels-sidebar and members-sidebar
content = content.replace('<div class="server-header">', '<div class="server-header">\n        <button class="mobile-close-sidebar-btn" onclick="document.querySelector(\'.channels-sidebar\').classList.remove(\'mobile-open\')" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;margin-right:10px;">✕</button>');

content = content.replace('<div class="members-sidebar-header">', '<div class="members-sidebar-header">\n        <button class="mobile-close-sidebar-btn" onclick="document.querySelector(\'.members-sidebar\').classList.remove(\'mobile-open\')" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;margin-right:10px;">✕</button>');

fs.writeFileSync('index.html', content);
