import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { getSqliteDb, persistSqliteToDisk } from './sqlite_db.js';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let vapidKeys: VapidKeys | null = null;
const DATA_DIR = process.env.VESPER_DATA_DIR || path.join(process.env.VESPER_APP_ROOT || process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid_keys.json');

export function initVapid(): VapidKeys {
  if (vapidKeys) return vapidKeys;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(VAPID_FILE)) {
      const raw = fs.readFileSync(VAPID_FILE, 'utf-8').trim();
      if (raw) {
        vapidKeys = JSON.parse(raw);
      }
    }
    if (!vapidKeys) {
      const generated = webpush.generateVAPIDKeys();
      vapidKeys = {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey
      };
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
      console.log('[WebPush] Generated new VAPID keypair successfully');
    }
  } catch (err) {
    console.error('[WebPush] Error loading VAPID keys, using generated fallback:', err);
    const fallback = webpush.generateVAPIDKeys();
    vapidKeys = {
      publicKey: fallback.publicKey,
      privateKey: fallback.privateKey
    };
  }

  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@vesperchat.app';
  webpush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);
  return vapidKeys;
}

export function getVapidPublicKey(): string {
  const keys = initVapid();
  return keys.publicKey;
}

export interface PushSubscriptionItem {
  id: string;
  username: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: number;
}

export async function initPushDbTable() {
  try {
    const db = await getSqliteDb();
    db.run(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        keys_p256dh TEXT NOT NULL,
        keys_auth TEXT NOT NULL,
        user_agent TEXT,
        created_at INTEGER
      );
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_push_username ON push_subscriptions(username);`);
    persistSqliteToDisk();
  } catch (err) {
    console.error('[PushDb] Error initializing push_subscriptions table:', err);
  }
}

export async function savePushSubscription(username: string, subscription: any, userAgent?: string): Promise<boolean> {
  if (!username || !subscription || !subscription.endpoint || !subscription.keys) {
    return false;
  }
  const u = username.toLowerCase().trim();
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;
  const subId = 'sub_' + Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-20);

  try {
    const db = await getSqliteDb();
    db.run(
      `INSERT INTO push_subscriptions (id, username, endpoint, keys_p256dh, keys_auth, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         username = excluded.username,
         keys_p256dh = excluded.keys_p256dh,
         keys_auth = excluded.keys_auth,
         user_agent = excluded.user_agent,
         created_at = excluded.created_at;`,
      [subId, u, endpoint, p256dh, auth, userAgent || '', Date.now()]
    );
    persistSqliteToDisk();
    console.log(`[WebPush] Saved subscription for user @${u}`);
    return true;
  } catch (err) {
    console.error(`[WebPush] Failed to save subscription for @${u}:`, err);
    return false;
  }
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  try {
    const db = await getSqliteDb();
    db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?;`, [endpoint]);
    persistSqliteToDisk();
    console.log('[WebPush] Deleted expired/unsubscribed push subscription');
  } catch (err) {
    console.error('[WebPush] Failed to delete push subscription:', err);
  }
}

export async function getUserSubscriptions(username: string): Promise<PushSubscriptionItem[]> {
  if (!username) return [];
  const u = username.toLowerCase().trim();
  try {
    const db = await getSqliteDb();
    const stmt = db.prepare(`SELECT * FROM push_subscriptions WHERE username = ?;`);
    stmt.bind([u]);
    const results: PushSubscriptionItem[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: String(row.id),
        username: String(row.username),
        endpoint: String(row.endpoint),
        keys: {
          p256dh: String(row.keys_p256dh),
          auth: String(row.keys_auth)
        },
        userAgent: String(row.user_agent || ''),
        createdAt: Number(row.created_at || 0)
      });
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error(`[WebPush] Failed to get subscriptions for @${u}:`, err);
    return [];
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: {
    url?: string;
    room?: string;
    author?: string;
    messageId?: string;
    timestamp?: number;
    [key: string]: any;
  };
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  vibrate?: number[];
  silent?: boolean;
}

export async function sendPushToUser(username: string, payload: PushNotificationPayload): Promise<{ success: number; failed: number }> {
  if (!username) return { success: 0, failed: 0 };
  initVapid();

  const subscriptions = await getUserSubscriptions(username);
  if (subscriptions.length === 0) {
    return { success: 0, failed: 0 };
  }

  const payloadString = JSON.stringify({
    title: payload.title || 'VesperChat',
    body: payload.body || 'Новое сообщение',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    image: payload.image,
    tag: payload.tag || ('chat_' + (payload.data?.room || 'general')),
    data: {
      url: payload.data?.url || (payload.data?.room ? `/?room=${encodeURIComponent(payload.data.room)}` : '/'),
      room: payload.data?.room || '',
      author: payload.data?.author || '',
      messageId: payload.data?.messageId || '',
      timestamp: payload.data?.timestamp || Date.now()
    },
    actions: payload.actions || [
      { action: 'open', title: '💬 Открыть' },
      { action: 'dismiss', title: '✕ Закрыть' }
    ],
    vibrate: payload.vibrate || [100, 50, 100],
    requireInteraction: false
  });

  let successCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth
        }
      };

      await webpush.sendNotification(pushSubscription, payloadString, {
        TTL: 86400, // 24 hours
        urgency: 'high'
      });
      successCount++;
    } catch (err: any) {
      failedCount++;
      const statusCode = err.statusCode || (err.response && err.response.statusCode);
      console.warn(`[WebPush Warning] Push failed for @${username} (status: ${statusCode}):`, err.message);

      // If subscription expired or invalidated (404 or 410 Gone)
      if (statusCode === 404 || statusCode === 410) {
        console.log(`[WebPush] Removing invalid endpoint for @${username}`);
        await removePushSubscription(sub.endpoint);
      }
    }
  }

  return { success: successCount, failed: failedCount };
}
