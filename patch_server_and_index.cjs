const fs = require('fs');

// --- 1. PATCH server.ts ---
let serverCode = fs.readFileSync('server.ts', 'utf8');

// Interface Client -> add req
serverCode = serverCode.replace(
  'interface Client {\n  ws: WebSocket;',
  'interface Client {\n  ws: WebSocket;\n  req?: any;'
);

// wss.on('connection') -> capture req
serverCode = serverCode.replace(
  "wss.on('connection', (ws: WebSocket) => {\n  const client: Client = {\n    ws,\n    username:",
  "wss.on('connection', (ws: WebSocket, req: any) => {\n  const client: Client = {\n    ws,\n    req,\n    username:"
);

// addVesperChatMessage -> broadcast to all connections of user and add to dmContacts
const oldVesperFunc = /function addVesperChatMessage[\s\S]*?saveDMHistoryToFile\(roomKey, room\.history\);\n[\s\S]*?for \(const c of connectedClients\) \{[\s\S]*?\}\n\}/;

const newVesperFunc = `function addVesperChatMessage(username: string, textTitle: string, ip: string, device: string) {
  if (!username) return;
  const lowerUser = username.toLowerCase();
  const roomKey = \`DM:VesperChat_\${lowerUser}\`;

  const userAccount = usersMap.get(lowerUser);
  if (userAccount) {
    userAccount.dmContacts = userAccount.dmContacts || [];
    if (!userAccount.dmContacts.map(c => c.toLowerCase()).includes('vesperchat')) {
      userAccount.dmContacts.unshift('VesperChat');
      saveUsers();
    }
  }

  let room = roomsMap.get(roomKey);
  if (!room) {
    const loadedHist = loadDMHistoryFromFile(roomKey);
    room = {
      name: roomKey,
      clients: new Set(),
      history: loadedHist,
      isDM: true
    };
    roomsMap.set(roomKey, room);
  }

  const mskTime = getFormattedMskTime();
  const timeShort = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
  const msgContent = \`\${textTitle}\\nВремя: \${mskTime}\\nIP: \${ip}\\nУстройство: \${device}\`;
  const vesperMsg: Message = {
    id: 'vesper_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    type: 'chat',
    room: roomKey,
    username: 'VesperChat',
    content: msgContent,
    timestamp: timeShort,
    fullDate: new Date().toISOString(),
    avatarUrl: 'https://api.iconify.design/lucide:shield-check.svg?color=%238b5cf6',
    isVip: true,
    reactions: {}
  };
  room.history.push(vesperMsg);
  saveDMHistoryToFile(roomKey, room.history);

  for (const c of connectedClients) {
    if (c.username && c.username.toLowerCase() === lowerUser && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({
        type: 'chat',
        message: vesperMsg
      }));
    }
  }
}`;

serverCode = serverCode.replace(oldVesperFunc, newVesperFunc);

// login -> detect device using client.req and update message text to "В ваш аккаунт вошли."
serverCode = serverCode.replace(
  "const { device, ip } = detectDeviceAndIp();\n        addVesperChatMessage(account.username, 'Вы вошли в аккаунт.', ip, device);",
  "const { device, ip } = detectDeviceAndIp(client.req);\n        addVesperChatMessage(account.username, 'В ваш аккаунт вошли.', ip, device);"
);

// register -> detect device using client.req
serverCode = serverCode.replace(
  "const { device, ip } = detectDeviceAndIp();\n        addVesperChatMessage(username, 'Вы зарегистрировались.', ip, device);",
  "const { device, ip } = detectDeviceAndIp(client.req);\n        addVesperChatMessage(username, 'Вы зарегистрировались.', ip, device);"
);

// start_dm -> support VesperChat and favorited special keys
const oldStartDM = /else if \(msg\.type === 'start_dm' \|\| msg\.type === 'init_dm'\) \{[\s\S]*?const dmRoomKey = getDMKey\(client\.username, targetUsername\);/;

const newStartDM = `else if (msg.type === 'start_dm' || msg.type === 'init_dm') {
        const rawTarget = (msg.targetUser || msg.recipient || '').trim().replace(/^@/, '');
        if (!rawTarget || !client.username) return;

        let dmRoomKey = '';
        let targetUsername = rawTarget;
        let targetColor = '#8b5cf6';

        if (rawTarget.toLowerCase() === 'vesperchat') {
          targetUsername = 'VesperChat';
          dmRoomKey = \`DM:VesperChat_\${client.username.toLowerCase()}\`;
        } else if (rawTarget.toLowerCase() === 'избранное' || rawTarget === 'Избранное') {
          targetUsername = 'Избранное';
          dmRoomKey = \`DM:favorited_\${client.username.toLowerCase()}\`;
        } else {
          if (rawTarget.toLowerCase() === client.username.toLowerCase()) {
            return sendError(ws, 'Нельзя создать личный чат с самим собой!');
          }
          const targetAccount = usersMap.get(rawTarget.toLowerCase());
          targetUsername = targetAccount ? targetAccount.username : rawTarget;
          targetColor = targetAccount ? targetAccount.color : '#8b5cf6';
          dmRoomKey = getDMKey(client.username, targetUsername);
        }`;

serverCode = serverCode.replace(oldStartDM, newStartDM);

fs.writeFileSync('server.ts', serverCode);
console.log('server.ts patched successfully');


// --- 2. PATCH index.html ---
let htmlCode = fs.readFileSync('index.html', 'utf8');

// Fix .group-badge CSS: add white-space: nowrap !important; flex-shrink: 0 !important;
htmlCode = htmlCode.replace(
  '.group-badge {\n      font-size: 11px;',
  '.group-badge {\n      white-space: nowrap !important;\n      flex-shrink: 0 !important;\n      font-size: 11px;'
);

// Fix .user-profile-bar in @media (max-width: 768px)
const oldMobileUserBarCSS = /\.user-profile-bar \{\s*position: fixed !important;\s*bottom: 0 !important;\s*left: 0 !important;\s*right: 0 !important;\s*z-index: 1001 !important;\s*background: var\(--bg-card\) !important;\s*padding: 8px 12px !important;\s*border-top: 1px solid rgba\(255,255,255,0\.08\) !important;\s*\}/;

const newMobileUserBarCSS = `.user-profile-bar {
        position: relative !important;
        bottom: auto !important;
        left: auto !important;
        right: auto !important;
        width: 100% !important;
        margin-top: auto !important;
        z-index: 10 !important;
        padding: 10px 12px !important;
        border-top: 1px solid rgba(255,255,255,0.08) !important;
      }`;

htmlCode = htmlCode.replace(oldMobileUserBarCSS, newMobileUserBarCSS);

// Fix .chat-window margin-bottom: 70px -> margin-bottom: 0
htmlCode = htmlCode.replace(
  '.chat-window {\n        margin-bottom: 70px !important;\n      }',
  '.chat-window {\n        margin-bottom: 0 !important;\n      }'
);

fs.writeFileSync('index.html', htmlCode);
console.log('index.html patched successfully');
