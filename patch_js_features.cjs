const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

// 1. INJECT GLOBAL VIDEO NOTE PLAYBACK FUNCTIONS & STICKER RENDERING INTO RENDER SINGLE MESSAGE
const videoNoteRenderCode = `
      // VIDEO NOTE CIRCULAR RENDERING
      if (msg.isVideoNote || msg.fileType === 'video_note') {
        const vnoteId = 'vnote_' + Math.random().toString(36).substring(2, 9);
        const vnoteDur = msg.duration || '00:00';
        contentHtml += \`
          <div class="video-note-card" id="card_\${vnoteId}" style="position: relative; width: 200px; height: 200px; border-radius: 50%; overflow: hidden; border: 3px solid var(--accent-purple); box-shadow: 0 8px 30px rgba(139,92,246,0.4), 0 4px 20px rgba(0,0,0,0.6); background: #000; cursor: pointer; margin: 6px 0;">
            <video src="\${msg.fileData}" id="\${vnoteId}" playsinline loop style="width: 100%; height: 100%; object-fit: cover;"></video>
            <div id="overlay_\${vnoteId}" class="vnote-overlay" onclick="toggleVideoNotePlay('\${vnoteId}')" style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; transition: opacity 0.2s;">
              <button id="btn_\${vnoteId}" style="width: 50px; height: 50px; border-radius: 50%; background: rgba(139,92,246,0.9); border: 2px solid #fff; color: #fff; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">▶</button>
            </div>
            <div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 800; color: #fff; backdrop-filter: blur(8px); display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.15);">
              <span id="dur_\${vnoteId}">\${escapeHtml(vnoteDur)}</span>
              <button onclick="event.stopPropagation(); toggleVideoNoteMute('\${vnoteId}')" style="background: none; border: none; color: #fff; font-size: 12px; cursor: pointer; padding: 0;" id="mute_\${vnoteId}" title="Включить/выключить звук">🔊</button>
            </div>
          </div>
        \`;
      }
      
      // STICKER RENDERING
      if (msg.isSticker || msg.fileType === 'sticker') {
        contentHtml += \`
          <div class="msg-sticker-container" style="padding: 4px; display: inline-block;">
            <img src="\${msg.fileData}" alt="Sticker" style="max-width: 150px; max-height: 150px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6)); transition: transform 0.2s ease; cursor: pointer;" onclick="openLightbox('\${msg.fileData}')" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" />
            \${msg.stickerPack ? \`<div style="font-size: 10px; color: var(--text-muted); margin-top: 2px; opacity: 0.7;">🎨 \${escapeHtml(msg.stickerPack)}</div>\` : ''}
          </div>
        \`;
      }
`;

// Insert rendering code into renderSingleMessage right before `else if (msg.fileData) {`
if (!content.includes('// VIDEO NOTE CIRCULAR RENDERING')) {
  content = content.replace('else if (msg.fileData) {', `${videoNoteRenderCode}\n      else if (msg.fileData) {`);
}

// 2. INJECT JS LOGIC FOR ALL 3 FEATURES BEFORE THE CLOSING SCRIPT TAG
const jsLogicCode = `
    // ==========================================================================
    // GLOBAL VIDEO NOTE PLAYBACK CONTROLS
    // ==========================================================================
    window.toggleVideoNotePlay = function(id) {
      const video = document.getElementById(id);
      const overlay = document.getElementById('overlay_' + id);
      const btn = document.getElementById('btn_' + id);
      if (!video) return;
      if (video.paused) {
        document.querySelectorAll('video, audio').forEach(m => {
          if (m !== video && !m.paused) m.pause();
        });
        video.play().catch(e => console.log('Autoplay blocked:', e));
        if (overlay) overlay.style.opacity = '0';
        if (btn) btn.textContent = '⏸';
      } else {
        video.pause();
        if (overlay) overlay.style.opacity = '1';
        if (btn) btn.textContent = '▶';
      }
    };

    window.toggleVideoNoteMute = function(id) {
      const video = document.getElementById(id);
      const muteBtn = document.getElementById('mute_' + id);
      if (!video) return;
      video.muted = !video.muted;
      if (muteBtn) muteBtn.textContent = video.muted ? '🔇' : '🔊';
    };

    // ==========================================================================
    // 1. CIRCULAR VIDEO NOTE RECORDING LOGIC
    // ==========================================================================
    const videoNoteRecordBtn = document.getElementById('videoNoteRecordBtn');
    const videoNoteRecordingOverlay = document.getElementById('videoNoteRecordingOverlay');
    const videoNoteCameraPreview = document.getElementById('videoNoteCameraPreview');
    const videoNoteTimerText = document.getElementById('videoNoteTimerText');
    const cancelVideoNoteBtn = document.getElementById('cancelVideoNoteBtn');
    const flipVideoNoteCameraBtn = document.getElementById('flipVideoNoteCameraBtn');
    const sendVideoNoteBtn = document.getElementById('sendVideoNoteBtn');

    let videoStream = null;
    let videoMediaRecorder = null;
    let videoNoteChunks = [];
    let videoNoteTimerInterval = null;
    let videoNoteStartTime = 0;
    let videoFacingMode = 'user';

    if (videoNoteRecordBtn) {
      videoNoteRecordBtn.addEventListener('click', startVideoNoteRecording);
    }
    if (cancelVideoNoteBtn) {
      cancelVideoNoteBtn.addEventListener('click', cancelVideoNoteRecording);
    }
    if (sendVideoNoteBtn) {
      sendVideoNoteBtn.addEventListener('click', stopAndSendVideoNoteRecording);
    }
    if (flipVideoNoteCameraBtn) {
      flipVideoNoteCameraBtn.addEventListener('click', flipVideoNoteCamera);
    }

    async function startVideoNoteRecording() {
      try {
        videoFacingMode = 'user';
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 400 }, height: { ideal: 400 }, facingMode: videoFacingMode },
          audio: true
        });

        if (videoNoteCameraPreview) {
          videoNoteCameraPreview.srcObject = videoStream;
          videoNoteCameraPreview.style.transform = videoFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        }

        videoNoteChunks = [];
        let mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
        }

        videoMediaRecorder = new MediaRecorder(videoStream, { mimeType });
        videoMediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) videoNoteChunks.push(e.data);
        };

        videoMediaRecorder.start();
        if (videoNoteRecordingOverlay) videoNoteRecordingOverlay.style.display = 'flex';

        videoNoteStartTime = Date.now();
        if (videoNoteTimerText) videoNoteTimerText.textContent = '00:00';
        clearInterval(videoNoteTimerInterval);
        videoNoteTimerInterval = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - videoNoteStartTime) / 1000);
          const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');
          if (videoNoteTimerText) videoNoteTimerText.textContent = \`\${mins}:\${secs}\`;
        }, 1000);
      } catch (err) {
        alert('Не удалось запустить камеру для кружочка: ' + err.message);
      }
    }

    async function flipVideoNoteCamera() {
      if (!videoStream) return;
      videoStream.getTracks().forEach(track => track.stop());
      videoFacingMode = videoFacingMode === 'user' ? 'environment' : 'user';
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 400 }, height: { ideal: 400 }, facingMode: videoFacingMode },
          audio: true
        });
        if (videoNoteCameraPreview) {
          videoNoteCameraPreview.srcObject = videoStream;
          videoNoteCameraPreview.style.transform = videoFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        }
        const mimeType = videoMediaRecorder ? videoMediaRecorder.mimeType : 'video/webm';
        videoMediaRecorder = new MediaRecorder(videoStream, { mimeType });
        videoMediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) videoNoteChunks.push(e.data);
        };
        videoMediaRecorder.start();
      } catch (err) {
        console.error('Error flipping camera:', err);
      }
    }

    function cancelVideoNoteRecording() {
      if (videoMediaRecorder && videoMediaRecorder.state !== 'inactive') {
        videoMediaRecorder.stop();
      }
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
      }
      clearInterval(videoNoteTimerInterval);
      if (videoNoteRecordingOverlay) videoNoteRecordingOverlay.style.display = 'none';
      videoNoteChunks = [];
    }

    function stopAndSendVideoNoteRecording() {
      if (!videoMediaRecorder || videoMediaRecorder.state === 'inactive') return;

      const elapsedSec = Math.floor((Date.now() - videoNoteStartTime) / 1000);
      const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      const durStr = \`\${mins}:\${secs}\`;

      videoMediaRecorder.onstop = () => {
        const mimeType = videoMediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(videoNoteChunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result;
          const targetRoom = state.currentRoom;
          const targetRecipient = state.activeDMRecipient;

          sendPayload({
            type: 'chat_message',
            room: targetRoom,
            recipient: targetRecipient,
            content: '',
            fileData: base64data,
            fileName: 'video_note.webm',
            fileType: 'video_note',
            isVideoNote: true,
            duration: durStr
          });
        };
        reader.readAsDataURL(blob);

        if (videoStream) {
          videoStream.getTracks().forEach(track => track.stop());
          videoStream = null;
        }
      };

      videoMediaRecorder.stop();
      clearInterval(videoNoteTimerInterval);
      if (videoNoteRecordingOverlay) videoNoteRecordingOverlay.style.display = 'none';
    }

    // ==========================================================================
    // 2. CHAT FOLDERS TOP BAR LOGIC
    // ==========================================================================
    state.activeFolderFilter = 'all';
    try {
      state.customFolders = JSON.parse(localStorage.getItem('cyberchord_folders') || '[]');
    } catch (e) {
      state.customFolders = [];
    }

    const chatFoldersList = document.getElementById('chatFoldersList');
    const openAddFolderModalBtn = document.getElementById('openAddFolderModalBtn');
    const addFolderModal = document.getElementById('addFolderModal');
    const closeAddFolderModalBtn = document.getElementById('closeAddFolderModalBtn');
    const cancelAddFolderBtn = document.getElementById('cancelAddFolderBtn');
    const saveCustomFolderBtn = document.getElementById('saveCustomFolderBtn');

    if (openAddFolderModalBtn) {
      openAddFolderModalBtn.addEventListener('click', openAddFolderModal);
    }
    if (closeAddFolderModalBtn) {
      closeAddFolderModalBtn.addEventListener('click', () => addFolderModal.classList.remove('active'));
    }
    if (cancelAddFolderBtn) {
      cancelAddFolderBtn.addEventListener('click', () => addFolderModal.classList.remove('active'));
    }
    if (saveCustomFolderBtn) {
      saveCustomFolderBtn.addEventListener('click', saveCustomFolder);
    }

    function initChatFolderTabs() {
      renderCustomFolderTabs();
      if (!chatFoldersList) return;
      chatFoldersList.querySelectorAll('.chat-folder-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          chatFoldersList.querySelectorAll('.chat-folder-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.activeFolderFilter = btn.dataset.folder || 'all';
          applyChatFolderFilter();
        });
      });
    }

    function renderCustomFolderTabs() {
      if (!chatFoldersList) return;
      // Remove previously appended custom tabs
      chatFoldersList.querySelectorAll('.custom-folder-tab').forEach(el => el.remove());

      (state.customFolders || []).forEach(folder => {
        const btn = document.createElement('button');
        btn.className = \`chat-folder-tab custom-folder-tab \${state.activeFolderFilter === folder.id ? 'active' : ''}\`;
        btn.dataset.folder = folder.id;
        btn.innerHTML = \`
          <span>\${escapeHtml(folder.icon || '📁')} \${escapeHtml(folder.name)}</span>
          <span class="delete-folder-x" title="Удалить папку" style="font-size:10px; opacity:0.6; margin-left:4px;" onclick="event.stopPropagation(); deleteCustomFolder('\${folder.id}')">✕</span>
        \`;
        btn.addEventListener('click', () => {
          chatFoldersList.querySelectorAll('.chat-folder-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.activeFolderFilter = folder.id;
          applyChatFolderFilter();
        });
        chatFoldersList.appendChild(btn);
      });
    }

    window.deleteCustomFolder = function(folderId) {
      if (!confirm('Удалить эту папку чатов? (Чаты не будут удалены)')) return;
      state.customFolders = (state.customFolders || []).filter(f => f.id !== folderId);
      localStorage.setItem('cyberchord_folders', JSON.stringify(state.customFolders));
      if (state.activeFolderFilter === folderId) {
        state.activeFolderFilter = 'all';
        const allTab = chatFoldersList ? chatFoldersList.querySelector('[data-folder="all"]') : null;
        if (allTab) {
          chatFoldersList.querySelectorAll('.chat-folder-tab').forEach(b => b.classList.remove('active'));
          allTab.classList.add('active');
        }
      }
      renderCustomFolderTabs();
      applyChatFolderFilter();
    };

    function openAddFolderModal() {
      if (!addFolderModal) return;
      const folderNameInput = document.getElementById('folderNameInput');
      const folderIconInput = document.getElementById('folderIconInput');
      const folderChatSelectContainer = document.getElementById('folderChatSelectContainer');

      if (folderNameInput) folderNameInput.value = '';
      if (folderIconInput) folderIconInput.value = '📁';

      if (folderChatSelectContainer) {
        folderChatSelectContainer.innerHTML = '';
        const allChats = [];

        // Collect DMs
        (state.dmContacts || []).forEach(dm => {
          allChats.push({ id: dm, name: '@' + dm, type: 'DM' });
        });
        // Collect Groups
        (state.groups || []).forEach(g => {
          allChats.push({ id: g.name, name: '👥 ' + g.name, type: 'Group' });
        });
        // Collect Rooms
        (state.rooms || []).forEach(r => {
          allChats.push({ id: r, name: '🌐 ' + r, type: 'Channel' });
        });

        if (allChats.length === 0) {
          folderChatSelectContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px;">Нет доступных чатов</div>';
        } else {
          allChats.forEach(c => {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer; font-size:12px; color:var(--text-main);';
            row.innerHTML = \`
              <span>\${escapeHtml(c.name)}</span>
              <input type="checkbox" value="\${escapeHtml(c.id)}" class="folder-chat-cb" style="accent-color:var(--accent-purple);" />
            \`;
            folderChatSelectContainer.appendChild(row);
          });
        }
      }

      addFolderModal.classList.add('active');
    }

    function saveCustomFolder() {
      const nameInput = document.getElementById('folderNameInput');
      const iconInput = document.getElementById('folderIconInput');
      const name = nameInput ? nameInput.value.trim() : '';
      const icon = iconInput ? iconInput.value.trim() : '📁';

      if (!name) {
        alert('Введите название папки');
        return;
      }

      const selectedChats = Array.from(document.querySelectorAll('.folder-chat-cb:checked')).map(cb => cb.value);
      const newFolder = {
        id: 'folder_' + Date.now(),
        name: name,
        icon: icon || '📁',
        chats: selectedChats
      };

      state.customFolders.push(newFolder);
      localStorage.setItem('cyberchord_folders', JSON.stringify(state.customFolders));

      addFolderModal.classList.remove('active');
      renderCustomFolderTabs();

      // Switch to new folder tab
      state.activeFolderFilter = newFolder.id;
      const newBtn = chatFoldersList.querySelector(\`[data-folder="\${newFolder.id}"]\`);
      if (newBtn) {
        chatFoldersList.querySelectorAll('.chat-folder-tab').forEach(b => b.classList.remove('active'));
        newBtn.classList.add('active');
      }
      applyChatFolderFilter();
    }

    function applyChatFolderFilter() {
      const filter = state.activeFolderFilter || 'all';
      const categories = document.querySelectorAll('.channels-container .channel-category');
      const groupsCat = categories[0];
      const dmsCat = categories[1];
      const channelsCat = categories[2];

      const groupsList = document.getElementById('groupsList');
      const dmsList = document.getElementById('directMessagesList');
      const roomsList = document.getElementById('roomsList');

      if (filter === 'all') {
        if (groupsCat) groupsCat.style.display = 'flex';
        if (groupsList) groupsList.style.display = 'block';
        if (dmsCat) dmsCat.style.display = 'flex';
        if (dmsList) dmsList.style.display = 'block';
        if (channelsCat) channelsCat.style.display = 'flex';
        if (roomsList) roomsList.style.display = 'block';

        if (groupsList) groupsList.querySelectorAll('.channel-item').forEach(i => i.style.display = 'flex');
        if (dmsList) dmsList.querySelectorAll('.dm-user-item').forEach(i => i.style.display = 'flex');
        if (roomsList) roomsList.querySelectorAll('.channel-item').forEach(i => i.style.display = 'flex');
      } else if (filter === 'dms') {
        if (groupsCat) groupsCat.style.display = 'none';
        if (groupsList) groupsList.style.display = 'none';
        if (channelsCat) channelsCat.style.display = 'none';
        if (roomsList) roomsList.style.display = 'none';
        if (dmsCat) dmsCat.style.display = 'flex';
        if (dmsList) {
          dmsList.style.display = 'block';
          dmsList.querySelectorAll('.dm-user-item').forEach(i => i.style.display = 'flex');
        }
      } else if (filter === 'groups') {
        if (dmsCat) dmsCat.style.display = 'none';
        if (dmsList) dmsList.style.display = 'none';
        if (channelsCat) channelsCat.style.display = 'none';
        if (roomsList) roomsList.style.display = 'none';
        if (groupsCat) groupsCat.style.display = 'flex';
        if (groupsList) {
          groupsList.style.display = 'block';
          groupsList.querySelectorAll('.channel-item').forEach(i => i.style.display = 'flex');
        }
      } else if (filter === 'channels') {
        if (dmsCat) dmsCat.style.display = 'none';
        if (dmsList) dmsList.style.display = 'none';
        if (groupsCat) groupsCat.style.display = 'none';
        if (groupsList) groupsList.style.display = 'none';
        if (channelsCat) channelsCat.style.display = 'flex';
        if (roomsList) {
          roomsList.style.display = 'block';
          roomsList.querySelectorAll('.channel-item').forEach(i => i.style.display = 'flex');
        }
      } else if (filter === 'favorites') {
        if (groupsCat) groupsCat.style.display = 'none';
        if (groupsList) groupsList.style.display = 'none';
        if (channelsCat) channelsCat.style.display = 'none';
        if (roomsList) roomsList.style.display = 'none';
        if (dmsCat) dmsCat.style.display = 'flex';
        if (dmsList) {
          dmsList.style.display = 'block';
          dmsList.querySelectorAll('.dm-user-item').forEach(item => {
            const name = (item.dataset.dmUser || '').toLowerCase();
            item.style.display = (name === 'избранное' || name === 'vesperchat') ? 'flex' : 'none';
          });
        }
      } else if (filter.startsWith('folder_')) {
        const folder = (state.customFolders || []).find(f => f.id === filter);
        if (folder) {
          const list = (folder.chats || []).map(c => c.toLowerCase());
          if (groupsCat) groupsCat.style.display = 'flex';
          if (groupsList) {
            groupsList.style.display = 'block';
            groupsList.querySelectorAll('.channel-item').forEach(i => {
              const name = (i.dataset.roomName || '').toLowerCase();
              i.style.display = list.includes(name) ? 'flex' : 'none';
            });
          }
          if (dmsCat) dmsCat.style.display = 'flex';
          if (dmsList) {
            dmsList.style.display = 'block';
            dmsList.querySelectorAll('.dm-user-item').forEach(i => {
              const name = (i.dataset.dmUser || '').toLowerCase();
              i.style.display = list.includes(name) ? 'flex' : 'none';
            });
          }
          if (channelsCat) channelsCat.style.display = 'flex';
          if (roomsList) {
            roomsList.style.display = 'block';
            roomsList.querySelectorAll('.channel-item').forEach(i => {
              const name = (i.dataset.roomName || '').toLowerCase();
              i.style.display = list.includes(name) ? 'flex' : 'none';
            });
          }
        }
      }
    }

    // Wrap applyChatFolderFilter into render functions
    const originalRenderRooms = renderRooms;
    renderRooms = function() {
      originalRenderRooms();
      applyChatFolderFilter();
    };

    const originalRenderGroupsList = renderGroupsList;
    renderGroupsList = function() {
      originalRenderGroupsList();
      applyChatFolderFilter();
    };

    const originalRenderDirectMessagesList = renderDirectMessagesList;
    renderDirectMessagesList = function() {
      originalRenderDirectMessagesList();
      applyChatFolderFilter();
    };

    setTimeout(initChatFolderTabs, 200);

    // ==========================================================================
    // 3. STICKER PACKS & CUSTOM EMOJIS LOGIC
    // ==========================================================================
    try {
      state.customStickers = JSON.parse(localStorage.getItem('cyberchord_stickers') || '[]');
    } catch (e) {
      state.customStickers = [];
    }

    // Built-in Sticker Data (High quality vector SVG stickers)
    const buildSvgSticker = (svgPath, bgColor, label) => {
      const svg = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120">
        <circle cx="50" cy="50" r="46" fill="\${bgColor}" stroke="#ffffff" stroke-width="3"/>
        \${svgPath}
        <text x="50" y="88" font-size="10" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="sans-serif">\${label}</text>
      </svg>\`;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    };

    const cyberStickers = [
      buildSvgSticker('<path d="M30 40 Q50 20 70 40 Q50 80 30 40 Z" fill="#8b5cf6"/><circle cx="40" cy="40" r="5" fill="#fff"/><circle cx="60" cy="40" r="5" fill="#fff"/>', '#3b0764', 'CYBER CAT'),
      buildSvgSticker('<path d="M25 30 L75 30 L65 70 L35 70 Z" fill="#06b6d4"/><circle cx="40" cy="45" r="6" fill="#fff"/><circle cx="60" cy="45" r="6" fill="#fff"/>', '#083344', 'GLITCH'),
      buildSvgSticker('<path d="M50 20 L60 40 L80 40 L65 55 L70 75 L50 62 L30 75 L35 55 L20 40 L40 40 Z" fill="#f43f5e"/>', '#881337', 'POWER'),
      buildSvgSticker('<circle cx="50" cy="45" r="22" fill="#d946ef"/><rect x="35" y="40" width="30" height="8" rx="4" fill="#000"/>', '#701a75', 'BOT DANCE'),
      buildSvgSticker('<path d="M50 20 Q70 40 50 80 Q30 40 50 20 Z" fill="#eab308"/>', '#713f12', 'FIRE'),
      buildSvgSticker('<polygon points="50,20 80,80 20,80" fill="#a855f7"/>', '#581c87', 'MATRIX'),
      buildSvgSticker('<circle cx="35" cy="45" r="10" fill="#fff"/><circle cx="65" cy="45" r="10" fill="#fff"/><path d="M35 60 Q50 75 65 60" stroke="#fff" stroke-width="4" fill="none"/>', '#0284c7', 'VIBE'),
      buildSvgSticker('<path d="M30 35 L70 35 L70 65 L30 65 Z" fill="#ec4899"/><circle cx="42" cy="50" r="6" fill="#fff"/><circle cx="58" cy="50" r="6" fill="#fff"/>', '#831843', 'NEON HUG')
    ];

    const catStickers = [
      buildSvgSticker('<path d="M30 25 L40 40 L60 40 L70 25 L65 65 L35 65 Z" fill="#f97316"/><circle cx="42" cy="48" r="4" fill="#000"/><circle cx="58" cy="48" r="4" fill="#000"/>', '#7c2d12', 'SMUG CAT'),
      buildSvgSticker('<circle cx="50" cy="50" r="25" fill="#facc15"/><ellipse cx="50" cy="55" rx="12" ry="8" fill="#000"/>', '#713f12', 'POPCAT'),
      buildSvgSticker('<path d="M30 30 L70 30 L60 70 L40 70 Z" fill="#10b981"/><circle cx="45" cy="45" r="5" fill="#fff"/><circle cx="55" cy="45" r="5" fill="#fff"/>', '#064e3b', 'COOL CAT'),
      buildSvgSticker('<circle cx="50" cy="50" r="25" fill="#ef4444"/><path d="M35 55 Q50 40 65 55" stroke="#fff" stroke-width="4" fill="none"/>', '#7f1d1d', 'CRY CAT'),
      buildSvgSticker('<circle cx="50" cy="50" r="25" fill="#06b6d4"/><circle cx="50" cy="45" r="12" fill="#fff"/>', '#164e63', 'GALAXY CAT'),
      buildSvgSticker('<rect x="30" y="30" width="40" height="40" rx="8" fill="#a855f7"/><circle cx="42" cy="45" r="4" fill="#fff"/><circle cx="58" cy="45" r="4" fill="#fff"/>', '#581c87', 'PIXEL CAT'),
      buildSvgSticker('<circle cx="50" cy="50" r="25" fill="#ec4899"/><path d="M40 40 L60 60 M60 40 L40 60" stroke="#fff" stroke-width="4"/>', '#831843', 'NO WAY'),
      buildSvgSticker('<circle cx="50" cy="50" r="25" fill="#84cc16"/><circle cx="42" cy="45" r="6" fill="#000"/><circle cx="58" cy="45" r="6" fill="#000"/>', '#365314', 'DJ CAT')
    ];

    // Picker Tabs switching logic
    document.querySelectorAll('.picker-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        document.querySelectorAll('.picker-tab-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'var(--text-muted)';
        });
        tabBtn.classList.add('active');
        tabBtn.style.background = 'var(--accent-purple)';
        tabBtn.style.color = '#fff';

        const targetTab = tabBtn.dataset.tab;
        document.querySelectorAll('.picker-tab-content').forEach(c => c.style.display = 'none');

        if (targetTab === 'emojis') {
          const el = document.getElementById('pickerTabEmojis');
          if (el) el.style.display = 'block';
        } else if (targetTab === 'stickers') {
          const el = document.getElementById('pickerTabStickers');
          if (el) el.style.display = 'block';
          renderBuiltInStickers();
        } else if (targetTab === 'mystickers') {
          const el = document.getElementById('pickerTabMyStickers');
          if (el) el.style.display = 'block';
          renderMyStickers();
        }
      });
    });

    function renderBuiltInStickers() {
      const cyberGrid = document.getElementById('cyberStickersGrid');
      const catGrid = document.getElementById('catStickersGrid');

      if (cyberGrid && cyberGrid.children.length === 0) {
        cyberStickers.forEach((st, idx) => {
          const item = document.createElement('div');
          item.className = 'sticker-item';
          item.innerHTML = \`<img src="\${st}" alt="Sticker" />\`;
          item.addEventListener('click', () => sendSticker(st, 'CyberChord Pack'));
          cyberGrid.appendChild(item);
        });
      }

      if (catGrid && catGrid.children.length === 0) {
        catStickers.forEach((st, idx) => {
          const item = document.createElement('div');
          item.className = 'sticker-item';
          item.innerHTML = \`<img src="\${st}" alt="Sticker" />\`;
          item.addEventListener('click', () => sendSticker(st, 'Мемный Кот'));
          catGrid.appendChild(item);
        });
      }
    }

    function renderMyStickers() {
      const myGrid = document.getElementById('myStickersGrid');
      if (!myGrid) return;
      myGrid.innerHTML = '';

      if (state.customStickers.length === 0) {
        myGrid.innerHTML = '<div style="grid-column: 1 / -1; font-size:12px; color:var(--text-muted); text-align:center; padding:20px;">У вас пока нет своих стикеров.<br>Нажмите «+ Создать», чтобы добавить картинку!</div>';
        return;
      }

      state.customStickers.forEach(st => {
        const item = document.createElement('div');
        item.className = 'sticker-item';
        item.innerHTML = \`<img src="\${st.url}" alt="Custom Sticker" />\`;
        item.addEventListener('click', () => sendSticker(st.url, st.packName || 'Мои стикеры'));
        myGrid.appendChild(item);
      });
    }

    function sendSticker(stickerUrl, packName) {
      const emojiPanel = document.getElementById('emojiPickerPanel');
      if (emojiPanel) emojiPanel.classList.remove('active');

      const targetRoom = state.currentRoom;
      const targetRecipient = state.activeDMRecipient;

      sendPayload({
        type: 'chat_message',
        room: targetRoom,
        recipient: targetRecipient,
        content: '',
        fileData: stickerUrl,
        fileName: 'sticker.png',
        fileType: 'sticker',
        isSticker: true,
        stickerPack: packName
      });
    }

    // Sticker Pack Creator Modal
    const openStickerPackModalBtn = document.getElementById('openStickerPackModalBtn');
    const stickerPackModal = document.getElementById('stickerPackModal');
    const closeStickerPackModalBtn = document.getElementById('closeStickerPackModalBtn');
    const cancelStickerPackBtn = document.getElementById('cancelStickerPackBtn');
    const saveStickerPackBtn = document.getElementById('saveStickerPackBtn');
    const stickerDropZone = document.getElementById('stickerDropZone');
    const stickerFilesInput = document.getElementById('stickerFilesInput');
    const stickerUploadPreviews = document.getElementById('stickerUploadPreviews');

    let uploadedStickerImages = [];

    if (openStickerPackModalBtn) {
      openStickerPackModalBtn.addEventListener('click', () => {
        uploadedStickerImages = [];
        const nameInput = document.getElementById('stickerPackNameInput');
        if (nameInput) nameInput.value = '';
        if (stickerUploadPreviews) stickerUploadPreviews.innerHTML = '';
        if (stickerPackModal) stickerPackModal.classList.add('active');
      });
    }

    if (closeStickerPackModalBtn) {
      closeStickerPackModalBtn.addEventListener('click', () => stickerPackModal.classList.remove('active'));
    }
    if (cancelStickerPackBtn) {
      cancelStickerPackBtn.addEventListener('click', () => stickerPackModal.classList.remove('active'));
    }

    if (stickerDropZone && stickerFilesInput) {
      stickerDropZone.addEventListener('click', () => stickerFilesInput.click());
      stickerFilesInput.addEventListener('change', (e) => handleStickerFilesSelect(e.target.files));

      stickerDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        stickerDropZone.style.borderColor = 'var(--accent-purple)';
      });
      stickerDropZone.addEventListener('dragleave', () => {
        stickerDropZone.style.borderColor = 'rgba(255,255,255,0.2)';
      });
      stickerDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        stickerDropZone.style.borderColor = 'rgba(255,255,255,0.2)';
        if (e.dataTransfer.files) handleStickerFilesSelect(e.dataTransfer.files);
      });
    }

    function handleStickerFilesSelect(files) {
      if (!files || files.length === 0) return;
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          uploadedStickerImages.push(dataUrl);

          if (stickerUploadPreviews) {
            const box = document.createElement('div');
            box.style.cssText = 'width:100%; aspect-ratio:1; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.2); background:#000; position:relative;';
            box.innerHTML = \`<img src="\${dataUrl}" style="width:100%; height:100%; object-fit:contain;" />\`;
            stickerUploadPreviews.appendChild(box);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (saveStickerPackBtn) {
      saveStickerPackBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('stickerPackNameInput');
        const packName = nameInput ? nameInput.value.trim() : 'Мой пак';

        if (uploadedStickerImages.length === 0) {
          alert('Выберите хотя бы одну картинку для стикера!');
          return;
        }

        uploadedStickerImages.forEach(imgUrl => {
          state.customStickers.push({
            id: 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            packName: packName || 'Мой пак',
            url: imgUrl
          });
        });

        localStorage.setItem('cyberchord_stickers', JSON.stringify(state.customStickers));
        if (stickerPackModal) stickerPackModal.classList.remove('active');
        renderMyStickers();
      });
    }
`;

if (!content.includes('// GLOBAL VIDEO NOTE PLAYBACK CONTROLS')) {
  content = content.replace('</script>', `${jsLogicCode}\n  </script>`);
}

fs.writeFileSync('index.html', content, 'utf8');
console.log('JS Logic patched successfully!');
