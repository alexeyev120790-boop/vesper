import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.VESPER_DATA_DIR || path.join(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'vesperchat.sqlite');

let db: Database | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;

export async function getSqliteDb(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(SQLITE_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(SQLITE_FILE);
      db = new SQL.Database(fileBuffer);
      console.log('📦 [SQLite] Loaded existing database from data/vesperchat.sqlite');
      
      // Attempt to initialize tables immediately to verify the DB file is not corrupt
      initTables(db);
    } catch (err) {
      console.error('⚠️ [SQLite] Error or corruption detected in SQLite file. Recreating fresh DB:', err);
      try {
        if (fs.existsSync(SQLITE_FILE)) {
          fs.unlinkSync(SQLITE_FILE);
        }
      } catch (e) {
        console.error('⚠️ [SQLite] Could not delete malformed SQLite file:', e);
      }
      db = new SQL.Database();
      initTables(db);
    }
  } else {
    db = new SQL.Database();
    console.log('✨ [SQLite] Initialized new SQLite database in memory');
    initTables(db);
  }

  persistSqliteToDisk();
  return db;
}

function safeAddColumn(database: Database, table: string, columnDef: string) {
  try {
    database.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch (_) {
    // Column already exists or table not ready, safely continue
  }
}

function initTables(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT,
      nickname TEXT,
      bio TEXT,
      avatar TEXT,
      banner TEXT,
      color TEXT,
      email TEXT,
      status TEXT,
      custom_status TEXT,
      neons INTEGER DEFAULT 5000,
      is_vip INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      last_daily_bonus_claim INTEGER DEFAULT 0,
      bonus_month_streak INTEGER DEFAULT 0,
      created_at TEXT,
      extra_json TEXT
    );

    CREATE TABLE IF NOT EXISTS rooms (
      name TEXT PRIMARY KEY,
      is_dm INTEGER DEFAULT 0,
      is_group INTEGER DEFAULT 0,
      is_announcement INTEGER DEFAULT 0,
      owner TEXT,
      admins_json TEXT,
      members_json TEXT,
      description TEXT,
      is_verified INTEGER DEFAULT 0,
      verification_pending INTEGER DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room TEXT,
      sender TEXT,
      content TEXT,
      timestamp INTEGER,
      type TEXT,
      reply_to TEXT,
      reactions_json TEXT,
      pin_info_json TEXT,
      is_forwarded INTEGER DEFAULT 0,
      file_url TEXT,
      file_name TEXT,
      is_voice INTEGER DEFAULT 0,
      voice_duration INTEGER DEFAULT 0,
      extra_json TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      username TEXT,
      type TEXT,
      title TEXT,
      description TEXT,
      amount INTEGER,
      sender TEXT,
      recipient TEXT,
      timestamp INTEGER,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      username TEXT,
      text TEXT,
      category TEXT,
      status TEXT,
      timestamp INTEGER,
      ip TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_wallet_username ON wallet_transactions(username);
  `);

  // Safe migrations for table columns
  safeAddColumn(database, 'users', 'password TEXT');
  safeAddColumn(database, 'users', 'nickname TEXT');
  safeAddColumn(database, 'users', 'bio TEXT');
  safeAddColumn(database, 'users', 'avatar TEXT');
  safeAddColumn(database, 'users', 'banner TEXT');
  safeAddColumn(database, 'users', 'color TEXT');
  safeAddColumn(database, 'users', 'email TEXT');
  safeAddColumn(database, 'users', 'status TEXT');
  safeAddColumn(database, 'users', 'custom_status TEXT');
  safeAddColumn(database, 'users', 'neons INTEGER DEFAULT 5000');
  safeAddColumn(database, 'users', 'is_vip INTEGER DEFAULT 0');
  safeAddColumn(database, 'users', 'is_banned INTEGER DEFAULT 0');
  safeAddColumn(database, 'users', 'last_daily_bonus_claim INTEGER DEFAULT 0');
  safeAddColumn(database, 'users', 'bonus_month_streak INTEGER DEFAULT 0');
  safeAddColumn(database, 'users', 'created_at TEXT');
  safeAddColumn(database, 'users', 'extra_json TEXT');

  safeAddColumn(database, 'rooms', 'is_verified INTEGER DEFAULT 0');
  safeAddColumn(database, 'rooms', 'verification_pending INTEGER DEFAULT 0');
  safeAddColumn(database, 'rooms', 'created_at INTEGER');

  safeAddColumn(database, 'messages', 'reactions_json TEXT');
  safeAddColumn(database, 'messages', 'pin_info_json TEXT');
  safeAddColumn(database, 'messages', 'is_forwarded INTEGER DEFAULT 0');
  safeAddColumn(database, 'messages', 'file_url TEXT');
  safeAddColumn(database, 'messages', 'file_name TEXT');
  safeAddColumn(database, 'messages', 'is_voice INTEGER DEFAULT 0');
  safeAddColumn(database, 'messages', 'voice_duration INTEGER DEFAULT 0');
  safeAddColumn(database, 'messages', 'extra_json TEXT');
}

export function persistSqliteToDisk(immediate = false) {
  if (!db) return;
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }

  const doSave = () => {
    try {
      if (!db) return;
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(SQLITE_FILE, buffer);
      console.log('💾 [SQLite] Database persisted to disk');
    } catch (err) {
      console.error('❌ [SQLite] Error saving database to disk:', err);
    }
  };

  if (immediate) {
    doSave();
  } else {
    saveDebounceTimer = setTimeout(doSave, 500);
  }
}

// User CRUD Helpers
export function sqliteSaveUser(user: any) {
  if (!db) return;
  const username = String(user.username || '').toLowerCase();
  if (!username) return;

  try {
    const extra = {
      activeStickerPacks: user.activeStickerPacks,
      customEmojiPacks: user.customEmojiPacks,
      purchasedGifts: user.purchasedGifts,
      receivedGifts: user.receivedGifts,
      dmContacts: user.dmContacts,
      customAvatarBadge: user.customAvatarBadge,
      walletTransactions: user.walletTransactions
    };

    db.run(
      `INSERT INTO users (
        username, password, nickname, bio, avatar, banner, color, email, status, custom_status,
        neons, is_vip, is_banned, last_daily_bonus_claim, bonus_month_streak, created_at, extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        password = excluded.password,
        nickname = excluded.nickname,
        bio = excluded.bio,
        avatar = excluded.avatar,
        banner = excluded.banner,
        color = excluded.color,
        email = excluded.email,
        status = excluded.status,
        custom_status = excluded.custom_status,
        neons = excluded.neons,
        is_vip = excluded.is_vip,
        is_banned = excluded.is_banned,
        last_daily_bonus_claim = excluded.last_daily_bonus_claim,
        bonus_month_streak = excluded.bonus_month_streak,
        extra_json = excluded.extra_json;`,
      [
        username,
        user.password || '',
        user.nickname || '',
        user.bio || '',
        user.avatar || '',
        user.banner || '',
        user.color || '',
        user.email || '',
        user.status || 'offline',
        user.customStatus || '',
        typeof user.neons === 'number' ? user.neons : 5000,
        user.isVip ? 1 : 0,
        user.isBanned ? 1 : 0,
        user.lastDailyBonusClaim || 0,
        user.bonusMonthStreak || 0,
        user.createdAt || new Date().toISOString(),
        JSON.stringify(extra)
      ]
    );
    persistSqliteToDisk(true); // Force immediate save on disk for user data
  } catch (err) {
    console.error('❌ [SQLite] Error saving user:', err);
  }
}

export function sqliteGetAllUsers(): any[] {
  if (!db) return [];
  try {
    const stmt = db.prepare(`SELECT * FROM users`);
    const results: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      let extra: any = {};
      try {
        if (row.extra_json) extra = JSON.parse(String(row.extra_json));
      } catch (_) {}

      results.push({
        username: row.username,
        password: row.password,
        nickname: row.nickname,
        bio: row.bio,
        avatar: row.avatar,
        banner: row.banner,
        color: row.color,
        email: row.email,
        status: row.status,
        customStatus: row.custom_status,
        neons: row.neons,
        isVip: Boolean(row.is_vip),
        isBanned: Boolean(row.is_banned),
        lastDailyBonusClaim: row.last_daily_bonus_claim,
        bonusMonthStreak: row.bonus_month_streak,
        createdAt: row.created_at,
        ...extra
      });
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('❌ [SQLite] Error fetching users:', err);
    return [];
  }
}

// Room & Messages CRUD Helpers
export function sqliteSaveRoom(room: any) {
  if (!db || !room || !room.name) return;
  try {
    db.run(
      `INSERT INTO rooms (
        name, is_dm, is_group, is_announcement, owner, admins_json, members_json, description, is_verified, verification_pending, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        is_dm = excluded.is_dm,
        is_group = excluded.is_group,
        is_announcement = excluded.is_announcement,
        owner = excluded.owner,
        admins_json = excluded.admins_json,
        members_json = excluded.members_json,
        description = excluded.description,
        is_verified = excluded.is_verified,
        verification_pending = excluded.verification_pending;`,
      [
        room.name,
        room.isDM ? 1 : 0,
        room.isGroup ? 1 : 0,
        room.isAnnouncement ? 1 : 0,
        room.owner || '',
        JSON.stringify(room.admins || []),
        JSON.stringify(room.members || []),
        room.description || '',
        room.isVerified ? 1 : 0,
        room.verificationPending ? 1 : 0,
        room.createdAt || Date.now()
      ]
    );

    // Also persist messages in room
    if (Array.isArray(room.history)) {
      for (const msg of room.history) {
        sqliteSaveMessage(msg, room.name);
      }
    }
    persistSqliteToDisk();
  } catch (err) {
    console.error('❌ [SQLite] Error saving room:', err);
  }
}

export function sqliteGetAllRooms(): Record<string, any> {
  if (!db) return {};
  try {
    const stmt = db.prepare(`SELECT * FROM rooms`);
    const rooms: Record<string, any> = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      let admins = [];
      let members = [];
      try { admins = JSON.parse(String(row.admins_json || '[]')); } catch (_) {}
      try { members = JSON.parse(String(row.members_json || '[]')); } catch (_) {}

      rooms[String(row.name)] = {
        name: row.name,
        isDM: Boolean(row.is_dm),
        isGroup: Boolean(row.is_group),
        isAnnouncement: Boolean(row.is_announcement),
        owner: row.owner || '',
        admins,
        members,
        description: row.description || '',
        isVerified: Boolean(row.is_verified),
        verificationPending: Boolean(row.verification_pending),
        history: []
      };
    }
    stmt.free();

    // Populate messages per room
    for (const roomName in rooms) {
      rooms[roomName].history = sqliteGetRoomMessages(roomName, 100);
    }
    return rooms;
  } catch (err) {
    console.error('❌ [SQLite] Error fetching rooms:', err);
    return {};
  }
}

export function sqliteSaveMessage(msg: any, roomName: string) {
  if (!db || !msg) return;
  const msgId = msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
  msg.id = msgId;

  try {
    const extra = {
      isAutoAnswer: msg.isAutoAnswer,
      isVesperBot: msg.isVesperBot,
      forwardFrom: msg.forwardFrom,
      color: msg.color
    };

    db.run(
      `INSERT INTO messages (
        id, room, sender, content, timestamp, type, reply_to, reactions_json, pin_info_json,
        is_forwarded, file_url, file_name, is_voice, voice_duration, extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        reactions_json = excluded.reactions_json,
        pin_info_json = excluded.pin_info_json;`,
      [
        msgId,
        roomName,
        msg.sender || 'Anonymous',
        msg.content || '',
        msg.timestamp || Date.now(),
        msg.type || 'text',
        typeof msg.replyTo === 'object' ? JSON.stringify(msg.replyTo) : (msg.replyTo || ''),
        JSON.stringify(msg.reactions || {}),
        msg.pinInfo ? JSON.stringify(msg.pinInfo) : '',
        msg.isForwarded ? 1 : 0,
        msg.fileUrl || '',
        msg.fileName || '',
        msg.isVoice ? 1 : 0,
        msg.voiceDuration || 0,
        JSON.stringify(extra)
      ]
    );
    persistSqliteToDisk();
  } catch (err) {
    console.error('❌ [SQLite] Error saving message:', err);
  }
}

export function sqliteGetRoomMessages(roomName: string, limit = 100): any[] {
  if (!db) return [];
  try {
    const stmt = db.prepare(`SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC LIMIT ?`);
    stmt.bind([roomName, limit]);
    const messages: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      let reactions = {};
      let replyTo: any = null;
      let pinInfo: any = null;
      let extra: any = {};

      try { if (row.reactions_json) reactions = JSON.parse(String(row.reactions_json)); } catch (_) {}
      try { if (row.reply_to) replyTo = JSON.parse(String(row.reply_to)); } catch (_) { replyTo = row.reply_to; }
      try { if (row.pin_info_json) pinInfo = JSON.parse(String(row.pin_info_json)); } catch (_) {}
      try { if (row.extra_json) extra = JSON.parse(String(row.extra_json)); } catch (_) {}

      messages.push({
        id: row.id,
        room: row.room,
        sender: row.sender,
        content: row.content,
        timestamp: row.timestamp,
        type: row.type || 'text',
        replyTo,
        reactions,
        pinInfo,
        isForwarded: Boolean(row.is_forwarded),
        fileUrl: row.file_url,
        fileName: row.file_name,
        isVoice: Boolean(row.is_voice),
        voiceDuration: row.voice_duration,
        ...extra
      });
    }
    stmt.free();
    return messages;
  } catch (err) {
    console.error('❌ [SQLite] Error fetching messages for room:', roomName, err);
    return [];
  }
}

// Suggestions CRUD
export function sqliteSaveSuggestion(sugg: any) {
  if (!db || !sugg) return;
  const id = sugg.id || ('sugg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  try {
    db.run(
      `INSERT INTO suggestions (id, username, text, category, status, timestamp, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status;`,
      [
        id,
        sugg.username || 'Anonymous',
        sugg.text || '',
        sugg.category || 'general',
        sugg.status || 'pending',
        sugg.timestamp || Date.now(),
        sugg.ip || ''
      ]
    );
    persistSqliteToDisk();
  } catch (err) {
    console.error('❌ [SQLite] Error saving suggestion:', err);
  }
}

export function sqliteGetAllSuggestions(): any[] {
  if (!db) return [];
  try {
    const stmt = db.prepare(`SELECT * FROM suggestions ORDER BY timestamp DESC`);
    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('❌ [SQLite] Error fetching suggestions:', err);
    return [];
  }
}
