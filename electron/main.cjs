const { app, BrowserWindow, Menu, Tray, session, shell, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Set Application Model ID for Windows Notifications
if (process.platform === 'win32') {
  app.setAppUserModelId('com.vesperchat.app');
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
app.isQuitting = false;

const PORT = process.env.PORT || '3000';
process.env.PORT = PORT;

const appRoot = app.getAppPath();
process.env.VESPER_APP_ROOT = appRoot;

// Set user data dir for SQLite persistence in production
const userDataDir = path.join(app.getPath('userData'), 'data');
if (!fs.existsSync(userDataDir)) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch (e) {
    console.error('Failed to create userData dir:', e);
  }
}
process.env.VESPER_DATA_DIR = userDataDir;

// Start embedded server
function startServer() {
  try {
    const serverPath = path.join(__dirname, '../dist/server.cjs');
    if (fs.existsSync(serverPath)) {
      console.log('Starting internal VesperChat server from:', serverPath);
      require(serverPath);
    } else {
      console.warn('Bundled server.cjs not found at', serverPath);
    }
  } catch (err) {
    console.error('Error starting internal server:', err);
  }
}

function waitForServer(url, timeout = 10000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      http.get(url, (res) => {
        resolve(true);
      }).on('error', () => {
        if (Date.now() - startTime < timeout) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });
}

async function createWindow() {
  const iconPath = path.join(__dirname, '../public/icon-512.png');
  const fallbackIcon = path.join(__dirname, '../public/favicon.png');
  const windowIcon = fs.existsSync(iconPath) ? iconPath : fallbackIcon;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#07050e',
    title: 'VesperChat',
    icon: windowIcon,
    show: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
      backgroundThrottling: false
    }
  });

  // Remove default top menu bar
  Menu.setApplicationMenu(null);

  // Grant media permissions for WebRTC (Mic, Cam, Screen share, Audio, Notifications)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const granted = [
      'media',
      'mediaKeySystem',
      'notifications',
      'fullscreen',
      'pointerLock',
      'display-capture'
    ];
    if (granted.includes(permission)) {
      return callback(true);
    }
    return callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);

  // Wait for server to start and load URL
  const serverUrl = 'http://127.0.0.1:' + PORT;
  const isUp = await waitForServer(serverUrl, 8000);

  if (isUp) {
    mainWindow.loadURL(serverUrl);
  } else {
    // Fallback: load index.html directly
    const indexPath = path.join(appRoot, 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle external links -> open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      if (!url.includes('127.0.0.1:' + PORT) && !url.includes('localhost:' + PORT)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('minimize', () => {
    console.log('[Window] minimize event. inCall:', activeCallState && activeCallState.inCall);
    if (activeCallState && activeCallState.inCall) {
      showOverlay();
    }
  });

  mainWindow.on('hide', () => {
    console.log('[Window] hide event. inCall:', activeCallState && activeCallState.inCall);
    if (activeCallState && activeCallState.inCall) {
      showOverlay();
    }
  });

  mainWindow.on('restore', () => {
    console.log('[Window] restore event -> hideOverlay');
    hideOverlay();
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isMinimized() && mainWindow.isVisible()) {
      console.log('[Window] focus event while visible -> hideOverlay');
      hideOverlay();
    }
  });

  createTray(windowIcon);
}

function createTray(iconPath) {
  if (tray) return;

  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Открыть VesperChat',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Перезагрузить',
        click: () => {
          if (mainWindow) mainWindow.reload();
        }
      },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('VesperChat - Игровой Мессенджер');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.error('Failed to create tray icon:', err);
  }
}

let overlayWindow = null;
let activeCallState = { inCall: false };

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  try {
    const { screen } = require('electron');
    // Determine target display: where mainWindow is, or fallback to primary display
    let targetDisplay = screen.getPrimaryDisplay();
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const mainBounds = mainWindow.getBounds();
        targetDisplay = screen.getDisplayMatching(mainBounds) || targetDisplay;
      } catch (e) {}
    }

    const workArea = targetDisplay.workArea;
    const overlayWidth = 320;
    const overlayHeight = 86;
    // Always place in top-right corner of the current monitor
    const x = Math.round(workArea.x + workArea.width - overlayWidth - 24);
    const y = Math.round(workArea.y + 24);

    console.log(`[Overlay] Creating overlay window at (${x}, ${y}) size ${overlayWidth}x${overlayHeight} on display ${targetDisplay.id}`);

    overlayWindow = new BrowserWindow({
      width: overlayWidth,
      height: overlayHeight,
      x: x,
      y: y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      show: false,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const overlayPath = path.join(__dirname, 'overlay.html');
    overlayWindow.loadFile(overlayPath);
    overlayWindow.setAlwaysOnTop(true, 'normal');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    overlayWindow.webContents.on('did-finish-load', () => {
      console.log('[Overlay] overlay.html loaded successfully. Current inCall:', activeCallState && activeCallState.inCall);
      if (activeCallState && activeCallState.inCall) {
        overlayWindow.webContents.send('overlay-update', activeCallState);
      }
    });

    overlayWindow.on('closed', () => {
      overlayWindow = null;
    });
  } catch (err) {
    console.error('[Overlay Error] Failed to create overlay window:', err);
  }

  return overlayWindow;
}

function showOverlay() {
  console.log('[Overlay] showOverlay invoked. activeCallState:', JSON.stringify(activeCallState));
  if (!activeCallState || !activeCallState.inCall) {
    console.log('[Overlay] Skip showOverlay: activeCallState.inCall is not true');
    return;
  }
  const ovWin = createOverlayWindow();
  if (ovWin && !ovWin.isDestroyed()) {
    ovWin.showInactive();
    ovWin.setAlwaysOnTop(true, 'normal');
    ovWin.webContents.send('overlay-update', activeCallState);
    console.log('[Overlay] Overlay window is now visible at', ovWin.getBounds());
  }
}

function hideOverlay() {
  console.log('[Overlay] hideOverlay invoked');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

// Single instance focus handler
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
  hideOverlay();
});

// IPC handlers for window management & Call Overlay
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('show-notification', (event, { title, body }) => {
  const iconPath = path.join(__dirname, '../public/icon-512.png');
  new Notification({
    title: title || 'VesperChat',
    body: body || '',
    icon: fs.existsSync(iconPath) ? iconPath : undefined
  }).show();
});

ipcMain.on('call-state-update', (event, data) => {
  console.log('[Overlay IPC] call-state-update received:', JSON.stringify(data));
  activeCallState = data || { inCall: false };
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-update', activeCallState);
  }
  if (activeCallState && activeCallState.inCall) {
    if (mainWindow && (mainWindow.isMinimized() || !mainWindow.isVisible())) {
      showOverlay();
    }
  } else {
    hideOverlay();
  }
});

ipcMain.on('call-speaking-update', (event, data) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-speaking', data);
  }
});

ipcMain.on('request-overlay-update', (event) => {
  if (event.sender && !event.sender.isDestroyed()) {
    event.sender.send('overlay-update', activeCallState);
  }
});

ipcMain.on('toggle-overlay-window', (event, force) => {
  console.log('[Overlay IPC] toggle-overlay-window received, force:', force);
  if (force === true) {
    showOverlay();
  } else if (force === false) {
    hideOverlay();
  } else {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      hideOverlay();
    } else {
      showOverlay();
    }
  }
});

ipcMain.on('overlay-action', (event, action) => {
  console.log('[Overlay IPC] overlay-action received:', action);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-call-action', action);
  }
});

ipcMain.on('restore-main-window', () => {
  console.log('[Overlay IPC] restore-main-window requested');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
  hideOverlay();
});

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
