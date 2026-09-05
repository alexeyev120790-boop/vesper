
    // ==========================================================================
    // STATE & VARIABLES
    // ==========================================================================
    const avatarColors = [
      '#8b5cf6', '#a855f7', '#ec4899', '#3b82f6', '#10b981',
      '#f59e0b', '#ef4444', '#06b6d4', '#6366f1', '#d946ef'
    ];

    const state = {
      authMode: 'login', // 'login' or 'register'
      username: '',
      color: '#8b5cf6',
      avatarUrl: '',
      bio: '',
      statusText: '',
      currentRoom: 'Разговоры',
      activeDMRecipient: '',
      rooms: ['Разговоры', 'Поиск пати', 'Программирование', 'Музыка', 'Игры'],
      onlineUsers: [],
      allRegisteredUsers: [], // [{ username, color, isOnline }]
      pendingFile: null, // { name, size, type, data }
      ws: null,
      reconnectAttempts: 0,
      userIsScrolledUp: false,
      typingTimer: null,
      typingMap: new Map(), // username -> timeoutId
      unreadDMs: new Set(), // set of room names e.g. "DM:alice_bob"
      unreadRooms: new Set(), // set of public room names
      dmContacts: [], // list of added direct message contacts
      lastAuthPassword: '',
      groups: [], // list of group objects [{ name, isOwner, isAdmin, membersCount }]
      currentGroupInfo: null, // { name, owner, admins, members, isGroup }
      isGroup: false,
      mediaRecorder: null,
      audioChunks: [],
      voiceTimerInterval: null,
      voiceStartTime: 0,
      isVip: false,
      blockedUsers: [],
      story: null,
      activeStoryAuthor: null
    };

    const roomIcons = {
      'Разговоры': '💬',
      'Поиск пати': '🎮',
      'Программирование': '💻',
      'Музыка': '🎵',
      'Игры': '🎯'
    };

    // DOM Elements
    const loginScreen = document.getElementById('loginScreen');
    const authErrorBanner = document.getElementById('authErrorBanner');
    const authErrorMessage = document.getElementById('authErrorMessage');

    const authViewChoice = document.getElementById('authViewChoice');
    const authViewLogin = document.getElementById('authViewLogin');
    const authViewRegStep1 = document.getElementById('authViewRegStep1');
    const authViewRegStep2 = document.getElementById('authViewRegStep2');

    const btnChoiceLogin = document.getElementById('btnChoiceLogin');
    const btnChoiceRegister = document.getElementById('btnChoiceRegister');
    const btnBackToChoiceFromLogin = document.getElementById('btnBackToChoiceFromLogin');
    const btnBackToChoiceFromReg = document.getElementById('btnBackToChoiceFromReg');
    const btnBackToRegStep1 = document.getElementById('btnBackToRegStep1');

    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const authSubmitBtn = document.getElementById('authSubmitBtn');

    const regInviteCodeInput = document.getElementById('regInviteCodeInput');
    const regNameInput = document.getElementById('regNameInput');
    const regEmailInput = document.getElementById('regEmailInput');
    const regEmailErrorText = document.getElementById('regEmailErrorText');
    const btnRegNext = document.getElementById('btnRegNext');

    const sentEmailDisplay = document.getElementById('sentEmailDisplay');
    const codeCountdownDisplay = document.getElementById('codeCountdownDisplay');
    const verificationCodeInput = document.getElementById('verificationCodeInput');
    const regPasswordInput = document.getElementById('regPasswordInput');
    const btnCompleteReg = document.getElementById('btnCompleteReg');
    const btnResendCode = document.getElementById('btnResendCode');

    const appLayout = document.getElementById('appLayout');
    const userSearchInput = document.getElementById('userSearchInput');
    const roomsList = document.getElementById('roomsList');
    const directMessagesList = document.getElementById('directMessagesList');
    const messagesContainer = document.getElementById('messagesContainer');
    const scrollDownBadge = document.getElementById('scrollDownBadge');
    const typingIndicatorBar = document.getElementById('typingIndicatorBar');
    const typingText = document.getElementById('typingText');

    const chatInput = document.getElementById('chatInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const attachFileBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');

    const attachmentPreviewBar = document.getElementById('attachmentPreviewBar');
    const previewMediaContainer = document.getElementById('previewMediaContainer');
    const previewFileName = document.getElementById('previewFileName');
    const previewFileSize = document.getElementById('previewFileSize');
    const cancelAttachmentBtn = document.getElementById('cancelAttachmentBtn');

    const currentRoomTitle = document.getElementById('currentRoomTitle');
    const currentRoomTopic = document.getElementById('currentRoomTopic');
    const onlineBadge = document.getElementById('onlineBadge');
    const membersList = document.getElementById('membersList');

    const myAvatar = document.getElementById('myAvatar');
    const myUsername = document.getElementById('myUsername');
    const logoutBtn = document.getElementById('logoutBtn');

    const addByUsernameInput = document.getElementById('addByUsernameInput');
    const addByUsernameBtn = document.getElementById('addByUsernameBtn');
    const createRoomMembersList = document.getElementById('createRoomMembersList');

    const lightboxModal = document.getElementById('lightboxModal');
    const lightboxImg = document.getElementById('lightboxImg');
    const closeLightboxBtn = document.getElementById('closeLightboxBtn');

    const groupsList = document.getElementById('groupsList');
    const openGroupSettingsBtn = document.getElementById('openGroupSettingsBtn');
    const groupSettingsModal = document.getElementById('groupSettingsModal');
    const closeGroupSettingsModalBtn = document.getElementById('closeGroupSettingsModalBtn');
    const editGroupNameInput = document.getElementById('editGroupNameInput');
    const saveGroupNameBtn = document.getElementById('saveGroupNameBtn');
    const groupMembersManagerList = document.getElementById('groupMembersManagerList');
    const groupAddMemberSelect = document.getElementById('groupAddMemberSelect');
    const groupAddMemberBtn = document.getElementById('groupAddMemberBtn');

    const voiceRecordBtn = document.getElementById('voiceRecordBtn');
    const voiceRecordingBar = document.getElementById('voiceRecordingBar');
    const voiceRecordingTimer = document.getElementById('voiceRecordingTimer');
    const cancelVoiceRecordBtn = document.getElementById('cancelVoiceRecordBtn');
    const sendVoiceRecordBtn = document.getElementById('sendVoiceRecordBtn');

    // ==========================================================================
    // AUTH VIEWS NAVIGATION & VALIDATION
    // ==========================================================================
    function showAuthView(viewName = 'choice') {
      hideAuthError();
      if (viewName === 'login') state.authMode = 'login';
      else if (viewName === 'regStep1' || viewName === 'regStep2') state.authMode = 'register';
      else state.authMode = 'login';
      if (authViewChoice) authViewChoice.style.display = viewName === 'choice' ? 'block' : 'none';
      if (authViewLogin) authViewLogin.style.display = viewName === 'login' ? 'block' : 'none';
      if (authViewRegStep1) authViewRegStep1.style.display = viewName === 'regStep1' ? 'block' : 'none';
      if (authViewRegStep2) authViewRegStep2.style.display = viewName === 'regStep2' ? 'block' : 'none';
    }

    showAuthView('choice');

    if (btnChoiceLogin) btnChoiceLogin.addEventListener('click', () => showAuthView('login'));
    if (btnChoiceRegister) btnChoiceRegister.addEventListener('click', () => showAuthView('regStep1'));
    if (btnBackToChoiceFromLogin) btnBackToChoiceFromLogin.addEventListener('click', () => showAuthView('choice'));
    if (btnBackToChoiceFromReg) btnBackToChoiceFromReg.addEventListener('click', () => showAuthView('choice'));
    if (btnBackToRegStep1) btnBackToRegStep1.addEventListener('click', () => showAuthView('regStep1'));

    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener('click', () => {
        const isPass = passwordInput.type === 'password';
        passwordInput.type = isPass ? 'text' : 'password';
      });
    }

    function showAuthError(msg) {
      if (authErrorMessage) authErrorMessage.textContent = msg;
      if (authErrorBanner) authErrorBanner.style.display = 'flex';
    }

    function hideAuthError() {
      if (authErrorBanner) authErrorBanner.style.display = 'none';
    }

    if (authSubmitBtn) authSubmitBtn.addEventListener('click', handleAuthSubmit);
    [usernameInput, passwordInput].forEach(el => {
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleAuthSubmit();
        });
      }
    });

    // Email live validation on registration Step 1
    function validateRegStep1Inputs() {
      hideAuthError();
      const email = regEmailInput ? regEmailInput.value.trim() : '';
      const name = regNameInput ? regNameInput.value.trim() : '';

      if (email.length > 0) {
        const hasAt = email.includes('@');
        const hasDot = email.includes('.');

        if (!hasAt || !hasDot) {
          if (regEmailErrorText) regEmailErrorText.style.display = 'block';
          if (regEmailInput) regEmailInput.style.borderColor = '#ef4444';
          if (btnRegNext) {
            btnRegNext.disabled = true;
            btnRegNext.style.opacity = '0.5';
            btnRegNext.style.cursor = 'not-allowed';
          }
        } else {
          if (regEmailErrorText) regEmailErrorText.style.display = 'none';
          if (regEmailInput) regEmailInput.style.borderColor = 'rgba(139, 92, 246, 0.5)';
          if (name.length >= 1) {
            if (btnRegNext) {
              btnRegNext.disabled = false;
              btnRegNext.style.opacity = '1';
              btnRegNext.style.cursor = 'pointer';
            }
          } else {
            if (btnRegNext) {
              btnRegNext.disabled = true;
              btnRegNext.style.opacity = '0.5';
              btnRegNext.style.cursor = 'not-allowed';
            }
          }
        }
      } else {
        if (regEmailErrorText) regEmailErrorText.style.display = 'none';
        if (regEmailInput) regEmailInput.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        if (btnRegNext) {
          btnRegNext.disabled = true;
          btnRegNext.style.opacity = '0.5';
          btnRegNext.style.cursor = 'not-allowed';
        }
      }
    }

    if (regEmailInput) regEmailInput.addEventListener('input', validateRegStep1Inputs);
    if (regNameInput) regNameInput.addEventListener('input', validateRegStep1Inputs);

    // Request 6-digit verification code
    let regTimerInterval = null;

    async function handleRegNextStep() {
      hideAuthError();
      const email = regEmailInput.value.trim();
      const name = regNameInput.value.trim();
      const inviteCode = regInviteCodeInput ? regInviteCodeInput.value.trim() : '';

      if (!email.includes('@') || !email.includes('.')) {
        if (regEmailErrorText) regEmailErrorText.style.display = 'block';
        return;
      }

      if (!name) {
        showAuthError('Укажите ваше имя!');
        return;
      }

      if (btnRegNext) {
        btnRegNext.disabled = true;
        const btnSpan = btnRegNext.querySelector('span');
        if (btnSpan) btnSpan.textContent = 'Отправка кода...';
      }

      try {
        const res = await fetch('/api/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name, inviteCode })
        });
        const data = await res.json();

        if (btnRegNext) {
          btnRegNext.disabled = false;
          const btnSpan = btnRegNext.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Дальше';
        }

        if (!data.success) {
          showAuthError(data.error || 'Ошибка при отправке кода');
          return;
        }

        state.pendingRegEmail = email;
        state.pendingRegName = name;
        state.pendingRegInvite = inviteCode;

        if (sentEmailDisplay) sentEmailDisplay.textContent = email;
        showAuthView('regStep2');
        start5MinCountdown();
      } catch (err) {
        if (btnRegNext) {
          btnRegNext.disabled = false;
          const btnSpan = btnRegNext.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Дальше';
        }
        showAuthError('Сетевая ошибка при запросе кода');
      }
    }

    if (btnRegNext) btnRegNext.addEventListener('click', handleRegNextStep);
    if (btnResendCode) btnResendCode.addEventListener('click', handleRegNextStep);

    // 5-minute countdown timer
    function start5MinCountdown() {
      if (regTimerInterval) clearInterval(regTimerInterval);
      const expiresAt = Date.now() + 5 * 60 * 1000;

      function updateTimer() {
        const remaining = Math.max(0, expiresAt - Date.now());
        const totalSec = Math.floor(remaining / 1000);
        const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
        const secs = String(totalSec % 60).padStart(2, '0');

        if (codeCountdownDisplay) codeCountdownDisplay.textContent = `${mins}:${secs}`;
        if (remaining <= 0) {
          clearInterval(regTimerInterval);
          if (codeCountdownDisplay) {
            codeCountdownDisplay.textContent = '00:00 (Код истек)';
            codeCountdownDisplay.style.color = '#ef4444';
          }
          showAuthError('Срок действия кода истек (5 минут). Нажмите "Отправить код повторно".');
        } else if (codeCountdownDisplay) {
          codeCountdownDisplay.style.color = '#38bdf8';
        }
      }

      updateTimer();
      regTimerInterval = setInterval(updateTimer, 1000);
    }

    // Complete registration with 6-digit code and password
    async function handleCompleteRegistration() {
      hideAuthError();
      const code = verificationCodeInput ? verificationCodeInput.value.trim() : '';
      const password = regPasswordInput ? regPasswordInput.value.trim() : '';

      if (!code || code.length !== 6) {
        showAuthError('Введите 6-значный код из письма!');
        return;
      }

      if (!password || password.length < 3) {
        showAuthError('Придумайте пароль (не менее 3 символов)!');
        return;
      }

      if (btnCompleteReg) {
        btnCompleteReg.disabled = true;
        const btnSpan = btnCompleteReg.querySelector('span');
        if (btnSpan) btnSpan.textContent = 'Регистрация...';
      }

      try {
        const res = await fetch('/api/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: state.pendingRegEmail || (regEmailInput ? regEmailInput.value.trim() : ''),
            code,
            password
          })
        });
        const data = await res.json();

        if (btnCompleteReg) {
          btnCompleteReg.disabled = false;
          const btnSpan = btnCompleteReg.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Завершить регистрацию';
        }

        if (!data.success) {
          showAuthError(data.error || 'Ошибка верификации кода');
          return;
        }

        if (regTimerInterval) clearInterval(regTimerInterval);
        const authData = JSON.stringify({ username: data.username, password: data.password });
        sessionStorage.setItem('cyberchord_auth', authData);
        localStorage.setItem('cyberchord_auth', authData);

        state.authMode = 'login';
        state.lastAuthPassword = data.password;
        if (usernameInput) usernameInput.value = data.username;
        if (passwordInput) passwordInput.value = data.password;

        // Route through PIN Creation mode for new user
        showPinScreenForRegistration(data.username, data.password);
      } catch (err) {
        if (btnCompleteReg) {
          btnCompleteReg.disabled = false;
          const btnSpan = btnCompleteReg.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Завершить регистрацию';
        }
        showAuthError('Ошибка подключения к серверу');
      }
    }

    if (btnCompleteReg) btnCompleteReg.addEventListener('click', handleCompleteRegistration);

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('cyberchord_auth');
        localStorage.removeItem('cyberchord_auth');
        location.reload();
      });
    }

    function handleAuthSubmit() {
      hideAuthError();
      const user = usernameInput ? usernameInput.value.trim() : '';
      const pass = passwordInput ? passwordInput.value.trim() : '';

      if (!user || !pass) {
        showAuthError('Заполните логин/email и пароль!');
        return;
      }

      state.lastAuthPassword = pass;
      const authData = JSON.stringify({ username: user, password: pass });
      sessionStorage.setItem('cyberchord_auth', authData);
      localStorage.setItem('cyberchord_auth', authData);

      const userPin = localStorage.getItem('cyberchord_pin_' + user) || localStorage.getItem('cyberchord_pin_code');
      const isPinEnabled = localStorage.getItem('cyberchord_pin_enabled_' + user) !== 'false' && localStorage.getItem('cyberchord_pin_enabled') !== 'false';

      if (userPin && isPinEnabled) {
        showPinScreenForLogin(user, pass, userPin);
      } else {
        connectWebSocketAndAuth(user, pass);
      }
    }

    // Auto load session on DOMReady
    window.addEventListener('DOMContentLoaded', () => {
      const savedRoom = localStorage.getItem('cyberchord_room');
      if (savedRoom) {
        state.currentRoom = savedRoom;
      }
      const saved = sessionStorage.getItem('cyberchord_auth') || localStorage.getItem('cyberchord_auth');
      if (saved) {
        try {
          const { username, password } = JSON.parse(saved);
          if (username && password) {
            usernameInput.value = username;
            passwordInput.value = password;
            state.lastAuthPassword = password;
            state.authMode = 'login';

            const userPin = localStorage.getItem('cyberchord_pin_' + username) || localStorage.getItem('cyberchord_pin_code');
            const isPinEnabled = localStorage.getItem('cyberchord_pin_enabled_' + username) !== 'false' && localStorage.getItem('cyberchord_pin_enabled') !== 'false';

            if (userPin && isPinEnabled) {
              showPinScreenForLogin(username, password, userPin);
            } else {
              connectWebSocketAndAuth(username, password);
            }
          }
        } catch (e) {
          sessionStorage.removeItem('cyberchord_auth');
          localStorage.removeItem('cyberchord_auth');
        }
      }
    });

    // ==========================================================================
    // WEBSOCKET & API PROTOCOL RESOLVER (SUPPORT FOR STANDALONE EXE/FILE://)
    // ==========================================================================
    const DEFAULT_REMOTE_SERVER = "https://ais-dev-qlpdofbuctuxkj4rb7scoc-339218718444.us-east5.run.app";

    function getApiUrl(endpoint) {
      if (window.location.protocol === 'file:' || !window.location.host) {
        return `${DEFAULT_REMOTE_SERVER}${endpoint}`;
      }
      return endpoint;
    }

    function getWsUrl() {
      if (window.location.protocol === 'file:' || !window.location.host) {
        const wsProto = DEFAULT_REMOTE_SERVER.startsWith('https:') ? 'wss:' : 'ws:';
        const hostOnly = DEFAULT_REMOTE_SERVER.replace(/^https?:\/\//, '');
        return `${wsProto}//${hostOnly}/ws`;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }

    // ==========================================================================
    // WEBSOCKET LOGIC
    // ==========================================================================
    function connectWebSocketAndAuth(user, pass) {
      const wsUrl = getWsUrl();

      if (state.ws) {
        state.ws.close();
      }

      state.ws = new WebSocket(wsUrl);

      state.ws.onopen = () => {
        state.reconnectAttempts = 0;
        const reqRoom = localStorage.getItem('cyberchord_room') || state.currentRoom || 'Разговоры';
        const payload = {
          type: state.authMode,
          username: user,
          password: pass,
          room: reqRoom
        };
        sendPayload(payload);
      };

      state.ws.onmessage = (event) => {
        const lines = event.data.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            handleIncomingMessage(data);
          } catch (err) {
            console.error('JSON error:', err);
          }
        }
      };

      state.ws.onclose = () => {
        state.reconnectAttempts++;
        if (state.username) {
          const delay = Math.min(5000, 1000 * state.reconnectAttempts);
          setTimeout(() => connectWebSocketAndAuth(user, pass), delay);
        }
      };

      state.ws.onerror = (err) => {
        console.warn('WS connection event:', err);
      };
    }

    function sendPayload(payload) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(payload));
      }
    }

    // ==========================================================================
    // INCOMING MESSAGE HANDLER
    // ==========================================================================
    function handleIncomingMessage(msg) {
      switch (msg.type) {
        case 'auth_success':
        case 'init':
          state.username = msg.username || state.username;
          if (myUsername && msg.username) myUsername.textContent = msg.username;
          if (myAvatar && myAvatar.firstChild && msg.username) myAvatar.firstChild.textContent = msg.username.charAt(0).toUpperCase();

          if (msg.username && (state.lastAuthPassword || passwordInput.value.trim())) {
            const authData = JSON.stringify({
              username: msg.username,
              password: state.lastAuthPassword || passwordInput.value.trim()
            });
            sessionStorage.setItem('cyberchord_auth', authData);
            localStorage.setItem('cyberchord_auth', authData);
          }

          if (loginScreen) {
            loginScreen.classList.add('hidden');
            loginScreen.style.display = 'none';
          }
          if (appLayout) {
            appLayout.classList.add('visible');
            appLayout.style.display = 'flex';
          }

          if (msg.dmContacts) {
            state.dmContacts = msg.dmContacts;
          }

          if (msg.room) {
            if (msg.type === 'init' && state.currentRoom && msg.room !== state.currentRoom) {
              // Ignore stale init/room_switched payload for a room we already switched away from
              break;
            }
            state.currentRoom = msg.room;
            localStorage.setItem('cyberchord_room', msg.room);
            state.unreadRooms.delete(msg.room);
            state.unreadDMs.delete(msg.room);

            if (msg.room.startsWith('DM:')) {
              const parts = msg.room.substring(3).split('_');
              const other = parts.find(p => p.toLowerCase() !== state.username.toLowerCase());
              if (other) {
                state.activeDMRecipient = other;
                if (!state.dmContacts.map(c => c.toLowerCase()).includes(other.toLowerCase())) {
                  state.dmContacts.push(other);
                }
              }
            } else {
              state.activeDMRecipient = '';
            }
            updateRoomHeader();
          }

          renderDirectMessagesList();
          if (msg.rooms) {
            state.rooms = msg.rooms;
            renderRooms();
          }
          if (msg.groups) {
            state.groups = msg.groups;
            renderGroupsList();
          }
          if (msg.groupInfo) {
            state.currentGroupInfo = msg.groupInfo;
          } else if (msg.room && !msg.room.startsWith('DM:') && !state.rooms.includes(msg.room)) {
            // Might not be a group or groupInfo will come
          } else {
            state.currentGroupInfo = null;
          }
          if (msg.onlineUsers) {
            state.onlineUsers = msg.onlineUsers;
            renderMembers();
          }
          if (msg.usersList) {
            state.allRegisteredUsers = msg.usersList;
            renderDirectMessagesList();
          }
          if (msg.color) {
            state.color = msg.color;
            if (myAvatar) myAvatar.style.background = `linear-gradient(135deg, ${msg.color}, #d946ef)`;
          }
          if (msg.bio !== undefined) state.bio = msg.bio;
          if (msg.statusText !== undefined) state.statusText = msg.statusText;
          if (msg.avatarUrl !== undefined) {
            state.avatarUrl = msg.avatarUrl;
            if (myAvatar) {
              if (msg.avatarUrl) {
                myAvatar.innerHTML = `<img src="${msg.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" /><div class="status-dot"></div>`;
              } else {
                myAvatar.innerHTML = `${state.username.charAt(0).toUpperCase()}<div class="status-dot"></div>`;
              }
            }
          }
          if (msg.isVip !== undefined) state.isVip = Boolean(msg.isVip);
          if (msg.blockedUsers) state.blockedUsers = msg.blockedUsers;
          if (msg.story !== undefined) state.story = msg.story;
          if (msg.privacySearch) {
             const ps = document.getElementById('privacySearchSelect');
             if (ps) ps.value = msg.privacySearch;
          }
          if (msg.privacyCall) {
             const pc = document.getElementById('privacyCallSelect');
             if (pc) pc.value = msg.privacyCall;
          }

          if (typeof updateVipUI === 'function') updateVipUI();

          messagesContainer.innerHTML = '';
          if (msg.history && msg.history.length > 0) {
            msg.history.forEach(renderSingleMessage);
          } else {
            renderWelcomeMessage();
          }
          scrollToBottom(true);
          break;

        case 'profile_updated':
          if (msg.color) state.color = msg.color;
          if (msg.avatarUrl !== undefined) state.avatarUrl = msg.avatarUrl;
          if (msg.bio !== undefined) state.bio = msg.bio;
          if (msg.statusText !== undefined) state.statusText = msg.statusText;
          if (myAvatar) {
            if (state.avatarUrl) {
              myAvatar.innerHTML = `<img src="${state.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" /><div class="status-dot"></div>`;
            } else {
              myAvatar.style.background = `linear-gradient(135deg, ${state.color}, #d946ef)`;
              myAvatar.innerHTML = `${state.username.charAt(0).toUpperCase()}<div class="status-dot"></div>`;
            }
          }
          renderMembers();
          renderDirectMessagesList();
          break;

        case 'username_changed':
          if (msg.newUsername) {
            state.username = msg.newUsername;
            if (myUsername) myUsername.textContent = msg.newUsername;
            if (myAvatar && !state.avatarUrl) {
              myAvatar.innerHTML = `${msg.newUsername.charAt(0).toUpperCase()}<div class="status-dot"></div>`;
            }
            const authDataStr = localStorage.getItem('cyberchord_auth') || sessionStorage.getItem('cyberchord_auth');
            if (authDataStr) {
              try {
                const parsed = JSON.parse(authDataStr);
                parsed.username = msg.newUsername;
                localStorage.setItem('cyberchord_auth', JSON.stringify(parsed));
                sessionStorage.setItem('cyberchord_auth', JSON.stringify(parsed));
              } catch(e) {}
            }
            renderMembers();
            renderDirectMessagesList();
          }
          break;

        case 'groups_list':
          if (msg.groups) {
            state.groups = msg.groups;
            renderGroupsList();
          }
          break;

        case 'group_info_updated':
          if (msg.groupInfo && msg.room === state.currentRoom) {
            state.currentGroupInfo = msg.groupInfo;
            if (msg.oldName && state.currentRoom === msg.oldName) {
              state.currentRoom = msg.room;
            }
            updateRoomHeader();
            renderGroupMembersManager();
          }
          break;

        case 'account_deleted':
          localStorage.removeItem('cyberchord_auth');
          sessionStorage.removeItem('cyberchord_auth');
          alert('Ваш аккаунт был успешно и полностью удален.');
          location.reload();
          break;

        case 'chat':
          if (msg.username && msg.username !== state.username) {
            playNotificationSound();
          }

          if (msg.room === state.currentRoom) {
            renderSingleMessage(msg);
            if (!state.userIsScrolledUp) {
              scrollToBottom(true);
            } else {
              scrollDownBadge.classList.add('visible');
            }
            if (msg.room.startsWith('DM:') && msg.username && msg.username !== state.username) {
              sendPayload({ type: 'mark_read', room: msg.room });
            }
          } else if (msg.room) {
            if (msg.room.startsWith('DM:')) {
              state.unreadDMs.add(msg.room);
              renderDirectMessagesList();
            } else {
              state.unreadRooms.add(msg.room);
              renderRooms();
            }
          }
          break;

        case 'message_edited':
          if (msg.messageId || msg.timestamp) {
            let card = document.querySelector(`[data-msg-id="${msg.messageId}"]`);
            if (!card && msg.timestamp) {
              card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === msg.timestamp);
            }
            if (card) {
              if (msg.messageId) card.dataset.msgId = msg.messageId;
              card.dataset.msgContent = msg.content;
              const textEl = card.querySelector('.msg-text');
              if (textEl) {
                textEl.innerHTML = `${escapeHtml(msg.content)} <span class="msg-edited-tag">(изменено)</span>`;
              }
            }
          }
          break;

        case 'message_deleted':
          if (msg.messageId || msg.timestamp) {
            let card = document.querySelector(`[data-msg-id="${msg.messageId}"]`);
            if (!card && msg.timestamp) {
              card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === msg.timestamp);
            }
            if (card) {
              card.style.opacity = '0';
              card.style.transform = 'scale(0.95)';
              setTimeout(() => card.remove(), 200);
            }
          }
          break;

        case 'message_reaction_updated':
          if (msg.messageId || msg.timestamp) {
            let card = document.querySelector(`[data-msg-id="${msg.messageId}"]`);
            if (!card && msg.timestamp) {
              card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === msg.timestamp);
            }
            if (card) {
              if (msg.messageId) card.dataset.msgId = msg.messageId;
              const reactionsRow = card.querySelector('.msg-reactions-row');
              if (reactionsRow) {
                renderReactionsContent(reactionsRow, msg.reactions, card.dataset.msgId || msg.messageId, card.dataset.msgTimestamp, card.dataset.msgContent);
              }
            }
          }
          break;

        case 'avatar_updated':
          if (msg.username === state.username) {
            state.avatarUrl = msg.avatarUrl || '';
            if (typeof updateMyAvatarDisplay === 'function') updateMyAvatarDisplay();
          }
          break;

        case 'thread_reply_added':
          if (msg.reply && msg.messageId) {
            if (state.activeThreadMsg && state.activeThreadMsg.id === msg.messageId) {
              if (!state.activeThreadMsg.threadReplies) state.activeThreadMsg.threadReplies = [];
              state.activeThreadMsg.threadReplies.push(msg.reply);
              if (typeof renderThreadReplies === 'function') renderThreadReplies(state.activeThreadMsg.threadReplies);
            }
            let card = document.querySelector(`[data-msg-id="${msg.messageId}"]`);
            if (card) {
              const count = msg.threadCount || 1;
              let badgeWrap = card.querySelector('.thread-badge-wrap');
              if (!badgeWrap) {
                badgeWrap = document.createElement('div');
                badgeWrap.className = 'thread-badge-wrap';
                badgeWrap.style.marginTop = '6px';
                card.querySelector('.msg-content-wrapper').appendChild(badgeWrap);
              }
              badgeWrap.innerHTML = `
                <button onclick="openThreadPanelById('${msg.messageId}')" style="background: rgba(139, 92, 246, 0.15); border: 1px solid var(--border-glow); color: var(--accent-purple); font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                  💬 ${count} ${count === 1 ? 'ответ в треде' : 'ответов в треде'}
                </button>
              `;
            }
          }
          break;

        case 'poll_updated':
          if (msg.messageId && msg.poll) {
            let card = document.querySelector(`[data-msg-id="${msg.messageId}"]`);
            if (card) {
              const poll = msg.poll;
              const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
              const isQuiz = Boolean(poll.isQuiz);
              let optionsHtml = '';

              poll.options.forEach(opt => {
                const votes = opt.votes || [];
                const voteCount = votes.length;
                const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                const hasVoted = votes.includes(state.username);
                const isCorrect = isQuiz && poll.correctOptionId === opt.id;
                const quizClass = (isQuiz && hasVoted && isCorrect) ? 'correct-quiz' : '';

                optionsHtml += `
                  <div class="poll-option-btn ${hasVoted ? 'voted' : ''} ${quizClass}" onclick="votePoll('${msg.messageId}', ${opt.id})">
                    <div class="poll-option-bar" style="width: ${pct}%"></div>
                    <span class="poll-option-text">${hasVoted ? '✓ ' : ''}${escapeHtml(opt.text)}</span>
                    <span class="poll-option-percent">${voteCount} (${pct}%)</span>
                  </div>
                `;
              });

              const pollCard = card.querySelector('.poll-card');
              if (pollCard) {
                pollCard.innerHTML = `
                  <div class="poll-title">${isQuiz ? '🎯 Викторина: ' : '📊 Опрос: '}${escapeHtml(poll.question)}</div>
                  <div class="poll-options-list">${optionsHtml}</div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Всего голосов: ${totalVotes}</span>
                    ${isQuiz ? '<span style="color:var(--accent-cyan); font-weight:700;">🎯 Викторина</span>' : ''}
                  </div>
                `;
              }
            }
          }
          break;

        case 'user_typing':
          if (msg.room === state.currentRoom && msg.username && msg.username !== state.username) {
            showTypingIndicator(msg.username);
          }
          break;

        case 'vip_status_updated':
          if (msg.username === state.username) {
            state.isVip = Boolean(msg.isVip);
            if (typeof updateVipUI === 'function') updateVipUI();
            if (typeof updateMyAvatarDisplay === 'function') updateMyAvatarDisplay();
            renderMembers();
          }
          if (msg.allRegisteredUsers) {
            state.allRegisteredUsers = msg.allRegisteredUsers;
            renderDirectMessagesList();
          }
          break;

        case 'blocked_users_updated':
          state.blockedUsers = msg.blockedUsers || [];
          renderDirectMessagesList();
          updateRoomHeader();
          break;

        case 'story_uploaded':
          if (msg.username === state.username) {
            state.story = msg.story;
            if (typeof updateMyAvatarDisplay === 'function') updateMyAvatarDisplay();
          }
          if (msg.allRegisteredUsers) {
            state.allRegisteredUsers = msg.allRegisteredUsers;
            renderDirectMessagesList();
          }
          break;

        case 'system':
          if (msg.room === state.currentRoom) {
            renderSystemMessage(msg.content);
            if (!state.userIsScrolledUp) scrollToBottom(true);
          }
          break;

        case 'room_list':
          if (msg.rooms) {
            state.rooms = msg.rooms;
            renderRooms();
          }
          break;

        case 'user_list':
          if (msg.room === state.currentRoom && msg.onlineUsers) {
            state.onlineUsers = msg.onlineUsers;
            renderMembers();
          }
          break;

        case 'dm_started':
          if (msg.room && state.currentRoom && msg.room !== state.currentRoom) {
            // Ignore stale dm_started if user switched to another room
            break;
          }
          state.currentRoom = msg.room;
          state.activeDMRecipient = msg.recipient;
          state.unreadDMs.delete(msg.room);

          if (msg.dmContacts) {
            state.dmContacts = msg.dmContacts;
          } else if (msg.recipient) {
            const rLower = msg.recipient.toLowerCase();
            if (!state.dmContacts.map(x => x.toLowerCase()).includes(rLower)) {
              state.dmContacts.push(msg.recipient);
            }
          }

          updateRoomHeader();
          renderRooms();
          renderGroupsList();
          renderDirectMessagesList();

          messagesContainer.innerHTML = '';
          if (msg.history && msg.history.length > 0) {
            msg.history.forEach(renderSingleMessage);
          } else {
            let welcomeTitle = `Личный чат с @${msg.recipient}`;
            if (msg.recipient === 'Избранное') welcomeTitle = 'Избранное';
            if (msg.recipient === 'VesperChat') welcomeTitle = 'VesperChat';
            renderWelcomeMessage(welcomeTitle);
          }
          scrollToBottom(true);
          sendPayload({ type: 'mark_read', room: msg.room });
          break;

        case 'search_users_result':
          if (msg.usersList || msg.results) {
            const returnedUsers = msg.usersList || msg.results;

            // Merge returned users into state.allRegisteredUsers
            returnedUsers.forEach(u => {
              const idx = state.allRegisteredUsers.findIndex(x => x.username.toLowerCase() === u.username.toLowerCase());
              if (idx !== -1) {
                state.allRegisteredUsers[idx] = u;
              } else {
                state.allRegisteredUsers.push(u);
              }
            });

            renderDirectMessagesList();

            // TOP LEFT SEARCH BAR DROPDOWN
            const topInput = document.getElementById('userSearchInput');
            const topDropdown = document.getElementById('topSearchResultsDropdown');
            if (topInput && topDropdown) {
              const topQuery = topInput.value.trim().replace(/^@/, '').toLowerCase();
              if (topQuery.length > 0) {
                topDropdown.innerHTML = '';
                const matches = returnedUsers.filter(u =>
                  u.username.toLowerCase() !== state.username.toLowerCase() &&
                  u.username.toLowerCase() === topQuery
                );

                if (matches.length === 0) {
                  topDropdown.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-dim); text-align: center;">Пользователь не найден</div>';
                } else {
                  matches.forEach(u => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.innerHTML = `
                      <div class="search-result-avatar" style="background:${u.color || '#8b5cf6'}">
                        ${u.username.charAt(0).toUpperCase()}
                        <div class="dm-status-dot ${u.isOnline ? 'online' : 'offline'}"></div>
                      </div>
                      <div style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <span style="font-weight:700; color:var(--text-main); overflow:hidden; text-overflow:ellipsis;">@${escapeHtml(u.username)}</span>
                        <span style="font-size:10px; color:${u.isOnline ? 'var(--accent-green)' : 'var(--text-dim)'}">${u.isOnline ? 'В сети' : 'Не в сети'}</span>
                      </div>
                      <span style="font-size:11px; color:#d946ef; font-weight:700; background:rgba(217,70,239,0.15); padding:4px 8px; border-radius:6px;">Написать 💬</span>
                    `;
                    div.addEventListener('click', (e) => {
                      e.stopPropagation();
                      startDirectMessageWith(u.username);
                      topDropdown.classList.add('hidden');
                      topInput.value = '';
                    });
                    topDropdown.appendChild(div);
                  });
                }
                topDropdown.classList.remove('hidden');
              } else {
                topDropdown.classList.add('hidden');
              }
            }

            // Modal DM search results list
            const modalInput = document.getElementById('modalDmNicknameInput');
            const modalResults = document.getElementById('modalDmSearchResults');
            if (modalInput && modalResults) {
              const modalQuery = modalInput.value.trim().replace(/^@/, '').toLowerCase();
              if (modalQuery.length >= 1) {
                modalResults.innerHTML = '';
                const matches = returnedUsers.filter(u => u.username.toLowerCase() !== state.username.toLowerCase() && u.username.toLowerCase() === modalQuery);
                if (matches.length === 0) {
                  modalResults.innerHTML = '<div style="padding: 10px; font-size: 12px; color: var(--text-dim); text-align: center;">Пользователь не найден</div>';
                } else {
                  matches.forEach(u => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.style.background = 'rgba(255,255,255,0.04)';
                    div.innerHTML = `
                      <div class="search-result-avatar" style="background:${u.color || '#8b5cf6'}">
                        ${u.username.charAt(0).toUpperCase()}
                        <div class="dm-status-dot ${u.isOnline ? 'online' : 'offline'}"></div>
                      </div>
                      <div style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <span style="font-weight:700; color:var(--text-main);">@${escapeHtml(u.username)}</span>
                        <span style="font-size:10px; color:${u.isOnline ? 'var(--accent-green)' : 'var(--text-dim)'}">${u.isOnline ? 'В сети' : 'Офлайн'}</span>
                      </div>
                      <span style="font-size:11px; color:#d946ef; font-weight:700;">Чат →</span>
                    `;
                    div.addEventListener('click', () => {
                      startDirectMessageWith(u.username);
                      closeNewDmModal();
                    });
                    modalResults.appendChild(div);
                  });
                }
              }
            }
          }
          break;

        case 'messages_read':
          if (state.currentRoom === msg.room) {
            document.querySelectorAll('.read-receipt-tick').forEach(tick => {
              tick.textContent = '✓✓';
              tick.style.color = 'var(--accent-cyan)';
              tick.style.fontWeight = '700';
              tick.title = 'Прочитано';
            });
          }
          break;

        case 'password_changed':
          const passStatus = document.getElementById('passwordChangeStatus');
          if (passStatus) {
            passStatus.style.display = 'block';
            passStatus.style.color = 'var(--accent-green)';
            passStatus.textContent = msg.message || 'Пароль успешно изменен!';
          }
          const nPass = document.getElementById('newPasswordInput');
          const oPass = document.getElementById('oldPasswordInput');
          const cPass = document.getElementById('confirmNewPasswordInput');
          if (nPass && oPass && cPass) {
            if (nPass.value.trim()) {
              state.lastAuthPassword = nPass.value.trim();
              if (state.username) {
                sessionStorage.setItem('cyberchord_auth', JSON.stringify({
                  username: state.username,
                  password: nPass.value.trim()
                }));
              }
            }
            nPass.value = '';
            oPass.value = '';
            cPass.value = '';
          }
          break;

        case 'profile_updated':
          if (msg.color) {
            state.color = msg.color;
            if (myAvatar) myAvatar.style.background = `linear-gradient(135deg, ${msg.color}, #d946ef)`;
          }
          break;

        case 'incoming_call':
          handleIncomingCall(msg);
          break;

        case 'call_accepted':
          handleCallAccepted(msg);
          break;

        case 'call_declined':
          handleCallDeclined(msg);
          break;

        case 'call_signal':
          handleCallSignal(msg);
          break;

        case 'call_ended':
          handleCallEnded(msg);
          break;

        case 'sessions_list':
          if (typeof window.renderDevicesTab === 'function') {
            window.renderDevicesTab(msg.currentSession, msg.otherSessions || []);
          }
          break;

        case 'error':
          const errMsg = msg.content || msg.message || 'Произошла ошибка';
          if (!appLayout.classList.contains('visible') && !state.username) {
            sessionStorage.removeItem('cyberchord_auth');
            localStorage.removeItem('cyberchord_auth');
            loginScreen.classList.remove('hidden');
            appLayout.classList.remove('visible');
            showAuthError(errMsg);
          } else {
            const passStatusErr = document.getElementById('passwordChangeStatus');
            const settingsModalEl = document.getElementById('settingsModal');
            if (passStatusErr && settingsModalEl && settingsModalEl.classList.contains('active')) {
              passStatusErr.style.display = 'block';
              passStatusErr.style.color = '#ef4444';
              passStatusErr.textContent = errMsg;
            } else {
              alert(errMsg);
            }
          }
          break;
      }
    }

    // ==========================================================================
    // TYPING INDICATOR LOGIC
    // ==========================================================================
    function updateTypingText() {
      if (typingIndicatorBar) typingIndicatorBar.classList.remove('visible');
    }

    // ==========================================================================
    // RENDERING FUNCTIONS
    // ==========================================================================
    function renderRooms() {
      roomsList.innerHTML = '';
      state.rooms.forEach(roomName => {
        const icon = roomIcons[roomName] || '🌐';
        const item = document.createElement('div');
        const isActive = roomName === state.currentRoom && !state.activeDMRecipient;
        const hasUnread = state.unreadRooms.has(roomName);

        item.className = `channel-item ${isActive ? 'active' : ''}`;
        item.innerHTML = `
          <span class="channel-icon">${icon}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(roomName)}</span>
          ${hasUnread ? '<div class="dm-unread-dot" title="Новые сообщения"></div>' : ''}
        `;
        item.addEventListener('click', () => switchRoom(roomName));
        roomsList.appendChild(item);
      });
    }

    function renderGroupsList() {
      if (!groupsList) return;
      groupsList.innerHTML = '';

      if (state.groups.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.style.padding = '6px 10px';
        emptyNotice.style.fontSize = '12px';
        emptyNotice.style.color = 'var(--text-dim)';
        emptyNotice.textContent = 'Нет созданных групп';
        groupsList.appendChild(emptyNotice);
        return;
      }

      state.groups.forEach(g => {
        const item = document.createElement('div');
        const isActive = g.name === state.currentRoom && !state.activeDMRecipient;
        const hasUnread = state.unreadRooms.has(g.name);

        item.className = `channel-item ${isActive ? 'active' : ''}`;
        item.innerHTML = `
          <span class="channel-icon">👥</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(g.name)}</span>
          ${g.isOwner ? '<span class="role-badge owner" title="Вы - создатель">👑</span>' : (g.isAdmin ? '<span class="role-badge admin" title="Вы - админ">🛡️</span>' : '')}
          ${hasUnread ? '<div class="dm-unread-dot" title="Новые сообщения"></div>' : ''}
        `;
        item.addEventListener('click', () => switchRoom(g.name));
        groupsList.appendChild(item);
      });
    }

    function switchRoom(roomName) {
      if (roomName === state.currentRoom && !state.activeDMRecipient) {
        if (typeof openPhoneChatView === 'function') openPhoneChatView();
        return;
      }
      state.currentRoom = roomName;
      state.activeDMRecipient = '';
      localStorage.setItem('cyberchord_room', roomName);
      state.unreadRooms.delete(roomName);

      messagesContainer.innerHTML = '';
      renderWelcomeMessage();

      renderRooms();
      renderGroupsList();
      renderDirectMessagesList();
      updateRoomHeader();

      sendPayload({
        type: 'switch_room',
        room: roomName
      });

      if (typeof openPhoneChatView === 'function') openPhoneChatView();
    }

    function startDirectMessageWith(targetUsername) {
      if (!targetUsername) return;
      let cleanTarget = targetUsername.replace(/^@/, '').trim();
      if (!cleanTarget) return;

      if (cleanTarget.toLowerCase() === state.username.toLowerCase()) {
        cleanTarget = 'Избранное';
      }

      state.activeDMRecipient = cleanTarget;
      let dmKey = getDMKey(state.username, cleanTarget);
      if (cleanTarget.toLowerCase() === 'избранное' || cleanTarget === 'Избранное') {
        dmKey = `DM:favorited_${state.username.toLowerCase()}`;
      } else if (cleanTarget.toLowerCase() === 'vesperchat' || cleanTarget === 'VesperChat') {
        dmKey = `DM:VesperChat_${state.username.toLowerCase()}`;
      }

      state.currentRoom = dmKey;
      localStorage.setItem('cyberchord_room', dmKey);

      if (cleanTarget !== 'Избранное' && cleanTarget !== 'VesperChat') {
        if (!state.dmContacts.map(c=>c.toLowerCase()).includes(cleanTarget.toLowerCase())) {
          state.dmContacts.push(cleanTarget);
        }
      }

      messagesContainer.innerHTML = '';
      if (cleanTarget === 'Избранное') {
        renderWelcomeMessage('Избранное');
      } else if (cleanTarget === 'VesperChat') {
        renderWelcomeMessage('VesperChat');
      } else {
        renderWelcomeMessage(`Личный чат с @${cleanTarget}`);
      }

      renderDirectMessagesList();
      renderRooms();
      renderGroupsList();
      updateRoomHeader();

      sendPayload({
        type: 'start_dm',
        recipient: cleanTarget
      });

      if (typeof openPhoneChatView === 'function') openPhoneChatView();
    }

    function getDMKey(u1, u2) {
      const sorted = [u1.toLowerCase(), u2.toLowerCase()].sort();
      return `DM:${sorted[0]}_${sorted[1]}`;
    }

    function renderDirectMessagesList() {
      if (!directMessagesList) return;
      directMessagesList.innerHTML = '';
      if (!state.username) return;
      if (!state.allRegisteredUsers) state.allRegisteredUsers = [];
      if (!state.dmContacts) state.dmContacts = [];
      if (!state.unreadDMs) state.unreadDMs = new Set();
      const filterQuery = userSearchInput && userSearchInput.value ? userSearchInput.value.trim().toLowerCase() : '';

      try {
        // 1. PINNED SPECIAL CHATS (Favorites & VesperChat)
        const favKey = `DM:favorited_${state.username.toLowerCase()}`;
        const vesperKey = `DM:VesperChat_${state.username.toLowerCase()}`;

      if (!filterQuery || 'избранное'.includes(filterQuery)) {
        const favItem = document.createElement('div');
        const isFavActive = state.currentRoom === favKey || state.activeDMRecipient === 'Избранное';
        const hasFavUnread = state.unreadDMs.has(favKey);

        favItem.className = `dm-user-item ${isFavActive ? 'active' : ''}`;
        favItem.innerHTML = `
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #ec4899); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(168, 85, 247, 0.4);">
            📌
          </div>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1; margin-left:8px; font-weight:700; color:var(--text-main);">
            Избранное
          </span>
          ${hasFavUnread ? '<div class="dm-unread-dot" title="Новое сообщение"></div>' : ''}
        `;
        favItem.addEventListener('click', () => {
          startDirectMessageWith('Избранное');
        });
        directMessagesList.appendChild(favItem);
      }

      if (!filterQuery || 'vesperchat'.includes(filterQuery)) {
        const vesperItem = document.createElement('div');
        const isVesperActive = state.currentRoom === vesperKey || state.activeDMRecipient === 'VesperChat';
        const hasVesperUnread = state.unreadDMs.has(vesperKey);

        vesperItem.className = `dm-user-item ${isVesperActive ? 'active' : ''}`;
        vesperItem.innerHTML = `
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #38bdf8, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(56, 189, 248, 0.4);">
            🛡️
          </div>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1; margin-left:8px; font-weight:700; color:var(--text-main);">
            VesperChat <span style="font-size: 9px; padding: 2px 6px; border-radius: 8px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-weight: 800;">INFO</span>
          </span>
          ${hasVesperUnread ? '<div class="dm-unread-dot" title="Новое сообщение"></div>' : ''}
        `;
        vesperItem.addEventListener('click', () => {
          startDirectMessageWith('VesperChat');
        });
        directMessagesList.appendChild(vesperItem);
      }

      // 2. USER DIRECT MESSAGES
      const registeredMap = new Map();
      state.allRegisteredUsers.forEach(u => registeredMap.set(u.username.toLowerCase(), u));

      const contactsList = [];
      const addedSet = new Set(['избранное', 'vesperchat']);

      // Include active recipient first if set
      if (state.activeDMRecipient && !['избранное', 'vesperchat', state.username.toLowerCase()].includes(state.activeDMRecipient.toLowerCase())) {
        const lower = state.activeDMRecipient.toLowerCase();
        const u = registeredMap.get(lower) || {
          username: state.activeDMRecipient,
          isOnline: false,
          color: '#8b5cf6'
        };
        contactsList.push(u);
        addedSet.add(lower);
      }

      // Include dmContacts
      (state.dmContacts || []).forEach(username => {
        const lower = username.toLowerCase();
        if (!['избранное', 'vesperchat', state.username.toLowerCase()].includes(lower) && !addedSet.has(lower)) {
          const u = registeredMap.get(lower) || {
            username: username,
            isOnline: false,
            color: '#8b5cf6'
          };
          contactsList.push(u);
          addedSet.add(lower);
        }
      });

      // Include unread DM senders
      state.unreadDMs.forEach(dmRoom => {
        if (dmRoom.startsWith('DM:') && !dmRoom.includes('favorited_') && !dmRoom.includes('VesperChat_')) {
          const parts = dmRoom.substring(3).split('_');
          parts.forEach(p => {
            const lower = p.toLowerCase();
            if (!['избранное', 'vesperchat', state.username.toLowerCase()].includes(lower) && !addedSet.has(lower)) {
              const u = registeredMap.get(lower) || {
                username: p,
                isOnline: false,
                color: '#8b5cf6'
              };
              contactsList.push(u);
              addedSet.add(lower);
            }
          });
        }
      });

      const filtered = contactsList.filter(u =>
        filterQuery === '' || u.username.toLowerCase() === filterQuery
      );

      filtered.forEach(u => {
        const item = document.createElement('div');
        const isActive = state.activeDMRecipient.toLowerCase() === u.username.toLowerCase();
        const dmKey = getDMKey(state.username, u.username);
        const hasUnread = state.unreadDMs.has(dmKey);
        const isBlocked = (state.blockedUsers || []).map(b => b.toLowerCase()).includes(u.username.toLowerCase());
        const crown = u.isVip ? ' 👑' : '';

        item.className = `dm-user-item ${isActive ? 'active' : ''}`;
        item.style.position = 'relative';

        const avatarMarkup = getAvatarHtml(u.username, u.color, u.avatarUrl, 32);

        item.innerHTML = `
          <div style="position:relative; display:inline-block;">
            ${avatarMarkup}
            <div class="dm-status-dot ${u.isOnline ? 'online' : 'offline'}"></div>
          </div>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1; margin-left:6px; font-weight:600;">
            @${escapeHtml(u.username)}${crown} ${isBlocked ? '<span style="color:#ef4444; font-size:10px;">(Заблокирован)</span>' : ''}
          </span>
          ${hasUnread ? '<div class="dm-unread-dot" title="Новое сообщение"></div>' : ''}
          <button class="dm-block-btn" title="${isBlocked ? 'Разблокировать' : 'Заблокировать'}" style="background:transparent; border:none; color:${isBlocked ? '#10b981' : '#ef4444'}; cursor:pointer; font-size:12px; padding:2px 4px; margin-left:4px;">
            ${isBlocked ? '✅' : '🚫'}
          </button>
        `;

        item.addEventListener('click', (e) => {
          if (e.target.closest('.dm-block-btn')) {
            e.stopPropagation();
            toggleBlockUser(u.username);
            return;
          }
          startDirectMessageWith(u.username);
        });

        directMessagesList.appendChild(item);
      });
      } catch (err) {
        console.error('Error in renderDirectMessagesList:', err);
      }
    }

    const topSearchResultsDropdown = document.getElementById('topSearchResultsDropdown');

    userSearchInput.addEventListener('input', () => {
      const val = userSearchInput.value.trim().replace(/^@/, '');
      renderDirectMessagesList();
      if (val.length > 0) {
        sendPayload({ type: 'search_users', query: val });
      } else {
        if (topSearchResultsDropdown) topSearchResultsDropdown.classList.add('hidden');
      }
    });

    userSearchInput.addEventListener('focus', () => {
      const val = userSearchInput.value.trim().replace(/^@/, '');
      if (val.length > 0) {
        sendPayload({ type: 'search_users', query: val });
      }
    });

    document.addEventListener('click', (e) => {
      if (topSearchResultsDropdown && userSearchInput) {
        if (!userSearchInput.contains(e.target) && !topSearchResultsDropdown.contains(e.target)) {
          topSearchResultsDropdown.classList.add('hidden');
        }
      }
    });



    // NEW DM MODAL LISTENERS
    const openNewDmModalBtn = document.getElementById('openNewDmModalBtn');
    const newDmModal = document.getElementById('newDmModal');
    const closeNewDmModalBtn = document.getElementById('closeNewDmModalBtn');
    const cancelNewDmModalBtn = document.getElementById('cancelNewDmModalBtn');
    const modalDmNicknameInput = document.getElementById('modalDmNicknameInput');
    const modalDmSearchResults = document.getElementById('modalDmSearchResults');
    const confirmStartDmModalBtn = document.getElementById('confirmStartDmModalBtn');

    if (openNewDmModalBtn) {
      openNewDmModalBtn.addEventListener('click', () => {
        if (newDmModal) {
          newDmModal.classList.add('active');
          if (modalDmNicknameInput) {
            modalDmNicknameInput.value = '';
            modalDmNicknameInput.focus();
            if (modalDmSearchResults) {
              modalDmSearchResults.innerHTML = '<div style="padding: 10px; font-size: 12px; color: var(--text-dim); text-align: center;">Введите точный никнейм для поиска...</div>';
            }
          }
        }
      });
    }

    function closeNewDmModal() {
      if (newDmModal) newDmModal.classList.remove('active');
    }

    if (closeNewDmModalBtn) closeNewDmModalBtn.addEventListener('click', closeNewDmModal);
    if (cancelNewDmModalBtn) cancelNewDmModalBtn.addEventListener('click', closeNewDmModal);

    if (modalDmNicknameInput) {
      modalDmNicknameInput.addEventListener('input', () => {
        const val = modalDmNicknameInput.value.trim().replace(/^@/, '');
        if (val.length >= 1) {
          sendPayload({ type: 'search_users', query: val });
        } else if (modalDmSearchResults) {
          modalDmSearchResults.innerHTML = '<div style="padding: 10px; font-size: 12px; color: var(--text-dim); text-align: center;">Введите точный никнейм для поиска...</div>';
        }
      });
    }

    if (confirmStartDmModalBtn) {
      confirmStartDmModalBtn.addEventListener('click', () => {
        if (modalDmNicknameInput) {
          const target = modalDmNicknameInput.value.trim().replace(/^@/, '');
          if (target) {
            startDirectMessageWith(target);
            closeNewDmModal();
          }
        }
      });
    }

    function updateRoomHeader() {

      const avatarContainer = document.getElementById('chatHeaderAvatarContainer');
      if (avatarContainer) {
        if (state.activeDMRecipient) {
          const uObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === state.activeDMRecipient.toLowerCase());
          const color = uObj ? uObj.color : '#8b5cf6';
          const avatarUrl = uObj ? uObj.avatarUrl : '';
          avatarContainer.innerHTML = getAvatarHtml(state.activeDMRecipient, color, avatarUrl, 38, '', true);
          avatarContainer.onclick = () => openUserProfileModal(state.activeDMRecipient);
        } else if (state.currentGroupInfo && state.currentGroupInfo.isGroup) {
          avatarContainer.innerHTML = `<div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #06b6d4); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; color: #fff;">👥</div>`;
          avatarContainer.onclick = () => { if (typeof openGroupSettingsModal === 'function') openGroupSettingsModal(); };
        } else {
          const icon = roomIcons[state.currentRoom] || '🌐';
          avatarContainer.innerHTML = `<div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(139,92,246,0.2); display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--accent-purple);">${icon}</div>`;
          avatarContainer.onclick = null;
        }
      }

      if (typeof updateScheduledBadge === 'function') updateScheduledBadge();
      const annBar = document.getElementById('announcementChannelBar');
      const inputContainer = document.getElementById('chatInputBoxContainer');
      const membersSidebar = document.getElementById('membersSidebar');
      const membersTitle = document.getElementById('membersTitle');

      if (state.activeDMRecipient === 'VesperChat' || (state.currentRoom && state.currentRoom.startsWith('DM:VesperChat_'))) {
        if (membersSidebar) membersSidebar.style.display = 'none';
        currentRoomTitle.style.cursor = 'default';
        currentRoomTitle.onclick = null;
        currentRoomTitle.title = '';
        currentRoomTitle.innerHTML = `🛡️ VesperChat <span class="group-badge" style="background: rgba(56, 189, 248, 0.15); border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;">Инфо-канал</span>`;

        currentRoomTopic.style.cursor = 'default';
        currentRoomTopic.onclick = null;
        currentRoomTopic.title = '';
        currentRoomTopic.textContent = `Официальный системный чат. Системные уведомления о безопасности и сеансах.`;

        if (openGroupSettingsBtn) openGroupSettingsBtn.style.display = 'none';

        if (annBar) {
          annBar.style.display = 'block';
          annBar.textContent = '🔒 Это системный канал VesperChat. Пользователи не могут отправлять сюда сообщения.';
        }
        if (inputContainer) inputContainer.style.display = 'none';

      } else if (state.activeDMRecipient === 'Избранное' || (state.currentRoom && state.currentRoom.startsWith('DM:favorited_'))) {
        if (membersSidebar) membersSidebar.style.display = 'none';
        currentRoomTitle.style.cursor = 'default';
        currentRoomTitle.onclick = null;
        currentRoomTitle.title = '';
        currentRoomTitle.innerHTML = `📌 Избранное`;

        currentRoomTopic.style.cursor = 'default';
        currentRoomTopic.onclick = null;
        currentRoomTopic.title = '';
        currentRoomTopic.textContent = `Личное хранилище заметок, файлов и сообщений`;

        if (openGroupSettingsBtn) openGroupSettingsBtn.style.display = 'none';
        if (annBar) annBar.style.display = 'none';
        if (inputContainer) inputContainer.style.display = 'flex';

      } else if (state.activeDMRecipient) {
        if (membersSidebar) membersSidebar.style.display = 'none';
        const isBlocked = (state.blockedUsers || []).map(b => b.toLowerCase()).includes(state.activeDMRecipient.toLowerCase());
        const uObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === state.activeDMRecipient.toLowerCase());
        const isVip = Boolean(uObj && uObj.isVip);

        currentRoomTitle.style.cursor = 'pointer';
        currentRoomTitle.title = 'Нажмите, чтобы посмотреть профиль пользователя';
        currentRoomTitle.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;" class="clickable-header-username">👤 ${escapeHtml(state.activeDMRecipient)} ${isVip ? '👑' : ''}</span> ${isBlocked ? '<span style="color:#ef4444; font-size:12px; font-weight:700; margin-left:6px;">[Заблокирован]</span>' : ''}`;
        currentRoomTitle.onclick = () => openUserProfileModal(state.activeDMRecipient);

        currentRoomTopic.style.cursor = 'pointer';
        currentRoomTopic.title = 'Нажмите, чтобы посмотреть профиль пользователя';
        currentRoomTopic.textContent = isBlocked ? `Пользователь заблокирован. Вы не можете отправлять ему сообщения.` : `Личные сообщения с @${escapeHtml(state.activeDMRecipient)}`;
        currentRoomTopic.onclick = () => openUserProfileModal(state.activeDMRecipient);
        
        if (openGroupSettingsBtn) {
          openGroupSettingsBtn.style.display = 'none';
        }
        if (annBar) annBar.style.display = 'none';
        if (inputContainer) inputContainer.style.display = isBlocked ? 'none' : 'flex';
      } else if (state.currentGroupInfo && state.currentGroupInfo.isGroup) {
        if (membersSidebar) membersSidebar.style.display = '';
        if (membersTitle) membersTitle.textContent = state.currentGroupInfo.isAnnouncement ? 'Подписчики канала' : 'Участники группы';
        const isAnn = Boolean(state.currentGroupInfo.isAnnouncement);
        const membersCount = (state.currentGroupInfo.members || []).length;
        const userLower = state.username.toLowerCase();
        const isOwner = state.currentGroupInfo.owner === userLower;
        const isAdmin = (state.currentGroupInfo.admins || []).includes(userLower);

        if (isAnn) {
          currentRoomTitle.innerHTML = `📢 ${escapeHtml(state.currentRoom)} <span class="group-badge" style="background: rgba(6, 182, 212, 0.2); border-color: var(--accent-cyan); color: var(--accent-cyan);">Канал объявлений</span>`;
          currentRoomTopic.textContent = `Канал объявлений • ${membersCount} участников`;
        } else {
          currentRoomTitle.innerHTML = `👥 ${escapeHtml(state.currentRoom)} <span class="group-badge">Группа</span>`;
          currentRoomTopic.textContent = `Закрытая группа • ${membersCount} участников`;
        }

        if (openGroupSettingsBtn) {
          openGroupSettingsBtn.style.display = (isOwner || isAdmin) ? 'inline-flex' : 'none';
        }

        if (isAnn && !(isOwner || isAdmin)) {
          if (annBar) annBar.style.display = 'block';
          if (inputContainer) inputContainer.style.display = 'none';
        } else {
          if (annBar) annBar.style.display = 'none';
          if (inputContainer) inputContainer.style.display = 'flex';
        }
      } else {
        if (membersSidebar) membersSidebar.style.display = '';
        if (membersTitle) membersTitle.textContent = 'Участники комнаты';
        const icon = roomIcons[state.currentRoom] || '🌐';
        currentRoomTitle.innerHTML = `${icon} ${escapeHtml(state.currentRoom)}`;
        currentRoomTopic.textContent = `Публичный канал: ${state.currentRoom}`;
        if (openGroupSettingsBtn) openGroupSettingsBtn.style.display = 'none';
        if (annBar) annBar.style.display = 'none';
        if (inputContainer) inputContainer.style.display = 'flex';
      }

      if (typeof updatePinnedMessageBar === 'function') updatePinnedMessageBar();
      if (typeof updateScheduledBadge === 'function') updateScheduledBadge();
    }

    function renderMembers() {
      membersList.innerHTML = '';
      onlineBadge.textContent = `${state.onlineUsers.length} Онлайн`;

      state.onlineUsers.forEach(username => {
        const isMe = username === state.username;
        const color = avatarColors[username.length % avatarColors.length];
        const item = document.createElement('div');
        item.className = 'member-item';
        const userObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
        const avatarUrl = userObj ? userObj.avatarUrl : '';
        const isVip = Boolean(userObj?.isVip || (isMe && state.isVip));
        const crown = isVip ? ' 👑' : '';
        const avatarMarkup = getAvatarHtml(username, color, avatarUrl, 32);
        const statusText = (isMe && state.statusText) ? state.statusText : (userObj?.statusText || '');
        const statusBadgeHtml = (isVip && statusText) 
          ? `<div style="font-size: 11px; color: var(--accent-magenta); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; margin-top: 1px;">🎮 ${escapeHtml(statusText)}</div>` 
          : '';

        item.innerHTML = `
          <div style="position:relative; display:inline-block; flex-shrink: 0;">
            ${avatarMarkup}
            <div class="member-status online" style="position:absolute; bottom:0; right:0; border:2px solid var(--bg-surface);"></div>
          </div>
          <div style="display:flex; flex-direction:column; overflow:hidden;">
            <div class="member-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(username)}${crown}${isMe ? ' (Вы)' : ''}</div>
            ${statusBadgeHtml}
          </div>
        `;
        item.style.cursor = 'pointer';
        item.title = isMe ? "Мой профиль" : `Профиль пользователя ${escapeHtml(username)}`;
        item.addEventListener('click', () => openUserProfileModal(username));
        membersList.appendChild(item);
      });
    }

    function renderWelcomeMessage(customTitle) {
      const welcome = document.createElement('div');
      welcome.style.textAlign = 'center';
      welcome.style.margin = '40px 0 20px';
      welcome.style.color = 'var(--text-muted)';
      welcome.innerHTML = `
        <div style="font-size:32px;margin-bottom:8px;">⚡</div>
        <h3 style="color:var(--text-main);font-size:18px;font-weight:800;margin-bottom:4px;">${customTitle || 'Добро пожаловать в ' + escapeHtml(state.currentRoom)}</h3>
        <p style="font-size:13px;">Отправьте первое сообщение, голосовую запись или файл!</p>
      `;
      messagesContainer.appendChild(welcome);
    }

    function toggleReaction(msgId, emoji, timestamp, content) {
      if (!emoji) return;
      let card = msgId ? document.querySelector(`[data-msg-id="${msgId}"]`) : null;
      if (!card && timestamp) {
        card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === timestamp);
      }
      const actualId = card ? card.dataset.msgId : msgId;
      sendPayload({
        type: 'add_reaction',
        messageId: actualId,
        emoji: emoji,
        timestamp: timestamp,
        content: content,
        room: state.currentRoom
      });
    }

    function openMessageReactionPicker(e, msgId, timestamp, content) {
      const panel = document.getElementById('msgReactionPickerPanel');
      if (!panel) return;
      const emojiPanel = document.getElementById('emojiPickerPanel');
      if (emojiPanel) emojiPanel.classList.remove('active');

      const reactionEmojis = [
        '👍', '👎', '❤️', '🔥', '😂', '😮', '💩', '🎉', '💯', '🙏', '😍', '🥰', '😎', '🥳',
        '⚡', '✨', '🚀', '👏', '🙌', '💡', '📌', '💬', '🤖', '🤡', '👻', '💀', '🍕', '🍻'
      ];

      panel.innerHTML = '';
      reactionEmojis.forEach(em => {
        const item = document.createElement('div');
        item.className = 'msg-reaction-picker-item';
        item.textContent = em;
        item.addEventListener('click', (evt) => {
          evt.stopPropagation();
          triggerEmojiPopAnim(item, em, evt.clientX, evt.clientY);
          toggleReaction(msgId, em, timestamp, content);
          setTimeout(() => panel.classList.remove('active'), 250);
        });
        panel.appendChild(item);
      });

      const rect = e.currentTarget.getBoundingClientRect();
      let left = rect.left - 120;
      let top = rect.top - 250;
      if (top < 10) top = rect.bottom + 10;
      if (left + 300 > window.innerWidth) left = window.innerWidth - 310;
      if (left < 10) left = 10;

      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.classList.add('active');
    }

    function startEditMessage(msgId, currentContent, timestamp) {
      let card = msgId ? document.querySelector(`[data-msg-id="${msgId}"]`) : null;
      if (!card && timestamp) {
        card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === timestamp);
      }
      if (!card) return;
      const textContainer = card.querySelector('.msg-text-container');
      if (!textContainer) return;

      if (textContainer.querySelector('.msg-edit-container')) return;

      const originalText = textContainer.querySelector('.msg-text');
      if (originalText) originalText.style.display = 'none';

      const latestContent = card.dataset.msgContent || currentContent || '';

      const editDiv = document.createElement('div');
      editDiv.className = 'msg-edit-container';
      editDiv.innerHTML = `
        <input type="text" class="msg-edit-input" value="${escapeHtml(latestContent)}" />
        <div class="msg-edit-actions">
          <button class="msg-edit-btn msg-edit-save">Сохранить</button>
          <button class="msg-edit-btn msg-edit-cancel">Отмена</button>
        </div>
      `;

      const input = editDiv.querySelector('.msg-edit-input');
      const saveBtn = editDiv.querySelector('.msg-edit-save');
      const cancelBtn = editDiv.querySelector('.msg-edit-cancel');

      const cancelEdit = () => {
        editDiv.remove();
        if (originalText) originalText.style.display = 'block';
      };

      const saveEdit = () => {
        const val = input.value.trim();
        if (val && val !== latestContent) {
          sendPayload({
            type: 'edit_message',
            messageId: card.dataset.msgId || msgId,
            content: val,
            timestamp: timestamp,
            room: state.currentRoom
          });
        }
        cancelEdit();
      };

      cancelBtn.addEventListener('click', cancelEdit);
      saveBtn.addEventListener('click', saveEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveEdit();
        } else if (e.key === 'Escape') {
          cancelEdit();
        }
      });

      textContainer.appendChild(editDiv);
      input.focus();
    }

    let pendingDeleteInfo = null;

    function getDeletedLocallySet() {
      const key = `cyberchord_deleted_for_me_${(state.username || '').toLowerCase()}_${state.currentRoom}`;
      try {
        const raw = localStorage.getItem(key);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch (e) {
        return new Set();
      }
    }

    function markDeletedLocally(msgId, timestamp) {
      if (!state.username || !state.currentRoom) return;
      const key = `cyberchord_deleted_for_me_${state.username.toLowerCase()}_${state.currentRoom}`;
      const set = getDeletedLocallySet();
      if (msgId) set.add(msgId);
      if (timestamp) set.add(timestamp);
      try {
        localStorage.setItem(key, JSON.stringify(Array.from(set)));
      } catch (e) {}
    }

    function isDeletedLocally(msgId, timestamp) {
      const set = getDeletedLocallySet();
      if (msgId && set.has(msgId)) return true;
      if (timestamp && set.has(timestamp)) return true;
      return false;
    }

    function openDeleteModal(msgId, timestamp, authorName) {
      let card = msgId ? document.querySelector(`[data-msg-id="${msgId}"]`) : null;
      if (!card && timestamp) {
        card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === timestamp);
      }
      const actualMsgId = card ? card.dataset.msgId : msgId;
      const actualTimestamp = card ? card.dataset.msgTimestamp : timestamp;
      const actualAuthor = authorName || (card ? card.dataset.msgAuthor : '');

      pendingDeleteInfo = {
        msgId: actualMsgId,
        timestamp: actualTimestamp,
        card: card,
        author: actualAuthor
      };

      const userLower = (state.username || '').toLowerCase();
      const authorLower = (actualAuthor || '').toLowerCase();

      let isOwnerOrAdmin = false;
      if (state.currentGroupInfo && state.currentGroupInfo.isGroup) {
        isOwnerOrAdmin = state.currentGroupInfo.owner === userLower || (state.currentGroupInfo.admins || []).includes(userLower);
      }

      const isAuthor = authorLower ? (authorLower === userLower) : true;
      const canDeleteForEveryone = isAuthor || isOwnerOrAdmin;

      const deleteModal = document.getElementById('deleteMessageModal');
      const noticeEl = document.getElementById('deleteModalNotice');
      const btnEveryone = document.getElementById('btnDeleteForEveryone');

      if (deleteModal && noticeEl && btnEveryone) {
        if (canDeleteForEveryone) {
          btnEveryone.style.display = 'flex';
          noticeEl.textContent = 'Удалить сообщение у всех участников чата или только для себя?';
        } else {
          btnEveryone.style.display = 'none';
          noticeEl.textContent = 'Вы можете удалить сообщение собеседника только для себя.';
        }
        deleteModal.classList.add('active');
      }
    }

    function closeDeleteModal() {
      const deleteModal = document.getElementById('deleteMessageModal');
      if (deleteModal) deleteModal.classList.remove('active');
      pendingDeleteInfo = null;
    }

    function deleteMessage(msgId, timestamp, authorName) {
      openDeleteModal(msgId, timestamp, authorName);
    }

    function renderReactionsContent(container, reactions, msgId, timestamp, content) {
      if (!container) return;
      container.innerHTML = '';
      if (!reactions || Object.keys(reactions).length === 0) return;

      const parentCard = container.closest('.message-card');
      const actualTs = timestamp || (parentCard ? parentCard.dataset.msgTimestamp : '');
      const actualContent = content || (parentCard ? parentCard.dataset.msgContent : '');

      Object.entries(reactions).forEach(([emoji, users]) => {
        if (!users || users.length === 0) return;
        const hasReacted = users.some(u => u.toLowerCase() === state.username.toLowerCase());
        const chip = document.createElement('div');
        chip.className = `reaction-chip ${hasReacted ? 'user-reacted' : ''}`;
        chip.title = `Поставили: ${users.join(', ')}`;
        chip.innerHTML = `${emoji} <span class="reaction-count">${users.length}</span>`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleReaction(msgId, emoji, actualTs, actualContent);
        });
        container.appendChild(chip);
      });
    }

    function renderSystemCallMessage(msg) {
      const container = document.createElement('div');
      container.className = 'system-call-card-wrapper';
      container.style.cssText = 'display: flex; justify-content: center; margin: 12px 0; width: 100%;';

      const isMissed = msg.content && (msg.content.includes('Пропущенный') || msg.content.includes('Отклоненный'));
      const isVideo = msg.content && (msg.content.includes('видеовызов') || msg.content.includes('📹'));

      const card = document.createElement('div');
      card.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 18px;
        border-radius: 20px;
        background: ${isMissed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'};
        border: 1px solid ${isMissed ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'};
        color: ${isMissed ? '#fca5a5' : '#6ee7b7'};
        font-size: 13px;
        font-weight: 600;
        backdrop-filter: blur(12px);
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      `;

      const icon = isVideo ? '📹' : '📞';
      const time = msg.timestamp || '';

      card.innerHTML = `
        <span style="font-size: 16px;">${icon}</span>
        <span>${escapeHtml(msg.content)}</span>
        ${time ? `<span style="font-size: 11px; opacity: 0.75; margin-left: 6px;">${escapeHtml(time)}</span>` : ''}
      `;

      container.appendChild(card);
      messagesContainer.appendChild(container);
    }

    function renderSingleMessage(msg) {
      if (!msg) return;
      if (msg.type === 'system' || msg.isSystemCall || (msg.content && (msg.content.startsWith('📞') || msg.content.startsWith('📹')))) {
        renderSystemCallMessage(msg);
        return;
      }
      const msgId = msg.id || ('msg_' + Math.random().toString(36).substring(2, 9));
      if (isDeletedLocally(msgId, msg.timestamp)) return;

      const card = document.createElement('div');
      card.className = 'message-card';
      card.dataset.msgId = msgId;
      if (msg.timestamp) card.dataset.msgTimestamp = msg.timestamp;
      if (msg.content) card.dataset.msgContent = msg.content;
      if (msg.username) card.dataset.msgAuthor = msg.username;

      const initial = (msg.username || '?').charAt(0).toUpperCase();
      const color = msg.color || avatarColors[(msg.username || '').length % avatarColors.length];
      const isOwnerOrAuthor = msg.username && msg.username.toLowerCase() === state.username.toLowerCase();
      
      let isGroupAdminOrOwner = false;
      if (state.currentGroupInfo && state.currentGroupInfo.isGroup) {
        const uLower = state.username.toLowerCase();
        isGroupAdminOrOwner = state.currentGroupInfo.owner === uLower || (state.currentGroupInfo.admins || []).includes(uLower);
      }

      const canDelete = true;
      const canEdit = isOwnerOrAuthor && Boolean(msg.content);

      // Hover Actions Toolbar
      const hoverActions = document.createElement('div');
      hoverActions.className = 'msg-hover-actions';

      const popularEmojis = ['👍', '❤️', '😂', '🔥', '😮', '💩'];
      popularEmojis.forEach(em => {
        const btn = document.createElement('button');
        btn.className = 'quick-reaction-btn';
        btn.textContent = em;
        btn.title = `Поставить ${em}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerEmojiPopAnim(btn, em, e.clientX, e.clientY);
          toggleReaction(msgId, em, msg.timestamp, msg.content);
        });
        hoverActions.appendChild(btn);
      });

      const moreEmojiBtn = document.createElement('button');
      moreEmojiBtn.className = 'quick-reaction-btn';
      moreEmojiBtn.innerHTML = '➕';
      moreEmojiBtn.title = 'Выбрать другой эмодзи';
      moreEmojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMessageReactionPicker(e, msgId, msg.timestamp, msg.content);
      });
      hoverActions.appendChild(moreEmojiBtn);

      if (canEdit || canDelete) {
        const divider = document.createElement('div');
        divider.className = 'msg-action-divider';
        hoverActions.appendChild(divider);
      }

      if (canEdit) {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Редактировать';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          startEditMessage(msgId, msg.content || '', msg.timestamp);
        });
        hoverActions.appendChild(editBtn);
      }

      if (canDelete) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'msg-action-btn delete';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Удалить';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteMessage(msgId, msg.timestamp, msg.username);
        });
        hoverActions.appendChild(deleteBtn);
      }

      // Pin Message Button
      const pinBtn = document.createElement('button');
      pinBtn.className = 'msg-action-btn';
      pinBtn.innerHTML = '📌';
      pinBtn.title = 'Закрепить сообщение вверху';
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pinMessageInCurrentRoom(msg);
      });
      hoverActions.appendChild(pinBtn);

      // Save Message / Forward to Saved Messages Button
      const saveMsgBtn = document.createElement('button');
      saveMsgBtn.className = 'msg-action-btn';
      saveMsgBtn.innerHTML = '🔖';
      saveMsgBtn.title = 'Сохранить в Избранное';
      saveMsgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        forwardToSavedMessages(msg);
      });
      hoverActions.appendChild(saveMsgBtn);

      // Thread Action Button
      const threadBtn = document.createElement('button');
      threadBtn.className = 'msg-action-btn';
      threadBtn.innerHTML = '💬';
      threadBtn.title = 'Открыть обсуждение в треде';
      threadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openThreadPanel(msg);
      });
      hoverActions.appendChild(threadBtn);

      // Reply Button
      const replyBtn = document.createElement('button');
      replyBtn.className = 'msg-action-btn';
      replyBtn.innerHTML = '↩️';
      replyBtn.title = 'Ответить на сообщение';
      replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const snippet = msg.content || (msg.isVoice ? '🎤 Голосовое сообщение' : (msg.fileName ? `📎 ${msg.fileName}` : 'Сообщение'));
        setReplyToMessage(msgId, msg.username || 'Пользователь', snippet, msg.timestamp);
      });
      hoverActions.appendChild(replyBtn);

      card.appendChild(hoverActions);

      let replyQuoteHtml = '';
      if (msg.replyTo) {
        const replyAuthor = escapeHtml(msg.replyTo.username || 'Пользователь');
        const replyText = escapeHtml(msg.replyTo.content || 'Сообщение');
        const targetId = msg.replyTo.id || '';
        const targetTs = msg.replyTo.timestamp || '';
        replyQuoteHtml = `
          <div class="msg-reply-quote" onclick="scrollToMessage('${targetId}', '${targetTs}')" title="Нажмите, чтобы перейти к оригиналу">
            <div class="msg-reply-author">↩️ ${replyAuthor}</div>
            <div class="msg-reply-text">${replyText}</div>
          </div>
        `;
      }

      let contentHtml = '';
      if (msg.content) {
        contentHtml += `
          <div class="msg-text-container">
            <div class="msg-text">${escapeHtml(msg.content)} ${msg.isEdited ? '<span class="msg-edited-tag">(изменено)</span>' : ''}</div>
          </div>
        `;
      }

      // POLL / QUIZ RENDERING
      if (msg.poll) {
        const poll = msg.poll;
        const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
        const isQuiz = Boolean(poll.isQuiz);
        let optionsHtml = '';

        poll.options.forEach(opt => {
          const votes = opt.votes || [];
          const voteCount = votes.length;
          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const hasVoted = votes.includes(state.username);
          const isCorrect = isQuiz && poll.correctOptionId === opt.id;
          const quizClass = (isQuiz && hasVoted && isCorrect) ? 'correct-quiz' : '';

          optionsHtml += `
            <div class="poll-option-btn ${hasVoted ? 'voted' : ''} ${quizClass}" onclick="votePoll('${msgId}', ${opt.id})">
              <div class="poll-option-bar" style="width: ${pct}%"></div>
              <span class="poll-option-text">${hasVoted ? '✓ ' : ''}${escapeHtml(opt.text)}</span>
              <span class="poll-option-percent">${voteCount} (${pct}%)</span>
            </div>
          `;
        });

        contentHtml += `
          <div class="poll-card">
            <div class="poll-title">${isQuiz ? '🎯 Викторина: ' : '📊 Опрос: '}${escapeHtml(poll.question)}</div>
            <div class="poll-options-list">${optionsHtml}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; display:flex; justify-content:space-between; align-items:center;">
              <span>Всего голосов: ${totalVotes}</span>
              ${isQuiz ? '<span style="color:var(--accent-cyan); font-weight:700;">🎯 Викторина</span>' : ''}
            </div>
          </div>
        `;
      }

      // THREAD COUNTER BUTTON
      const threadCount = msg.threadCount || (msg.threadReplies ? msg.threadReplies.length : 0);
      let threadBadgeHtml = '';
      if (threadCount > 0 || msg.threadReplies) {
        threadBadgeHtml = `
          <div style="margin-top: 6px;" class="thread-badge-wrap">
            <button onclick="openThreadPanelById('${msgId}')" style="background: rgba(139, 92, 246, 0.15); border: 1px solid var(--border-glow); color: var(--accent-purple); font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              💬 ${threadCount} ${threadCount === 1 ? 'ответ в треде' : 'ответов в треде'}
            </button>
          </div>
        `;
      }

      let pendingVoiceId = null;
      if (msg.isVoice || (msg.fileData && (msg.fileType === 'audio' || msg.fileData.startsWith('data:audio')))) {
        const voiceId = 'audio_' + Math.random().toString(36).substring(2, 9);
        pendingVoiceId = voiceId;
        const initialDur = (msg.duration && msg.duration !== '00:05') ? msg.duration : '00:00';

        let barsHtml = '';
        const numBars = 28;
        for (let i = 0; i < numBars; i++) {
          const barHeight = ((i * 7 + voiceId.charCodeAt(i % voiceId.length)) % 13) + 5;
          barsHtml += `<div class="tg-wave-bar" style="height:${barHeight}px;"></div>`;
        }

        contentHtml += `
          <div class="voice-msg-card" id="card_${voiceId}">
            <button class="voice-play-btn" id="btn_${voiceId}" onclick="toggleVoicePlay('${voiceId}')" title="Воспроизвести">▶</button>
            <div class="voice-body">
              <div class="tg-wave-visual" id="wave_${voiceId}" onclick="seekVoicePlay(event, '${voiceId}')">
                ${barsHtml}
              </div>
              <div class="voice-info-row" style="display:flex; justify-content:space-between; align-items:center; gap: 6px;">
                <span class="voice-duration" id="dur_${voiceId}">${escapeHtml(initialDur)}</span>
                <div style="display:flex; align-items:center; gap:6px;">
                  <button class="voice-transcribe-btn" id="speed_btn_${voiceId}" onclick="cycleVoiceSpeed('${voiceId}')" title="Изменить скорость воспроизведения" style="padding:2px 8px; font-weight:800; color:var(--accent-cyan);">
                    1x
                  </button>
                  <button class="voice-transcribe-btn" id="transcribe_btn_${voiceId}" onclick="transcribeAudioMessage('${voiceId}')" title="Расшифровать голосом через AI">
                    📝 <span class="transcribe-text">Расшифровать</span>
                  </button>
                </div>
              </div>
              <div class="transcription-box" id="transcribe_box_${voiceId}" style="display:none;"></div>
            </div>
            <audio id="${voiceId}" src="${msg.fileData}" preload="metadata" style="display:none;"></audio>
          </div>
        `;
      } else if (msg.fileData) {
        if (msg.fileType === 'image') {
          contentHtml += `
            <div class="msg-image-preview" onclick="openLightbox('${msg.fileData}')">
              <img src="${msg.fileData}" alt="${escapeHtml(msg.fileName || 'Image')}" loading="lazy" />
            </div>
          `;
        } else {
          contentHtml += `
            <div class="msg-file-card">
              <div class="msg-file-icon">📁</div>
              <div class="msg-file-details">
                <div class="msg-file-name">${escapeHtml(msg.fileName || 'Файл')}</div>
                <div class="msg-file-size">${msg.fileSize || ''}</div>
              </div>
              <a href="${msg.fileData}" download="${escapeHtml(msg.fileName || 'file')}" class="msg-file-download-btn">
                <span>Скачать</span>
              </a>
            </div>
          `;
        }
      }

      const mainContent = document.createElement('div');
      mainContent.style.display = 'flex';
      mainContent.style.gap = '14px';
      mainContent.style.width = '100%';

      const uObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === (msg.username || '').toLowerCase());
      const isMsgVip = Boolean(msg.isVip || (uObj && uObj.isVip) || ((msg.username || '').toLowerCase() === state.username.toLowerCase() && state.isVip));
      const crownMarkup = isMsgVip ? ' <span class="vip-crown" title="VIP пользователь">👑</span>' : '';

      const avatarMarkup = `<div style="cursor:pointer;" onclick="openUserProfileModal('${escapeHtml(msg.username || '')}')" title="Нажмите, чтобы открыть профиль">${getAvatarHtml(msg.username, color, msg.avatarUrl, 38)}</div>`;

      const isDmRoom = (msg.room && msg.room.startsWith('DM:')) || (state.currentRoom && state.currentRoom.startsWith('DM:'));
      let readTickHtml = '';
      if (isDmRoom && isOwnerOrAuthor) {
        if (msg.isRead) {
          readTickHtml = `<span class="read-receipt-tick" style="color:var(--accent-cyan); font-weight:700; margin-left:4px; font-size:12px;" title="Прочитано">✓✓</span>`;
        } else {
          readTickHtml = `<span class="read-receipt-tick" style="opacity:0.6; margin-left:4px; font-size:12px;" title="Отправлено">✓</span>`;
        }
      }

      mainContent.innerHTML = `
        ${avatarMarkup}
        <div class="msg-content-wrapper">
          <div class="msg-header">
            <span class="msg-username" style="color:${color}; cursor:pointer;" onclick="openUserProfileModal('${escapeHtml(msg.username || '')}')" title="Нажмите, чтобы открыть профиль">${escapeHtml(msg.username || 'Аноним')}${crownMarkup}</span>
            <span class="msg-time">${msg.timestamp || ''}${readTickHtml}</span>
          </div>
          ${replyQuoteHtml}
          ${contentHtml}
          ${threadBadgeHtml}
          <div class="msg-reactions-row"></div>
        </div>
      `;

      card.appendChild(mainContent);

      const reactionsRow = card.querySelector('.msg-reactions-row');
      if (reactionsRow && msg.reactions) {
        renderReactionsContent(reactionsRow, msg.reactions, msgId, msg.timestamp, msg.content);
      }

      messagesContainer.appendChild(card);

      if (pendingVoiceId) {
        setTimeout(() => window.initVoiceAudioEvents(pendingVoiceId), 50);
      }
    }

    function formatAudioTime(sec) {
      if (!sec || isNaN(sec) || sec === Infinity) return '00:00';
      const mins = Math.floor(sec / 60);
      const secs = Math.floor(sec % 60);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    window.initVoiceAudioEvents = function(voiceId) {
      const audio = document.getElementById(voiceId);
      const durLabel = document.getElementById('dur_' + voiceId);
      const waveVisual = document.getElementById('wave_' + voiceId);
      if (!audio || audio.dataset.inited) return;
      audio.dataset.inited = 'true';

      const updateDur = () => {
        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
          if (durLabel) durLabel.textContent = formatAudioTime(audio.duration);
        }
      };

      audio.addEventListener('loadedmetadata', updateDur);
      audio.addEventListener('durationchange', updateDur);
      if (audio.readyState >= 1) updateDur();

      audio.addEventListener('timeupdate', () => {
        if (!audio.duration || isNaN(audio.duration)) return;
        const cur = audio.currentTime;
        const dur = audio.duration;
        const pct = cur / dur;

        if (durLabel) {
          durLabel.textContent = `${formatAudioTime(cur)} / ${formatAudioTime(dur)}`;
        }

        if (waveVisual) {
          const bars = waveVisual.querySelectorAll('.tg-wave-bar');
          const totalBars = bars.length;
          const activeIndex = Math.floor(pct * totalBars);
          bars.forEach((b, idx) => {
            if (idx <= activeIndex && cur > 0) {
              b.classList.add('active');
            } else {
              b.classList.remove('active');
            }
          });
        }
      });
    };

    window.seekVoicePlay = function(e, voiceId) {
      const audio = document.getElementById(voiceId);
      const waveVisual = document.getElementById('wave_' + voiceId);
      if (!audio || !waveVisual || !audio.duration) return;

      const rect = waveVisual.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      audio.currentTime = pct * audio.duration;
    };

    window.toggleVoicePlay = function(audioId) {
      const audio = document.getElementById(audioId);
      const btn = document.getElementById('btn_' + audioId);
      const card = document.getElementById('card_' + audioId);
      const durLabel = document.getElementById('dur_' + audioId);
      const waveVisual = document.getElementById('wave_' + audioId);
      if (!audio || !btn || !card) return;

      window.initVoiceAudioEvents(audioId);

      if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => {
          if (a !== audio) {
            a.pause();
            const b = document.getElementById('btn_' + a.id);
            const c = document.getElementById('card_' + a.id);
            if (b) b.textContent = '▶';
            if (c) c.classList.remove('playing');
          }
        });

        audio.play().then(() => {
          btn.textContent = '⏸';
          card.classList.add('playing');
        }).catch(err => console.error('Audio play error:', err));
      } else {
        audio.pause();
        btn.textContent = '▶';
        card.classList.remove('playing');
      }

      audio.onended = () => {
        btn.textContent = '▶';
        card.classList.remove('playing');
        if (waveVisual) {
          waveVisual.querySelectorAll('.tg-wave-bar').forEach(b => b.classList.remove('active'));
        }
        if (durLabel && audio.duration) {
          durLabel.textContent = formatAudioTime(audio.duration);
        }
      };
    };

    function renderSystemMessage(text) {
      if (!text) return;
      renderSystemCallMessage({ content: text, type: 'system' });
    }

    // ==========================================================================
    // SCROLLING & LIGHTBOX
    // ==========================================================================
    messagesContainer.addEventListener('scroll', () => {
      const threshold = 120;
      const position = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
      state.userIsScrolledUp = position > threshold;
      if (!state.userIsScrolledUp) {
        scrollDownBadge.classList.remove('visible');
      }
    });

    scrollDownBadge.addEventListener('click', () => scrollToBottom(true));

    function scrollToBottom(smooth = true) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      scrollDownBadge.classList.remove('visible');
    }

    window.openLightbox = function(src) {
      lightboxImg.src = src;
      lightboxModal.classList.add('active');
    };

    closeLightboxBtn.addEventListener('click', () => {
      lightboxModal.classList.remove('active');
    });
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) lightboxModal.classList.remove('active');
    });

    // ==========================================================================
    // ATTACHMENTS & SEND MESSAGE
    // ==========================================================================
    attachFileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 200 * 1024 * 1024) {
        alert('Размер файла не должен превышать 200 МБ');
        fileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        const isImage = file.type.startsWith('image/');
        const formattedSize = formatBytes(file.size);

        state.pendingFile = {
          name: file.name,
          size: formattedSize,
          type: isImage ? 'image' : 'file',
          data: dataUrl
        };

        // Render preview
        previewMediaContainer.innerHTML = '';
        if (isImage) {
          const img = document.createElement('img');
          img.src = dataUrl;
          img.className = 'preview-thumb';
          previewMediaContainer.appendChild(img);
        } else {
          const icon = document.createElement('div');
          icon.className = 'preview-icon-box';
          icon.textContent = '📄';
          previewMediaContainer.appendChild(icon);
        }

        previewFileName.textContent = file.name;
        previewFileSize.textContent = formattedSize;
        attachmentPreviewBar.classList.add('active');
      };

      reader.readAsDataURL(file);
    });

    cancelAttachmentBtn.addEventListener('click', clearPendingFile);

    function clearPendingFile() {
      state.pendingFile = null;
      fileInput.value = '';
      attachmentPreviewBar.classList.remove('active');
    }

    sendMessageBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    state.replyingTo = null;

    function setReplyToMessage(msgId, authorName, contentSnippet, timestamp) {
      state.replyingTo = {
        id: msgId,
        username: authorName,
        content: contentSnippet,
        timestamp: timestamp
      };

      const replyBar = document.getElementById('replyPreviewBar');
      const authorEl = document.getElementById('replyPreviewAuthor');
      const textEl = document.getElementById('replyPreviewText');

      if (replyBar && authorEl && textEl) {
        authorEl.innerHTML = `↩️ Ответ для <span style="color:var(--text-main);margin-left:4px;">${escapeHtml(authorName)}</span>`;
        textEl.textContent = contentSnippet;
        replyBar.style.display = 'flex';
      }

      const chatInput = document.getElementById('chatInput');
      if (chatInput) chatInput.focus();
    }

    function cancelReplyToMessage() {
      state.replyingTo = null;
      const replyBar = document.getElementById('replyPreviewBar');
      if (replyBar) replyBar.style.display = 'none';
    }

    function scrollToMessage(targetId, timestamp) {
      let card = targetId ? document.querySelector(`[data-msg-id="${targetId}"]`) : null;
      if (!card && timestamp) {
        card = Array.from(document.querySelectorAll('.message-card')).find(c => c.dataset.msgTimestamp === timestamp);
      }
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('msg-highlight-pulse');
        setTimeout(() => card.classList.remove('msg-highlight-pulse'), 1500);
      }
    }

    const cancelReplyBtn = document.getElementById('cancelReplyBtn');
    if (cancelReplyBtn) {
      cancelReplyBtn.addEventListener('click', cancelReplyToMessage);
    }

    function handleSendMessage() {
      const text = chatInput.value.trim();
      const hasFile = state.pendingFile !== null;

      if (!text && !hasFile) return;

      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        alert('Соединение с сервером не установлено. Попробуйте обновить страницу.');
        return;
      }

      const payload = {
        type: 'chat',
        content: text,
        room: state.currentRoom
      };

      if (state.replyingTo) {
        payload.replyTo = {
          id: state.replyingTo.id,
          username: state.replyingTo.username,
          content: state.replyingTo.content,
          timestamp: state.replyingTo.timestamp
        };
      }

      if (hasFile) {
        payload.fileName = state.pendingFile.name;
        payload.fileType = state.pendingFile.type;
        payload.fileData = state.pendingFile.data;
        payload.fileSize = state.pendingFile.size;
      }

      sendPayload(payload);

      chatInput.value = '';
      clearPendingFile();
      cancelReplyToMessage();
      scrollToBottom(true);
    }

    // ==========================================================================
    // ADD BY USERNAME & CREATE ROOM MODAL
    // ==========================================================================
    if (addByUsernameBtn) {
      const handleAddByNick = () => {
        const raw = addByUsernameInput ? addByUsernameInput.value.trim() : '';
        if (!raw) return;
        const nick = raw.replace(/^@/, '').trim();
        if (!nick) return;

        if (nick.toLowerCase() === state.username.toLowerCase()) {
          alert('Нельзя создать личный чат с самим собой!');
          return;
        }

        startDirectMessageWith(nick);
        if (addByUsernameInput) addByUsernameInput.value = '';
      };
      addByUsernameBtn.addEventListener('click', handleAddByNick);
      if (addByUsernameInput) {
        addByUsernameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleAddByNick();
        });
      }
    }

    openCreateRoomModalBtn.addEventListener('click', () => {
      newRoomNameInput.value = '';
      if (createRoomMembersList) {
        createRoomMembersList.innerHTML = '';
        const otherUsers = state.allRegisteredUsers.filter(u => u.username.toLowerCase() !== state.username.toLowerCase());
        if (otherUsers.length === 0) {
          createRoomMembersList.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:4px;">Нет доступных пользователей</div>';
        } else {
          otherUsers.forEach(u => {
            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;border-radius:4px;font-size:13px;color:var(--text-main);';
            lbl.innerHTML = `
              <input type="checkbox" class="room-member-cb" value="${escapeHtml(u.username)}" style="accent-color:var(--accent-purple);" />
              <span style="width:8px;height:8px;border-radius:50%;background:${u.isOnline ? 'var(--accent-green)' : 'var(--accent-gray)'}"></span>
              <span>${escapeHtml(u.username)}</span>
            `;
            createRoomMembersList.appendChild(lbl);
          });
        }
      }
      createRoomModal.classList.add('active');
      setTimeout(() => newRoomNameInput.focus(), 100);
    });

    closeCreateRoomModalBtn.addEventListener('click', () => {
      createRoomModal.classList.remove('active');
    });

    confirmCreateRoomBtn.addEventListener('click', handleCreateRoom);
    newRoomNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCreateRoom();
    });

    function handleCreateRoom() {
      const name = newRoomNameInput.value.trim();
      if (!name) return;

      const checkedCbs = document.querySelectorAll('.room-member-cb:checked');
      const members = Array.from(checkedCbs).map(cb => cb.value);

      const isAnnouncementCb = document.getElementById('createRoomIsAnnouncement');
      const isAnnouncement = isAnnouncementCb ? isAnnouncementCb.checked : false;

      sendPayload({
        type: 'create_group',
        room: name,
        members: members,
        isAnnouncement: isAnnouncement
      });

      createRoomModal.classList.remove('active');
      if (isAnnouncementCb) isAnnouncementCb.checked = false;
      // Automatically switch to new room
      setTimeout(() => switchRoom(name), 150);
    }

    // ==========================================================================
    // VOICE RECORDING LOGIC
    // ==========================================================================
    if (voiceRecordBtn) {
      voiceRecordBtn.addEventListener('click', startVoiceRecording);
      cancelVoiceRecordBtn.addEventListener('click', cancelVoiceRecording);
      sendVoiceRecordBtn.addEventListener('click', stopAndSendVoiceRecording);
    }

    async function startVoiceRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.audioChunks = [];
        state.mediaRecorder = new MediaRecorder(stream);

        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.audioChunks.push(e.data);
        };

        state.mediaRecorder.start();
        voiceRecordingBar.classList.add('active');

        state.voiceStartTime = Date.now();
        voiceRecordingTimer.textContent = '00:00';
        state.voiceTimerInterval = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - state.voiceStartTime) / 1000);
          const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');
          voiceRecordingTimer.textContent = `${mins}:${secs}`;
        }, 1000);
      } catch (err) {
        alert('Не удалось получить доступ к микрофону: ' + err.message);
      }
    }

    function cancelVoiceRecording() {
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      clearInterval(state.voiceTimerInterval);
      voiceRecordingBar.classList.remove('active');
      state.audioChunks = [];
    }

    function stopAndSendVoiceRecording() {
      if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;

      const elapsedSec = Math.max(1, Math.floor((Date.now() - (state.voiceStartTime || Date.now())) / 1000));
      const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      const durationStr = `${mins}:${secs}`;

      state.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop());

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          sendPayload({
            type: 'chat',
            content: '',
            room: state.currentRoom,
            fileData: base64Audio,
            fileType: 'audio',
            isVoice: true,
            duration: durationStr
          });
        };
        reader.readAsDataURL(audioBlob);

        clearInterval(state.voiceTimerInterval);
        voiceRecordingBar.classList.remove('active');
        state.audioChunks = [];
      };

      state.mediaRecorder.stop();
    }

    // ==========================================================================
    // GROUP SETTINGS MANAGEMENT
    // ==========================================================================
    if (openGroupSettingsBtn) {
      openGroupSettingsBtn.addEventListener('click', () => {
        if (!state.currentGroupInfo) return;
        editGroupNameInput.value = state.currentGroupInfo.name || state.currentRoom;
        renderGroupMembersManager();
        groupSettingsModal.classList.add('active');
      });
    }

    if (closeGroupSettingsModalBtn) {
      closeGroupSettingsModalBtn.addEventListener('click', () => {
        groupSettingsModal.classList.remove('active');
      });
    }

    if (saveGroupNameBtn) {
      saveGroupNameBtn.addEventListener('click', () => {
        const newName = editGroupNameInput.value.trim();
        if (!newName || !state.currentRoom) return;

        sendPayload({
          type: 'update_group_info',
          room: state.currentRoom,
          newName: newName
        });
      });
    }

    if (groupAddMemberBtn) {
      groupAddMemberBtn.addEventListener('click', () => {
        const targetUser = groupAddMemberSelect.value;
        if (!targetUser || !state.currentRoom) return;

        sendPayload({
          type: 'manage_group_role',
          room: state.currentRoom,
          targetUser: targetUser,
          action: 'add_member'
        });
      });
    }

    function renderGroupMembersManager() {
      if (!groupMembersManagerList || !state.currentGroupInfo) return;
      groupMembersManagerList.innerHTML = '';

      const info = state.currentGroupInfo;
      const ownerLower = (info.owner || '').toLowerCase();
      const adminsLower = (info.admins || []).map(a => a.toLowerCase());
      const members = info.members || [];
      const userLower = state.username.toLowerCase();
      const isMeOwner = ownerLower === userLower;
      const isMeAdmin = adminsLower.includes(userLower);

      members.forEach(m => {
        const mLower = m.toLowerCase();
        const isMOwner = mLower === ownerLower;
        const isMAdmin = adminsLower.includes(mLower);

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: rgba(255,255,255,0.04); border-radius: 6px; font-size: 13px; color: var(--text-main);';

        let badgeHtml = '<span class="role-badge" style="background: rgba(255,255,255,0.1); color: var(--text-muted);">Участник</span>';
        if (isMOwner) {
          badgeHtml = '<span class="role-badge owner">👑 Создатель</span>';
        } else if (isMAdmin) {
          badgeHtml = '<span class="role-badge admin">🛡️ Админ</span>';
        }

        let actionsHtml = '';
        if ((isMeOwner || isMeAdmin) && !isMOwner && mLower !== userLower) {
          if (isMeOwner && !isMAdmin) {
            actionsHtml += `<button class="ripple-btn" onclick="manageGroupRole('${escapeHtml(m)}', 'promote_admin')" style="font-size:11px; padding:3px 8px; height:auto; margin:0; background:rgba(59,130,246,0.3);">+ Админ</button>`;
          } else if (isMeOwner && isMAdmin) {
            actionsHtml += `<button class="cancel-btn" onclick="manageGroupRole('${escapeHtml(m)}', 'demote_admin')" style="font-size:11px; padding:3px 8px; margin:0;">- Снять админа</button>`;
          }

          actionsHtml += `<button class="cancel-btn" onclick="manageGroupRole('${escapeHtml(m)}', 'kick_member')" style="font-size:11px; padding:3px 8px; margin:0; color:#ef4444; border-color:rgba(239,68,68,0.3);">❌ Исключить</button>`;
        }

        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>@${escapeHtml(m)}</span>
            ${badgeHtml}
          </div>
          <div style="display: flex; gap: 6px;">
            ${actionsHtml}
          </div>
        `;
        groupMembersManagerList.appendChild(row);
      });

      // Populate add member select
      if (groupAddMemberSelect) {
        groupAddMemberSelect.innerHTML = '';
        const nonMembers = state.allRegisteredUsers.filter(u => !members.map(x => x.toLowerCase()).includes(u.username.toLowerCase()));
        if (nonMembers.length === 0) {
          groupAddMemberSelect.innerHTML = '<option value="">Все зарегистрированные уже в группе</option>';
        } else {
          nonMembers.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.username;
            opt.textContent = `@${u.username}`;
            groupAddMemberSelect.appendChild(opt);
          });
        }
      }
    }

    window.manageGroupRole = function(targetUser, action) {
      if (!state.currentRoom) return;
      sendPayload({
        type: 'manage_group_role',
        room: state.currentRoom,
        targetUser: targetUser,
        action: action
      });
    };

    // Helper functions
    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, (m) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Avatar Helpers
    function getAvatarHtml(username, color, avatarUrl, sizePx = 36, extraStyle = '', disableRing = false) {
      const u = username || '?';
      const initial = u.charAt(0).toUpperCase();
      const bg = color || avatarColors[u.length % avatarColors.length];
      const sizeStyle = `width:${sizePx}px; height:${sizePx}px; min-width:${sizePx}px; min-height:${sizePx}px; border-radius:50%; flex-shrink:0;`;

      const uObj = (state.allRegisteredUsers || []).find(user => user.username && user.username.toLowerCase() === u.toLowerCase());
      const hasStory = !disableRing && ((uObj && uObj.hasStory) || (u.toLowerCase() === state.username.toLowerCase() && Boolean(state.story)));

      let avatarMarkup = '';
      if (avatarUrl) {
        avatarMarkup = `<img src="${avatarUrl}" alt="${u}" style="${sizeStyle} object-fit:cover; border:1px solid var(--border-glow); ${extraStyle}" onerror="this.onerror=null; this.replaceWith(createFallbackAvatarElement('${u}', '${bg}', ${sizePx}))" />`;
      } else {
        avatarMarkup = `<div style="${sizeStyle} background:${bg}; display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--text-main); font-size:${Math.round(sizePx * 0.42)}px; box-shadow:0 2px 8px rgba(0,0,0,0.3); ${extraStyle}">${initial}</div>`;
      }

      if (hasStory) {
        return `<div class="story-avatar-ring" onclick="event.stopPropagation(); window.openStoryModalForUser('${escapeHtml(u)}')" title="Смотреть сторис ${escapeHtml(u)}">${avatarMarkup}</div>`;
      }

      return avatarMarkup;
    }

    function createFallbackAvatarElement(username, bg, sizePx) {
      const div = document.createElement('div');
      div.style.cssText = `width:${sizePx}px; height:${sizePx}px; min-width:${sizePx}px; min-height:${sizePx}px; border-radius:50%; flex-shrink:0; background:${bg}; display:flex; align-items:center; justify-content:center; font-weight:800; color:var(--text-main); font-size:${Math.round(sizePx * 0.42)}px; box-shadow:0 2px 8px rgba(0,0,0,0.3);`;
      div.textContent = (username || '?').charAt(0).toUpperCase();
      return div;
    }

    function updateMyAvatarDisplay() {
      if (myAvatar) {
        myAvatar.innerHTML = getAvatarHtml(state.username, state.color, state.avatarUrl, 42);
      }
      const previewEl = document.getElementById('settingsAvatarPreview');
      if (previewEl) {
        previewEl.innerHTML = getAvatarHtml(state.username, state.color, state.avatarUrl, 64);
      }
    }

    // Avatar Upload Listeners
    const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
    const avatarFileInput = document.getElementById('avatarFileInput');
    const avatarUrlInput = document.getElementById('avatarUrlInput');
    const removeAvatarBtn = document.getElementById('removeAvatarBtn');

    if (uploadAvatarBtn && avatarFileInput) {
      uploadAvatarBtn.addEventListener('click', () => avatarFileInput.click());
      avatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 200;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            state.avatarUrl = dataUrl;
            updateMyAvatarDisplay();
            sendPayload({ type: 'update_avatar', avatarUrl: dataUrl });
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    if (avatarUrlInput) {
      avatarUrlInput.addEventListener('change', () => {
        const url = avatarUrlInput.value.trim();
        state.avatarUrl = url;
        updateMyAvatarDisplay();
        sendPayload({ type: 'update_avatar', avatarUrl: url });
      });
    }

    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener('click', () => {
        state.avatarUrl = '';
        if (avatarUrlInput) avatarUrlInput.value = '';
        updateMyAvatarDisplay();
        sendPayload({ type: 'update_avatar', avatarUrl: '' });
      });
    }

    // ==========================================================================
    // TYPING INDICATOR LOGIC
    // ==========================================================================
    function showTypingIndicator(username) {
      if (!username || username === state.username) return;
      const typingIndicatorBar = document.getElementById('typingIndicatorBar');
      const typingText = document.getElementById('typingText');
      if (!typingIndicatorBar || !typingText) return;

      if (state.typingMap.has(username)) {
        clearTimeout(state.typingMap.get(username));
      }

      const timeoutId = setTimeout(() => {
        state.typingMap.delete(username);
        updateTypingIndicatorDisplay();
      }, 3000);

      state.typingMap.set(username, timeoutId);
      updateTypingIndicatorDisplay();
    }

    function updateTypingIndicatorDisplay() {
      const typingIndicatorBar = document.getElementById('typingIndicatorBar');
      const typingText = document.getElementById('typingText');
      if (!typingIndicatorBar || !typingText) return;

      const users = Array.from(state.typingMap.keys());
      if (users.length === 0) {
        typingIndicatorBar.classList.remove('visible');
        typingIndicatorBar.style.display = 'none';
      } else {
        const text = users.length === 1 
          ? `💬 ${escapeHtml(users[0])} печатает...` 
          : `💬 ${users.map(escapeHtml).join(', ')} печатают...`;
        typingText.textContent = text;
        typingIndicatorBar.style.display = 'flex';
        typingIndicatorBar.classList.add('visible');
      }
    }

    let lastTypingPayloadTime = 0;
    if (chatInput) {
      chatInput.addEventListener('input', () => {
        const now = Date.now();
        if (now - lastTypingPayloadTime > 1500) {
          lastTypingPayloadTime = now;
          sendPayload({ type: 'typing', room: state.currentRoom });
        }
      });
    }

    // ==========================================================================
    // BLOCK / UNBLOCK LOGIC
    // ==========================================================================
    function toggleBlockUser(targetUsername) {
      if (!targetUsername) return;
      sendPayload({ type: 'toggle_block_user', targetUsername: targetUsername });
    }

    // ==========================================================================
    // ACCOUNT DELETION LOGIC
    // ==========================================================================
    const btnDeleteAccount = document.getElementById('btnDeleteAccount');
    const confirmDeleteAccountModal = document.getElementById('confirmDeleteAccountModal');
    const btnCancelAccountDeletion = document.getElementById('btnCancelAccountDeletion');
    const btnConfirmAccountDeletion = document.getElementById('btnConfirmAccountDeletion');

    if (btnDeleteAccount) {
      btnDeleteAccount.addEventListener('click', () => {
        if (confirmDeleteAccountModal) confirmDeleteAccountModal.classList.add('active');
      });
    }

    if (btnCancelAccountDeletion) {
      btnCancelAccountDeletion.addEventListener('click', () => {
        if (confirmDeleteAccountModal) confirmDeleteAccountModal.classList.remove('active');
      });
    }

    if (btnConfirmAccountDeletion) {
      btnConfirmAccountDeletion.addEventListener('click', () => {
        sendPayload({ type: 'delete_account' });
        if (confirmDeleteAccountModal) confirmDeleteAccountModal.classList.remove('active');
      });
    }

    // ==========================================================================
    // PWA & NOTIFICATIONS TUTORIAL LOGIC
    // ==========================================================================
    function isStandalonePwa() {
      return Boolean(
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://')
      );
    }

    function updateNotificationToggleUI() {
      const isPwa = isStandalonePwa();
      const toggle = document.getElementById('pwaNotificationToggle');
      const badge = document.getElementById('pwaStatusBadge');

      if (toggle) {
        if (isPwa) {
          toggle.disabled = false;
          if (badge) {
            badge.innerHTML = '🟢 Доступно';
            badge.style.background = 'rgba(16, 185, 129, 0.15)';
            badge.style.color = '#10b981';
            badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          }
        } else {
          toggle.disabled = true;
          toggle.checked = false;
          if (badge) {
            badge.innerHTML = '🔒 Требуется веб-приложение';
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#ef4444';
            badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
          }
        }
      }
    }

    const pwaNotificationRow = document.getElementById('pwaNotificationRow');
    const pwaNotificationToggle = document.getElementById('pwaNotificationToggle');

    if (pwaNotificationRow) {
      pwaNotificationRow.addEventListener('click', (e) => {
        if (!isStandalonePwa()) {
          e.preventDefault();
          const tutBox = document.getElementById('pwaTutorialBox');
          if (tutBox) {
            tutBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            tutBox.classList.remove('shake-tutorial-anim');
            void tutBox.offsetWidth;
            tutBox.classList.add('shake-tutorial-anim');
          }
        } else if (e.target !== pwaNotificationToggle && pwaNotificationToggle && !pwaNotificationToggle.disabled) {
          pwaNotificationToggle.checked = !pwaNotificationToggle.checked;
          if (pwaNotificationToggle.checked && 'Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
          }
        }
      });
    }

    if (pwaNotificationToggle) {
      pwaNotificationToggle.addEventListener('change', () => {
        if (pwaNotificationToggle.checked && 'Notification' in window && Notification.permission !== 'granted') {
          Notification.requestPermission();
        }
      });
    }

    updateNotificationToggleUI();

    // ==========================================================================
    // VIP & STORIES LOGIC
    // ==========================================================================
    function updateVipUI() {
      const toggleVipBtn = document.getElementById('toggleVipBtn');
      const vipStatusBadge = document.getElementById('vipStatusBadge');
      const vipStoriesSection = document.getElementById('vipStoriesSection');

      if (toggleVipBtn) {
        toggleVipBtn.textContent = state.isVip ? 'Деактивировать VIP' : 'Активировать VIP';
        toggleVipBtn.style.background = state.isVip 
          ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
          : 'linear-gradient(135deg, #f59e0b, #d97706)';
      }
      if (vipStatusBadge) {
        vipStatusBadge.style.display = state.isVip ? 'block' : 'none';
      }
      if (vipStoriesSection) {
        vipStoriesSection.style.display = state.isVip ? 'block' : 'none';
      }
    }

    const toggleVipBtn = document.getElementById('toggleVipBtn');
    const vipPasswordModal = document.getElementById('vipPasswordModal');
    const vipPasswordInput = document.getElementById('vipPasswordInput');
    const submitVipPasswordBtn = document.getElementById('submitVipPasswordBtn');
    const cancelVipPasswordBtn = document.getElementById('cancelVipPasswordBtn');

    if (toggleVipBtn) {
      toggleVipBtn.addEventListener('click', () => {
        if (state.isVip) {
          sendPayload({ type: 'deactivate_vip' });
        } else {
          if (vipPasswordInput) vipPasswordInput.value = '';
          if (vipPasswordModal) vipPasswordModal.classList.add('active');
        }
      });
    }

    if (submitVipPasswordBtn) {
      submitVipPasswordBtn.addEventListener('click', () => {
        const pwd = vipPasswordInput ? vipPasswordInput.value.trim() : '';
        if (pwd === 'caREND') {
          sendPayload({ type: 'activate_vip', password: pwd });
          if (vipPasswordModal) vipPasswordModal.classList.remove('active');
        } else {
          alert('Неверный пароль для активации VIP!');
        }
      });
    }

    if (cancelVipPasswordBtn) {
      cancelVipPasswordBtn.addEventListener('click', () => {
        if (vipPasswordModal) vipPasswordModal.classList.remove('active');
      });
    }

    // Story Upload
    const uploadStoryBtn = document.getElementById('uploadStoryBtn');
    const storyVideoInput = document.getElementById('storyVideoInput');
    const storyUploadStatus = document.getElementById('storyUploadStatus');

    if (uploadStoryBtn && storyVideoInput) {
      uploadStoryBtn.addEventListener('click', () => {
        const file = storyVideoInput.files[0];
        if (!file) {
          alert('Выберите видеофайл для публикации!');
          return;
        }
        if (file.size > 200 * 1024 * 1024) {
          alert('Размер видеофайла не должен превышать 200 МБ!');
          return;
        }
        if (storyUploadStatus) {
          storyUploadStatus.style.display = 'block';
          storyUploadStatus.textContent = '⏳ Опубликование видео-сторис...';
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          sendPayload({
            type: 'upload_story',
            videoData: e.target.result,
            fileType: file.type || 'video/mp4'
          });
          if (storyUploadStatus) {
            storyUploadStatus.textContent = '✅ Сторис успешно опубликована!';
            setTimeout(() => { storyUploadStatus.style.display = 'none'; }, 3000);
          }
          storyVideoInput.value = '';
        };
        reader.readAsDataURL(file);
      });
    }

    // Story Viewer Modal
    window.openStoryModalForUser = function(username) {
      const uObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
      let storyData = uObj ? uObj.story : null;
      if (username.toLowerCase() === state.username.toLowerCase() && state.story) {
        storyData = state.story;
      }

      if (!storyData || !storyData.videoData) {
        alert('У данного пользователя нет активных сторис.');
        return;
      }

      state.activeStoryAuthor = username;

      const storyModal = document.getElementById('storyModal');
      const storyAuthorAvatar = document.getElementById('storyAuthorAvatar');
      const storyAuthorName = document.getElementById('storyAuthorName');
      const storyTimeAgo = document.getElementById('storyTimeAgo');
      const storyVideoPlayer = document.getElementById('storyVideoPlayer');
      const storyLikesCount = document.getElementById('storyLikesCount');
      const storyHeartIcon = document.getElementById('storyHeartIcon');
      const storyLikersText = document.getElementById('storyLikersText');

      if (storyAuthorAvatar) {
        storyAuthorAvatar.innerHTML = getAvatarHtml(username, uObj ? uObj.color : '#8b5cf6', uObj ? uObj.avatarUrl : '', 38, '', true);
      }
      if (storyAuthorName) {
        storyAuthorName.innerHTML = `${escapeHtml(username)} ${uObj && uObj.isVip ? '👑' : ''}`;
      }
      if (storyTimeAgo && storyData.createdAt) {
        const hoursAgo = Math.max(0, Math.floor((Date.now() - storyData.createdAt) / (1000 * 60 * 60)));
        storyTimeAgo.textContent = hoursAgo === 0 ? 'Только что' : `${hoursAgo} ч. назад`;
      }
      if (storyVideoPlayer) {
        storyVideoPlayer.src = storyData.videoData;
        storyVideoPlayer.play().catch(() => {});
      }

      const likes = storyData.likes || [];
      if (storyLikesCount) storyLikesCount.textContent = likes.length;
      const hasLiked = likes.includes(state.username);
      if (storyHeartIcon) storyHeartIcon.textContent = hasLiked ? '❤️' : '🤍';
      if (storyLikersText) {
        storyLikersText.textContent = likes.length > 0 ? `Понравилось: ${likes.join(', ')}` : 'Пока нет лайков';
      }

      if (storyModal) storyModal.classList.add('active');
    };

    const likeStoryBtn = document.getElementById('likeStoryBtn');
    if (likeStoryBtn) {
      likeStoryBtn.addEventListener('click', () => {
        if (!state.activeStoryAuthor) return;
        sendPayload({
          type: 'like_story',
          authorUsername: state.activeStoryAuthor
        });
      });
    }

    const closeStoryModalBtn = document.getElementById('closeStoryModalBtn');
    if (closeStoryModalBtn) {
      closeStoryModalBtn.addEventListener('click', () => {
        const storyModal = document.getElementById('storyModal');
        const storyVideoPlayer = document.getElementById('storyVideoPlayer');
        if (storyVideoPlayer) storyVideoPlayer.pause();
        if (storyModal) storyModal.classList.remove('active');
      });
    }

    // ==========================================================================
    // POLLS / QUIZZES LOGIC
    // ==========================================================================
    const createPollModal = document.getElementById('createPollModal');
    const openCreatePollModalBtn = document.getElementById('openCreatePollModalBtn');
    const closeCreatePollModalBtn = document.getElementById('closeCreatePollModalBtn');
    const pollQuestionInput = document.getElementById('pollQuestionInput');
    const pollOptionsInputsContainer = document.getElementById('pollOptionsInputsContainer');
    const addPollOptionBtn = document.getElementById('addPollOptionBtn');
    const submitCreatePollBtn = document.getElementById('submitCreatePollBtn');

    if (openCreatePollModalBtn) {
      openCreatePollModalBtn.addEventListener('click', () => {
        if (createPollModal) createPollModal.classList.add('active');
      });
    }

    if (closeCreatePollModalBtn) {
      closeCreatePollModalBtn.addEventListener('click', () => {
        if (createPollModal) createPollModal.classList.remove('active');
      });
    }

    if (addPollOptionBtn && pollOptionsInputsContainer) {
      addPollOptionBtn.addEventListener('click', () => {
        const optionCount = pollOptionsInputsContainer.children.length + 1;
        const div = document.createElement('div');
        div.className = 'poll-option-input-row';
        div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
        div.innerHTML = `
          <input type="radio" name="quizCorrectOption" value="${optionCount - 1}" class="quiz-correct-radio" title="Отметить как правильный ответ" style="display: none;" />
          <input type="text" class="custom-input poll-opt-val" placeholder="Вариант ${optionCount}" style="font-size: 13px;" />
          <button type="button" class="cancel-btn remove-poll-opt-btn" style="padding: 4px 8px; font-size: 12px; flex: initial;">✕</button>
        `;
        div.querySelector('.remove-poll-opt-btn').addEventListener('click', () => div.remove());
        pollOptionsInputsContainer.appendChild(div);
        updateQuizRadiosVisibility();
      });
    }

    function updateQuizRadiosVisibility() {
      const isQuiz = document.querySelector('input[name="pollType"]:checked')?.value === 'quiz';
      document.querySelectorAll('.quiz-correct-radio').forEach(radio => {
        radio.style.display = isQuiz ? 'inline-block' : 'none';
      });
    }

    document.querySelectorAll('input[name="pollType"]').forEach(radio => {
      radio.addEventListener('change', updateQuizRadiosVisibility);
    });

    if (submitCreatePollBtn) {
      submitCreatePollBtn.addEventListener('click', () => {
        const question = pollQuestionInput ? pollQuestionInput.value.trim() : '';
        if (!question) {
          alert('Введите вопрос для опроса!');
          return;
        }

        const optionInputs = pollOptionsInputsContainer ? pollOptionsInputsContainer.querySelectorAll('.poll-opt-val') : [];
        const options = [];
        optionInputs.forEach((input, index) => {
          const val = input.value.trim();
          if (val) {
            options.push({ id: index + 1, text: val, votes: [] });
          }
        });

        if (options.length < 2) {
          alert('Добавьте минимум 2 варианта ответа!');
          return;
        }

        const pollType = document.querySelector('input[name="pollType"]:checked')?.value || 'regular';
        const isQuiz = pollType === 'quiz';
        let correctOptionId = null;

        if (isQuiz) {
          const selectedRadio = document.querySelector('input[name="quizCorrectOption"]:checked');
          if (selectedRadio) {
            const idx = parseInt(selectedRadio.value, 10);
            if (options[idx]) correctOptionId = options[idx].id;
          }
          if (!correctOptionId) correctOptionId = options[0].id;
        }

        sendPayload({
          type: 'create_poll',
          room: state.currentRoom,
          poll: {
            question,
            options,
            isQuiz,
            correctOptionId
          }
        });

        if (pollQuestionInput) pollQuestionInput.value = '';
        if (createPollModal) createPollModal.classList.remove('active');
      });
    }

    window.votePoll = function(messageId, optionId) {
      sendPayload({
        type: 'vote_poll',
        room: state.currentRoom,
        messageId,
        optionId
      });
    };

    // ==========================================================================
    // THREADS LOGIC
    // ==========================================================================
    const threadPanel = document.getElementById('threadPanel');
    const closeThreadPanelBtn = document.getElementById('closeThreadPanelBtn');
    const threadParentMsgContainer = document.getElementById('threadParentMsgContainer');
    const threadRepliesList = document.getElementById('threadRepliesList');
    const threadReplyInput = document.getElementById('threadReplyInput');
    const sendThreadReplyBtn = document.getElementById('sendThreadReplyBtn');

    state.activeThreadMsg = null;

    window.openThreadPanel = function(msg) {
      if (!msg || !threadPanel) return;
      state.activeThreadMsg = msg;
      
      const initial = (msg.username || '?').charAt(0).toUpperCase();
      const color = msg.color || avatarColors[(msg.username || '').length % avatarColors.length];
      const avatarMarkup = getAvatarHtml(msg.username, color, msg.avatarUrl, 32);

      if (threadParentMsgContainer) {
        threadParentMsgContainer.innerHTML = `
          <div style="display:flex; gap:10px; align-items:flex-start;">
            ${avatarMarkup}
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; font-size:13px; color:${color};">${escapeHtml(msg.username || 'Пользователь')}</span>
                <span style="font-size:11px; color:var(--text-muted);">${msg.timestamp || ''}</span>
              </div>
              <div style="font-size:13px; color:var(--text-main); margin-top:4px;">${escapeHtml(msg.content || 'Сообщение')}</div>
            </div>
          </div>
        `;
      }

      renderThreadReplies(msg.threadReplies || []);
      threadPanel.style.display = 'flex';
      if (threadReplyInput) threadReplyInput.focus();
    };

    window.openThreadPanelById = function(msgId) {
      const card = document.querySelector(`[data-msg-id="${msgId}"]`);
      if (card) {
        const msg = {
          id: msgId,
          username: card.dataset.msgAuthor || 'Пользователь',
          content: card.dataset.msgContent || '',
          timestamp: card.dataset.msgTimestamp || '',
          threadReplies: []
        };
        openThreadPanel(msg);
      }
    };

    function renderThreadReplies(replies) {
      if (!threadRepliesList) return;
      threadRepliesList.innerHTML = '';
      if (!replies || replies.length === 0) {
        threadRepliesList.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:12px;">Пока нет ответов. Напишите первый!</div>';
        return;
      }

      replies.forEach(reply => {
        const color = avatarColors[(reply.username || '').length % avatarColors.length];
        const avatarMarkup = getAvatarHtml(reply.username, color, reply.avatarUrl, 26);

        const div = document.createElement('div');
        div.style.cssText = 'display:flex; gap:8px; padding:8px 10px; background:rgba(255,255,255,0.03); border-radius:var(--radius-sm); border:1px solid rgba(255,255,255,0.05);';
        div.innerHTML = `
          ${avatarMarkup}
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:12px; color:${color};">${escapeHtml(reply.username || 'Пользователь')}</span>
              <span style="font-size:10px; color:var(--text-muted);">${reply.timestamp || ''}</span>
            </div>
            <div style="font-size:12px; color:var(--text-main); margin-top:2px;">${escapeHtml(reply.content || '')}</div>
          </div>
        `;
        threadRepliesList.appendChild(div);
      });

      threadRepliesList.scrollTop = threadRepliesList.scrollHeight;
    }

    if (closeThreadPanelBtn) {
      closeThreadPanelBtn.addEventListener('click', () => {
        if (threadPanel) threadPanel.style.display = 'none';
        state.activeThreadMsg = null;
      });
    }

    function handleSendThreadReply() {
      if (!state.activeThreadMsg || !threadReplyInput) return;
      const text = threadReplyInput.value.trim();
      if (!text) return;

      sendPayload({
        type: 'thread_reply',
        room: state.currentRoom,
        messageId: state.activeThreadMsg.id,
        content: text
      });

      threadReplyInput.value = '';
    }

    if (sendThreadReplyBtn) sendThreadReplyBtn.addEventListener('click', handleSendThreadReply);
    if (threadReplyInput) {
      threadReplyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSendThreadReply();
      });
    }

    // ==========================================================================
    // DELETE MESSAGE MODAL LISTENERS
    // ==========================================================================
    const deleteMessageModal = document.getElementById('deleteMessageModal');
    const btnDeleteForEveryone = document.getElementById('btnDeleteForEveryone');
    const btnDeleteForMe = document.getElementById('btnDeleteForMe');
    const btnCancelDelete = document.getElementById('btnCancelDelete');

    if (btnCancelDelete) {
      btnCancelDelete.addEventListener('click', closeDeleteModal);
    }

    if (deleteMessageModal) {
      deleteMessageModal.addEventListener('click', (e) => {
        if (e.target === deleteMessageModal) {
          closeDeleteModal();
        }
      });
    }

    if (btnDeleteForEveryone) {
      btnDeleteForEveryone.addEventListener('click', () => {
        if (!pendingDeleteInfo) return;
        const { msgId, timestamp } = pendingDeleteInfo;
        sendPayload({
          type: 'delete_message',
          messageId: msgId,
          timestamp: timestamp,
          room: state.currentRoom,
          mode: 'for_everyone'
        });
        closeDeleteModal();
      });
    }

    if (btnDeleteForMe) {
      btnDeleteForMe.addEventListener('click', () => {
        if (!pendingDeleteInfo) return;
        const { msgId, timestamp, card } = pendingDeleteInfo;

        markDeletedLocally(msgId, timestamp);

        if (card) {
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => card.remove(), 200);
        }

        sendPayload({
          type: 'delete_message',
          messageId: msgId,
          timestamp: timestamp,
          room: state.currentRoom,
          mode: 'for_me'
        });

        closeDeleteModal();
      });
    }

    // ==========================================================================
    // SETTINGS MODAL & CUSTOMIZATION LOGIC
    // ==========================================================================
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const avatarColorPicker = document.getElementById('avatarColorPicker');
    const themePickerGrid = document.getElementById('themePickerGrid');
    const fontSizeSelect = document.getElementById('fontSizeSelect');
    const oldPasswordInput = document.getElementById('oldPasswordInput');
    const newPasswordInput = document.getElementById('newPasswordInput');
    const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const passwordChangeStatus = document.getElementById('passwordChangeStatus');
    const clearLocalCacheBtn = document.getElementById('clearLocalCacheBtn');
    const soundToggle = document.getElementById('soundToggle');
    const settingsUsernameText = document.getElementById('settingsUsernameText');

    state.soundEnabled = true;

    // Load saved theme and font size
    const savedTheme = localStorage.getItem('cyberchord_theme') || 'violet';
    applyTheme(savedTheme);

    const savedFontSize = localStorage.getItem('cyberchord_fontsize') || '15px';
    document.documentElement.style.fontSize = savedFontSize;
    if (fontSizeSelect) fontSizeSelect.value = savedFontSize;

    const settingsBioInput = document.getElementById('settingsBioInput');
    const saveSettingsBioBtn = document.getElementById('saveSettingsBioBtn');
    const settingsBioStatus = document.getElementById('settingsBioStatus');

    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => {
        if (settingsUsernameText && state.username) {
          settingsUsernameText.textContent = state.username;
        }
        if (settingsBioInput) settingsBioInput.value = state.bio || '';
        if (passwordChangeStatus) passwordChangeStatus.style.display = 'none';
        renderAvatarColorPicker();
        if (typeof updateSettingsModalContent === 'function') updateSettingsModalContent();
        
        const searchInput = document.getElementById('settingsSearchInput');
        if (searchInput) searchInput.value = '';
        if (typeof performSettingsSearch === 'function') performSettingsSearch();

        if (typeof switchToSettingsTab === 'function') switchToSettingsTab('tab-account');
        settingsModal.classList.add('active');
      });
    }

    if (saveSettingsBioBtn && settingsBioInput) {
      saveSettingsBioBtn.addEventListener('click', () => {
        const bioText = settingsBioInput.value.trim();
        state.bio = bioText;
        sendPayload({ type: 'update_profile', bio: bioText });
        if (settingsBioStatus) {
          settingsBioStatus.style.display = 'block';
          settingsBioStatus.textContent = '✅ «О себе» успешно сохранено!';
          setTimeout(() => { settingsBioStatus.style.display = 'none'; }, 2500);
        }
      });
    }

    
    const psSelect = document.getElementById('privacySearchSelect');
    if (psSelect) {
      psSelect.addEventListener('change', () => {
        sendPayload({ type: 'update_profile', privacySearch: psSelect.value });
        showToast('Настройки приватности обновлены');
      });
    }

    const pcSelect = document.getElementById('privacyCallSelect');
    if (pcSelect) {
      pcSelect.addEventListener('change', () => {
        sendPayload({ type: 'update_profile', privacyCall: pcSelect.value });
        showToast('Настройки звонков обновлены');
      });
    }

    if (closeSettingsModalBtn) {
      closeSettingsModalBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
      });
    }

    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          settingsModal.classList.remove('active');
        }
      });
    }

    // ==========================================================================
    // PROFILE MODALS LOGIC (Self Profile & View Other User Profile)
    // ==========================================================================
    const myProfileModal = document.getElementById('myProfileModal');
    const openMyProfileBtn = document.getElementById('openMyProfileBtn');
    const closeMyProfileModalBtn = document.getElementById('closeMyProfileModalBtn');
    const myAvatarElem = document.getElementById('myAvatar');
    const myUserInfoBtn = document.getElementById('myUserInfoBtn');

    if (openMyProfileBtn) openMyProfileBtn.addEventListener('click', openMyProfileModal);
    if (myAvatarElem) myAvatarElem.addEventListener('click', openMyProfileModal);
    if (myUserInfoBtn) myUserInfoBtn.addEventListener('click', openMyProfileModal);

    if (closeMyProfileModalBtn) {
      closeMyProfileModalBtn.addEventListener('click', () => {
        if (myProfileModal) myProfileModal.classList.remove('active');
      });
    }

    if (myProfileModal) {
      myProfileModal.addEventListener('click', (e) => {
        if (e.target === myProfileModal) myProfileModal.classList.remove('active');
      });
    }

    function openMyProfileModal() {
      if (!myProfileModal) return;
      const myProfileAvatarPreview = document.getElementById('myProfileAvatarPreview');
      const myProfileUsernameDisplay = document.getElementById('myProfileUsernameDisplay');
      const myProfileVipCrown = document.getElementById('myProfileVipCrown');
      const myProfileStatusDisplay = document.getElementById('myProfileStatusDisplay');
      const myProfileUsernameInput = document.getElementById('myProfileUsernameInput');
      const myProfileBioInput = document.getElementById('myProfileBioInput');
      const myProfileAvatarUrlInput = document.getElementById('myProfileAvatarUrlInput');

      if (myProfileAvatarPreview) {
        myProfileAvatarPreview.innerHTML = getAvatarHtml(state.username, state.color, state.avatarUrl, 56, '', true);
      }
      if (myProfileUsernameDisplay) {
        myProfileUsernameDisplay.textContent = `@${state.username}`;
      }
      if (myProfileVipCrown) {
        myProfileVipCrown.style.display = state.isVip ? 'inline' : 'none';
      }
      if (myProfileStatusDisplay) {
        myProfileStatusDisplay.textContent = state.statusText ? `Статус: "${state.statusText}"` : (state.isVip ? 'VIP аккаунт активен' : 'Пользователь');
      }
      if (myProfileUsernameInput) {
        myProfileUsernameInput.value = state.username;
      }
      if (myProfileBioInput) {
        myProfileBioInput.value = state.bio || '';
      }
      if (myProfileAvatarUrlInput) {
        myProfileAvatarUrlInput.value = state.avatarUrl || '';
      }

      renderMyProfileVipStatusBox();
      myProfileModal.classList.add('active');
    }

    function renderMyProfileVipStatusBox() {
      const box = document.getElementById('myProfileVipStatusBox');
      if (!box) return;
      if (state.isVip) {
        box.innerHTML = `
          <div style="display:flex; gap:8px;">
            <input type="text" id="myProfileStatusInput" class="custom-input" value="${escapeHtml(state.statusText || '')}" placeholder="Установить текст статуса..." style="flex:1; font-size:12px; padding:6px 10px;" />
            <button id="myProfileSaveStatusBtn" class="ripple-btn" style="background:linear-gradient(135deg, #f59e0b, #d97706); color:var(--text-main); font-weight:700; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px;">Установить</button>
          </div>
          <div id="myProfileStatusMsg" style="font-size:11px; color:#10b981; margin-top:4px; display:none;"></div>
        `;
        setTimeout(() => {
          const btn = document.getElementById('myProfileSaveStatusBtn');
          const input = document.getElementById('myProfileStatusInput');
          const statusMsg = document.getElementById('myProfileStatusMsg');
          if (btn && input) {
            btn.onclick = () => {
              const val = input.value.trim();
              state.statusText = val;
              sendPayload({ type: 'update_profile', statusText: val });
              if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.textContent = '✅ Статус обновлен!';
                setTimeout(() => { statusMsg.style.display = 'none'; }, 2000);
              }
            };
          }
        }, 50);
      } else {
        box.innerHTML = `
          <div style="font-size:12px; color:var(--text-muted);">
            🔒 Изменение статуса доступно VIP-пользователям.
            <button id="goToVipFromProfileBtn" style="background:transparent; border:none; color:#f59e0b; font-weight:700; cursor:pointer; text-decoration:underline; padding:0; margin-left:4px;">Активировать VIP 👑</button>
          </div>
        `;
        setTimeout(() => {
          const btn = document.getElementById('goToVipFromProfileBtn');
          if (btn) {
            btn.onclick = () => {
              if (myProfileModal) myProfileModal.classList.remove('active');
              const vipPasswordModal = document.getElementById('vipPasswordModal');
              if (vipPasswordModal) vipPasswordModal.classList.add('active');
            };
          }
        }, 50);
      }
    }

    // Save Name in My Profile
    const myProfileSaveNameBtn = document.getElementById('myProfileSaveNameBtn');
    const myProfileUsernameInput = document.getElementById('myProfileUsernameInput');
    const myProfileNameStatus = document.getElementById('myProfileNameStatus');

    if (myProfileSaveNameBtn && myProfileUsernameInput) {
      myProfileSaveNameBtn.addEventListener('click', () => {
        const newName = myProfileUsernameInput.value.trim();
        if (!newName || newName.length < 2) {
          if (myProfileNameStatus) {
            myProfileNameStatus.style.display = 'block';
            myProfileNameStatus.style.color = '#ef4444';
            myProfileNameStatus.textContent = 'Имя слишком короткое!';
          }
          return;
        }
        sendPayload({ type: 'change_username', newUsername: newName });
        if (myProfileNameStatus) {
          myProfileNameStatus.style.display = 'block';
          myProfileNameStatus.style.color = '#10b981';
          myProfileNameStatus.textContent = '⏳ Сохранение имени...';
          setTimeout(() => { myProfileNameStatus.style.display = 'none'; }, 2000);
        }
      });
    }

    // Save Bio in My Profile
    const myProfileSaveBioBtn = document.getElementById('myProfileSaveBioBtn');
    const myProfileBioInput = document.getElementById('myProfileBioInput');
    const myProfileBioStatus = document.getElementById('myProfileBioStatus');

    if (myProfileSaveBioBtn && myProfileBioInput) {
      myProfileSaveBioBtn.addEventListener('click', () => {
        const bioText = myProfileBioInput.value.trim();
        state.bio = bioText;
        sendPayload({ type: 'update_profile', bio: bioText });
        if (myProfileBioStatus) {
          myProfileBioStatus.style.display = 'block';
          myProfileBioStatus.textContent = '✅ «О себе» сохранено!';
          setTimeout(() => { myProfileBioStatus.style.display = 'none'; }, 2000);
        }
      });
    }

    // Save Avatar URL in My Profile
    const myProfileSaveAvatarUrlBtn = document.getElementById('myProfileSaveAvatarUrlBtn');
    const myProfileAvatarUrlInput = document.getElementById('myProfileAvatarUrlInput');

    if (myProfileSaveAvatarUrlBtn && myProfileAvatarUrlInput) {
      myProfileSaveAvatarUrlBtn.addEventListener('click', () => {
        const url = myProfileAvatarUrlInput.value.trim();
        state.avatarUrl = url;
        sendPayload({ type: 'update_profile', avatarUrl: url });
        const myProfileAvatarPreview = document.getElementById('myProfileAvatarPreview');
        if (myProfileAvatarPreview) {
          myProfileAvatarPreview.innerHTML = getAvatarHtml(state.username, state.color, url, 56, '', true);
        }
      });
    }

    // Save Avatar File in My Profile
    const myProfileAvatarFileInput = document.getElementById('myProfileAvatarFileInput');
    if (myProfileAvatarFileInput) {
      myProfileAvatarFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 200 * 1024 * 1024) {
          alert('Файл слишком большой (макс 200 МБ)!');
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target.result;
          state.avatarUrl = dataUrl;
          sendPayload({ type: 'update_profile', avatarUrl: dataUrl });
          const myProfileAvatarPreview = document.getElementById('myProfileAvatarPreview');
          if (myProfileAvatarPreview) {
            myProfileAvatarPreview.innerHTML = getAvatarHtml(state.username, state.color, dataUrl, 56, '', true);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // View Other User Profile Modal
    const viewUserProfileModal = document.getElementById('viewUserProfileModal');
    const closeViewUserProfileModalBtn = document.getElementById('closeViewUserProfileModalBtn');

    if (closeViewUserProfileModalBtn) {
      closeViewUserProfileModalBtn.addEventListener('click', () => {
        if (viewUserProfileModal) viewUserProfileModal.classList.remove('active');
      });
    }

    if (viewUserProfileModal) {
      viewUserProfileModal.addEventListener('click', (e) => {
        if (e.target === viewUserProfileModal) viewUserProfileModal.classList.remove('active');
      });
    }

    window.openUserProfileModal = function(targetUsername) {
      if (!targetUsername) return;
      if (targetUsername.toLowerCase() === state.username.toLowerCase()) {
        openMyProfileModal();
        return;
      }

      const viewUserAvatarDisplay = document.getElementById('viewUserAvatarDisplay');
      const viewUserUsernameDisplay = document.getElementById('viewUserUsernameDisplay');
      const viewUserStatusDisplay = document.getElementById('viewUserStatusDisplay');
      const viewUserBioDisplay = document.getElementById('viewUserBioDisplay');
      const viewUserHandleDisplay = document.getElementById('viewUserHandleDisplay');
      const viewUserBirthdayDisplay = document.getElementById('viewUserBirthdayDisplay');

      const uObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === targetUsername.toLowerCase());
      const color = uObj ? uObj.color : avatarColors[targetUsername.length % avatarColors.length];
      const avatarUrl = uObj ? uObj.avatarUrl : '';
      const isVip = Boolean(uObj && uObj.isVip);
      const bioText = uObj && uObj.bio ? uObj.bio : '';
      const birthdayText = uObj && uObj.birthday ? uObj.birthday : '';
      const customStatus = uObj && uObj.statusText ? uObj.statusText : '';
      const isOnline = uObj ? uObj.isOnline : false;

      if (viewUserAvatarDisplay) {
        viewUserAvatarDisplay.innerHTML = getAvatarHtml(targetUsername, color, avatarUrl, 72);
      }
      if (viewUserUsernameDisplay) {
        viewUserUsernameDisplay.innerHTML = `${escapeHtml(targetUsername)} ${isVip ? '<span title="VIP пользователь">👑</span>' : ''}`;
      }
      if (viewUserStatusDisplay) {
        let statusHtml = isOnline ? '🟢 В сети' : 'был(а) недавно';
        if (customStatus) {
          statusHtml += ` • "${escapeHtml(customStatus)}"`;
        }
        viewUserStatusDisplay.innerHTML = statusHtml;
      }
      if (viewUserBioDisplay) {
        viewUserBioDisplay.textContent = bioText || 'Пользователь пока ничего не рассказал о себе.';
      }
      if (viewUserHandleDisplay) {
        viewUserHandleDisplay.textContent = `@${targetUsername}`;
      }
      if (viewUserBirthdayDisplay) {
        viewUserBirthdayDisplay.textContent = birthdayText || 'Не указан';
      }

      
    const chatHeaderMenuBtn = document.getElementById('chatHeaderMenuBtn');
    if (chatHeaderMenuBtn) {
      chatHeaderMenuBtn.onclick = (e) => {
        e.stopPropagation();
        // Create context menu or options
        const existing = document.getElementById('chatHeaderDropdownMenu');
        if (existing) { existing.remove(); return; }
        
        const menu = document.createElement('div');
        menu.id = 'chatHeaderDropdownMenu';
        menu.style.cssText = 'position: absolute; top: 55px; right: 10px; background: var(--bg-card); border: 1px solid var(--border-glow); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10000; padding: 6px; min-width: 180px; display: flex; flex-direction: column; gap: 4px;';
        
        let itemsHtml = '';
        if (state.activeDMRecipient) {
          itemsHtml = `
            <button class="menu-item-btn" id="menuBtnCall" style="background:none; border:none; color:var(--text-main); text-align:left; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px;">📞 Позвонить</button>
            <button class="menu-item-btn" id="menuBtnVideo" style="background:none; border:none; color:var(--text-main); text-align:left; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px;">📹 Видеозвонок</button>
            <button class="menu-item-btn" id="menuBtnProfile" style="background:none; border:none; color:var(--text-main); text-align:left; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px;">👤 Профиль</button>
          `;
        } else if (state.currentGroupInfo && state.currentGroupInfo.isGroup) {
          itemsHtml = `
            <button class="menu-item-btn" id="menuBtnGroupSettings" style="background:none; border:none; color:var(--text-main); text-align:left; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; display:flex; align-items:center; gap:8px;">⚙️ Управление группой</button>
          `;
        } else {
          itemsHtml = `
            <div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted);">Публичный канал</div>
          `;
        }
        
        menu.innerHTML = itemsHtml;
        document.body.appendChild(menu);
        
        const closeMenu = (ev) => {
          if (!menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
          }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
        
        const btnCall = document.getElementById('menuBtnCall');
        if (btnCall) btnCall.onclick = () => { menu.remove(); startCall(state.activeDMRecipient, null, false); };
        
        const btnVideo = document.getElementById('menuBtnVideo');
        if (btnVideo) btnVideo.onclick = () => { menu.remove(); startCall(state.activeDMRecipient, null, true); };
        
        const btnProfile = document.getElementById('menuBtnProfile');
        if (btnProfile) btnProfile.onclick = () => { menu.remove(); openUserProfileModal(state.activeDMRecipient); };
        
        const btnGroupSettings = document.getElementById('menuBtnGroupSettings');
        if (btnGroupSettings) btnGroupSettings.onclick = () => { menu.remove(); if(typeof openGroupSettingsModal === 'function') openGroupSettingsModal(); };
      };
    }

      // Quick Actions
      const btnChat = document.getElementById('viewUserActionChat');
      const btnMute = document.getElementById('viewUserActionMute');
      const btnCall = document.getElementById('viewUserActionCall');

      if (btnChat) {
        btnChat.onclick = () => {
          if (viewUserProfileModal) viewUserProfileModal.classList.remove('active');
          startDirectMessageWith(targetUsername);
        };
      }
      if (btnMute) {
        btnMute.onclick = () => {
          alert(`Уведомления от @${targetUsername} без звука`);
        };
      }
      if (btnCall) {
        btnCall.onclick = () => {
          if (viewUserProfileModal) viewUserProfileModal.classList.remove('active');
          startCall(targetUsername, null, false);
        };
      }
      const btnVideo = document.getElementById('viewUserActionVideo');
      if (btnVideo) {
        btnVideo.onclick = () => {
          if (viewUserProfileModal) viewUserProfileModal.classList.remove('active');
          startCall(targetUsername, null, true);
        };
      }
      
      const btnBlock = document.getElementById('viewUserActionBlock');
      if (btnBlock) {
        btnBlock.onclick = () => {
          if (confirm('Вы уверены, что хотите заблокировать ' + targetUsername + '?')) {
            sendPayload({ type: 'toggle_block_user', targetUsername });
            alert('Пользователь ' + targetUsername + ' заблокирован.');
            if (viewUserProfileModal) viewUserProfileModal.classList.remove('active');
          }
        };
      }

      const copyHandleBtn = document.getElementById('viewUserCopyHandleBtn');
      if (copyHandleBtn) {
        copyHandleBtn.onclick = () => {
          navigator.clipboard.writeText(`@${targetUsername}`);
          alert(`Имя пользователя @${targetUsername} скопировано!`);
        };
      }

      const isBlocked = (state.blockedUsers || []).map(b => b.toLowerCase()).includes(targetUsername.toLowerCase());
      const toggleBlockBtn = document.getElementById('viewUserToggleBlockBtn');
      if (toggleBlockBtn) {
        toggleBlockBtn.textContent = isBlocked ? '✅ Разблокировать пользователя' : '🚫 Заблокировать пользователя';
        toggleBlockBtn.onclick = () => {
          toggleBlockUser(targetUsername);
          if (viewUserProfileModal) viewUserProfileModal.classList.remove('active');
        };
      }

      if (viewUserProfileModal) viewUserProfileModal.classList.add('active');
    };

    // Settings Tabs switching helper
    window.switchToSettingsTab = function(tabId) {
      const searchInput = document.getElementById('settingsSearchInput');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        if (typeof performSettingsSearch === 'function') performSettingsSearch();
      }

      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));

      const activeBtn = document.querySelector(`.settings-tab-btn[data-tab="${tabId}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      const targetContent = document.getElementById(tabId);
      if (targetContent) targetContent.classList.add('active');

      const titles = {
        'tab-account': 'Учётная запись',
        'tab-security': 'Пароль и безопасность',
        'tab-devices': 'Устройства',
        'tab-customization': 'Внешний вид',
        'tab-preferences': 'Уведомления',
        'tab-vip': 'VIP & Сторис'
      };
      const titleEl = document.getElementById('settingsPanelTitle');
      if (titleEl && titles[tabId]) titleEl.textContent = titles[tabId];

      if (tabId === 'tab-devices') {
        sendPayload({ type: 'get_sessions' });
      }
    };

    window.renderDevicesTab = function(currentSession, otherSessions) {
      const accountSessionsSummaryVal = document.getElementById('accountSessionsSummaryVal');
      if (accountSessionsSummaryVal) {
        const count = 1 + (otherSessions ? otherSessions.length : 0);
        accountSessionsSummaryVal.textContent = `${count} ${count === 1 ? 'устройство' : 'устройства'} (Текущее${count > 1 ? ' и другие' : ''})`;
      }

      const currentDeviceTitle = document.getElementById('currentDeviceTitle');
      const currentDeviceStatus = document.getElementById('currentDeviceStatus');
      const currentDeviceDetails = document.getElementById('currentDeviceDetails');

      if (currentSession) {
        if (currentDeviceTitle) currentDeviceTitle.textContent = currentSession.device || 'Неизвестное устройство';
        if (currentDeviceStatus) currentDeviceStatus.textContent = 'в сети (Текущий сеанс)';
        if (currentDeviceDetails) {
          const timeStr = currentSession.loginTime ? new Date(currentSession.loginTime).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
          currentDeviceDetails.textContent = `${currentSession.ip || '127.0.0.1'} · вход ${timeStr}`;
        }
      }

      const activeSessionsListContainer = document.getElementById('activeSessionsListContainer');
      if (!activeSessionsListContainer) return;
      activeSessionsListContainer.innerHTML = '';

      if (!otherSessions || otherSessions.length === 0) {
        activeSessionsListContainer.innerHTML = `
          <div style="background: rgba(0,0,0,0.3); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; text-align: center; color: #64748b; font-size: 13px;">
            Нет других активных сеансов
          </div>
        `;
        return;
      }

      otherSessions.forEach(sess => {
        const card = document.createElement('div');
        card.className = 'discord-settings-box';
        card.style.cssText = 'background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;';

        const icon = sess.device && sess.device.toLowerCase().includes('телефон') ? '📱' : '💻';
        const timeStr = sess.lastActive ? new Date(sess.lastActive).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'недавно';

        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
            <div style="font-size: 24px; flex-shrink: 0;">${icon}</div>
            <div style="overflow: hidden;">
              <div style="font-weight: 700; font-size: 15px; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(sess.device || 'Сеанс')}</div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">был(а) ${timeStr}</div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px;">${escapeHtml(sess.ip || '')}</div>
            </div>
          </div>
          <button class="terminate-single-session-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer; flex-shrink: 0; transition: background 0.2s;">
            Завершить
          </button>
        `;

        card.querySelector('.terminate-single-session-btn').addEventListener('click', () => {
          if (confirm('Завершить этот сеанс?')) {
            sendPayload({ type: 'terminate_session', sessionId: sess.sessionId });
            setTimeout(() => sendPayload({ type: 'get_sessions' }), 300);
          }
        });

        activeSessionsListContainer.appendChild(card);
      });
    };

    // Populate Settings Modal Data when opened
    function updateSettingsModalContent() {
      const sidebarAvatar = document.getElementById('settingsSidebarAvatar');
      const sidebarUsername = document.getElementById('settingsSidebarUsername');
      const accountUsernameVal = document.getElementById('accountUsernameVal');
      const accountBirthdayVal = document.getElementById('accountBirthdayVal');
      const accountBioVal = document.getElementById('accountBioVal');

      if (sidebarAvatar) {
        sidebarAvatar.innerHTML = getAvatarHtml(state.username, state.color, state.avatarUrl, 36, '', true);
      }
      if (sidebarUsername) {
        sidebarUsername.textContent = `@${state.username}`;
      }
      if (accountUsernameVal) {
        accountUsernameVal.textContent = `@${state.username}`;
      }
      if (accountBirthdayVal) {
        accountBirthdayVal.textContent = state.birthday ? state.birthday : 'Не указана';
      }
      if (accountBioVal) {
        accountBioVal.textContent = state.bio ? state.bio : 'Пользователь пока ничего не рассказал о себе.';
      }
    }

    // Attach Settings Edit Event Listeners
    const btnEditUsername = document.getElementById('btnEditUsername');
    if (btnEditUsername) {
      btnEditUsername.addEventListener('click', () => {
        const newName = prompt('Введите новое имя пользователя:', state.username);
        if (newName && newName.trim().length >= 2) {
          sendPayload({ type: 'change_username', newUsername: newName.trim() });
          setTimeout(() => updateSettingsModalContent(), 300);
        }
      });
    }

    const btnEditBirthday = document.getElementById('btnEditBirthday');
    if (btnEditBirthday) {
      btnEditBirthday.addEventListener('click', () => {
        const newBday = prompt('Введите вашу дату рождения (например: 15.05.2000):', state.birthday || '');
        if (newBday !== null) {
          state.birthday = newBday.trim();
          sendPayload({ type: 'update_profile', birthday: newBday.trim() });
          updateSettingsModalContent();
        }
      });
    }

    const btnTerminateOtherSessions = document.getElementById('btnTerminateOtherSessions');
    if (btnTerminateOtherSessions) {
      btnTerminateOtherSessions.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите завершить все остальные сеансы?')) {
          sendPayload({ type: 'terminate_other_sessions' });
          setTimeout(() => sendPayload({ type: 'get_sessions' }), 300);
        }
      });
    }

    const btnDevicesDone = document.getElementById('btnDevicesDone');
    if (btnDevicesDone) {
      btnDevicesDone.addEventListener('click', () => {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.classList.remove('active');
      });
    }

    // PWA Service Worker & Android Installation Logic
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    let deferredPwaPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPwaPrompt = e;
    });

    const androidInstallModal = document.getElementById('androidInstallModal');
    const closeAndroidInstallModalBtn = document.getElementById('closeAndroidInstallModalBtn');
    const cancelAndroidInstallModalBtn = document.getElementById('cancelAndroidInstallModalBtn');
    const triggerDirectPwaInstallBtn = document.getElementById('triggerDirectPwaInstallBtn');

    function openAndroidInstallModal() {
      if (androidInstallModal) androidInstallModal.classList.add('active');
    }
    function closeAndroidInstallModal() {
      if (androidInstallModal) androidInstallModal.classList.remove('active');
    }

    if (closeAndroidInstallModalBtn) closeAndroidInstallModalBtn.addEventListener('click', closeAndroidInstallModal);
    if (cancelAndroidInstallModalBtn) cancelAndroidInstallModalBtn.addEventListener('click', closeAndroidInstallModal);
    if (androidInstallModal) {
      androidInstallModal.addEventListener('click', (e) => {
        if (e.target === androidInstallModal) closeAndroidInstallModal();
      });
    }

    if (triggerDirectPwaInstallBtn) {
      triggerDirectPwaInstallBtn.addEventListener('click', async () => {
        if (deferredPwaPrompt) {
          deferredPwaPrompt.prompt();
          const choice = await deferredPwaPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            alert('🎉 VesperChat успешно устанавливается на ваш Android!');
            closeAndroidInstallModal();
          }
          deferredPwaPrompt = null;
        } else {
          alert('💡 Откройте меню вашего браузера (⋮) и нажмите «Добавить на главный экран» или «Установить приложение».');
        }
      });
    }

    const downloadApkBtn = document.getElementById('downloadApkBtn');
    if (downloadApkBtn) {
      downloadApkBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = '/download/VesperChat_v2.4.apk';
        link.download = 'VesperChat_v2.4.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    const btnEditBio = document.getElementById('btnEditBio');
    if (btnEditBio) {
      btnEditBio.addEventListener('click', () => {
        const newBio = prompt('Введите информацию «О себе»:', state.bio || '');
        if (newBio !== null) {
          state.bio = newBio.trim();
          sendPayload({ type: 'update_profile', bio: newBio.trim() });
          updateSettingsModalContent();
        }
      });
    }





    // Settings Tabs switching
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId) switchToSettingsTab(tabId);
      });
    });

    // Avatar Color Picker
    function renderAvatarColorPicker() {
      if (!avatarColorPicker) return;
      avatarColorPicker.innerHTML = '';
      avatarColors.forEach(color => {
        const circle = document.createElement('div');
        circle.className = `color-circle ${color === state.color ? 'selected' : ''}`;
        circle.style.background = color;
        circle.addEventListener('click', () => {
          document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
          circle.classList.add('selected');
          state.color = color;
          if (myAvatar) myAvatar.style.background = `linear-gradient(135deg, ${color}, #d946ef)`;
          sendPayload({ type: 'update_profile', color });
        });
        avatarColorPicker.appendChild(circle);
      });
    }

    // Themes (Accent Colors & Full UI Themes)
    function applyUiTheme(themeName) {
      const validThemes = ['neon', 'classic', 'matrix', 'light'];
      const targetTheme = validThemes.includes(themeName) ? themeName : 'neon';

      document.body.classList.remove('ui-theme-neon', 'ui-theme-classic', 'ui-theme-matrix', 'ui-theme-light');
      document.body.classList.add(`ui-theme-${targetTheme}`);

      const uiPicker = document.getElementById('uiThemePickerGrid');
      if (uiPicker) {
        uiPicker.querySelectorAll('.ui-theme-card').forEach(card => {
          if (card.getAttribute('data-ui-theme') === targetTheme) {
            card.classList.add('active');
          } else {
            card.classList.remove('active');
          }
        });
      }

      localStorage.setItem('vesper_ui_theme', targetTheme);
    }

    const uiThemePickerGrid = document.getElementById('uiThemePickerGrid');
    if (uiThemePickerGrid) {
      uiThemePickerGrid.querySelectorAll('.ui-theme-card').forEach(card => {
        card.addEventListener('click', () => {
          const themeName = card.getAttribute('data-ui-theme');
          applyUiTheme(themeName);
        });
      });
    }

    // Restore UI Theme on startup
    const savedUiTheme = localStorage.getItem('vesper_ui_theme') || 'neon';
    applyUiTheme(savedUiTheme);

    function applyTheme(themeName) {
      const themes = {
        violet: {
          '--accent-purple': '#8b5cf6',
          '--accent-magenta': '#d946ef',
          '--border-glow': 'rgba(139, 92, 246, 0.25)',
          '--border-glow-strong': 'rgba(217, 70, 239, 0.5)'
        },
        cyan: {
          '--accent-purple': '#06b6d4',
          '--accent-magenta': '#3b82f6',
          '--border-glow': 'rgba(6, 182, 212, 0.25)',
          '--border-glow-strong': 'rgba(59, 130, 246, 0.5)'
        },
        emerald: {
          '--accent-purple': '#10b981',
          '--accent-magenta': '#06b6d4',
          '--border-glow': 'rgba(16, 185, 129, 0.25)',
          '--border-glow-strong': 'rgba(6, 182, 212, 0.5)'
        },
        crimson: {
          '--accent-purple': '#ef4444',
          '--accent-magenta': '#f43f5e',
          '--border-glow': 'rgba(239, 68, 68, 0.25)',
          '--border-glow-strong': 'rgba(244, 63, 94, 0.5)'
        },
        amber: {
          '--accent-purple': '#f59e0b',
          '--accent-magenta': '#d97706',
          '--border-glow': 'rgba(245, 158, 11, 0.25)',
          '--border-glow-strong': 'rgba(217, 119, 6, 0.5)'
        },
        sakura: {
          '--accent-purple': '#ec4899',
          '--accent-magenta': '#f43f5e',
          '--border-glow': 'rgba(236, 72, 153, 0.25)',
          '--border-glow-strong': 'rgba(244, 63, 94, 0.5)'
        },
        orange: {
          '--accent-purple': '#f97316',
          '--accent-magenta': '#f59e0b',
          '--border-glow': 'rgba(249, 115, 22, 0.25)',
          '--border-glow-strong': 'rgba(245, 158, 11, 0.5)'
        },
        lime: {
          '--accent-purple': '#84cc16',
          '--accent-magenta': '#10b981',
          '--border-glow': 'rgba(132, 204, 22, 0.25)',
          '--border-glow-strong': 'rgba(16, 185, 129, 0.5)'
        },
        sapphire: {
          '--accent-purple': '#3b82f6',
          '--accent-magenta': '#6366f1',
          '--border-glow': 'rgba(59, 130, 246, 0.25)',
          '--border-glow-strong': 'rgba(99, 102, 241, 0.5)'
        },
        amethyst: {
          '--accent-purple': '#a855f7',
          '--accent-magenta': '#8b5cf6',
          '--border-glow': 'rgba(168, 85, 247, 0.25)',
          '--border-glow-strong': 'rgba(139, 92, 246, 0.5)'
        },
        rose: {
          '--accent-purple': '#f43f5e',
          '--accent-magenta': '#fb7185',
          '--border-glow': 'rgba(244, 63, 94, 0.25)',
          '--border-glow-strong': 'rgba(251, 113, 133, 0.5)'
        },
        pitch: {
          '--accent-purple': '#d946ef',
          '--accent-magenta': '#a855f7',
          '--border-glow': 'rgba(217, 70, 239, 0.25)',
          '--border-glow-strong': 'rgba(168, 85, 247, 0.5)'
        }
      };

      const t = themes[themeName] || themes.violet;
      for (const key in t) {
        document.documentElement.style.setProperty(key, t[key]);
      }

      if (themePickerGrid) {
        themePickerGrid.querySelectorAll('.theme-option').forEach(opt => {
          if (opt.getAttribute('data-theme') === themeName) {
            opt.classList.add('active');
          } else {
            opt.classList.remove('active');
          }
        });
      }
      localStorage.setItem('cyberchord_theme', themeName);
    }

    if (themePickerGrid) {
      themePickerGrid.querySelectorAll('.theme-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const theme = opt.getAttribute('data-theme');
          applyTheme(theme);
        });
      });
    }

    // VIP Tab Custom Text Status Handler
    const saveVipCustomStatusBtn = document.getElementById('saveVipCustomStatusBtn');
    const vipCustomStatusInput = document.getElementById('vipCustomStatusInput');
    const vipCustomStatusNotice = document.getElementById('vipCustomStatusNotice');

    if (saveVipCustomStatusBtn && vipCustomStatusInput) {
      saveVipCustomStatusBtn.addEventListener('click', () => {
        const val = vipCustomStatusInput.value.trim();
        state.statusText = val;
        sendPayload({ type: 'update_profile', statusText: val });
        if (vipCustomStatusNotice) {
          vipCustomStatusNotice.style.display = 'block';
          setTimeout(() => { vipCustomStatusNotice.style.display = 'none'; }, 2500);
        }
        renderMembers();
      });
    }

    // Font size
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        document.documentElement.style.fontSize = val;
        localStorage.setItem('cyberchord_fontsize', val);
      });
    }

    // ==========================================================================
    // YOUR DEVICE MODE LOGIC ("Компьютер" / "Телефон")
    // ==========================================================================
    function setDeviceMode(mode) {
      const targetMode = (mode === 'phone' || mode === 'pc') ? mode : 'pc';
      state.deviceMode = targetMode;
      localStorage.setItem('vesper_device_mode', targetMode);

      const pcBtn = document.getElementById('deviceModePcBtn');
      const phoneBtn = document.getElementById('deviceModePhoneBtn');

      if (pcBtn && phoneBtn) {
        if (targetMode === 'pc') {
          pcBtn.classList.add('active');
          phoneBtn.classList.remove('active');
        } else {
          phoneBtn.classList.add('active');
          pcBtn.classList.remove('active');
        }
      }

      document.body.classList.remove('device-mode-phone', 'device-mode-pc');
      if (targetMode === 'phone') {
        document.body.classList.add('device-mode-phone');
      } else {
        document.body.classList.add('device-mode-pc');
        document.body.classList.remove('phone-chat-open');
      }
    }

    function openPhoneChatView() {
      if (document.body.classList.contains('device-mode-phone') || window.innerWidth <= 768) {
        document.body.classList.add('device-mode-phone');
        document.body.classList.add('phone-chat-open');
      }
    }

    function closePhoneChatView() {
      document.body.classList.remove('phone-chat-open');
    }

    const pcModeBtnEl = document.getElementById('deviceModePcBtn');
    const phoneModeBtnEl = document.getElementById('deviceModePhoneBtn');
    if (pcModeBtnEl) pcModeBtnEl.addEventListener('click', () => setDeviceMode('pc'));
    if (phoneModeBtnEl) phoneModeBtnEl.addEventListener('click', () => setDeviceMode('phone'));

    const mobileBackBtnEl = document.getElementById('mobileBackBtn');
    if (mobileBackBtnEl) mobileBackBtnEl.addEventListener('click', closePhoneChatView);

    // Initialize device mode on startup
    const savedDeviceMode = localStorage.getItem('vesper_device_mode');
    const initialDeviceMode = savedDeviceMode || (window.innerWidth <= 768 ? 'phone' : 'pc');
    setDeviceMode(initialDeviceMode);

    // Interface UI Mode (Mobile / Auto / Desktop)
    function applyUiMode(modeName) {
      const mode = modeName || 'auto';
      localStorage.setItem('cyberchord_ui_mode', mode);

      document.body.classList.remove('force-mobile-view', 'force-desktop-view');
      if (mode === 'mobile') {
        document.body.classList.add('force-mobile-view');
      } else if (mode === 'desktop') {
        document.body.classList.add('force-desktop-view');
      }

      const uiGrid = document.getElementById('uiModeGrid');
      if (uiGrid) {
        uiGrid.querySelectorAll('.ui-mode-option').forEach(opt => {
          if (opt.getAttribute('data-mode') === mode) {
            opt.classList.add('active');
          } else {
            opt.classList.remove('active');
          }
        });
      }
    }

    const savedUiMode = localStorage.getItem('cyberchord_ui_mode') || 'auto';
    applyUiMode(savedUiMode);

    const uiModeGrid = document.getElementById('uiModeGrid');
    if (uiModeGrid) {
      uiModeGrid.querySelectorAll('.ui-mode-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          applyUiMode(mode);
        });
      });
    }

    // Change Password
    if (changePasswordBtn) {
      changePasswordBtn.addEventListener('click', () => {
        const oldPass = oldPasswordInput.value.trim();
        const newPass = newPasswordInput.value.trim();
        const confirmPass = confirmNewPasswordInput.value.trim();

        passwordChangeStatus.style.display = 'block';

        if (!oldPass || !newPass || !confirmPass) {
          passwordChangeStatus.style.color = '#ef4444';
          passwordChangeStatus.textContent = 'Заполните все поля!';
          return;
        }

        if (newPass.length < 4) {
          passwordChangeStatus.style.color = '#ef4444';
          passwordChangeStatus.textContent = 'Новый пароль должен быть от 4 символов!';
          return;
        }

        if (newPass !== confirmPass) {
          passwordChangeStatus.style.color = '#ef4444';
          passwordChangeStatus.textContent = 'Новые пароли не совпадают!';
          return;
        }

        passwordChangeStatus.style.color = 'var(--accent-purple)';
        passwordChangeStatus.textContent = 'Отправка запроса...';

        sendPayload({
          type: 'change_password',
          oldPassword: oldPass,
          newPassword: newPass
        });
      });
    }

    // Clear Cache
    if (clearLocalCacheBtn) {
      clearLocalCacheBtn.addEventListener('click', () => {
        if (confirm('Вы действительно хотите очистить сохраненные данные авторизации и выйти?')) {
          sessionStorage.removeItem('cyberchord_auth');
          localStorage.removeItem('cyberchord_auth');
          localStorage.removeItem('cyberchord_theme');
          localStorage.removeItem('cyberchord_fontsize');
          location.reload();
        }
      });
    }

    // Sound toggle
    if (soundToggle) {
      soundToggle.addEventListener('change', (e) => {
        state.soundEnabled = e.target.checked;
      });
    }

    // ==========================================================================
    // REAL-TIME SETTINGS SEARCH LOGIC
    // ==========================================================================
    window.performSettingsSearch = function() {
      const settingsSearchInput = document.getElementById('settingsSearchInput');
      const clearSettingsSearchBtn = document.getElementById('clearSettingsSearchBtn');
      if (!settingsSearchInput) return;

      const query = settingsSearchInput.value.trim().toLowerCase();

      if (clearSettingsSearchBtn) {
        clearSettingsSearchBtn.style.display = query ? 'block' : 'none';
      }

      const allTabs = document.querySelectorAll('.settings-tab-content');
      const allTabBtns = document.querySelectorAll('.settings-tab-btn');
      const panelTitle = document.getElementById('settingsPanelTitle');

      if (!query) {
        // Restore standard view
        allTabs.forEach(tab => {
          tab.style.display = '';
          tab.querySelectorAll('.discord-settings-box, .discord-row-item, .ui-theme-card, .theme-option').forEach(el => {
            el.style.display = '';
          });
        });

        // Remove search badges from tab buttons
        allTabBtns.forEach(btn => {
          btn.style.opacity = '1';
          const badge = btn.querySelector('.search-tab-badge');
          if (badge) badge.remove();
        });

        // Restore active tab title & view
        const activeBtn = document.querySelector('.settings-tab-btn.active');
        const activeTabId = activeBtn ? activeBtn.getAttribute('data-tab') : 'tab-account';
        if (typeof switchToSettingsTab === 'function') {
          switchToSettingsTab(activeTabId);
        }

        const noRes = document.getElementById('settingsSearchNoResults');
        if (noRes) noRes.remove();
        return;
      }

      // Perform real-time filter across all tabs & settings elements
      let totalMatches = 0;
      const tabMatchCounts = {};

      allTabs.forEach(tab => {
        const tabId = tab.id;
        let tabMatches = 0;

        // Make tab content container visible for search
        tab.style.display = 'block';

        const boxes = tab.querySelectorAll('.discord-settings-box');
        boxes.forEach(box => {
          const text = box.textContent.toLowerCase();
          if (text.includes(query)) {
            box.style.display = 'block';
            tabMatches++;
            totalMatches++;

            // Filter individual rows inside box if present
            const rows = box.querySelectorAll('.discord-row-item');
            if (rows.length > 0) {
              let matchedAnyRow = false;
              rows.forEach(row => {
                if (row.textContent.toLowerCase().includes(query)) {
                  row.style.display = 'flex';
                  matchedAnyRow = true;
                } else {
                  row.style.display = 'none';
                }
              });
              if (!matchedAnyRow) {
                rows.forEach(row => { row.style.display = 'flex'; });
              }
            }
          } else {
            box.style.display = 'none';
          }
        });

        tabMatchCounts[tabId] = tabMatches;

        if (tabMatches === 0) {
          tab.style.display = 'none';
        }
      });

      // Update header title
      if (panelTitle) {
        panelTitle.innerHTML = `🔍 Поиск: <span style="color:var(--accent-purple);">«${escapeHtml(query)}»</span> <span style="font-size:12px; font-weight:600; color:var(--text-muted); margin-left:6px;">(${totalMatches} совпадений)</span>`;
      }

      // Update sidebar tab buttons with search count badges
      allTabBtns.forEach(btn => {
        const tabId = btn.getAttribute('data-tab');
        const count = tabMatchCounts[tabId] || 0;

        const oldBadge = btn.querySelector('.search-tab-badge');
        if (oldBadge) oldBadge.remove();

        if (count > 0) {
          btn.style.opacity = '1';
          const badge = document.createElement('span');
          badge.className = 'search-tab-badge';
          badge.style.cssText = 'margin-left: auto; background: var(--accent-purple); color: var(--text-main); font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 10px; flex-shrink: 0; box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);';
          badge.textContent = count;
          btn.appendChild(badge);
        } else {
          btn.style.opacity = '0.35';
        }
      });

      // Show "No results" container if query matches 0 settings
      let noRes = document.getElementById('settingsSearchNoResults');
      if (totalMatches === 0) {
        if (!noRes) {
          noRes = document.createElement('div');
          noRes.id = 'settingsSearchNoResults';
          noRes.style.cssText = 'padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 14px; background: rgba(0,0,0,0.25); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.12); margin-top: 10px; animation: fadeIn 0.2s ease;';
          const mainPanel = document.querySelector('.settings-main-panel');
          if (mainPanel) mainPanel.appendChild(noRes);
        }
        noRes.innerHTML = `
          <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 800; font-size: 16px; color: var(--text-main); margin-bottom: 6px;">Ничего не найдено</div>
          <div style="font-size: 13px; color: var(--text-dim);">По запросу «<span style="color:var(--accent-purple); font-weight:700;">${escapeHtml(query)}</span>» настройки не найдены.</div>
          <button onclick="document.getElementById('settingsSearchInput').value=''; performSettingsSearch();" style="margin-top: 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: var(--text-main); font-size: 12px; padding: 6px 14px; border-radius: 8px; cursor: pointer;">Очистить поиск</button>
        `;
      } else if (noRes) {
        noRes.remove();
      }
    };

    const searchInputEl = document.getElementById('settingsSearchInput');
    const clearSearchBtnEl = document.getElementById('clearSettingsSearchBtn');

    if (searchInputEl) {
      searchInputEl.addEventListener('input', performSettingsSearch);
      searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInputEl.value = '';
          performSettingsSearch();
        }
      });
    }

    if (clearSearchBtnEl) {
      clearSearchBtnEl.addEventListener('click', () => {
        if (searchInputEl) {
          searchInputEl.value = '';
          searchInputEl.focus();
          performSettingsSearch();
        }
      });
    }

    // Emoji Burst Particle Helper & Animations
    function spawnEmojiBurst(x, y, emoji) {
      if (!emoji) return;
      const count = 5;
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'floating-emoji-particle';
        el.textContent = emoji;
        const dx = (Math.random() - 0.5) * 120;
        const rot = (Math.random() - 0.5) * 60;
        el.style.setProperty('--dx', `${dx}px`);
        el.style.setProperty('--rot', `${rot}deg`);
        el.style.left = `${x || window.innerWidth / 2}px`;
        el.style.top = `${y || window.innerHeight / 2}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 850);
      }
    }

    function triggerEmojiPopAnim(targetEl, emojiStr, clientX, clientY) {
      if (targetEl) {
        targetEl.classList.remove('emoji-pop-anim');
        void targetEl.offsetWidth;
        targetEl.classList.add('emoji-pop-anim');
      }
      let x = clientX;
      let y = clientY;
      if (!x || !y) {
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          x = rect.left + rect.width / 2;
          y = rect.top + rect.height / 2;
        } else {
          x = window.innerWidth / 2;
          y = window.innerHeight / 2;
        }
      }
      spawnEmojiBurst(x, y, emojiStr);
    }

    // Audio Transcription Functions (3 per week free limit)
    function getWeekIdentifier() {
      const d = new Date();
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${weekNum}`;
    }

    function getTranscribeUsageInfo() {
      const curWeek = getWeekIdentifier();
      const key = 'cyberchord_transcribe_limit';
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.week === curWeek) {
            return { week: curWeek, count: data.count || 0, remaining: Math.max(0, 3 - (data.count || 0)) };
          }
        }
      } catch (e) {}
      const init = { week: curWeek, count: 0 };
      localStorage.setItem(key, JSON.stringify(init));
      return { week: curWeek, count: 0, remaining: 3 };
    }

    function recordTranscribeUsage() {
      const info = getTranscribeUsageInfo();
      const newCount = info.count + 1;
      localStorage.setItem('cyberchord_transcribe_limit', JSON.stringify({ week: info.week, count: newCount }));
      return newCount;
    }

    window.transcribeAudioMessage = async function(voiceId) {
      const btn = document.getElementById('transcribe_btn_' + voiceId);
      const box = document.getElementById('transcribe_box_' + voiceId);
      const audio = document.getElementById(voiceId);
      if (!btn || !box || !audio) return;

      const usageInfo = getTranscribeUsageInfo();
      if (usageInfo.count >= 3) {
        alert(`⚠️ Лимит бесплатной расшифровки исчерпан!\n\nВы уже использовали 3 из 3 бесплатных расшифровок на этой неделе (${usageInfo.week}). Доступ обновится на следующей неделе.`);
        return;
      }

      const audioSrc = audio.src;
      if (!audioSrc) {
        alert('Не удалось получить аудиозапись для расшифровки');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '⏳ <span class="transcribe-text">AI расшифровывает...</span>';
      box.style.display = 'block';
      box.innerHTML = '<div style="color:var(--accent-cyan); font-style:italic;">⏳ Gemini AI распознает аудио и формирует текст...</div>';

      try {
        const response = await fetch(getApiUrl('/api/transcribe'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioData: audioSrc })
        });

        const data = await response.json();

        if (data.success && data.text) {
          const newCount = recordTranscribeUsage();
          btn.innerHTML = `✅ <span class="transcribe-text">Расшифровано</span>`;
          btn.style.background = 'rgba(16, 185, 129, 0.2)';
          btn.style.borderColor = 'rgba(16, 185, 129, 0.5)';

          box.innerHTML = `
            <div class="transcribe-header">
              <span>📝 Расшифровка Gemini AI</span>
              <span class="transcribe-badge">${newCount}/3 на этой неделе</span>
            </div>
            <div class="transcribe-text-content">${escapeHtml(data.text)}</div>
          `;
        } else {
          btn.disabled = false;
          btn.innerHTML = '📝 <span class="transcribe-text">Повторить</span>';
          box.innerHTML = `<div style="color:#ef4444;">❌ Ошибка: ${escapeHtml(data.error || 'Не удалось распознать речь')}</div>`;
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '📝 <span class="transcribe-text">Повторить</span>';
        box.innerHTML = `<div style="color:#ef4444;">❌ Ошибка сети: ${escapeHtml(err.message)}</div>`;
      }
    };

    // Emoji Picker Initialization
    const emojiPickerBtn = document.getElementById('emojiPickerBtn');
    const emojiPickerPanel = document.getElementById('emojiPickerPanel');
    const emojiPickerGrid = document.getElementById('emojiPickerGrid');
    const msgReactionPickerPanel = document.getElementById('msgReactionPickerPanel');

    const availableEmojis = [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋', '😜', '😎', '🤩', '🥳', '🤪', '🤷‍♂️', '🤷‍♀️', '🤦‍♂️', '🤦‍♀️',
      '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '👈', '👉', '👆', '👇', '☝️', '🖐', '✋', '🖖', '👋', '🤙',
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '⚡', '🔥', '🌟', '✨', '💥', '💯', '🎯', '🚀', '🎉', '🎊', '💬', '📌', '💡', '💩', '💀', '👻', '🤡', '🤖', '🐱', '🐶', '🐼', '🍕', '🍔', '🍟', '☕', '🍻', '⚽', '🎮', '🎵', '🎧'
    ];

    if (emojiPickerGrid) {
      availableEmojis.forEach(em => {
        const item = document.createElement('div');
        item.className = 'emoji-picker-item';
        item.textContent = em;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerEmojiPopAnim(item, em, e.clientX, e.clientY);
          insertEmojiToInput(em);
        });
        emojiPickerGrid.appendChild(item);
      });
    }

    function insertEmojiToInput(emoji) {
      if (!chatInput) return;
      const start = chatInput.selectionStart !== null && chatInput.selectionStart !== undefined ? chatInput.selectionStart : chatInput.value.length;
      const end = chatInput.selectionEnd !== null && chatInput.selectionEnd !== undefined ? chatInput.selectionEnd : chatInput.value.length;
      const val = chatInput.value;
      chatInput.value = val.substring(0, start) + emoji + val.substring(end);
      chatInput.focus();
      const newPos = start + emoji.length;
      chatInput.setSelectionRange(newPos, newPos);
    }

    if (emojiPickerBtn && emojiPickerPanel) {
      emojiPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (msgReactionPickerPanel) msgReactionPickerPanel.classList.remove('active');
        emojiPickerPanel.classList.toggle('active');
      });
    }

    document.addEventListener('click', (e) => {
      // Button-contained inner wave ripple
      const targetBtn = e.target.closest('.ripple-btn, .icon-action-btn, .modal-btn, .settings-tab-btn, .cancel-btn, .quick-action-card, .discord-btn-secondary, .discord-btn-danger, .settings-nav-item, .room-item, .dm-user-item, button');
      if (targetBtn) {
        if (getComputedStyle(targetBtn).position === 'static') {
          targetBtn.style.position = 'relative';
        }
        if (getComputedStyle(targetBtn).overflow !== 'hidden') {
          targetBtn.style.overflow = 'hidden';
        }
        const rect = targetBtn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const innerWave = document.createElement('span');
        innerWave.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(168,85,247,0.5) 40%, rgba(6,182,212,0.3) 70%, transparent 100%);
          box-shadow: 0 0 15px rgba(168,85,247,0.8);
          transform: translate(-50%, -50%);
          animation: buttonInnerWave 0.5s ease-out forwards;
          pointer-events: none;
          z-index: 10;
        `;
        targetBtn.appendChild(innerWave);
        setTimeout(() => { if (innerWave && innerWave.parentNode) innerWave.parentNode.removeChild(innerWave); }, 500);
      }

      if (emojiPickerPanel && !emojiPickerPanel.contains(e.target) && e.target !== emojiPickerBtn) {
        emojiPickerPanel.classList.remove('active');
      }
      if (msgReactionPickerPanel && !msgReactionPickerPanel.contains(e.target)) {
        msgReactionPickerPanel.classList.remove('active');
      }
    });

    function playNotificationSound() {
      if (!state.soundEnabled) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } catch (e) {}
    }

    // ==========================================================================
    // WEBRTC VOICE & VIDEO CALL ENGINE WITH DYNAMIC ISLAND & FULL SCREEN UI
    // ==========================================================================
    const callState = {
      peerConnection: null,
      localStream: null,
      remoteStream: null,
      activeCallId: null,
      peerUser: null,
      isVideo: false,
      callTimerInterval: null,
      callStartTime: 0,
      micMuted: false,
      camOff: false,
      pendingCandidates: [],
      callAccepted: false,
      isCaller: false,
      ringTimeout: null
    };

    const iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.services.mozilla.com' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelay',
          credential: 'openrelay'
        }
      ],
      iceCandidatePoolSize: 10
    };

    // UI Elements
    const startVoiceCallBtn = document.getElementById('startVoiceCallBtn');
    const startVideoCallBtn = document.getElementById('startVideoCallBtn');
    const incomingCallModal = document.getElementById('incomingCallModal');
    const incomingCallUser = document.getElementById('incomingCallUser');
    const incomingCallType = document.getElementById('incomingCallType');
    const incomingCallIcon = document.getElementById('incomingCallIcon');
    const acceptCallBtn = document.getElementById('acceptCallBtn');
    const declineCallBtn = document.getElementById('declineCallBtn');
    const closeVpnWarningBtn = document.getElementById('closeVpnWarningBtn');

    if (closeVpnWarningBtn) {
      closeVpnWarningBtn.addEventListener('click', () => {
        const banner = document.getElementById('vpnWarningBanner');
        if (banner) banner.style.display = 'none';
        sessionStorage.setItem('vpn_warning_closed', 'true');
      });
    }

    function detectVpnAndWarn() {
      if (sessionStorage.getItem('vpn_warning_closed') === 'true') return;

      const showBanner = () => {
        const banner = document.getElementById('vpnWarningBanner');
        if (banner) banner.style.display = 'flex';
      };

      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('vpn_probe');
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});

        const uniqueSubnets = new Set();

        pc.onicecandidate = (evt) => {
          if (!evt.candidate) {
            try { pc.close(); } catch(e){}
            return;
          }
          const cand = evt.candidate.candidate.toLowerCase();

          if (
            cand.includes(' 100.6') || cand.includes(' 100.7') || cand.includes(' 100.8') ||
            cand.includes(' 100.9') || cand.includes(' 100.10') || cand.includes(' 100.11') || cand.includes(' 100.12') ||
            cand.includes(' 10.8.') || cand.includes(' 10.14.') || cand.includes(' 10.252.') ||
            cand.includes(' 10.211.') || cand.includes(' 172.20.') || cand.includes(' 172.28.') ||
            cand.includes('tun') || cand.includes('tap') || cand.includes('wireguard') || cand.includes('openvpn')
          ) {
            showBanner();
          }

          const match = cand.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (match) {
            const ip = match[1];
            if (!ip.startsWith('127.')) {
              const subnet = ip.split('.').slice(0, 2).join('.');
              uniqueSubnets.add(subnet);
            }
          }

          if (uniqueSubnets.size >= 2) {
            showBanner();
          }
        };

        setTimeout(() => {
          try { pc.close(); } catch(e){}
        }, 3000);
      } catch (e) {
        console.warn('VPN detection probe exception:', e);
      }
    }

    setTimeout(detectVpnAndWarn, 1500);

    function logCallSystemMessage(peerName, callType, statusText) {
      if (!peerName) return;
      const myUser = state.username || '';
      const dmRoom = getDMKey(myUser, peerName);
      
      sendPayload({
        type: 'send_message',
        room: dmRoom,
        content: statusText,
        isSystemCall: true
      });
    }

    // Dynamic Island Elements
    const dynamicIslandPill = document.getElementById('dynamicIslandPill');
    const islandTypeIcon = document.getElementById('islandTypeIcon');
    const islandPeerName = document.getElementById('islandPeerName');
    const islandTimer = document.getElementById('islandTimer');
    const islandEndBtn = document.getElementById('islandEndBtn');

    // Full Screen Overlay Elements
    const fullScreenCallOverlay = document.getElementById('fullScreenCallOverlay');
    const minimizeCallBtn = document.getElementById('minimizeCallBtn');
    const fullScreenCallTimer = document.getElementById('fullScreenCallTimer');
    const fullVideoGrid = document.getElementById('fullVideoGrid');
    const fullVoiceContainer = document.getElementById('fullVoiceContainer');
    const fullCallAvatar = document.getElementById('fullCallAvatar');
    const fullCallUsername = document.getElementById('fullCallUsername');
    const fullCallStatus = document.getElementById('fullCallStatus');

    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');
    const remoteAudio = document.getElementById('remoteAudio');

    const fullToggleMicBtn = document.getElementById('fullToggleMicBtn');
    const fullToggleCamBtn = document.getElementById('fullToggleCamBtn');
    const fullEndCallBtn = document.getElementById('fullEndCallBtn');

    function unlockAudioContext() {
      if (remoteAudio) {
        remoteAudio.volume = 1.0;
        remoteAudio.muted = false;
        if (remoteAudio.srcObject) {
          remoteAudio.play().catch(() => {});
        }
      }
    }

    document.addEventListener('click', unlockAudioContext);
    document.addEventListener('touchstart', unlockAudioContext);

    // Event Listeners
    if (startVoiceCallBtn) startVoiceCallBtn.addEventListener('click', () => { unlockAudioContext(); initiateCall(false); });
    if (startVideoCallBtn) startVideoCallBtn.addEventListener('click', () => { unlockAudioContext(); initiateCall(true); });
    if (acceptCallBtn) acceptCallBtn.addEventListener('click', () => { unlockAudioContext(); acceptCall(); });
    if (declineCallBtn) declineCallBtn.addEventListener('click', declineCall);

    if (dynamicIslandPill) {
      dynamicIslandPill.addEventListener('click', (e) => {
        if (e.target.closest('#islandEndBtn')) return;
        unlockAudioContext();
        showFullScreenCall();
      });
    }
    if (islandEndBtn) {
      islandEndBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        endCall();
      });
    }

    if (minimizeCallBtn) minimizeCallBtn.addEventListener('click', hideFullScreenCall);
    if (fullToggleMicBtn) fullToggleMicBtn.addEventListener('click', toggleMicrophone);
    if (fullToggleCamBtn) fullToggleCamBtn.addEventListener('click', toggleCamera);
    if (fullEndCallBtn) fullEndCallBtn.addEventListener('click', endCall);

    const addContactToCallBtn = document.getElementById('addContactToCallBtn');
    if (addContactToCallBtn) {
        addContactToCallBtn.addEventListener('click', () => {
            const contactUsername = prompt('Введите никнейм пользователя для приглашения в звонок:');
            if (contactUsername && contactUsername.trim()) {
                sendPayload({
                    type: 'call_start',
                    targetUser: contactUsername.trim(),
                    isVideo: callState.isVideo,
                    callId: callState.activeCallId
                });
                alert('Приглашение отправлено пользователю @' + contactUsername.trim());
            }
        });
    }


    function showFullScreenCall() {
      if (fullScreenCallOverlay) fullScreenCallOverlay.style.display = 'flex';
      if (dynamicIslandPill) dynamicIslandPill.style.display = 'none';
    }

    function hideFullScreenCall() {
      if (fullScreenCallOverlay) fullScreenCallOverlay.style.display = 'none';
      if (callState.activeCallId && dynamicIslandPill) dynamicIslandPill.style.display = 'flex';
    }

    
    let jitsiApi = null;

    function setupJitsiCall(callId, isVideo) {
      if (jitsiApi) {
        jitsiApi.dispose();
      }
      
      const domain = 'meet.jit.si';
      const options = {
          roomName: 'VesperChat_' + callId,
          width: '100%',
          height: '100%',
          parentNode: document.querySelector('#fullVideoGrid'),
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: !isVideo,
            prejoinPageEnabled: false
          },
          userInfo: {
              displayName: state.username
          }
      };
      
      // Setup UI
      const vGrid = document.getElementById('fullVideoGrid');
      const vVoice = document.getElementById('fullVoiceContainer');
      const botCtrls = document.getElementById('fullToggleMicBtn').parentNode;
      
      if (vGrid) {
          vGrid.style.display = 'block';
          vGrid.style.height = '70vh';
          vGrid.style.maxWidth = '100%';
          vGrid.innerHTML = '';
      }
      if (vVoice) vVoice.style.display = 'none';
      if (botCtrls) botCtrls.style.display = 'none'; // Jitsi has its own controls
      
      jitsiApi = new JitsiMeetExternalAPI(domain, options);
      
      jitsiApi.addEventListener('videoConferenceLeft', () => {
          endCall();
      });
    }

    async function initiateCall(isVideo) {
      if (callState.activeCallId) {
        alert('У вас уже идет активный звонок!');
        return;
      }

      let targetUser = state.activeDMRecipient;
      let targetRoom = state.currentRoom;

      if (!targetUser && !targetRoom) {
        alert('Выберите чат или группу для звонка!');
        return;
      }

      callState.isVideo = isVideo;
      callState.peerUser = targetUser || targetRoom;
      callState.activeCallId = 'call_' + Date.now();
      callState.micMuted = false;
      callState.camOff = false;
      callState.callAccepted = true;
      callState.isCaller = true;

      setupJitsiCall(callState.activeCallId, isVideo);
      showFullScreenCall();

      sendPayload({
        type: 'call_start',
        targetUser: targetUser,
        targetRoom: targetRoom,
        isVideo: isVideo,
        callId: callState.activeCallId
      });
      startCallTimer();
    }

    function setupCallUI(peerName, isVideo, statusText) {
      // Handled by Jitsi now
    }

    function createPeerConnection() {
      // Deprecated
    }

    function handleIncomingCall(msg) {
      callState.activeCallId = msg.callId;
      callState.peerUser = msg.fromUser;
      callState.isVideo = msg.isVideo;
      callState.callAccepted = false;
      callState.isCaller = false;

      if (incomingCallUser) incomingCallUser.textContent = `@${msg.fromUser}`;
      if (incomingCallType) incomingCallType.textContent = msg.isVideo ? '📹 Входящий видеозвонок...' : '📞 Входящий звонок...';
      if (incomingCallIcon) incomingCallIcon.textContent = msg.isVideo ? '📹' : '📞';
      
      if (incomingCallModal) incomingCallModal.style.display = 'block';
      playCallRingtone();
    }

    async function acceptCall() {
      if (incomingCallModal) incomingCallModal.style.display = 'none';
      stopCallRingtone();
      callState.callAccepted = true;

      setupJitsiCall(callState.activeCallId, callState.isVideo);
      showFullScreenCall();

      sendPayload({
        type: 'call_accept',
        targetUser: callState.peerUser,
        callId: callState.activeCallId
      });
      startCallTimer();
    }

    function declineCall() {
      if (incomingCallModal) incomingCallModal.style.display = 'none';
      stopCallRingtone();
      if (callState.peerUser && callState.activeCallId) {
        sendPayload({
          type: 'call_decline',
          targetUser: callState.peerUser,
          callId: callState.activeCallId
        });
      }
      resetCallState();
    }

    async function handleCallAccepted(msg) {
      // Handled by Jitsi automatically connecting people to same room
    }

    function handleCallDeclined(msg) {
      stopCallRingtone();
      alert(`Пользователь @${msg.fromUser} отклонил звонок.`);
    }

    async function handleCallSignal(msg) {
      // Deprecated
    }

    function endCall() {
      stopCallRingtone();
      if (jitsiApi) {
          jitsiApi.dispose();
          jitsiApi = null;
      }
      resetCallState();
    }

    function toggleMicrophone() {
        if (jitsiApi) {
            jitsiApi.executeCommand('toggleAudio');
        }
    }
    function toggleCamera() {
        if (jitsiApi) {
            jitsiApi.executeCommand('toggleVideo');
        }
    }

function startCallTimer() {
      callState.callStartTime = Date.now();
      if (islandTimer) islandTimer.textContent = '00:00';
      if (fullScreenCallTimer) fullScreenCallTimer.textContent = '00:00';
      clearInterval(callState.callTimerInterval);
      callState.callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callState.callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        const formatted = `${mins}:${secs}`;
        if (islandTimer) islandTimer.textContent = formatted;
        if (fullScreenCallTimer) fullScreenCallTimer.textContent = formatted;
      }, 1000);
    }

    let ringInterval = null;
    function playCallRingtone() {
      stopCallRingtone();
      ringInterval = setInterval(() => playNotificationSound(), 1200);
    }

    function stopCallRingtone() {
      if (ringInterval) {
        clearInterval(ringInterval);
        ringInterval = null;
      }
    }

    function resetCallState() {
      stopCallRingtone();
      clearInterval(callState.callTimerInterval);
      clearTimeout(callState.ringTimeout);
      callState.ringTimeout = null;
      callState.callAccepted = false;
      callState.isCaller = false;

      if (callState.localStream) {
        callState.localStream.getTracks().forEach(t => t.stop());
      }
      if (callState.peerConnection) {
        callState.peerConnection.close();
      }

      callState.peerConnection = null;
      callState.localStream = null;
      callState.remoteStream = null;
      callState.activeCallId = null;
      callState.peerUser = null;
      callState.pendingCandidates = [];

      if (localVideo) localVideo.srcObject = null;
      if (remoteVideo) remoteVideo.srcObject = null;
      if (remoteAudio) remoteAudio.srcObject = null;

      if (incomingCallModal) incomingCallModal.style.display = 'none';
      if (dynamicIslandPill) dynamicIslandPill.style.display = 'none';
      if (fullScreenCallOverlay) fullScreenCallOverlay.style.display = 'none';
    }

    // ==========================================================================
    // 1. PINNED MESSAGES LOGIC
    // ==========================================================================
    function pinMessageInCurrentRoom(msg) {
      if (!state.currentRoom) return;
      const pinData = {
        id: msg.id || ('msg_' + Math.random().toString(36).substring(2, 9)),
        author: msg.username || 'Пользователь',
        content: msg.content || (msg.isVoice ? '🎤 Голосовое сообщение' : (msg.fileName ? `📎 ${msg.fileName}` : 'Сообщение')),
        timestamp: msg.timestamp || ''
      };
      localStorage.setItem(`cyberchord_pin_${state.currentRoom}`, JSON.stringify(pinData));
      updatePinnedMessageBar();
      showToast('📌 Сообщение закреплено вверху!');
    }

    function unpinMessageInCurrentRoom() {
      if (!state.currentRoom) return;
      localStorage.removeItem(`cyberchord_pin_${state.currentRoom}`);
      updatePinnedMessageBar();
      showToast('📌 Сообщение откреплено');
    }

    function updatePinnedMessageBar() {
      const bar = document.getElementById('pinnedMessageBar');
      if (!bar || !state.currentRoom) return;
      const raw = localStorage.getItem(`cyberchord_pin_${state.currentRoom}`);
      if (!raw) {
        bar.style.display = 'none';
        return;
      }
      try {
        const pin = JSON.parse(raw);
        const authorEl = document.getElementById('pinnedMsgAuthor');
        const textEl = document.getElementById('pinnedMsgText');
        if (authorEl) authorEl.textContent = `Закреплено от @${pin.author}:`;
        if (textEl) textEl.textContent = pin.content;
        bar.style.display = 'flex';
      } catch (e) {
        bar.style.display = 'none';
      }
    }

    const unpinMsgBtn = document.getElementById('unpinMsgBtn');
    if (unpinMsgBtn) {
      unpinMsgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        unpinMessageInCurrentRoom();
      });
    }

    const pinnedMessageBar = document.getElementById('pinnedMessageBar');
    if (pinnedMessageBar) {
      pinnedMessageBar.addEventListener('click', (e) => {
        if (e.target.closest('#unpinMsgBtn')) return;
        const raw = localStorage.getItem(`cyberchord_pin_${state.currentRoom}`);
        if (raw) {
          try {
            const pin = JSON.parse(raw);
            scrollToMessage(pin.id, pin.timestamp);
          } catch(e) {}
        }
      });
    }

    // ==========================================================================
    // 2. SAVED MESSAGES (FAVORITES / ИЗБРАННОЕ) LOGIC
    // ==========================================================================
    function forwardToSavedMessages(msg) {
      const favRoom = `DM:favorited_${state.username}`;
      const textSnippet = msg.content || (msg.isVoice ? '🎤 Голосовое сообщение' : (msg.fileName ? `📎 ${msg.fileName}` : 'Сообщение'));
      const forwardedContent = `🔖 Переслано от @${msg.username || 'User'}:\n${textSnippet}`;
      sendPayload({
        type: 'chat',
        room: favRoom,
        content: forwardedContent,
        fileData: msg.fileData || null,
        fileName: msg.fileName || null,
        fileType: msg.fileType || null,
        fileSize: msg.fileSize || null,
        isVoice: Boolean(msg.isVoice)
      });
      showToast('🔖 Сообщение сохранено в «Избранное»!');
    }

    // ==========================================================================
    // 3. VOICE PLAYBACK SPEED CONTROLLER
    // ==========================================================================
    function cycleVoiceSpeed(voiceId) {
      const audio = document.getElementById(voiceId);
      const btn = document.getElementById('speed_btn_' + voiceId);
      if (!audio || !btn) return;
      let current = audio.playbackRate || 1;
      let next = 1;
      if (current === 1) next = 1.5;
      else if (current === 1.5) next = 2;
      else if (current === 2) next = 0.5;
      else next = 1;
      
      audio.playbackRate = next;
      btn.textContent = next + 'x';
    }

    // ==========================================================================
    // 4. GLOBAL SEARCH MODAL (Ctrl+K) LOGIC
    // ==========================================================================
    const openGlobalSearchBtn = document.getElementById('openGlobalSearchBtn');
    const globalSearchModal = document.getElementById('globalSearchModal');
    const closeGlobalSearchModalBtn = document.getElementById('closeGlobalSearchModalBtn');
    const globalSearchModalInput = document.getElementById('globalSearchModalInput');
    const globalSearchResultsList = document.getElementById('globalSearchResultsList');
    let activeGlobalSearchFilter = 'all';

    if (openGlobalSearchBtn) {
      openGlobalSearchBtn.addEventListener('click', openGlobalSearchModal);
    }

    if (closeGlobalSearchModalBtn) {
      closeGlobalSearchModalBtn.addEventListener('click', closeGlobalSearchModal);
    }

    function openGlobalSearchModal() {
      if (globalSearchModal) {
        globalSearchModal.classList.add('active');
        if (globalSearchModalInput) {
          globalSearchModalInput.value = '';
          globalSearchModalInput.focus();
          renderGlobalSearchResults('');
        }
      }
    }

    function closeGlobalSearchModal() {
      if (globalSearchModal) globalSearchModal.classList.remove('active');
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openGlobalSearchModal();
      }
    });

    if (globalSearchModalInput) {
      globalSearchModalInput.addEventListener('input', () => {
        renderGlobalSearchResults(globalSearchModalInput.value);
      });
    }

    document.querySelectorAll('.global-search-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.global-search-filter').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'rgba(255,255,255,0.08)';
          b.style.color = 'var(--text-muted)';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--accent-purple)';
        btn.style.color = '#fff';
        activeGlobalSearchFilter = btn.dataset.filter || 'all';
        if (globalSearchModalInput) renderGlobalSearchResults(globalSearchModalInput.value);
      });
    });

    function renderGlobalSearchResults(query) {
      if (!globalSearchResultsList) return;
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        globalSearchResultsList.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">Введите запрос для поиска по всем вашим перепискам и комнатам...</div>';
        return;
      }

      const allCards = Array.from(document.querySelectorAll('.message-card'));
      const matches = [];

      allCards.forEach(card => {
        const text = (card.dataset.msgContent || '').toLowerCase();
        const author = (card.dataset.msgAuthor || '').toLowerCase();
        const id = card.dataset.msgId;
        const ts = card.dataset.msgTimestamp || '';
        const isVoiceOrFile = card.querySelector('.voice-msg-card, .msg-file-card, .msg-image-preview');

        let passesFilter = true;
        if (activeGlobalSearchFilter === 'text' && isVoiceOrFile) passesFilter = false;
        if (activeGlobalSearchFilter === 'file' && !isVoiceOrFile) passesFilter = false;

        if (passesFilter && (text.includes(q) || author.includes(q))) {
          matches.push({
            id: id,
            ts: ts,
            author: card.dataset.msgAuthor || 'User',
            text: card.dataset.msgContent || (isVoiceOrFile ? '📁 Вложение / Голосовое' : 'Сообщение'),
            room: state.currentRoom
          });
        }
      });

      if (matches.length === 0) {
        globalSearchResultsList.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">Сообщений по запросу «${escapeHtml(query)}» не найдено</div>`;
        return;
      }

      globalSearchResultsList.innerHTML = '';
      matches.forEach(m => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; cursor: pointer; transition: background 0.2s;';
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom: 4px;">
            <span style="color: var(--accent-purple); font-weight: 800;">@${escapeHtml(m.author)}</span>
            <span style="color: var(--text-muted);">${escapeHtml(m.ts)}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(m.text)}
          </div>
        `;
        item.addEventListener('click', () => {
          closeGlobalSearchModal();
          scrollToMessage(m.id, m.ts);
        });
        globalSearchResultsList.appendChild(item);
      });
    }

    // ==========================================================================
    // 5. SCHEDULED MESSAGES LOGIC
    // ==========================================================================
    const openScheduleModalBtn = document.getElementById('openScheduleModalBtn');
    const scheduledMessageModal = document.getElementById('scheduledMessageModal');
    const closeScheduledModalBtn = document.getElementById('closeScheduledModalBtn');
    const cancelScheduleModalBtn = document.getElementById('cancelScheduleModalBtn');
    const confirmScheduleMsgBtn = document.getElementById('confirmScheduleMsgBtn');
    const scheduledTextInput = document.getElementById('scheduledTextInput');
    const scheduledDateTimeInput = document.getElementById('scheduledDateTimeInput');
    const scheduledQueueBadge = document.getElementById('scheduledQueueBadge');

    const scheduledListModal = document.getElementById('scheduledListModal');
    const closeScheduledListModalBtn = document.getElementById('closeScheduledListModalBtn');
    const scheduledItemsContainer = document.getElementById('scheduledItemsContainer');

    if (openScheduleModalBtn) {
      openScheduleModalBtn.addEventListener('click', () => {
        if (scheduledMessageModal) {
          const chatInput = document.getElementById('chatInput');
          if (scheduledTextInput && chatInput) {
            scheduledTextInput.value = chatInput.value;
          }
          // Set default date/time to today + 1 hour in local format YYYY-MM-DDTHH:mm
          const d = new Date(Date.now() + 3600 * 1000);
          const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          if (scheduledDateTimeInput) scheduledDateTimeInput.value = localIso;

          scheduledMessageModal.classList.add('active');
        }
      });
    }

    function closeScheduledModal() {
      if (scheduledMessageModal) scheduledMessageModal.classList.remove('active');
    }

    if (closeScheduledModalBtn) closeScheduledModalBtn.addEventListener('click', closeScheduledModal);
    if (cancelScheduleModalBtn) cancelScheduleModalBtn.addEventListener('click', closeScheduledModal);

    document.querySelectorAll('.schedule-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let target = new Date();
        if (btn.dataset.minutes) {
          target = new Date(Date.now() + parseInt(btn.dataset.minutes, 10) * 60000);
        } else if (btn.dataset.preset === 'tonight') {
          target.setHours(21, 0, 0, 0);
          if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
        } else if (btn.dataset.preset === 'tomorrow_morning') {
          target.setDate(target.getDate() + 1);
          target.setHours(9, 0, 0, 0);
        }
        const localIso = new Date(target.getTime() - target.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        if (scheduledDateTimeInput) scheduledDateTimeInput.value = localIso;
      });
    });

    if (confirmScheduleMsgBtn) {
      confirmScheduleMsgBtn.addEventListener('click', () => {
        const text = scheduledTextInput ? scheduledTextInput.value.trim() : '';
        const dtVal = scheduledDateTimeInput ? scheduledDateTimeInput.value : '';

        if (!text) {
          alert('Введите текст сообщения');
          return;
        }
        if (!dtVal) {
          alert('Укажите дату и время отправки');
          return;
        }

        const formattedDt = dtVal.includes('T') ? dtVal : dtVal.replace(' ', 'T');
        const targetTs = new Date(formattedDt).getTime();
        if (isNaN(targetTs) || targetTs <= Date.now()) {
          alert('Время отправки должно быть в будущем!');
          return;
        }

        const scheduledItem = {
          id: 'sch_' + Math.random().toString(36).substring(2, 9),
          room: state.currentRoom,
          content: text,
          scheduledTime: targetTs,
          author: state.username || 'Я'
        };

        const uKey = (state.username || 'user').toLowerCase();
        const key = `cyberchord_scheduled_${uKey}`;
        let queue = [];
        try {
          const raw = localStorage.getItem(key) || localStorage.getItem(`cyberchord_scheduled_${state.username}`);
          if (raw) queue = JSON.parse(raw);
        } catch(e) {}

        queue.push(scheduledItem);
        localStorage.setItem(key, JSON.stringify(queue));

        const chatInput = document.getElementById('chatInput');
        if (chatInput) chatInput.value = '';

        closeScheduledModal();
        updateScheduledBadge();
        showToast('🕒 Сообщение запланировано!');
      });
    }

    function getScheduledQueue() {
      const uKey = (state.username || 'user').toLowerCase();
      let queue = [];
      try {
        const raw = localStorage.getItem(`cyberchord_scheduled_${uKey}`) || localStorage.getItem(`cyberchord_scheduled_${state.username}`);
        if (raw) queue = JSON.parse(raw);
      } catch(e) {}
      return Array.isArray(queue) ? queue : [];
    }

    function saveScheduledQueue(queue) {
      const uKey = (state.username || 'user').toLowerCase();
      const key = `cyberchord_scheduled_${uKey}`;
      localStorage.setItem(key, JSON.stringify(queue));
    }

    function updateScheduledBadge() {
      if (!scheduledQueueBadge) return;
      const queue = getScheduledQueue();
      const count = queue.filter(item => item.room === state.currentRoom).length;

      if (count > 0) {
        scheduledQueueBadge.textContent = `🕒 ${count}`;
        scheduledQueueBadge.style.display = 'inline-block';
      } else {
        scheduledQueueBadge.style.display = 'none';
      }
    }

    if (scheduledQueueBadge) {
      scheduledQueueBadge.addEventListener('click', openScheduledListModal);
    }

    if (closeScheduledListModalBtn) {
      closeScheduledListModalBtn.addEventListener('click', closeScheduledListModal);
    }

    function openScheduledListModal() {
      if (scheduledListModal) {
        scheduledListModal.classList.add('active');
        renderScheduledItems();
      }
    }

    function closeScheduledListModal() {
      if (scheduledListModal) {
        scheduledListModal.classList.remove('active');
      }
    }

    function renderScheduledItems() {
      if (!scheduledItemsContainer) return;
      const queue = getScheduledQueue();
      const roomQueue = queue.filter(item => item.room === state.currentRoom);

      if (roomQueue.length === 0) {
        scheduledItemsContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">В этом чате нет отложенных сообщений</div>';
        return;
      }

      scheduledItemsContainer.innerHTML = '';
      roomQueue.forEach(item => {
        const d = new Date(item.scheduledTime);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        const diffMs = item.scheduledTime - Date.now();
        let relativeStr = '';
        if (diffMs > 0) {
          const diffMins = Math.round(diffMs / 60000);
          if (diffMins < 60) relativeStr = `через ${diffMins} мин.`;
          else relativeStr = `через ${Math.floor(diffMins / 60)} ч. ${diffMins % 60} мин.`;
        } else {
          relativeStr = 'готов к отправке';
        }

        const div = document.createElement('div');
        div.style.cssText = 'padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; display: flex; flex-direction: column; gap: 6px; position: relative;';
        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--accent-cyan); font-weight: 700;">
            <span>🕒 ${dateStr}, ${timeStr} (${relativeStr})</span>
            <button class="delete-scheduled-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 700; cursor: pointer;" title="Отменить и удалить">🗑️ Удалить</button>
          </div>
          <div style="font-size: 13px; color: var(--text-main); word-break: break-word; white-space: pre-wrap;">${escapeHtml(item.content)}</div>
        `;

        div.querySelector('.delete-scheduled-btn').addEventListener('click', () => {
          deleteScheduledItem(item.id);
        });

        scheduledItemsContainer.appendChild(div);
      });
    }

    function deleteScheduledItem(itemId) {
      let queue = getScheduledQueue();
      queue = queue.filter(item => item.id !== itemId);
      saveScheduledQueue(queue);
      updateScheduledBadge();
      renderScheduledItems();
      showToast('🗑️ Отложенное сообщение удалено!');
    }

    setInterval(() => {
      if (!state.username) return;
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

      const queue = getScheduledQueue();
      if (queue.length === 0) return;

      const now = Date.now();
      const ready = queue.filter(item => item.scheduledTime <= now);
      const remaining = queue.filter(item => item.scheduledTime > now);

      if (ready.length > 0) {
        ready.forEach(item => {
          sendPayload({
            type: 'chat',
            room: item.room,
            content: item.content
          });
        });
        saveScheduledQueue(remaining);
        updateScheduledBadge();
        if (scheduledListModal && scheduledListModal.classList.contains('active')) {
          renderScheduledItems();
        }
        if (typeof playNotificationSound === 'function') playNotificationSound();
        showToast('🚀 Запланированное сообщение отправлено!');
      }
    }, 2000);

    // ==========================================================================
    // 6. PIN LOCK & NUMPAD PROTECTION LOGIC (REGISTRATION, LOGIN & SETTINGS)
    // ==========================================================================
    const pinLockScreen = document.getElementById('pinLockScreen');
    const pinProtectionToggle = document.getElementById('pinProtectionToggle');
    const setChangePinBtn = document.getElementById('setChangePinBtn');
    const pinBackBtn = document.getElementById('pinBackBtn');
    const pinThemeToggleBtn = document.getElementById('pinThemeToggleBtn');
    const pinTitleText = document.getElementById('pinTitleText');
    const pinErrorText = document.getElementById('pinErrorText');

    let pinCodeInputBuffer = '';
    let pinScreenMode = 'LOGIN'; // 'LOGIN' | 'REGISTER' | 'SETTINGS_CHANGE'
    let pendingPinUser = '';
    let pendingPinPass = '';
    let expectedPinCode = '';

    function showPinScreenForRegistration(username, password) {
      pinScreenMode = 'REGISTER';
      pendingPinUser = username;
      pendingPinPass = password;
      pinCodeInputBuffer = '';

      if (pinTitleText) pinTitleText.textContent = 'Создайте PIN-код';
      if (pinErrorText) {
        pinErrorText.textContent = 'Придумайте 4-значный PIN-код для защиты входа';
        pinErrorText.style.color = 'var(--text-muted)';
        pinErrorText.style.opacity = '1';
      }
      updatePinDotsUI();
      if (pinLockScreen) pinLockScreen.style.display = 'flex';
    }

    function showPinScreenForLogin(username, password, pin) {
      pinScreenMode = 'LOGIN';
      pendingPinUser = username;
      pendingPinPass = password;
      expectedPinCode = pin;
      pinCodeInputBuffer = '';

      if (pinTitleText) pinTitleText.textContent = 'Введи пароль';
      if (pinErrorText) {
        pinErrorText.textContent = 'Введите ваш 4-значный PIN-код';
        pinErrorText.style.color = 'var(--text-muted)';
        pinErrorText.style.opacity = '1';
      }
      updatePinDotsUI();
      if (pinLockScreen) pinLockScreen.style.display = 'flex';
    }

    function showPinScreenForChange() {
      pinScreenMode = 'SETTINGS_CHANGE';
      pinCodeInputBuffer = '';

      if (pinTitleText) pinTitleText.textContent = 'Новый PIN-код';
      if (pinErrorText) {
        pinErrorText.textContent = 'Введите 4 цифры нового PIN-кода';
        pinErrorText.style.color = 'var(--text-muted)';
        pinErrorText.style.opacity = '1';
      }
      updatePinDotsUI();
      if (pinLockScreen) pinLockScreen.style.display = 'flex';
    }

    function hidePinLockScreen() {
      if (pinLockScreen) pinLockScreen.style.display = 'none';
      pinCodeInputBuffer = '';
    }

    if (pinBackBtn) {
      pinBackBtn.addEventListener('click', () => {
        hidePinLockScreen();
      });
    }

    if (pinThemeToggleBtn) {
      pinThemeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('ui-theme-light');
        const isLight = document.body.classList.contains('ui-theme-light');
        pinThemeToggleBtn.textContent = isLight ? '🌙' : '☀️';
      });
    }

    if (setChangePinBtn) {
      setChangePinBtn.addEventListener('click', () => {
        showPinScreenForChange();
      });
    }

    if (pinProtectionToggle) {
      const isCurrentEnabled = localStorage.getItem('cyberchord_pin_enabled_' + (state.username || '')) !== 'false' && localStorage.getItem('cyberchord_pin_enabled') !== 'false';
      pinProtectionToggle.checked = isCurrentEnabled;

      pinProtectionToggle.addEventListener('change', () => {
        const u = state.username || 'user';
        if (pinProtectionToggle.checked) {
          const existingPin = localStorage.getItem('cyberchord_pin_' + u) || localStorage.getItem('cyberchord_pin_code');
          if (!existingPin) {
            showPinScreenForChange();
          } else {
            localStorage.setItem('cyberchord_pin_enabled_' + u, 'true');
            localStorage.setItem('cyberchord_pin_enabled', 'true');
            showToast('🔒 Защита PIN-кодом включена');
          }
        } else {
          localStorage.setItem('cyberchord_pin_enabled_' + u, 'false');
          localStorage.setItem('cyberchord_pin_enabled', 'false');
          showToast('🔓 Защита PIN-кодом отключена');
        }
      });
    }

    document.querySelectorAll('.numpad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (key && pinCodeInputBuffer.length < 4) {
          pinCodeInputBuffer += key;
          updatePinDotsUI();

          if (pinCodeInputBuffer.length === 4) {
            handlePin4DigitsEntered();
          }
        }
      });
    });

    function handlePin4DigitsEntered() {
      const entered = pinCodeInputBuffer;

      if (pinScreenMode === 'REGISTER') {
        const u = pendingPinUser || 'user';
        localStorage.setItem('cyberchord_pin_' + u, entered);
        localStorage.setItem('cyberchord_pin_enabled_' + u, 'true');
        localStorage.setItem('cyberchord_pin_code', entered);
        localStorage.setItem('cyberchord_pin_enabled', 'true');

        hidePinLockScreen();
        showToast('🔑 PIN-код успешно создан!');
        connectWebSocketAndAuth(pendingPinUser, pendingPinPass);

      } else if (pinScreenMode === 'LOGIN') {
        if (entered === expectedPinCode) {
          hidePinLockScreen();
          connectWebSocketAndAuth(pendingPinUser, pendingPinPass);
        } else {
          if (pinErrorText) {
            pinErrorText.textContent = 'Неверный PIN-код!';
            pinErrorText.style.color = '#ef4444';
            pinErrorText.style.opacity = '1';
          }
          const dotsWrapper = document.getElementById('pinDotsContainer');
          if (dotsWrapper) {
            dotsWrapper.style.animation = 'shakeError 0.4s ease';
            setTimeout(() => { dotsWrapper.style.animation = ''; }, 400);
          }
          setTimeout(() => {
            pinCodeInputBuffer = '';
            updatePinDotsUI();
          }, 500);
        }

      } else if (pinScreenMode === 'SETTINGS_CHANGE') {
        const u = state.username || 'user';
        localStorage.setItem('cyberchord_pin_' + u, entered);
        localStorage.setItem('cyberchord_pin_enabled_' + u, 'true');
        localStorage.setItem('cyberchord_pin_code', entered);
        localStorage.setItem('cyberchord_pin_enabled', 'true');

        if (pinProtectionToggle) pinProtectionToggle.checked = true;

        hidePinLockScreen();
        showToast('🔑 Новый PIN-код сохранен!');
      }
    }

    const numpadDeleteBtn = document.getElementById('numpadDeleteBtn');
    if (numpadDeleteBtn) {
      numpadDeleteBtn.addEventListener('click', () => {
        if (pinCodeInputBuffer.length > 0) {
          pinCodeInputBuffer = pinCodeInputBuffer.slice(0, -1);
          updatePinDotsUI();
        }
      });
    }

    function updatePinDotsUI() {
      const dots = document.querySelectorAll('#pinDotsContainer .pin-dot');
      dots.forEach((dot, idx) => {
        if (idx < pinCodeInputBuffer.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
      });
    }

    // ==========================================================================
    // 7. CUSTOM CHAT WALLPAPERS LOGIC
    // ==========================================================================
    function applyChatWallpaper(styleVal) {
      const container = document.getElementById('messagesContainer');
      if (!container) return;
      localStorage.setItem('cyberchord_wallpaper', styleVal);

      if (styleVal === 'neon_cyber') {
        container.style.background = 'linear-gradient(135deg, rgba(20,10,40,0.95), rgba(5,2,15,0.95)), url("https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&q=80") center/cover';
      } else if (styleVal === 'deep_space') {
        container.style.background = 'radial-gradient(circle at center, rgba(13,10,26,0.9), rgba(3,2,10,0.95)), url("https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&q=80") center/cover';
      } else if (styleVal === 'matrix_grid') {
        container.style.background = '#022c22';
      } else if (styleVal === 'minimal_dark') {
        container.style.background = '#09090b';
      } else if (styleVal.startsWith('http://') || styleVal.startsWith('https://')) {
        container.style.background = `url("${styleVal}") center/cover no-repeat`;
      } else {
        container.style.background = 'var(--bg-main)';
      }
    }

    document.querySelectorAll('.wallpaper-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.wallpaper-preset-card').forEach(c => c.style.borderColor = 'rgba(255,255,255,0.1)');
        card.style.borderColor = 'var(--accent-purple)';
        const wp = card.dataset.wallpaper || 'default';
        applyChatWallpaper(wp);
        showToast('🎨 Обои чата обновлены!');
      });
    });

    const applyCustomWallpaperBtn = document.getElementById('applyCustomWallpaperBtn');
    const customWallpaperInput = document.getElementById('customWallpaperInput');
    if (applyCustomWallpaperBtn && customWallpaperInput) {
      applyCustomWallpaperBtn.addEventListener('click', () => {
        const url = customWallpaperInput.value.trim();
        if (url) {
          applyChatWallpaper(url);
          showToast('🎨 Свои обои успешно применены!');
        }
      });
    }

    // Load saved wallpaper
    const savedWallpaper = localStorage.getItem('cyberchord_wallpaper');
    if (savedWallpaper) {
      applyChatWallpaper(savedWallpaper);
    }

    // ==========================================================================
    // 8. LOGOUT & INTERFACE LANGUAGE LOGIC
    // ==========================================================================
    function performLogout() {
      sessionStorage.removeItem('cyberchord_auth');
      localStorage.removeItem('cyberchord_auth');
      localStorage.removeItem('cyberchord_room');
      if (typeof ws !== 'undefined' && ws) {
        try { ws.close(); } catch(e){}
      }
      location.reload();
    }

    const settingsSidebarLogoutBtnEl = document.getElementById('settingsSidebarLogoutBtn');
    if (settingsSidebarLogoutBtnEl) {
      settingsSidebarLogoutBtnEl.addEventListener('click', () => {
        if (confirm('Вы действительно хотите выйти из аккаунта?')) {
          performLogout();
        }
      });
    }

    const btnDeleteAccountEl = document.getElementById('btnDeleteAccount');
    if (btnDeleteAccountEl) {
      btnDeleteAccountEl.addEventListener('click', () => {
        if (confirm('Удалить аккаунт и выйти из сессии?')) {
          performLogout();
        }
      });
    }

    ;

    
    const i18nDict = {
      ru: {
        logout: "Выйти из аккаунта",
        type_message: "Написать сообщение...",
        search_placeholder: "Поиск по сообщениям...",
        lang_saved: "🌐 Язык интерфейса изменен на Русский!",
        profile_title: "👤 Профиль пользователя (Вы)",
        profile_bio_label: "О себе",
        profile_birthday_label: "День рождения",
        copy_handle: "📋 Скопировать юзернейм",
        edit_profile: "✏️ Редактировать профиль",
        upload_story: "Загрузить сторис",
        settings_title: "Настройки пользователя"
      },
      en: {
        logout: "Log Out",
        type_message: "Type a message...",
        search_placeholder: "Search messages...",
        lang_saved: "🌐 Language changed to English!",
        profile_title: "👤 User Profile (You)",
        profile_bio_label: "About Me",
        profile_birthday_label: "Birthday",
        copy_handle: "📋 Copy Username",
        edit_profile: "✏️ Edit Profile",
        upload_story: "Upload Story",
        settings_title: "User Settings"
      },
      uk: {
        logout: "Вийти з акаунта",
        type_message: "Написати повідомлення...",
        search_placeholder: "Пошук по повідомленнях...",
        lang_saved: "🌐 Мову змінено на Українську!",
        profile_title: "👤 Профіль користувача (Ви)",
        profile_bio_label: "Про себе",
        profile_birthday_label: "День народження",
        copy_handle: "📋 Скопіювати юзернейм",
        edit_profile: "✏️ Редагувати профіль",
        upload_story: "Завантажити сторіс",
        settings_title: "Налаштування"
      },
      es: {
        logout: "Cerrar sesión",
        type_message: "Escribe un mensaje...",
        search_placeholder: "Buscar mensajes...",
        lang_saved: "🌐 ¡Idioma cambiado a Español!",
        profile_title: "👤 Perfil de usuario (Tú)",
        profile_bio_label: "Sobre mí",
        profile_birthday_label: "Cumpleaños",
        copy_handle: "📋 Copiar nombre de usuario",
        edit_profile: "✏️ Editar perfil",
        upload_story: "Subir historia",
        settings_title: "Ajustes de usuario"
      },
      de: {
        logout: "Abmelden",
        type_message: "Nachricht eingeben...",
        search_placeholder: "Nachrichten suchen...",
        lang_saved: "🌐 Sprache auf Deutsch geändert!",
        profile_title: "👤 Benutzerprofil (Du)",
        profile_bio_label: "Über mich",
        profile_birthday_label: "Geburtstag",
        copy_handle: "📋 Benutzername kopieren",
        edit_profile: "✏️ Profil bearbeiten",
        upload_story: "Story hochladen",
        settings_title: "Benutzereinstellungen"
      },
      fr: {
        logout: "Se déconnecter",
        type_message: "Taper un message...",
        search_placeholder: "Rechercher des messages...",
        lang_saved: "🌐 Langue changée en Français!",
        profile_title: "👤 Profil utilisateur (Vous)",
        profile_bio_label: "À propos de moi",
        profile_birthday_label: "Anniversaire",
        copy_handle: "📋 Copier le nom d'utilisateur",
        edit_profile: "✏️ Modifier le profil",
        upload_story: "Ajouter une story",
        settings_title: "Paramètres"
      },
      kk: {
        logout: "Шығу",
        type_message: "Хабарлама жазу...",
        search_placeholder: "Хабарламаларды іздеу...",
        lang_saved: "🌐 Тіл қазақшаға өзгертілді!",
        profile_title: "👤 Пайдаланушы профилі (Сіз)",
        profile_bio_label: "Мен туралы",
        profile_birthday_label: "Туған күн",
        copy_handle: "📋 Пайдаланушы атын көшіру",
        edit_profile: "✏️ Профильді өңдеу",
        upload_story: "Оқиға жүктеу",
        settings_title: "Параметрлер"
      }
    };
    
    function setAppLanguage(langCode) {
      const lang = i18nDict[langCode] ? langCode : 'ru';
      localStorage.setItem('cyberchord_lang', lang);

      document.querySelectorAll('.custom-lang-card').forEach(card => {
        if (card.dataset.lang === lang) {
          card.classList.add('active');
          card.style.border = '2px solid var(--accent-purple)';
          card.style.background = 'rgba(139, 92, 246, 0.2)';
        } else {
          card.classList.remove('active');
          card.style.border = '1px solid rgba(255,255,255,0.1)';
          card.style.background = 'rgba(255,255,255,0.05)';
        }
      });

      const dict = i18nDict[lang];
      if (!dict) return;

      const sidebarLogoutBtn = document.getElementById('settingsSidebarLogoutBtn');
      if (sidebarLogoutBtn) sidebarLogoutBtn.innerHTML = `<span>🚪</span> ${dict.logout}`;

      const chatInput = document.getElementById('chatInput');
      if (chatInput) chatInput.placeholder = dict.type_message;

      const chatSearchInput = document.getElementById('chatSearchInput');
      if (chatSearchInput) chatSearchInput.placeholder = dict.search_placeholder;
      
      const pTitle = document.querySelector('#myProfileModal h3');
      if (pTitle) pTitle.innerHTML = dict.profile_title;
      
      const copyBtn = document.getElementById('myProfileCopyHandleBtn');
      if (copyBtn) copyBtn.innerHTML = dict.copy_handle;
      
      const editBtn = document.getElementById('myProfileEditBtn');
      if (editBtn) editBtn.innerHTML = dict.edit_profile;
      
      const upStory = document.getElementById('uploadStoryBtn');
      if (upStory) upStory.innerHTML = dict.upload_story;
      
      const setH2 = document.querySelector('#settingsModal h2');
      if (setH2) setH2.innerHTML = dict.settings_title;
    }


    document.querySelectorAll('.custom-lang-card').forEach(card => {
      card.addEventListener('click', () => {
        const lang = card.dataset.lang;
        setAppLanguage(lang);
        showToast(i18nDict[lang]?.lang_saved || '🌐 Язык обновлен!');
      });
    });

    // Load language on start
    const savedLang = localStorage.getItem('cyberchord_lang') || 'ru';
    setAppLanguage(savedLang);

    // ==========================================================================
    // TOAST NOTIFICATION UTILITY
    // ==========================================================================
    function showToast(message) {
      let toast = document.getElementById('globalAppToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalAppToast';
        toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 99999; background: rgba(139, 92, 246, 0.95); color: var(--text-main); padding: 12px 20px; border-radius: 14px; font-weight: 700; font-size: 13px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.2); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform: translateY(20px); opacity: 0; pointer-events: none;';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
      setTimeout(() => {
        toast.style.transform = 'translateY(20px)';
        toast.style.opacity = '0';
      }, 2500);
    }
  