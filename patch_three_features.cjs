const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

// 1. ADD CSS FOR CHAT FOLDERS AND STICKERS
const cssToInject = `
    /* CHAT FOLDERS STYLING */
    .chat-folders-bar {
      padding: 6px 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.2);
    }
    .chat-folders-bar::-webkit-scrollbar {
      display: none;
    }
    .chat-folder-tab {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 10px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .chat-folder-tab:hover {
      background: rgba(255,255,255,0.12);
      color: var(--text-main);
    }
    .chat-folder-tab.active {
      background: linear-gradient(135deg, var(--accent-purple), var(--accent-magenta));
      color: #fff;
      border-color: transparent;
      box-shadow: 0 2px 10px rgba(139, 92, 246, 0.4);
    }

    /* STICKERS & PICKER STYLING */
    .sticker-item {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 10px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 4px;
    }
    .sticker-item:hover {
      background: rgba(139, 92, 246, 0.2);
      border-color: var(--accent-purple);
      transform: scale(1.08);
    }
    .sticker-item img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
`;

if (!content.includes('.chat-folders-bar {')) {
  content = content.replace('</head>', `<style>${cssToInject}</style>\n</head>`);
}

// 2. INJECT CHAT FOLDERS BAR IN SIDEBAR
const folderBarHtml = `
      <!-- CHAT FOLDERS NAVIGATION TABS -->
      <div class="chat-folders-bar" id="chatFoldersBar">
        <div id="chatFoldersList" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <button class="chat-folder-tab active" data-folder="all">🌐 Все</button>
          <button class="chat-folder-tab" data-folder="dms">💬 Личные</button>
          <button class="chat-folder-tab" data-folder="groups">👥 Группы</button>
          <button class="chat-folder-tab" data-folder="channels">📢 Каналы</button>
          <button class="chat-folder-tab" data-folder="favorites">⭐ Избранное</button>
        </div>
        <button class="add-folder-btn" id="openAddFolderModalBtn" title="Создать свою папку чатов" style="background: rgba(139, 92, 246, 0.2); border: 1px dashed var(--accent-purple); color: var(--accent-cyan); width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; cursor: pointer; flex-shrink: 0; transition: all 0.2s;">+</button>
      </div>
`;

if (!content.includes('id="chatFoldersBar"')) {
  content = content.replace('<div class="channels-container">', `${folderBarHtml}\n      <div class="channels-container">`);
}

// 3. INJECT VIDEO NOTE BUTTON AND RECORDING OVERLAY IN INPUT BOX
const videoNoteBtnHtml = `
          <!-- Video Note Circular Trigger Button -->
          <button class="voice-rec-btn" id="videoNoteRecordBtn" title="Записать видеосообщение в кружочке 🎥" style="color: var(--accent-cyan);">
            <svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">
              <path d="M23 7l-7 5 7 5V7z"></path>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </button>
`;

if (!content.includes('id="videoNoteRecordBtn"')) {
  content = content.replace('<button class="voice-rec-btn" id="voiceRecordBtn"', `${videoNoteBtnHtml}\n          <button class="voice-rec-btn" id="voiceRecordBtn"`);
}

const videoNoteOverlayHtml = `
        <!-- CIRCULAR VIDEO NOTE RECORDING OVERLAY -->
        <div id="videoNoteRecordingOverlay" style="display: none; position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%); z-index: 1000000; flex-direction: column; align-items: center; gap: 10px; pointer-events: auto; animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
          <div style="position: relative; width: 210px; height: 210px; border-radius: 50%; overflow: hidden; border: 4px solid var(--accent-purple); box-shadow: 0 0 50px rgba(139, 92, 246, 0.7), 0 10px 40px rgba(0,0,0,0.8); background: #000; display: flex; align-items: center; justify-content: center;">
            <video id="videoNoteCameraPreview" autoplay muted playsinline style="width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);"></video>
            <div style="position: absolute; top: 12px; background: rgba(0,0,0,0.65); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 800; color: #fff; backdrop-filter: blur(8px); display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.15);">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: pulseGlow 1s infinite;"></span>
              <span id="videoNoteTimerText">00:00</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 14px; background: rgba(15, 23, 42, 0.95); padding: 8px 18px; border-radius: 30px; border: 1px solid var(--border-glow); box-shadow: 0 10px 30px rgba(0,0,0,0.6); backdrop-filter: blur(16px);">
            <button id="cancelVideoNoteBtn" class="cancel-btn" style="width: 38px; height: 38px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid rgba(239,68,68,0.4);" title="Отмена">✕</button>
            <button id="flipVideoNoteCameraBtn" style="width: 38px; height: 38px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 17px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;" title="Повернуть камеру">🔄</button>
            <button id="sendVideoNoteBtn" class="ripple-btn" style="width: 42px; height: 42px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 17px; background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan)); color: #fff; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(139,92,246,0.5);" title="Отправить кружочек">🚀</button>
          </div>
        </div>
`;

if (!content.includes('id="videoNoteRecordingOverlay"')) {
  content = content.replace('<div class="input-box-container"', `${videoNoteOverlayHtml}\n        <div class="input-box-container"`);
}

// 4. UPGRADE EMOJI PICKER PANEL TO INCLUDE TABS (EMOJIS, STICKERS, MY STICKERS)
const newEmojiPickerPanelHtml = `
        <!-- EMOJI & STICKER PICKER POPUP PANEL -->
        <div class="emoji-picker-panel" id="emojiPickerPanel" style="width: 320px; max-height: 420px; display: flex; flex-direction: column; padding: 0; overflow: hidden;">
          <div class="emoji-picker-tabs" style="display: flex; background: rgba(0,0,0,0.4); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 4px; gap: 4px;">
            <button class="picker-tab-btn active" data-tab="emojis" style="flex:1; background:var(--accent-purple); border:none; color:#fff; font-size:11px; font-weight:700; padding:6px; border-radius:8px; cursor:pointer;">😀 Эмодзи</button>
            <button class="picker-tab-btn" data-tab="stickers" style="flex:1; background:transparent; border:none; color:var(--text-muted); font-size:11px; font-weight:700; padding:6px; border-radius:8px; cursor:pointer;">🎨 Стикеры</button>
            <button class="picker-tab-btn" data-tab="mystickers" style="flex:1; background:transparent; border:none; color:var(--text-muted); font-size:11px; font-weight:700; padding:6px; border-radius:8px; cursor:pointer;">⭐ Мои</button>
          </div>
          
          <!-- EMOJIS TAB CONTENT -->
          <div id="pickerTabEmojis" class="picker-tab-content active" style="padding: 10px; overflow-y: auto; max-height: 350px;">
            <div class="emoji-picker-grid" id="emojiPickerGrid"></div>
          </div>

          <!-- STICKERS TAB CONTENT -->
          <div id="pickerTabStickers" class="picker-tab-content" style="display:none; padding: 10px; overflow-y: auto; max-height: 350px;">
            <div style="font-size: 11px; font-weight: 800; color: var(--accent-cyan); margin-bottom: 8px; text-transform: uppercase;">⚡ CyberChord Pack</div>
            <div class="stickers-grid" id="cyberStickersGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;"></div>

            <div style="font-size: 11px; font-weight: 800; color: var(--accent-purple); margin-bottom: 8px; text-transform: uppercase;">🐱 Мемный Кот</div>
            <div class="stickers-grid" id="catStickersGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;"></div>
          </div>

          <!-- MY STICKERS TAB CONTENT -->
          <div id="pickerTabMyStickers" class="picker-tab-content" style="display:none; padding: 10px; overflow-y: auto; max-height: 350px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-main);">Мои стикерпаки</span>
              <button id="openStickerPackModalBtn" style="background: rgba(217, 70, 239, 0.2); border: 1px solid var(--accent-magenta); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 8px; cursor: pointer;">+ Создать</button>
            </div>
            <div class="stickers-grid" id="myStickersGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;"></div>
          </div>
        </div>
`;

if (content.includes('id="emojiPickerPanel"')) {
  content = content.replace(/<div class="emoji-picker-panel" id="emojiPickerPanel">[\s\S]*?<\/div>\s*<\/div>/, newEmojiPickerPanelHtml);
}

// 5. INJECT MODALS FOR CREATING CUSTOM FOLDERS AND STICKER PACKS
const newModalsHtml = `
  <!-- CREATE CUSTOM FOLDER MODAL -->
  <div class="modal-overlay" id="addFolderModal">
    <div class="modal-card" style="max-width: 440px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h2 class="modal-title" style="margin-bottom: 0; font-size: 17px; display: flex; align-items: center; gap: 8px;">
          <span>📁</span> Новая папка чатов
        </h2>
        <button class="cancel-btn" id="closeAddFolderModalBtn" style="flex: initial; padding: 4px 10px;">✕</button>
      </div>

      <div style="margin-bottom: 14px;">
        <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Название и иконка папки</label>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="folderIconInput" class="custom-input" value="📁" style="width: 50px; text-align: center; font-size: 18px; padding: 8px;" maxlength="2" />
          <input type="text" id="folderNameInput" class="custom-input" placeholder="Например: Работа, Учеба, Крипта..." style="flex: 1; font-size: 13px;" />
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Выберите чаты для включения в папку</label>
        <div id="folderChatSelectContainer" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: rgba(0,0,0,0.25); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
          <!-- Dynamic chat checkmarks -->
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="cancel-btn" id="cancelAddFolderBtn" style="flex: 1;">Отмена</button>
        <button class="modal-btn ripple-btn" id="saveCustomFolderBtn" style="flex: 1;">Создать папку</button>
      </div>
    </div>
  </div>

  <!-- CREATE STICKER PACK MODAL -->
  <div class="modal-overlay" id="stickerPackModal">
    <div class="modal-card" style="max-width: 440px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h2 class="modal-title" style="margin-bottom: 0; font-size: 17px; display: flex; align-items: center; gap: 8px;">
          <span>🎨</span> Создать свой стикерпак
        </h2>
        <button class="cancel-btn" id="closeStickerPackModalBtn" style="flex: initial; padding: 4px 10px;">✕</button>
      </div>

      <div style="margin-bottom: 14px;">
        <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Название стикерпака</label>
        <input type="text" id="stickerPackNameInput" class="custom-input" placeholder="Например: Мои любимые мемы" style="width: 100%; font-size: 13px;" />
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 6px;">Загрузите картинки или фото (PNG, JPG, WebP)</label>
        <div id="stickerDropZone" style="border: 2px dashed rgba(255,255,255,0.2); border-radius: 12px; padding: 18px; text-align: center; cursor: pointer; background: rgba(0,0,0,0.2); transition: all 0.2s;">
          <div style="font-size: 26px; margin-bottom: 4px;">🖼️</div>
          <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">Нажмите или перетащите изображения</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Можно выбрать несколько файлов</div>
          <input type="file" id="stickerFilesInput" accept="image/*" multiple style="display: none;" />
        </div>
        <div id="stickerUploadPreviews" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; max-height: 140px; overflow-y: auto;"></div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="cancel-btn" id="cancelStickerPackBtn" style="flex: 1;">Отмена</button>
        <button class="modal-btn ripple-btn" id="saveStickerPackBtn" style="flex: 1;">Сохранить стикерпак</button>
      </div>
    </div>
  </div>
`;

if (!content.includes('id="addFolderModal"')) {
  content = content.replace('<!-- SCHEDULED MESSAGE MODAL -->', `${newModalsHtml}\n  <!-- SCHEDULED MESSAGE MODAL -->`);
}

fs.writeFileSync('index.html', content, 'utf8');
console.log('HTML updated successfully!');
