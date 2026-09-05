import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

export interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

let dbInstance: any = null;
let isInitialized = false;

export function getFirebaseFirestore(): any {
  if (dbInstance) return dbInstance;

  try {
    const configPath = path.join(process.env.VESPER_APP_ROOT || process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const raw = fs.readFileSync(configPath, 'utf-8').trim();
    if (!raw) {
      return null;
    }

    const config: FirebaseConfig = JSON.parse(raw);
    if (!config.apiKey || !config.projectId) {
      return null;
    }

    const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
    
    // Check if a custom database ID was provisioned
    if (config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)') {
      try {
        dbInstance = getFirestore(app, config.firestoreDatabaseId);
      } catch (e) {
        console.warn(`[Firebase] Fallback to default database:`, e);
        dbInstance = getFirestore(app);
      }
    } else {
      dbInstance = getFirestore(app);
    }

    isInitialized = true;
    console.log(`🔥 [Firebase Firestore] Connected successfully to project: ${config.projectId}`);
    return dbInstance;
  } catch (err) {
    console.error('❌ [Firebase] Failed to initialize Firestore:', err);
    return null;
  }
}

// Clean key for Firestore document ID (safe chars only)
function sanitizeDocId(id: string): string {
  return encodeURIComponent(id).replace(/\./g, '%2E').replace(/\//g, '%2F');
}

function desanitizeDocId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

// ==========================================
// USERS SYNC
// ==========================================

export async function firestoreSaveUser(user: any): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !user || !user.username) return false;

  try {
    const docId = sanitizeDocId(user.username.toLowerCase());
    const docRef = doc(db, 'vesper_users', docId);

    // Filter out undefined values as Firestore rejects them
    const cleanData: any = {};
    for (const [k, v] of Object.entries(user)) {
      if (v !== undefined) {
        cleanData[k] = v;
      }
    }
    cleanData.lastSyncedAt = new Date().toISOString();

    await setDoc(docRef, cleanData, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[Firebase] Failed to save user ${user.username} to Firestore:`, err);
    return false;
  }
}

export async function firestoreLoadAllUsers(): Promise<any[]> {
  const db = getFirebaseFirestore();
  if (!db) return [];

  try {
    const usersCol = collection(db, 'vesper_users');
    const snapshot = await getDocs(usersCol);
    const users: any[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.username) {
        users.push(data);
      }
    });
    console.log(`🔥 [Firebase] Loaded ${users.length} users from Firestore cloud`);
    return users;
  } catch (err) {
    console.warn('[Firebase] Error reading users from Firestore:', err);
    return [];
  }
}

export async function firestoreDeleteUser(username: string): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !username) return false;
  try {
    const docId = sanitizeDocId(username.toLowerCase());
    const docRef = doc(db, 'vesper_users', docId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.warn(`[Firebase] Failed to delete user ${username} from Firestore:`, err);
    return false;
  }
}

// ==========================================
// ROOMS & CHATS SYNC
// ==========================================

export async function firestoreSaveRoom(room: any): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !room || !room.name) return false;

  try {
    const docId = sanitizeDocId(room.name);
    const docRef = doc(db, 'vesper_rooms', docId);

    const cleanData: any = {
      name: room.name,
      isDM: Boolean(room.isDM),
      isGroup: Boolean(room.isGroup),
      isAnnouncement: Boolean(room.isAnnouncement),
      owner: room.owner || '',
      admins: Array.isArray(room.admins) ? room.admins : [],
      members: Array.isArray(room.members) ? room.members : [],
      description: room.description || '',
      isVerified: Boolean(room.isVerified),
      verificationPending: Boolean(room.verificationPending),
      lastSyncedAt: new Date().toISOString()
    };

    if (Array.isArray(room.history)) {
      // Store up to 100 recent messages per room
      cleanData.history = room.history.slice(-100).map((m: any) => {
        const cleanMsg: any = {};
        for (const [mk, mv] of Object.entries(m)) {
          if (mv !== undefined) cleanMsg[mk] = mv;
        }
        return cleanMsg;
      });
    }

    await setDoc(docRef, cleanData, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[Firebase] Failed to save room ${room.name} to Firestore:`, err);
    return false;
  }
}

export async function firestoreLoadAllRooms(): Promise<Record<string, any>> {
  const db = getFirebaseFirestore();
  if (!db) return {};

  try {
    const roomsCol = collection(db, 'vesper_rooms');
    const snapshot = await getDocs(roomsCol);
    const rooms: Record<string, any> = {};
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.name) {
        rooms[data.name] = data;
      }
    });
    console.log(`🔥 [Firebase] Loaded ${Object.keys(rooms).length} rooms/DMs from Firestore cloud`);
    return rooms;
  } catch (err) {
    console.warn('[Firebase] Error reading rooms from Firestore:', err);
    return {};
  }
}

export async function firestoreDeleteRoom(roomName: string): Promise<boolean> {
  const db = getFirebaseFirestore();
  if (!db || !roomName) return false;
  try {
    const docId = sanitizeDocId(roomName);
    const docRef = doc(db, 'vesper_rooms', docId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.warn(`[Firebase] Failed to delete room ${roomName} from Firestore:`, err);
    return false;
  }
}

// Background debounced batch syncer
let isSyncingUsers = false;
let pendingUsersQueue = new Map<string, any>();
let syncTimer: NodeJS.Timeout | null = null;

export function queueUserForFirestoreSync(user: any) {
  if (!user || !user.username) return;
  pendingUsersQueue.set(user.username.toLowerCase(), user);

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (isSyncingUsers || pendingUsersQueue.size === 0) return;
    isSyncingUsers = true;
    const batch = Array.from(pendingUsersQueue.values());
    pendingUsersQueue.clear();

    for (const u of batch) {
      await firestoreSaveUser(u);
    }
    isSyncingUsers = false;
  }, 1000);
}

let isSyncingRooms = false;
let pendingRoomsQueue = new Map<string, any>();
let roomSyncTimer: NodeJS.Timeout | null = null;

export function queueRoomForFirestoreSync(room: any) {
  if (!room || !room.name) return;
  pendingRoomsQueue.set(room.name, room);

  if (roomSyncTimer) clearTimeout(roomSyncTimer);
  roomSyncTimer = setTimeout(async () => {
    if (isSyncingRooms || pendingRoomsQueue.size === 0) return;
    isSyncingRooms = true;
    const batch = Array.from(pendingRoomsQueue.values());
    pendingRoomsQueue.clear();

    for (const r of batch) {
      await firestoreSaveRoom(r);
    }
    isSyncingRooms = false;
  }, 1000);
}
