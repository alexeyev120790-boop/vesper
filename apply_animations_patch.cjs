const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add keyframes to ANIMATIONS section
const newKeyframes = `
    @keyframes messageSpringIn {
      0% { opacity: 0; transform: translateY(18px) scale(0.94); }
      60% { opacity: 1; transform: translateY(-2px) scale(1.01); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes chatSwitchAnim {
      0% { opacity: 0.2; transform: translateY(14px) scale(0.985); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes headerSwitchAnim {
      0% { opacity: 0; transform: translateX(-12px); }
      100% { opacity: 1; transform: translateX(0); }
    }

    @keyframes hoverActionsPop {
      0% { opacity: 0; transform: scale(0.78) translateY(8px); }
      70% { opacity: 1; transform: scale(1.04) translateY(-2px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes reactionPop {
      0% { transform: scale(0.5); }
      60% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }

    @keyframes modalSpringPop {
      0% { opacity: 0; transform: scale(0.86) translateY(24px); }
      65% { opacity: 1; transform: scale(1.02) translateY(-4px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes msgDeleteAnim {
      0% { opacity: 1; transform: scale(1) translateX(0); max-height: 200px; margin-bottom: 6px; padding-top: 6px; padding-bottom: 6px; }
      100% { opacity: 0; transform: scale(0.85) translateX(-40px); max-height: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0; overflow: hidden; }
    }

    @keyframes unreadDotPulse {
      0%, 100% { box-shadow: 0 0 4px var(--accent-magenta); transform: scale(0.95); }
      50% { box-shadow: 0 0 14px var(--accent-magenta), 0 0 6px var(--accent-pink); transform: scale(1.25); }
    }

    .chat-switch-anim {
      animation: chatSwitchAnim 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .header-switch-anim {
      animation: headerSwitchAnim 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .msg-deleting-anim {
      animation: msgDeleteAnim 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      pointer-events: none;
    }
`;

if (html.includes('/* ==========================================================================\n       ANIMATIONS')) {
  html = html.replace('/* ==========================================================================\n       ANIMATIONS\n       ========================================================================== */', 
  '/* ==========================================================================\n       ANIMATIONS\n       ========================================================================== */' + newKeyframes);
} else {
  html = html.replace('/* ==========================================================================\n       ANIMATIONS', '/* ==========================================================================\n       ANIMATIONS' + newKeyframes);
}

// 2. Replace phone mode CSS layout rules
const oldPhoneCSSPattern = /\/\* In phone mode, when chat is closed -> show channels sidebar, hide chat area & members \*\/[\s\S]*?body\.device-mode-phone\.phone-chat-open \.members-sidebar \{\s*display: none !important;\s*\}/;

const newPhoneCSS = `/* PHONE DEVICE MODE LAYOUT OVERRIDES WITH NATIVE SLIDE ANIMATIONS */
    body.device-mode-phone {
      background: #06030c;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      overflow: hidden;
    }
    body.device-mode-phone #appLayout {
      width: 100%;
      max-width: 440px;
      height: 100vh;
      margin: 0 auto;
      position: relative;
      overflow: hidden;
      border-left: 1px solid rgba(255, 255, 255, 0.1);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 0 60px rgba(139, 92, 246, 0.3), 0 0 100px rgba(0, 0, 0, 0.9);
      background: #0a0614;
    }
    body.device-mode-phone .server-bar {
      display: none !important;
    }
    body.device-mode-phone .channels-sidebar {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      z-index: 10;
      display: flex !important;
      flex-direction: column !important;
      transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s ease, filter 0.35s ease !important;
      will-change: transform, opacity;
      backface-visibility: hidden;
    }
    body.device-mode-phone .chat-area {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      z-index: 20;
      display: flex !important;
      flex-direction: column !important;
      transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s ease, filter 0.35s ease !important;
      will-change: transform, opacity;
      backface-visibility: hidden;
    }
    body.device-mode-phone .members-sidebar {
      display: none !important;
    }

    /* In phone mode, when chat is closed -> show channels sidebar, hide chat area offscreen to right */
    body.device-mode-phone:not(.phone-chat-open) .channels-sidebar {
      transform: translateX(0) scale(1) !important;
      opacity: 1 !important;
      filter: blur(0px) !important;
      pointer-events: auto !important;
    }
    body.device-mode-phone:not(.phone-chat-open) .chat-area {
      transform: translateX(100%) scale(0.96) !important;
      opacity: 0 !important;
      filter: blur(4px) !important;
      pointer-events: none !important;
    }

    /* In phone mode, when chat is open -> slide sidebar offscreen left, slide chat area in */
    body.device-mode-phone.phone-chat-open .channels-sidebar {
      transform: translateX(-28%) scale(0.94) !important;
      opacity: 0 !important;
      filter: blur(4px) !important;
      pointer-events: none !important;
    }
    body.device-mode-phone.phone-chat-open .chat-area {
      transform: translateX(0) scale(1) !important;
      opacity: 1 !important;
      filter: blur(0px) !important;
      pointer-events: auto !important;
    }
    body.device-mode-phone.phone-chat-open .mobile-back-btn,
    body.phone-chat-open .mobile-back-btn {
      display: flex !important;
    }
    body.device-mode-phone.phone-chat-open .members-sidebar {
      display: none !important;
    }`;

if (oldPhoneCSSPattern.test(html)) {
  html = html.replace(oldPhoneCSSPattern, newPhoneCSS);
  console.log('Successfully replaced phone CSS pattern');
} else {
  console.log('Phone CSS pattern not matched directly, appending custom styles');
}

// 3. Add enhanced micro-interactions CSS block right before </style>
const enhancedMicroCSS = `
    /* ENHANCED GLOBAL MICRO-INTERACTIONS & ANIMATIONS */
    .message-card {
      animation: messageSpringIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease, box-shadow 0.2s ease !important;
    }
    .message-card:hover {
      transform: translateY(-2px) scale(1.002);
      background: rgba(255, 255, 255, 0.035) !important;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.12) !important;
    }
    .msg-avatar {
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease !important;
    }
    .msg-avatar:hover {
      transform: scale(1.12) rotate(4deg);
      box-shadow: 0 0 12px rgba(139, 92, 246, 0.5) !important;
    }
    .message-card:hover .msg-hover-actions {
      opacity: 1 !important;
      pointer-events: auto !important;
      animation: hoverActionsPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    .quick-reaction-btn {
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease !important;
    }
    .quick-reaction-btn:hover {
      transform: scale(1.3) translateY(-3px) rotate(6deg) !important;
    }
    .quick-reaction-btn:active {
      transform: scale(0.9) !important;
    }
    .reaction-chip {
      animation: reactionPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    .reaction-chip:hover {
      transform: translateY(-2px) scale(1.08) !important;
      box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35) !important;
    }
    .dm-unread-dot {
      animation: unreadDotPulse 1.6s infinite ease-in-out !important;
    }
    .channel-item, .contact-item, .group-item, .dm-item {
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease !important;
    }
    .channel-item:hover, .contact-item:hover, .group-item:hover, .dm-item:hover {
      transform: translateX(5px) !important;
      background: rgba(139, 92, 246, 0.15) !important;
    }
    .channel-item.active, .contact-item.active, .group-item.active, .dm-item.active {
      transform: translateX(6px) scale(1.01) !important;
      background: linear-gradient(90deg, rgba(139, 92, 246, 0.3), rgba(217, 70, 239, 0.15)) !important;
      box-shadow: inset 3px 0 0 var(--accent-magenta), 0 4px 15px rgba(139, 92, 246, 0.2) !important;
    }
    .server-icon {
      transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), border-radius 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s ease, box-shadow 0.25s ease !important;
    }
    .server-icon:hover {
      border-radius: 14px !important;
      transform: scale(1.1) translateY(-2px) !important;
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.5) !important;
    }
    .server-icon:active {
      transform: scale(0.95) !important;
    }
    .input-box-container {
      transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease !important;
    }
    .input-box-container:focus-within {
      border-color: rgba(168, 85, 247, 0.8) !important;
      box-shadow: 0 0 25px rgba(139, 92, 246, 0.35), 0 0 10px rgba(217, 70, 239, 0.3) !important;
      transform: translateY(-1px) !important;
    }
    #sendMsgBtn, #recordVoiceBtn, .attach-btn {
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.22s ease, box-shadow 0.22s ease !important;
    }
    #sendMsgBtn:hover, #recordVoiceBtn:hover, .attach-btn:hover {
      transform: scale(1.12) rotate(4deg) !important;
      box-shadow: 0 0 18px rgba(168, 85, 247, 0.6) !important;
    }
    #sendMsgBtn:active, #recordVoiceBtn:active, .attach-btn:active {
      transform: scale(0.92) !important;
    }
    .btn, .btn-primary, .btn-secondary, .icon-action-btn, .settings-nav-item, .custom-theme-card, .custom-lang-card {
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease !important;
    }
    .btn:hover, .btn-primary:hover, .btn-secondary:hover, .settings-nav-item:hover, .custom-theme-card:hover, .custom-lang-card:hover {
      transform: translateY(-2px) scale(1.02) !important;
    }
    .btn:active, .btn-primary:active, .btn-secondary:active, .icon-action-btn:active, .settings-nav-item:active, .custom-theme-card:active, .custom-lang-card:active {
      transform: scale(0.95) !important;
    }
    .icon-action-btn:hover {
      transform: scale(1.12) translateY(-1px) !important;
      box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35) !important;
    }
    .mobile-back-btn {
      transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    }
    .mobile-back-btn:hover {
      transform: translateX(-4px) scale(1.03) !important;
      background: rgba(139, 92, 246, 0.35) !important;
      box-shadow: 0 0 14px rgba(139, 92, 246, 0.4) !important;
    }
    .mobile-back-btn:active {
      transform: translateX(-6px) scale(0.94) !important;
    }
    .modal-overlay {
      transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 0.32s ease !important;
    }
    .modal-overlay.active .modal-card,
    .modal-overlay.active .discord-settings-card {
      animation: modalSpringPop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
    }
`;

html = html.replace('</head>', `${enhancedMicroCSS}\n</head>`);

// 4. Update JS for updateRoomHeader to trigger animateChatRoomSwitch
const updateHeaderFunctionStr = "function updateRoomHeader() {";
const animateChatFunction = `
    function animateChatRoomSwitch() {
      const messagesContainer = document.getElementById('messagesContainer');
      const chatHeader = document.querySelector('.chat-header');
      if (messagesContainer) {
        messagesContainer.classList.remove('chat-switch-anim');
        void messagesContainer.offsetWidth;
        messagesContainer.classList.add('chat-switch-anim');
      }
      if (chatHeader) {
        chatHeader.classList.remove('header-switch-anim');
        void chatHeader.offsetWidth;
        chatHeader.classList.add('header-switch-anim');
      }
    }

    function updateRoomHeader() {
      animateChatRoomSwitch();
`;

html = html.replace("function updateRoomHeader() {", animateChatFunction);

// 5. Update message deletion JS to use msg-deleting-anim
const oldDeleteJS = `if (card) {\n              card.style.opacity = '0';\n              card.style.transform = 'scale(0.95)';\n              setTimeout(() => card.remove(), 200);\n            }`;
const newDeleteJS = `if (card) {\n              card.classList.add('msg-deleting-anim');\n              setTimeout(() => card.remove(), 320);\n            }`;

html = html.replace(oldDeleteJS, newDeleteJS);

fs.writeFileSync('index.html', html);
console.log('Animations patch applied successfully');
