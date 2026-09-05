import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

// Global process error handlers to prevent crashes and ensure high availability
process.on('uncaughtException', (err) => {
  console.error('⚠️ [SYSTEM UncaughtException]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [SYSTEM UnhandledRejection]:', reason);
});

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import {
  getSqliteDb,
  sqliteSaveUser,
  sqliteGetAllUsers,
  sqliteSaveRoom,
  sqliteGetAllRooms,
  sqliteSaveMessage,
  sqliteGetRoomMessages,
  sqliteSaveSuggestion,
  sqliteGetAllSuggestions,
  persistSqliteToDisk
} from './server/sqlite_db.js';
import {
  firestoreSaveUser,
  firestoreLoadAllUsers,
  firestoreDeleteUser,
  firestoreSaveRoom,
  firestoreLoadAllRooms,
  firestoreDeleteRoom,
  queueUserForFirestoreSync,
  queueRoomForFirestoreSync
} from './server/firebase_store.js';
import {
  initVapid,
  initPushDbTable,
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  getUserSubscriptions,
  sendPushToUser
} from './server/push_service.js';

const app = express();

// Ultra-fast health check endpoints for cloud hosts (Render, Railway, Fly, Heroku)
// Responds in < 1ms without hitting any heavy middleware or database
app.get(['/healthz', '/health', '/ping', '/up'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

const APP_ROOT = process.env.VESPER_APP_ROOT || (typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : process.cwd());
const DATA_DIR = process.env.VESPER_DATA_DIR || path.join(APP_ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

// Security and hardening headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Advanced Multi-Layer Rate Limiter and Anti-DDoS Protection
interface RateLimitBucket {
  count: number;
  resetAt: number;
  violations: number;
  bannedUntil?: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();
const bannedIps = new Set<string>();

function checkRateLimit(ip: string, limit: number, windowMs: number, penaltyMs: number = 30000): boolean {
  if (!ip) return true;
  const now = Date.now();

  // Quick check for banned IP
  if (bannedIps.has(ip)) return false;

  let entry = rateLimitMap.get(ip);
  if (!entry) {
    entry = { count: 1, resetAt: now + windowMs, violations: 0 };
    rateLimitMap.set(ip, entry);
    return true;
  }

  // Check if currently under temporary ban penalty
  if (entry.bannedUntil && now < entry.bannedUntil) {
    return false;
  }

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return true;
  }

  if (entry.count >= limit) {
    entry.violations++;
    // If multiple violations occur, place into progressive temporary ban
    if (entry.violations >= 3) {
      entry.bannedUntil = now + penaltyMs * entry.violations;
      console.warn(`[Anti-DDoS] IP ${ip} temporarily throttled/banned for ${Math.round((penaltyMs * entry.violations) / 1000)}s due to flood`);
    }
    return false;
  }

  entry.count++;
  return true;
}

// Cleanup stale rate limit items every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetAt && (!v.bannedUntil || now > v.bannedUntil)) {
      rateLimitMap.delete(k);
    }
  }
}, 120000);

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static(path.join(APP_ROOT, 'public')));

app.get(['/vesperchat.apk', '/download/apk', '/downloads/vesperchat.apk'], (req, res) => {
  const apkPath = path.join(APP_ROOT, 'public', 'vesperchat.apk');
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'vesperchat.apk');
  } else {
    const rootApkPath = path.join(APP_ROOT, 'vesperchat (3).apk');
    if (fs.existsSync(rootApkPath)) {
      res.download(rootApkPath, 'vesperchat.apk');
    } else {
      res.status(404).send('APK file not found');
    }
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);

let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Email delivery helper: Resend API (HTTPS fetch) with fallback to Nodemailer SMTP
async function sendVerificationEmail(recipientEmail: string, code: string): Promise<{ success: boolean; provider: string; error?: string }> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USER || '';
  const rawPass = process.env.SMTP_PASS || '';
  const pass = rawPass.replace(/\s+/g, '');
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const from = process.env.SMTP_FROM || user || '';
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const resendFrom = process.env.RESEND_FROM || 'VesperChat <onboarding@resend.dev>';

  const htmlContent = `
    <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; background: #0d0a1a; color: #f8fafc; padding: 28px; border-radius: 16px; max-width: 480px; border: 1px solid rgba(139, 92, 246, 0.3);">
      <h2 style="color: #a855f7; margin-top: 0; font-size: 22px;">VesperChat Messenger</h2>
      <p style="color: #cbd5e1; font-size: 15px;">Ваш 6-значный код для подтверждения регистрации:</p>
      <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #38bdf8; background: #18122b; padding: 16px 24px; border-radius: 12px; text-align: center; margin: 20px 0; border: 1px solid #8b5cf6;">
        ${code}
      </div>
      <p style="font-size: 13px; color: #94a3b8; margin-bottom: 0;">⏱️ Код действителен строго <strong>15 минут</strong>. Никому не сообщайте этот код.</p>
    </div>
  `;
  const textContent = `Ваш код подтверждения регистрации в VesperChat: ${code}\nКод действителен в течение 15 минут. Никому не сообщайте этот код.`;

  // Step 1: Try Resend HTTPS API if API key is provided
  if (resendApiKey) {
    try {
      console.log(`📧 [EMAIL / Resend API] Attempting HTTPS delivery to ${recipientEmail}...`);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [recipientEmail],
          subject: '🔑 Код подтверждения VesperChat',
          html: htmlContent,
          text: textContent
        })
      });

      const resData: any = await response.json().catch(() => ({}));
      if (response.ok && resData.id) {
        console.log(`✅ [EMAIL / Resend SUCCESS] Email delivered to ${recipientEmail} via Resend HTTPS (ID: ${resData.id})`);
        return { success: true, provider: 'resend' };
      } else {
        const errDetail = resData.message || resData.error || response.statusText;
        console.warn(`⚠️ [EMAIL / Resend Warning] Resend returned HTTP ${response.status}: ${errDetail}. Falling back to Nodemailer SMTP...`);
      }
    } catch (err: any) {
      console.warn(`⚠️ [EMAIL / Resend Error] HTTPS request failed (${err.message}). Falling back to Nodemailer SMTP...`);
    }
  } else {
    console.log(`ℹ️ [EMAIL / Resend] RESEND_API_KEY not configured. Falling back to Nodemailer SMTP...`);
  }

  // Step 2: Fallback to Nodemailer SMTP
  try {
    console.log(`📬 [EMAIL / Nodemailer SMTP] Connecting to ${host}:${port} (${user})...`);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // false for 587 (uses STARTTLS)
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 5000,
      greetingTimeout: 4000,
      socketTimeout: 5000
    });

    const info = await transporter.sendMail({
      from: `"VesperChat Messenger" <${from}>`,
      to: recipientEmail,
      subject: '🔑 Код подтверждения VesperChat',
      text: textContent,
      html: htmlContent
    });

    console.log(`✅ [EMAIL / SMTP SUCCESS] Email successfully sent to ${recipientEmail} via ${host}:${port} (MessageID: ${info.messageId})`);
    return { success: true, provider: 'smtp' };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.warn(`⚠️ [EMAIL / SMTP Warning] Failed to deliver via SMTP (${errorMsg}).`);
    console.log(`🔑 [DEV MODE] Verification code for ${recipientEmail}: ${code}`);
    return { success: false, provider: 'none', error: errorMsg };
  }
}

// SMTP helper for user suggestions and feedback (sent to vesperchats@gmai.com & vesperchats@gmail.com)
async function sendSuggestionEmail(author: string, category: string, title: string, content: string, userIp?: string): Promise<{ success: boolean; error?: string }> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const user = process.env.SMTP_USER || '';
  const rawPass = process.env.SMTP_PASS || '';
  const pass = rawPass.replace(/\s+/g, '');
  const from = process.env.SMTP_FROM || user || '';

  // Send to both addresses to ensure delivery regardless of domain spelling (gmail.com vs gmai.com)
  const recipientList = ['vesperchats@gmail.com', 'vesperchats@gmai.com'];

  const safeTitle = (title || 'Без темы').trim().slice(0, 150);
  const safeAuthor = (author || 'Пользователь').trim();
  const safeCategory = (category || 'Идея').trim();
  const safeContent = (content || '').trim().slice(0, 4000);

  // Also persist to disk log
  try {
    const fs = await import('fs');
    const path = await import('path');
    const logFile = path.join(DATA_DIR, 'all_suggestions.json');
    let existingLogs: any[] = [];
    if (fs.existsSync(logFile)) {
      try {
        existingLogs = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
      } catch (e) {
        existingLogs = [];
      }
    }
    existingLogs.push({
      author: safeAuthor,
      category: safeCategory,
      title: safeTitle,
      content: safeContent,
      ip: userIp || 'unknown',
      date: new Date().toISOString()
    });
    fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2), 'utf-8');
    sqliteSaveSuggestion({
      username: safeAuthor,
      text: `${safeTitle}: ${safeContent}`,
      category: safeCategory,
      status: 'submitted',
      timestamp: Date.now(),
      ip: userIp || ''
    });
  } catch (logErr) {
    console.warn('[Suggestions Log Warning]', logErr);
  }

  // Attempt 1: Port 465 (SSL direct - fastest & most reliable in cloud)
  // Attempt 2: Port 587 (STARTTLS)
  const portConfigs = [
    { port: 465, secure: true },
    { port: 587, secure: false }
  ];

  let lastError = '';

  for (const cfg of portConfigs) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 12000,
        greetingTimeout: 10000,
        socketTimeout: 12000
      });

      const mailOptions = {
        from: `"VesperChat Suggestions" <${from}>`,
        to: recipientList.join(', '),
        subject: `💡 [VesperChat] [${safeCategory}] ${safeTitle} (@${safeAuthor})`,
        text: `Новое предложение от пользователя @${safeAuthor}:\n\nКатегория: ${safeCategory}\nТема: ${safeTitle}\n\nОписание:\n${safeContent}\n\nДата: ${new Date().toLocaleString('ru-RU')}\nIP: ${userIp || 'unknown'}`,
        html: `
          <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; background: #0d0a1a; color: #f8fafc; padding: 28px; border-radius: 16px; max-width: 600px; border: 1px solid rgba(139, 92, 246, 0.3);">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom: 16px;">
              <h2 style="color: #a855f7; margin: 0; font-size: 22px;">💡 VesperChat — Новое предложение</h2>
            </div>
            <div style="background: #18122b; padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 16px;">
              <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Автор: <strong style="color: #38bdf8;">@${safeAuthor}</strong></div>
              <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Категория: <span style="background: rgba(168,85,247,0.2); color: #c084fc; padding: 2px 8px; border-radius: 6px; font-weight: 700;">${safeCategory}</span></div>
              <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">Дата: <span style="color: #e2e8f0;">${new Date().toLocaleString('ru-RU')}</span></div>
              <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin-top: 10px;">Тема: ${safeTitle}</div>
            </div>
            <div style="font-size: 14px; line-height: 1.6; color: #e2e8f0; background: rgba(0,0,0,0.3); padding: 18px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.2); white-space: pre-wrap;">
${safeContent}
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 20px; margin-bottom: 0;">Получено через VesperChat с защитой от спама (1 час перезарядки).</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`[SMTP Suggestion Success] Sent suggestion to ${recipientList.join(', ')} via port ${cfg.port} from @${safeAuthor}`);
      return { success: true };
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`[SMTP Suggestion Retry] Port ${cfg.port} failed (${lastError}), trying next...`);
    }
  }

  console.warn(`[SMTP Suggestion Warning] Failed all SMTP attempts: ${lastError}`);
  return { success: false, error: lastError };
}

interface PendingVerification {
  email: string;
  name: string;
  nickname?: string;
  inviteCode: string;
  code: string;
  expiresAt: number;
}

const pendingVerificationCodes = new Map<string, PendingVerification>();

function extractCleanEmail(email: string): string {
  if (!email) return '';
  const raw = email.trim().toLowerCase();
  const match = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : raw;
}

// Send verification email endpoint
app.post('/api/send-code', async (req, res) => {
  try {
    const { email, name, nickname, inviteCode } = req.body || {};
    const trimmedEmail = extractCleanEmail(email);
    const trimmedName = (name || '').trim();
    const trimmedNickname = (nickname || '').trim().slice(0, 15);

    console.log(`\n======================================================`);
    console.log(`🔑 [AUTH /api/send-code] Incoming request:`);
    console.log(`   Email:    "${trimmedEmail}"`);
    console.log(`   Username: "${trimmedName}"`);
    console.log(`   Nickname: "${trimmedNickname || 'none'}"`);

    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      console.warn(`⚠️ [AUTH /api/send-code] Rejected: Invalid email address ("${email}")`);
      return res.status(400).json({ success: false, error: 'В почте есть ошибка (укажите валидный email)' });
    }

    if (!trimmedName) {
      console.warn(`⚠️ [AUTH /api/send-code] Rejected: Username is missing`);
      return res.status(400).json({ success: false, error: 'Укажите юзернейм!' });
    }

    // Username validation: English letters, numbers, and underscores only (1 to 24 chars)
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(trimmedName)) {
      console.warn(`⚠️ [AUTH /api/send-code] Rejected: Invalid username format ("${trimmedName}")`);
      return res.status(400).json({ success: false, error: 'Юзернейм может содержать только английские буквы, цифры и символ _ (от 1 до 24 символов)!' });
    }

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity

    pendingVerificationCodes.set(trimmedEmail, {
      email: trimmedEmail,
      name: trimmedName,
      nickname: trimmedNickname,
      inviteCode: (inviteCode || '').trim(),
      code,
      expiresAt
    });

    console.log(`🔐 [AUTH /api/send-code] Generated 6-digit code for ${trimmedEmail}: >>> ${code} <<< (Valid for 15 min)`);
    console.log(`======================================================\n`);

    // Trigger async email delivery via Resend API or SMTP fallback
    sendVerificationEmail(trimmedEmail, code).catch(e => console.warn('[EMAIL ERROR]', e));

    return res.json({
      success: true,
      emailSent: true,
      message: 'Код подтверждения отправлен на вашу почту!',
      expiresIn: 900
    });
  } catch (err: any) {
    console.error('❌ [AUTH /api/send-code] Error in /api/send-code:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при отправке кода' });
  }
});

// Verify 6-digit code and register user endpoint
app.post('/api/verify-code', async (req, res) => {
  try {
    const { email, code, password } = req.body || {};
    const trimmedEmail = extractCleanEmail(email);
    const trimmedCode = (code || '').trim();
    const trimmedPass = (password || '').trim();

    console.log(`\n======================================================`);
    console.log(`🔐 [AUTH /api/verify-code] Incoming verification request:`);
    console.log(`   Email:        "${trimmedEmail}"`);
    console.log(`   Entered Code: "${trimmedCode}"`);

    if (!trimmedCode || !trimmedPass) {
      console.warn(`⚠️ [AUTH /api/verify-code] Missing 6-digit code or password`);
      return res.status(400).json({ success: false, error: 'Заполните 6-значный код и пароль!' });
    }

    if (trimmedPass.length < 3) {
      console.warn(`⚠️ [AUTH /api/verify-code] Password too short (< 3 chars)`);
      return res.status(400).json({ success: false, error: 'Пароль должен быть не короче 3 символов!' });
    }

    // Primary lookup by clean email
    let pendingKey = trimmedEmail;
    let pending = pendingVerificationCodes.get(trimmedEmail);

    // Fallback 1: search pending codes if email didn't match directly
    if (!pending && trimmedCode) {
      for (const [pEmail, pData] of pendingVerificationCodes.entries()) {
        if (pData.code === trimmedCode && Date.now() <= pData.expiresAt) {
          console.log(`ℹ️ [AUTH /api/verify-code] Found matching code ${trimmedCode} for pending email ${pEmail}`);
          pending = pData;
          pendingKey = pEmail;
          break;
        }
      }
    }

    // Fallback 2: check if any pending verification exists in map if map only has 1 item
    if (!pending && pendingVerificationCodes.size === 1) {
      const soleEntry = Array.from(pendingVerificationCodes.values())[0];
      const soleKey = Array.from(pendingVerificationCodes.keys())[0];
      if (soleEntry && Date.now() <= soleEntry.expiresAt && soleEntry.code === trimmedCode) {
        pending = soleEntry;
        pendingKey = soleKey;
      }
    }

    if (!pending) {
      console.warn(`❌ [AUTH /api/verify-code FAIL] No pending code found for email="${trimmedEmail}", code="${trimmedCode}". (Total pending: ${pendingVerificationCodes.size})`);
      return res.status(400).json({ success: false, error: 'Код подтверждения не запрашивался или устарел. Запросите код заново.' });
    }

    if (Date.now() > pending.expiresAt) {
      console.warn(`❌ [AUTH /api/verify-code FAIL] Code expired for ${pendingKey} (over 15 min old)`);
      pendingVerificationCodes.delete(pendingKey);
      return res.status(400).json({ success: false, error: 'Время действия кода истекло (прошло больше 15 минут). Запросите новый код.' });
    }

    if (pending.code !== trimmedCode) {
      console.warn(`❌ [AUTH /api/verify-code FAIL] Invalid code: expected ${pending.code}, received ${trimmedCode}`);
      return res.status(400).json({ success: false, error: 'Неверный 6-значный код из письма!' });
    }

    // Code is valid! Create or update user account
    let finalUsername = pending.name;
    const lowerUser = finalUsername.toLowerCase();
    const userEmail = pending.email || trimmedEmail;

    if (usersMap.has(lowerUser)) {
      const existing = usersMap.get(lowerUser);
      if (existing && existing.email && extractCleanEmail(existing.email) === userEmail) {
        existing.password = trimmedPass;
        if (pending.nickname) existing.nickname = pending.nickname.slice(0, 15);
        saveUsers();
        pendingVerificationCodes.delete(pendingKey);
        console.log(`✅ [AUTH /api/verify-code SUCCESS] Existing user @${existing.username} updated and logged in.`);
        console.log(`======================================================\n`);
        return res.json({ success: true, username: existing.username, password: trimmedPass });
      } else {
        finalUsername = `${pending.name}_${Math.floor(100 + Math.random() * 900)}`;
      }
    }

    const color = avatarColors[finalUsername.length % avatarColors.length];
    const newAcc: UserAccount = {
      username: finalUsername,
      nickname: pending.nickname ? pending.nickname.slice(0, 15) : undefined,
      password: trimmedPass,
      color,
      email: userEmail,
      createdAt: new Date().toISOString()
    };

    usersMap.set(finalUsername.toLowerCase(), newAcc);
    saveUsers();
    pendingVerificationCodes.delete(pendingKey);

    const { device, ip } = detectDeviceAndIp(req);
    addVesperChatMessage(finalUsername, 'Вы зарегистрировались.', ip, device);

    console.log(`✅ [AUTH /api/verify-code SUCCESS] New user successfully registered: @${finalUsername} (${userEmail})`);
    console.log(`======================================================\n`);

    return res.json({
      success: true,
      username: finalUsername,
      password: trimmedPass
    });
  } catch (err: any) {
    console.error('❌ [AUTH /api/verify-code] Error in /api/verify-code:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при регистрации' });
  }
});

// Quick auto-registration endpoint when secret invite code "autoacc1" is used
app.post('/api/auto-register', async (req, res) => {
  try {
    const { password, inviteCode, nickname } = req.body || {};
    const trimmedInvite = (inviteCode || '').trim().toLowerCase();
    const trimmedPass = (password || '').trim();
    const trimmedNickname = (nickname || '').trim().slice(0, 15);

    if (trimmedInvite !== 'autoacc1') {
      return res.status(400).json({ success: false, error: 'Секретный код должен быть "autoacc1"' });
    }

    if (!trimmedPass || trimmedPass.length < 3) {
      return res.status(400).json({ success: false, error: 'Пароль должен быть не короче 3 символов!' });
    }

    // Generate random unique username: User_XXXXX
    let randomUsername = '';
    let attempts = 0;
    do {
      const num = Math.floor(1000 + Math.random() * 90000);
      randomUsername = `User_${num}`;
      attempts++;
    } while (usersMap.has(randomUsername.toLowerCase()) && attempts < 100);

    const lowerUser = randomUsername.toLowerCase();
    const color = avatarColors[randomUsername.length % avatarColors.length];
    const newAcc: UserAccount = {
      username: randomUsername,
      nickname: trimmedNickname || undefined,
      password: trimmedPass,
      color,
      createdAt: new Date().toISOString()
    };

    usersMap.set(lowerUser, newAcc);
    saveUsers();
    
    // Also force an immediate SQLite persist for the new user just to be extra safe
    sqliteSaveUser(newAcc);

    const { device, ip } = detectDeviceAndIp(req);
    addVesperChatMessage(randomUsername, 'Вы зарегистрировались с секретным кодом autoacc1.', ip, device);
    console.log(`[AUTH] Auto-registered user ${randomUsername} (password: ${trimmedPass}) with code autoacc1.`);

    return res.json({
      success: true,
      username: randomUsername,
      password: trimmedPass
    });
  } catch (err: any) {
    console.error('Error in /api/auto-register:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера при автоматической регистрации' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 200 * 1024 * 1024 });

setInterval(() => {
  const pingPayload = JSON.stringify({ type: 'ping' });
  for (const client of connectedClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      try { client.ws.send(pingPayload); } catch (e) {}
    }
  }
}, 15000);

// Avatar color palette
const avatarColors = [
  '#8b5cf6', '#a855f7', '#ec4899', '#3b82f6', '#10b981',
  '#f59e0b', '#ef4444', '#06b6d4', '#6366f1', '#d946ef'
];

interface UserAccount {
  username: string;
  nickname?: string;
  password: string;
  color: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bio?: string;
  statusText?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  createdAt: string;
  dmContacts?: string[];
  blockedUsers?: string[];
  isVip?: boolean;
  neons?: number;
  bonusMonthStreak?: number;
  walletTransactions?: Array<{
    id: string;
    type: string;
    title: string;
    desc?: string;
    amount: number;
    timestamp: number;
    recipient?: string;
    sender?: string;
    status?: string;
  }>;
  lastDailyBonusClaim?: number;
  lastSuggestionTimestamp?: number;
  suggestions?: Array<{
    id: string;
    category: string;
    title: string;
    content: string;
    timestamp: number;
    status?: string;
  }>;
  gifts?: Array<{
    id: string;
    giftId: string;
    giftName: string;
    giftIcon: string;
    giftPrice?: number;
    from: string;
    to: string;
    comment?: string;
    timestamp: number;
  }>;
  privacySearch?: string;
  privacyCall?: string;
  gamingStatus?: string;
  customStickers?: any[];
  badges?: string[];
  story?: {
    id: string;
    videoData: string;
    videoType: string;
    createdAt: number;
    likes: string[];
  };
}

interface Client {
  ws: WebSocket;
  req?: any;
  username: string;
  nickname?: string;
  room: string;
  color: string;
  sessionId?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  gamingStatus?: string;
  bio?: string;
  statusText?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  blockedUsers?: string[];
  isVip?: boolean;
  neons?: number;
  badges?: string[];
}

// Device & session tracking structures
interface UserSession {
  id: string;
  device: string;
  ip: string;
  loginDateStr: string;
  lastActiveTs: number;
  ws?: WebSocket;
}
const userSessionsMap: Map<string, UserSession[]> = new Map();

function getFormattedMskTime(d = new Date()) {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    const parts = new Intl.DateTimeFormat('ru-RU', options).format(d);
    return `${parts} (МСК)`;
  } catch (e) {
    return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU')} (МСК)`;
  }
}

function getFormattedSessionDate(d = new Date()) {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Europe/Moscow',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    return new Intl.DateTimeFormat('ru-RU', options).format(d).replace(',', ' в');
  } catch (e) {
    return `${d.getDate()} ${d.getMonth()+1} в ${d.getHours()}:${d.getMinutes()}`;
  }
}

function detectDeviceAndIp(req?: any) {
  let userAgent = '';
  if (req && req.headers && req.headers['user-agent']) {
    userAgent = req.headers['user-agent'];
  }
  let device = 'Веб';
  if (/windows/i.test(userAgent)) device = 'Windows';
  else if (/android/i.test(userAgent)) device = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) device = 'iOS';
  else if (/macintosh|mac os x/i.test(userAgent)) device = 'Mac';
  else if (/linux/i.test(userAgent)) device = 'Linux';

  let ip = '31.192.141.152';
  if (req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      ip = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    } else if (req.socket && req.socket.remoteAddress) {
      ip = req.socket.remoteAddress;
    }
  }
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) {
    ip = '31.192.141.152';
  }

  return { device, ip };
}

function addVesperChatMessage(username: string, textTitle: string, ip: string, device: string) {
  if (!username) return;
  const lowerUser = username.toLowerCase();
  const roomKey = `DM:VesperChat_${lowerUser}`;

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
  const msgContent = `${textTitle}\nВремя: ${mskTime}\nIP: ${ip}\nУстройство: ${device}`;
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
}

function registerUserSession(client: Client, req?: any) {
  if (!client.username) return;
  const lowerUser = client.username.toLowerCase();
  const { device, ip } = detectDeviceAndIp(req);
  const sessionId = 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
  client.sessionId = sessionId;

  const newSess: UserSession = {
    id: sessionId,
    device,
    ip,
    loginDateStr: getFormattedSessionDate(),
    lastActiveTs: Date.now(),
    ws: client.ws
  };

  let sessions = userSessionsMap.get(lowerUser) || [];
  sessions.unshift(newSess);
  userSessionsMap.set(lowerUser, sessions);
}

function sendSessionsList(client: Client) {
  if (!client.username) return;
  const lowerUser = client.username.toLowerCase();
  let sessions = userSessionsMap.get(lowerUser) || [];

  if (!client.sessionId || !sessions.some(s => s.id === client.sessionId)) {
    registerUserSession(client, client.req);
    sessions = userSessionsMap.get(lowerUser) || [];
  }

  const now = Date.now();
  const currentSess = sessions.find(s => s.id === client.sessionId);

  const formattedSessions = sessions.map(s => {
    const diffMs = now - s.lastActiveTs;
    let lastActive = '1 мин. назад';
    if (s.id === client.sessionId) {
      lastActive = '1 мин. назад';
    } else if (diffMs < 60 * 1000) {
      lastActive = '1 мин. назад';
    } else if (diffMs < 60 * 60 * 1000) {
      const mins = Math.floor(diffMs / (60 * 1000));
      lastActive = `${mins} мин. назад`;
    } else if (diffMs < 24 * 60 * 60 * 1000) {
      const hrs = Math.floor(diffMs / (60 * 60 * 1000));
      lastActive = `${hrs} ч. назад`;
    } else {
      const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      lastActive = `${days} дн. назад`;
    }

    return {
      id: s.id,
      sessionId: s.id,
      device: s.device,
      ip: s.ip,
      loginDateStr: s.loginDateStr,
      lastActiveStr: lastActive,
      isCurrent: s.id === client.sessionId
    };
  });

  const curr = currentSess ? {
    id: currentSess.id,
    sessionId: currentSess.id,
    device: currentSess.device,
    ip: currentSess.ip,
    loginDateStr: currentSess.loginDateStr,
    lastActiveStr: 'был(а) 1 мин. назад',
    isCurrent: true
  } : (formattedSessions[0] || {
    id: 'current',
    sessionId: 'current',
    device: 'Windows',
    ip: '127.0.0.1',
    loginDateStr: getFormattedSessionDate(),
    lastActiveStr: 'был(а) 1 мин. назад',
    isCurrent: true
  });

  client.ws.send(JSON.stringify({
    type: 'sessions_list',
    currentSession: curr,
    otherSessions: formattedSessions.filter(s => !s.isCurrent),
    sessions: formattedSessions.filter(s => !s.isCurrent)
  }));
}

interface ThreadReply {
  id: string;
  username: string;
  color?: string;
  avatarUrl?: string;
  content: string;
  timestamp: string;
  fileName?: string;
  fileType?: string;
  fileData?: string;
  fileSize?: string;
}

interface PollOption {
  id: number;
  text: string;
  votes: string[];
}

interface PollData {
  question: string;
  options: PollOption[];
  isQuiz?: boolean;
  correctOptionId?: number;
  isClosed?: boolean;
}

interface Message {
  id?: string;
  messageId?: string;
  type: string;
  fullDate?: string;
  username?: string;
  password?: string;
  oldPassword?: string;
  newPassword?: string;
  email?: string;
  emailVerificationCode?: string;
  content?: string;
  room?: string;
  roomName?: string;
  verifiedRooms?: string[];
  isVerified?: boolean;
  newName?: string;
  target?: string;
  category?: string;
  [key: string]: any;
  targetUsername?: string;
  authorUsername?: string;
  videoData?: string;
  story?: any;
  blockedUsers?: string[];
  isVip?: boolean;
  isRead?: boolean;
  readBy?: string | string[];
  action?: string;
  members?: string[];
  recipient?: string; // For DM
  timestamp?: string;
  color?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  nickname?: string;
  bio?: string;
  statusText?: string;
  phone?: string;
  birthday?: string;
  newUsername?: string;
  amount?: number;
  method?: string;
  promoCode?: string;
  comment?: string;
  price?: number;
  itemType?: string;
  spendType?: string;
  title?: string;
  to?: string;
  adminPassword?: string;
  bonusMonthStreak?: number;
  fileName?: string;
  fileType?: string;
  fileData?: string;
  fileSize?: string;
  isVoice?: boolean;
  duration?: string;
  rooms?: string[];
  groups?: { name: string; isOwner: boolean; isAdmin: boolean; isAnnouncement?: boolean; membersCount: number }[];
  onlineUsers?: string[];
  usersList?: { username: string; color: string; avatarUrl?: string; isOnline: boolean }[];
  query?: string;
  results?: { username: string; color: string; avatarUrl?: string; isOnline: boolean }[];
  history?: Message[];
  code?: string;
  message?: string;
  emoji?: string;
  reactions?: Record<string, string[]>;
  isEdited?: boolean;
  deletedFor?: string[];
  mode?: string;
  forMeOnly?: boolean;
  replyTo?: { id?: string; username?: string; content?: string; timestamp?: string };
  threadReplies?: ThreadReply[];
  threadCount?: number;
  reply?: ThreadReply;
  poll?: PollData;
  isSticker?: boolean;
  stickerPack?: string;
  isVideoNote?: boolean;
  isPoll?: boolean;
  pollData?: PollData;
  isScheduled?: boolean;
  optionId?: number;
  isAnnouncement?: boolean;
  targetRoom?: string;
  isVideo?: boolean;
  callId?: string;
  signal?: any;
  reason?: string;
  offer?: any;
  answer?: any;
  candidate?: any;
  micMuted?: boolean;
  camOff?: boolean;
  isScreenSharing?: boolean;
  groupInfo?: {
    name: string;
    owner: string;
    admins: string[];
    members: string[];
    isGroup: boolean;
    isAnnouncement?: boolean;
  } | null;
}

interface Room {
  name: string;
  clients: Set<Client>;
  history: Message[];
  isDM?: boolean;
  isGroup?: boolean;
  isAnnouncement?: boolean;
  owner?: string;      // lowercase username of creator
  admins?: string[];   // array of lowercase usernames of admins
  members?: string[];  // array of lowercase usernames of members
  description?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  verificationPending?: boolean;
}

// Global state
const usersMap: Map<string, UserAccount> = new Map(); // key = lowercase username
const roomsMap: Map<string, Room> = new Map();
const connectedClients: Set<Client> = new Set();
const qrSessions: Map<string, Client> = new Map(); // key = qr login token, value = Client (waiting browser)

// Active Calls tracking for WebRTC Signaling
const activeCalls = new Map<string, Set<Client>>();

function getCallClients(callId: string): Client[] {
  const set = activeCalls.get(callId);
  return set ? Array.from(set) : [];
}

function addClientToCall(callId: string, client: Client) {
  if (!callId) return;
  if (!activeCalls.has(callId)) {
    activeCalls.set(callId, new Set());
  }
  activeCalls.get(callId)!.add(client);
}

function removeClientFromCall(callId: string, client: Client) {
  if (!callId) return;
  const set = activeCalls.get(callId);
  if (set) {
    set.delete(client);
    if (set.size === 0) {
      activeCalls.delete(callId);
    } else {
      for (const c of set) {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'user_left_call',
            callId,
            username: client.username
          }));
        }
      }
    }
  }
}

function removeClientFromAllCalls(client: Client) {
  for (const [callId, set] of activeCalls.entries()) {
    if (set.has(client)) {
      removeClientFromCall(callId, client);
    }
  }
}

// PERSISTENCE FILES
const USERS_FILE = path.join(DATA_DIR, 'users_data.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms_data.json');
const DMS_DIR = path.join(DATA_DIR, 'dms');

if (!fs.existsSync(DMS_DIR)) {
  try { fs.mkdirSync(DMS_DIR, { recursive: true }); } catch (e) {}
}

// Helper to get DM room name key and file name
function getDMKey(user1: string, user2: string): string {
  const u1 = user1.toLowerCase();
  const u2 = user2.toLowerCase();
  const sorted = [u1, u2].sort();
  return `DM:${sorted[0]}_${sorted[1]}`;
}

function isUserAuthorizedForRoom(username: string, roomName: string): boolean {
  if (!username || !roomName) return false;
  const uLower = username.toLowerCase();

  if (roomName.startsWith('DM:')) {
    const dmBody = roomName.substring(3);
    if (dmBody.startsWith('favorited_')) {
      return dmBody.substring('favorited_'.length).toLowerCase() === uLower;
    }
    if (dmBody.startsWith('VesperChat_')) {
      return dmBody.substring('VesperChat_'.length).toLowerCase() === uLower;
    }
    const parts = dmBody.split('_').map(p => p.toLowerCase());
    return parts.includes(uLower);
  }

  const room = roomsMap.get(roomName);
  if (room && room.isGroup) {
    const isOwner = room.owner === uLower;
    const isAdmin = (room.admins || []).includes(uLower);
    const isMember = (room.members || []).includes(uLower);
    return isOwner || isAdmin || isMember;
  }

  return true;
}

function loadDMHistoryFromFile(dmRoomKey: string): Message[] {
  try {
    const rawId = dmRoomKey.startsWith('DM:') ? dmRoomKey.substring(3) : dmRoomKey;
    const filePath = path.join(DMS_DIR, `${rawId}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (!content) return [];
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        parsed.forEach((m: any) => {
          if (m && !m.id) {
            m.id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
          }
        });
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading DM file:', err);
  }
  return [];
}

const dmSaveTimers = new Map<string, NodeJS.Timeout>();

function saveDMHistoryToFile(dmRoomKey: string, history: Message[]) {
  if (dmSaveTimers.has(dmRoomKey)) {
    clearTimeout(dmSaveTimers.get(dmRoomKey)!);
  }
  const timer = setTimeout(async () => {
    dmSaveTimers.delete(dmRoomKey);
    try {
      const rawId = dmRoomKey.startsWith('DM:') ? dmRoomKey.substring(3) : dmRoomKey;
      const filePath = path.join(DMS_DIR, `${rawId}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(history.slice(-100)), 'utf-8');
      
      // Also sync DM room to Firestore
      const room = roomsMap.get(dmRoomKey);
      if (room) {
        queueRoomForFirestoreSync(room);
      }
    } catch (err) {
      console.error('Error writing DM file:', err);
    }
  }, 300);
  dmSaveTimers.set(dmRoomKey, timer);
}

// Load stored users from Firestore Cloud, SQLite & JSON backup
async function loadUsers() {
  try {
    await getSqliteDb();

    // 1. First, load from Firebase Firestore (authoritative persistent cloud database)
    const firestoreUsers = await firestoreLoadAllUsers();
    if (firestoreUsers.length > 0) {
      for (const u of firestoreUsers) {
        if (u && u.username) {
          usersMap.set(u.username.toLowerCase(), u);
          sqliteSaveUser(u);
        }
      }
      console.log(`🔥 [Firestore] Synchronized ${firestoreUsers.length} users from Firebase Cloud`);
    }

    // 2. Load users from local SQLite
    const sqliteUsers = sqliteGetAllUsers();
    if (sqliteUsers.length > 0) {
      for (const u of sqliteUsers) {
        if (!usersMap.has(u.username.toLowerCase())) {
          usersMap.set(u.username.toLowerCase(), u);
          // Sync existing SQLite user to Firestore
          queueUserForFirestoreSync(u);
        }
      }
      console.log(`🗄️ [SQLite] Loaded ${sqliteUsers.length} users from SQLite database`);
    }

    // 3. Also check legacy JSON file for initial migration if needed
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        let migrated = 0;
        for (const u of data) {
          if (!usersMap.has(u.username.toLowerCase())) {
            usersMap.set(u.username.toLowerCase(), u);
            sqliteSaveUser(u);
            queueUserForFirestoreSync(u);
            migrated++;
          }
        }
        if (migrated > 0) {
          console.log(`📦 [SQLite] Migrated ${migrated} legacy users into SQLite & Firestore`);
        }
      }
    }
  } catch (err) {
    console.error('Error loading users from Firestore/SQLite/file:', err);
  }
}

let saveUsersTimer: NodeJS.Timeout | null = null;
function saveUsers() {
  // 1. Save all users to SQLite immediately and queue to Firebase Firestore
  for (const u of usersMap.values()) {
    sqliteSaveUser(u);
    queueUserForFirestoreSync(u);
  }

  // 2. Debounced flush to disk and backup JSON
  if (saveUsersTimer) {
    clearTimeout(saveUsersTimer);
  }
  saveUsersTimer = setTimeout(async () => {
    saveUsersTimer = null;
    try {
      persistSqliteToDisk();
      const data = Array.from(usersMap.values());
      await fs.promises.writeFile(USERS_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('Error saving users to SQLite/file:', err);
    }
  }, 300);
}

// Load stored rooms & history from Firestore Cloud, SQLite & JSON backup
async function loadRooms() {
  const defaultRoomNames: string[] = ['Разговоры', 'Поиск пати', 'Программирование', 'Музыка', 'Игры'];
  for (const name of defaultRoomNames) {
    if (!roomsMap.has(name)) {
      roomsMap.set(name, {
        name,
        clients: new Set(),
        history: []
      });
    }
  }

  try {
    await getSqliteDb();

    // 1. Load from Firebase Firestore
    const firestoreRooms = await firestoreLoadAllRooms();
    for (const roomName in firestoreRooms) {
      const fRoom = firestoreRooms[roomName];
      if (!roomsMap.has(roomName)) {
        roomsMap.set(roomName, {
          ...fRoom,
          clients: new Set()
        });
      } else {
        const existing = roomsMap.get(roomName)!;
        existing.history = fRoom.history || existing.history || [];
        existing.isDM = fRoom.isDM || false;
        existing.isGroup = fRoom.isGroup || false;
        existing.isAnnouncement = fRoom.isAnnouncement || false;
        existing.owner = fRoom.owner || '';
        existing.admins = fRoom.admins || [];
        existing.members = fRoom.members || [];
        existing.description = fRoom.description || '';
        existing.isVerified = fRoom.isVerified || false;
        existing.verificationPending = fRoom.verificationPending || false;
      }
      sqliteSaveRoom(roomsMap.get(roomName));
    }

    // 2. Load from SQLite
    const sqliteRooms = sqliteGetAllRooms();
    for (const roomName in sqliteRooms) {
      const sRoom = sqliteRooms[roomName];
      if (!roomsMap.has(roomName)) {
        roomsMap.set(roomName, {
          ...sRoom,
          clients: new Set()
        });
        queueRoomForFirestoreSync(roomsMap.get(roomName));
      } else {
        const existing = roomsMap.get(roomName)!;
        if (!existing.history || existing.history.length === 0) {
          existing.history = sRoom.history || [];
        }
        existing.isDM = sRoom.isDM || existing.isDM || false;
        existing.isGroup = sRoom.isGroup || existing.isGroup || false;
        existing.isAnnouncement = sRoom.isAnnouncement || existing.isAnnouncement || false;
        existing.owner = sRoom.owner || existing.owner || '';
        existing.admins = sRoom.admins || existing.admins || [];
        existing.members = sRoom.members || existing.members || [];
        existing.description = sRoom.description || existing.description || '';
        existing.isVerified = sRoom.isVerified || existing.isVerified || false;
        existing.verificationPending = sRoom.verificationPending || existing.verificationPending || false;
      }
    }

    // 3. Check legacy JSON rooms for migration
    if (fs.existsSync(ROOMS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf-8'));
      if (typeof data === 'object') {
        for (const roomName in data) {
          const roomObj = data[roomName];
          const rawHistory = roomObj.history || [];
          const cleanHistory = rawHistory.filter((m: any) => m && m.type !== 'system');
          cleanHistory.forEach((m: any) => {
            if (!m.id) {
              m.id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            }
          });
          if (!roomsMap.has(roomName)) {
            roomsMap.set(roomName, {
              name: roomName,
              clients: new Set(),
              history: cleanHistory,
              isDM: roomObj.isDM || false,
              isGroup: roomObj.isGroup || false,
              isAnnouncement: roomObj.isAnnouncement || false,
              owner: roomObj.owner || '',
              admins: roomObj.admins || [],
              members: roomObj.members || [],
              description: roomObj.description || '',
              isVerified: roomObj.isVerified || false,
              verificationPending: roomObj.verificationPending || false
            });
          }
          sqliteSaveRoom(roomsMap.get(roomName));
          queueRoomForFirestoreSync(roomsMap.get(roomName));
        }
      }
    }

    // 4. Load & migrate DM files from ./data/dms/
    if (fs.existsSync(DMS_DIR)) {
      const files = fs.readdirSync(DMS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const rawId = file.replace('.json', '');
          const dmRoomKey = `DM:${rawId}`;
          const loadedHist = loadDMHistoryFromFile(dmRoomKey);
          if (!roomsMap.has(dmRoomKey)) {
            roomsMap.set(dmRoomKey, {
              name: dmRoomKey,
              clients: new Set(),
              history: loadedHist,
              isDM: true
            });
          }
          sqliteSaveRoom(roomsMap.get(dmRoomKey));
          queueRoomForFirestoreSync(roomsMap.get(dmRoomKey));
        }
      }
    }
  } catch (err) {
    console.error('Error loading rooms from Firestore/SQLite/file:', err);
  }
}

let saveRoomsTimer: NodeJS.Timeout | null = null;
function saveRooms() {
  // 1. Save all rooms to SQLite immediately and queue to Firebase Firestore
  for (const room of roomsMap.values()) {
    sqliteSaveRoom(room);
    queueRoomForFirestoreSync(room);
  }

  // 2. Debounced backup to JSON
  if (saveRoomsTimer) {
    clearTimeout(saveRoomsTimer);
  }
  saveRoomsTimer = setTimeout(async () => {
    saveRoomsTimer = null;
    try {
      persistSqliteToDisk();
      const data: Record<string, {
        history: Message[];
        isDM?: boolean;
        isGroup?: boolean;
        isAnnouncement?: boolean;
        owner?: string;
        admins?: string[];
        members?: string[];
        description?: string;
        isVerified?: boolean;
        verificationPending?: boolean;
      }> = {};
      for (const [name, room] of roomsMap.entries()) {
        if (room.isDM) continue; // DMs are saved in their own files, SQLite and Firestore
        data[name] = {
          history: room.history.slice(-100), // Keep last 100 messages
          isDM: room.isDM,
          isGroup: room.isGroup,
          isAnnouncement: room.isAnnouncement,
          owner: room.owner,
          admins: room.admins,
          members: room.members,
          description: room.description,
          isVerified: room.isVerified,
          verificationPending: room.verificationPending
        };
      }
      await fs.promises.writeFile(ROOMS_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('Error saving rooms to file:', err);
    }
  }, 300);
}

// Fast server startup: bind to PORT immediately so Render and health checks succeed in <10ms
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [SYSTEM] VesperChat server listening IMMEDIATELY on http://0.0.0.0:${PORT}`);

  // Non-blocking background initialization
  (async () => {
    try {
      console.log('📦 [SYSTEM] Initializing persistence & Push Service in background...');
      await loadUsers();
      await loadRooms();
      await initPushDbTable();
      initVapid();
      console.log('✅ [SYSTEM] Background initialization complete. Full storage ready.');
    } catch (e) {
      console.error('⚠️ [SYSTEM] Background initialization warning (non-fatal):', e);
    }
  })();
});


function getPublicRooms(): string[] {
  const publicRooms: string[] = [];
  for (const [name, room] of roomsMap.entries()) {
    if (!room.isDM && !room.isGroup) {
      publicRooms.push(name);
    }
  }
  return publicRooms;
}

function getVerifiedRooms(): string[] {
  const verified: string[] = [];
  for (const [name, room] of roomsMap.entries()) {
    if (room.isVerified) {
      verified.push(name);
    }
  }
  return verified;
}

function getGroupsForUser(username: string) {
  const userLower = username.toLowerCase();
  const groupsList: { name: string; isOwner: boolean; isAdmin: boolean; isAnnouncement?: boolean; isVerified?: boolean; verificationPending?: boolean; membersCount: number }[] = [];

  for (const [name, room] of roomsMap.entries()) {
    if (room.isGroup) {
      const isOwner = room.owner === userLower;
      const isAdmin = (room.admins || []).includes(userLower);
      const isMember = (room.members || []).includes(userLower) || isOwner || isAdmin;

      if (isMember) {
        groupsList.push({
          name: room.name,
          isOwner,
          isAdmin,
          isAnnouncement: Boolean(room.isAnnouncement),
          isVerified: Boolean(room.isVerified),
          verificationPending: Boolean(room.verificationPending),
          membersCount: room.members ? room.members.length : 1
        });
      }
    }
  }
  return groupsList;
}

function getGroupDetails(roomName: string) {
  const room = roomsMap.get(roomName);
  if (!room) return null;
  return {
    name: room.name,
    owner: room.owner || '',
    admins: room.admins || [],
    members: room.members || (room.clients ? Array.from(room.clients).map(c => c.username) : []),
    isGroup: Boolean(room.isGroup),
    isAnnouncement: Boolean(room.isAnnouncement),
    isVerified: Boolean(room.isVerified),
    verificationPending: Boolean(room.verificationPending),
    description: room.description || '',
    avatarUrl: room.avatarUrl || ''
  };
}

function broadcastRoomsAndGroups() {
  const verifiedRooms = getVerifiedRooms();
  for (const client of connectedClients) {
    if (client.ws.readyState === WebSocket.OPEN && client.username) {
      client.ws.send(JSON.stringify({
        type: 'room_list',
        rooms: getPublicRooms(),
        groups: getGroupsForUser(client.username),
        verifiedRooms
      }));
    }
  }
}

function getOnlineUsers(): string[] {
  const set = new Set<string>();
  for (const client of connectedClients) {
    if (client.username) {
      set.add(client.username);
    }
  }
  return Array.from(set);
}

function getAllUsersInfo(): { username: string; nickname?: string; color: string; avatarUrl?: string; bannerUrl?: string; bio?: string; statusText?: string; birthday?: string; isOnline: boolean; isVip?: boolean; hasStory?: boolean; story?: any; privacySearch?: string; privacyCall?: string; gifts?: any[] }[] {
  const onlineSet = new Set(getOnlineUsers().map(u => u.toLowerCase()));
  const knownMap = new Map<string, { username: string; nickname?: string; color: string; avatarUrl?: string; bannerUrl?: string; bio?: string; statusText?: string; birthday?: string; isOnline: boolean; isVip?: boolean; hasStory?: boolean; story?: any; privacySearch?: string; privacyCall?: string; gifts?: any[] }>();

  for (const u of usersMap.values()) {
    const lower = u.username.toLowerCase();
    const hasValidStory = Boolean(u.story && u.story.createdAt && (Date.now() - u.story.createdAt < 24 * 60 * 60 * 1000));
    knownMap.set(lower, {
      username: u.username,
      nickname: u.nickname || '',
      color: u.color || '#8b5cf6',
      avatarUrl: u.avatarUrl || '',
      bannerUrl: u.bannerUrl || '',
      bio: u.bio || '',
      statusText: u.statusText || '',
      birthday: u.birthday || '',
      isOnline: onlineSet.has(lower),
      isVip: Boolean(u.isVip),
      hasStory: hasValidStory,
      story: hasValidStory ? u.story : undefined,
      gifts: u.gifts || [],
      privacySearch: u.privacySearch || 'all',
      privacyCall: u.privacyCall || 'all'
    });
  }

  for (const c of connectedClients) {
    if (c.username) {
      const lower = c.username.toLowerCase();
      if (!knownMap.has(lower)) {
        knownMap.set(lower, {
          username: c.username,
          nickname: c.nickname || '',
          color: c.color || '#8b5cf6',
          avatarUrl: c.avatarUrl || '',
          bannerUrl: c.bannerUrl || '',
          bio: c.bio || '',
          statusText: c.statusText || '',
          birthday: c.birthday || '',
          isOnline: true,
          isVip: Boolean(c.isVip),
          hasStory: false
        });
      }
    }
  }

  return Array.from(knownMap.values());
}

function broadcastToRoomExceptSender(roomName: string, msg: Message, senderWs: WebSocket) {
  const payload = JSON.stringify(msg);
  if (roomName.startsWith('DM:')) {
    const parts = roomName.substring(3).split('_');
    const targetUsers = new Set(parts.map(p => p.toLowerCase()));
    for (const client of connectedClients) {
      if (client.username && targetUsers.has(client.username.toLowerCase()) && client.ws !== senderWs) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(payload);
        }
      }
    }
  } else {
    for (const client of connectedClients) {
      if (client.room === roomName && client.ws !== senderWs && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}

function broadcastToRoom(roomName: string, msg: Message) {
  let room = roomsMap.get(roomName);
  if (!room) {
    for (const [k, r] of roomsMap.entries()) {
      if (k.toLowerCase() === roomName.toLowerCase()) {
        room = r;
        break;
      }
    }
  }
  if (!room) {
    if (roomName.startsWith('DM:')) {
      const loadedHist = loadDMHistoryFromFile(roomName);
      room = {
        name: roomName,
        clients: new Set(),
        history: loadedHist,
        isDM: true
      };
      roomsMap.set(roomName, room);
    } else {
      room = {
        name: roomName,
        clients: new Set(),
        history: []
      };
      roomsMap.set(roomName, room);
    }
  }

  if (msg.type === 'chat' || msg.type === 'system') {
    room.history.push(msg);
    if (room.history.length > 100) {
      room.history.shift();
    }
    sqliteSaveMessage(msg, roomName);
    saveRooms();
    if (roomName.startsWith('DM:')) {
      saveDMHistoryToFile(roomName, room.history);
    }
  }

  const payload = JSON.stringify(msg);
  const roomObjRaw = roomsMap.get(roomName);
  let roomObj = roomObjRaw;
  if (!roomObj) {
    for (const [k, r] of roomsMap.entries()) {
      if (k.toLowerCase() === roomName.toLowerCase()) {
        roomObj = r;
        break;
      }
    }
  }

  if (roomName.startsWith('DM:')) {
    // DM room: Send ONLY to connected clients who are authorized for this DM
    for (const client of connectedClients) {
      if (client.username && isUserAuthorizedForRoom(client.username, roomName)) {
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(payload);
          } catch (e) {}
        }
      }
    }
  } else {
    // Public room or Group: Send to all connected clients authorized for this room/group
    const isGroup = Boolean(roomObj && roomObj.isGroup);

    for (const client of connectedClients) {
      if (!client.username) continue;
      const isAuthorized = !isGroup || isUserAuthorizedForRoom(client.username, roomName);
      if (isAuthorized && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payload);
        } catch (e) {}
      }
    }
  }

  // Dispatch Web Push Notifications via Service Worker
  if (msg.type === 'chat' && msg.username) {
    const sender = msg.username;
    let pushTitle = `@${sender}`;
    let pushBody = msg.content || '';

    if (msg.isVoice) {
      pushBody = '🎤 [Голосовое сообщение]';
    } else if (msg.isVideoNote) {
      pushBody = '🎥 [Видеосообщение]';
    } else if (msg.isSticker) {
      pushBody = '🎨 [Стикер' + (msg.stickerPack ? ` • ${msg.stickerPack}` : '') + ']';
    } else if (msg.isPoll || msg.poll) {
      pushBody = `📊 [Опрос]: ${(msg.poll?.question || 'Новый опрос')}`;
    } else if (msg.fileName) {
      pushBody = `📁 [Файл]: ${msg.fileName}`;
    }

    if (!roomName.startsWith('DM:')) {
      pushTitle = `💬 @${sender} (#${roomName})`;
    }

    const pushData = {
      title: pushTitle,
      body: pushBody,
      icon: msg.avatarUrl || '/icon-192.png',
      badge: '/icon-192.png',
      image: (msg.fileData && typeof msg.fileData === 'string' && msg.fileData.startsWith('data:image/')) ? msg.fileData : undefined,
      tag: `vesperchat_${roomName}`,
      data: {
        url: `/?room=${encodeURIComponent(roomName)}`,
        room: roomName,
        author: sender,
        messageId: msg.id,
        timestamp: Date.now()
      }
    };

    if (roomName.startsWith('DM:')) {
      const parts = roomName.substring(3).split('_');
      const targetRecipients = parts.filter(p => p.toLowerCase() !== sender.toLowerCase());
      for (const recUser of targetRecipients) {
        sendPushToUser(recUser, pushData).catch(err => console.warn('[WebPush] Error sending DM push:', err));
      }
    } else {
      const isGroup = Boolean(roomObj && roomObj.isGroup);
      if (isGroup && roomObj && Array.isArray(roomObj.members)) {
        for (const member of roomObj.members) {
          if (member.toLowerCase() !== sender.toLowerCase()) {
            sendPushToUser(member, pushData).catch(err => console.warn('[WebPush] Error sending Group push:', err));
          }
        }
      } else {
        const mentions = (msg.content || '').match(/@([a-zA-Z0-9_-]+)/g);
        if (mentions) {
          for (const m of mentions) {
            const target = m.substring(1);
            if (target.toLowerCase() !== sender.toLowerCase()) {
              sendPushToUser(target, {
                ...pushData,
                title: `🔔 @${sender} упомянул(а) вас в #${roomName}`
              }).catch(err => console.warn('[WebPush] Error sending mention push:', err));
            }
          }
        }
      }
    }
  }
}

function broadcastUserList(roomName: string) {
  if (roomName.startsWith('DM:')) return;
  const room = roomsMap.get(roomName);
  if (!room) return;

  const onlineUsers = Array.from(connectedClients)
    .filter(c => c.room === roomName && c.username)
    .map(c => c.username);

  const uniqueUsers = Array.from(new Set(onlineUsers));

  const payload = JSON.stringify({
    type: 'user_list',
    room: roomName,
    onlineUsers: uniqueUsers
  });

  for (const c of connectedClients) {
    if (c.room === roomName && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(payload);
    }
  }
}

function broadcastGlobalUserList() {
  const usersList = getAllUsersInfo();
  const payload = JSON.stringify({
    type: 'search_users_result',
    usersList
  });

  for (const client of connectedClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function sendError(ws: WebSocket, errMsg: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', content: errMsg, message: errMsg }));
  }
}

// Verification codes map with cooldown rate limiting
interface CodeRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  nextAllowedAt: number;
}
const emailVerificationCodes: Map<string, CodeRecord> = new Map();

function filterHistoryForUser(history: Message[], username?: string): Message[] {
  if (!history) return [];
  const uLower = (username || '').toLowerCase();
  return history.filter(h => {
    if (h.type === 'system') return false;
    if (uLower && Array.isArray(h.deletedFor)) {
      if (h.deletedFor.map(x => x.toLowerCase()).includes(uLower)) {
        return false;
      }
    }
    return true;
  });
}

function handleJoin(client: Client, targetRoomReq?: string) {
  let targetRoomName = targetRoomReq || 'Разговоры';

  // Fallback to public room 'Разговоры' if unauthorized for requested targetRoom
  if (!client.username || !isUserAuthorizedForRoom(client.username, targetRoomName)) {
    targetRoomName = 'Разговоры';
  }

  let room = roomsMap.get(targetRoomName);
  if (!room) {
    if (targetRoomName.startsWith('DM:')) {
      const loadedHist = loadDMHistoryFromFile(targetRoomName);
      room = {
        name: targetRoomName,
        clients: new Set(),
        history: loadedHist,
        isDM: true
      };
    } else {
      room = {
        name: targetRoomName,
        clients: new Set(),
        history: []
      };
    }
    roomsMap.set(targetRoomName, room);
    saveRooms();
  }

  client.room = room.name;
  room.clients.add(client);

  const acc = usersMap.get((client.username || '').toLowerCase());
  const dmContacts = acc ? (acc.dmContacts || []) : [];
  if (acc) {
    client.nickname = acc.nickname || '';
    client.avatarUrl = acc.avatarUrl || '';
    client.bannerUrl = acc.bannerUrl || '';
    client.bio = acc.bio || '';
    client.statusText = acc.statusText || '';
    client.birthday = acc.birthday || '';
    if (acc.color) client.color = acc.color;
    client.isVip = Boolean(acc.isVip);
    client.blockedUsers = acc.blockedUsers || [];
  } else {
    client.nickname = '';
    client.avatarUrl = '';
    client.bannerUrl = '';
    client.bio = '';
    client.statusText = '';
    client.birthday = '';
    client.isVip = false;
    client.blockedUsers = [];
  }

  client.ws.send(JSON.stringify({
    type: 'auth_success',
    username: client.username,
    password: acc?.password || '',
    nickname: client.nickname || acc?.nickname || '',
    room: room.name,
    color: client.color,
    avatarUrl: client.avatarUrl || '',
    bannerUrl: client.bannerUrl || '',
    bio: client.bio || '',
    statusText: client.statusText || '',
    birthday: client.birthday || acc?.birthday || '',
    isVip: Boolean(client.isVip),
    blockedUsers: client.blockedUsers || [],
    story: (acc?.story && Date.now() - acc.story.createdAt < 24 * 60 * 60 * 1000) ? acc.story : undefined,
    privacySearch: acc?.privacySearch || 'all',
    privacyCall: acc?.privacyCall || 'all',
    customStickers: acc?.customStickers || [],
    neons: typeof acc?.neons === 'number' ? acc.neons : 5000,
    walletTransactions: (acc?.walletTransactions && acc.walletTransactions.length > 0) ? acc.walletTransactions : [
      {
        id: 'tx_welcome_' + Date.now(),
        type: 'bonus',
        title: 'Приветственный бонус',
        desc: 'Регистрация и подарок в VesperChat',
        amount: 5000,
        timestamp: Date.now() - 3600000,
        status: 'completed'
      }
    ],
    lastDailyBonusClaim: acc?.lastDailyBonusClaim || 0,
    bonusMonthStreak: Math.max(1, acc?.bonusMonthStreak || 1),
    lastSuggestionTimestamp: acc?.lastSuggestionTimestamp || 0,
    suggestions: acc?.suggestions || [],
    rooms: getPublicRooms(),
    groups: getGroupsForUser(client.username),
    dmContacts,
    onlineUsers: Array.from(room.clients).map(c => c.username),
    usersList: getAllUsersInfo(),
    history: filterHistoryForUser(room.history, client.username),
    groupInfo: getGroupDetails(room.name)
  }));

  broadcastUserList(room.name);
  broadcastGlobalUserList();
}

wss.on('connection', (ws: WebSocket, req: any) => {
  const { ip } = detectDeviceAndIp(req);
  if (!checkRateLimit(ip, 60, 10000, 45000)) {
    console.warn(`[Anti-DDoS] WebSocket connection rejected from ${ip} (too many attempts)`);
    try {
      ws.send(JSON.stringify({ type: 'error', message: 'Слишком много запросов на подключение. Пожалуйста, подождите 45 секунд.' }));
      ws.close(1008, 'Rate limit exceeded');
    } catch(e) {}
    return;
  }

  const client: Client = {
    ws,
    req,
    username: '',
    room: 'Разговоры',
    color: '#8b5cf6'
  };
  connectedClients.add(client);

  let msgCounter = 0;
  let lastMsgWindow = Date.now();

  ws.on('message', (messageRaw: string) => {
    try {
      // WS Message Flood Protection (Max 40 messages per second per client socket)
      const now = Date.now();
      if (now - lastMsgWindow > 1000) {
        msgCounter = 0;
        lastMsgWindow = now;
      }
      msgCounter++;
      if (msgCounter > 40) {
        console.warn(`[Anti-DDoS] Throttling message flood from ${client.username || ip}`);
        return;
      }

      const msg: Message = JSON.parse(messageRaw.toString());

      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch (e) {}
        }
        return;
      }
      if (msg.type === 'pong') {
        return;
      }

      if (msg.type === 'sync_messages') {
        if (!client.username) return;
        const targetRoomName = msg.room || client.room || 'Разговоры';
        if (!isUserAuthorizedForRoom(client.username, targetRoomName)) {
          return;
        }
        let room = roomsMap.get(targetRoomName);
        if (!room) {
          for (const [k, r] of roomsMap.entries()) {
            if (k.toLowerCase() === targetRoomName.toLowerCase()) {
              room = r;
              break;
            }
          }
        }
        if (!room && targetRoomName.startsWith('DM:')) {
          const loadedHist = loadDMHistoryFromFile(targetRoomName);
          room = { name: targetRoomName, clients: new Set(), history: loadedHist, isDM: true };
          roomsMap.set(targetRoomName, room);
        }
        if (room && room.history) {
          const cleanHistory = filterHistoryForUser(room.history, client.username);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'messages_synced',
              room: targetRoomName,
              history: cleanHistory
            }));
          }
        }
        return;
      }

      if (msg.type === 'register') {
        const username = (msg.username || '').trim();
        const password = (msg.password || '').trim();

        if (!username || !password) {
          return sendError(ws, 'Никнейм и пароль обязательны!');
        }
        if (username.length < 1 || username.length > 20) {
          return sendError(ws, 'Никнейм должен быть от 1 до 20 символов!');
        }

        const lowerUser = username.toLowerCase();
        if (usersMap.has(lowerUser)) {
          return sendError(ws, 'Пользователь с таким никнеймом уже зарегистрирован!');
        }

        const color = avatarColors[username.length % avatarColors.length];
        const newAcc: UserAccount = {
          username,
          password,
          color,
          avatarUrl: msg.avatarUrl || '',
          createdAt: new Date().toISOString()
        };
        usersMap.set(lowerUser, newAcc);
        saveUsers();

        client.username = username;
        client.color = color;
        client.avatarUrl = newAcc.avatarUrl;

        registerUserSession(client);
        const { device, ip } = detectDeviceAndIp(client.req);
        addVesperChatMessage(username, 'Вы зарегистрировались.', ip, device);

        handleJoin(client, 'Разговоры');
      }

      else if (msg.type === 'login') {
        const usernameOrEmail = (msg.username || '').trim().replace(/^@/, '');
        const password = (msg.password || '').trim();

        if (!usernameOrEmail || !password) {
          return sendError(ws, 'Введите логин/email и пароль!');
        }

        const lowerUser = usernameOrEmail.toLowerCase();
        let account = usersMap.get(lowerUser);

        if (!account) {
          // Check by email (already trimmed/lowercased)
          for (const acc of usersMap.values()) {
            if (acc.email && acc.email.toLowerCase() === lowerUser) {
              account = acc;
              break;
            }
          }
        }

        if (!account) {
          // Check by nickname for helpful hint
          for (const acc of usersMap.values()) {
            if (acc.nickname && acc.nickname.toLowerCase() === lowerUser) {
              return sendError(ws, `Пользователь не найден! Используйте ID (например: ${acc.username}) вместо никнейма.`);
            }
          }
          console.log(`[AUTH] Login failed: User not found for "${usernameOrEmail}"`);
          return sendError(ws, 'Пользователь не найден! Зарегистрируйтесь по коду приглашения.');
        }
        if (account.password !== password) {
          return sendError(ws, 'Неверный пароль!');
        }

        client.username = account.username;
        client.nickname = account.nickname || '';
        client.color = account.color || avatarColors[account.username.length % avatarColors.length];
        client.avatarUrl = account.avatarUrl || '';
        client.bannerUrl = account.bannerUrl || '';
        client.bio = account.bio || '';
        client.birthday = account.birthday || '';
        client.statusText = account.statusText || '';
        client.gamingStatus = account.gamingStatus || '';
        client.isVip = Boolean(account.isVip);
        client.neons = typeof account.neons === 'number' ? account.neons : 5000;
        client.blockedUsers = account.blockedUsers || [];

        registerUserSession(client);
        const { device, ip } = detectDeviceAndIp(client.req);
        addVesperChatMessage(account.username, 'В ваш аккаунт вошли.', ip, device);

        handleJoin(client, msg.room);
      }

      else if (msg.type === 'qr_login_register') {
        const token = msg.token || '';
        if (token) {
          qrSessions.set(token, client);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'qr_login_registered', token }));
          }
        }
      }

      else if (msg.type === 'qr_login_approve') {
        const token = msg.token || '';
        if (!client.username) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'qr_login_approved_error', error: 'Вы не авторизованы на этом устройстве!' }));
          }
          return;
        }

        const waitingClient = qrSessions.get(token);
        if (!waitingClient) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'qr_login_approved_error', error: 'Сессия QR-кода истекла или не найдена. Обновите QR-код на компьютере.' }));
          }
          return;
        }

        const account = usersMap.get(client.username.toLowerCase());
        if (!account) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'qr_login_approved_error', error: 'Аккаунт не найден.' }));
          }
          return;
        }

        // Authenticate the waiting client
        waitingClient.username = account.username;
        waitingClient.color = account.color || avatarColors[account.username.length % avatarColors.length];
        waitingClient.avatarUrl = account.avatarUrl || '';
        waitingClient.bio = account.bio || '';
        waitingClient.birthday = account.birthday || '';
        waitingClient.statusText = account.statusText || '';
        waitingClient.isVip = Boolean(account.isVip);
        waitingClient.blockedUsers = account.blockedUsers || [];

        registerUserSession(waitingClient);
        const { device, ip } = detectDeviceAndIp(waitingClient.req);
        addVesperChatMessage(account.username, 'В ваш аккаунт вошли по QR-коду.', ip, device);

        // This will send auth_success to the waiting client!
        handleJoin(waitingClient, 'Разговоры');

        // Confirm success back to the scanning phone client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'qr_login_approved_success', username: account.username }));
        }

        // Remove the QR token session
        qrSessions.delete(token);
      }

      else if (msg.type === 'get_sessions') {
        if (!client.username) return;
        sendSessionsList(client);
      }

      else if (msg.type === 'terminate_session') {
        if (!client.username) return;
        const targetSessId = msg.id || (msg as any).sessionId;
        const lowerUser = client.username.toLowerCase();
        let sessions = userSessionsMap.get(lowerUser) || [];
        const foundIndex = sessions.findIndex(s => s.id === targetSessId);
        if (foundIndex !== -1) {
          const sess = sessions[foundIndex];
          if (sess.ws && sess.ws !== ws && sess.ws.readyState === WebSocket.OPEN) {
            try { sess.ws.close(); } catch (e) {}
          }
          sessions.splice(foundIndex, 1);
          userSessionsMap.set(lowerUser, sessions);
          addVesperChatMessage(client.username, 'Завершен сеанс устройства.', sess.ip, sess.device);
        }
        sendSessionsList(client);
      }

      else if (msg.type === 'terminate_other_sessions') {
        if (!client.username) return;
        const lowerUser = client.username.toLowerCase();
        let sessions = userSessionsMap.get(lowerUser) || [];
        const { device, ip } = detectDeviceAndIp(client.req);

        const remaining: UserSession[] = [];
        for (const s of sessions) {
          if (s.id === client.sessionId) {
            remaining.push(s);
          } else {
            if (s.ws && s.ws.readyState === WebSocket.OPEN) {
              try { s.ws.close(); } catch (e) {}
            }
          }
        }
        userSessionsMap.set(lowerUser, remaining);
        addVesperChatMessage(client.username, 'Завершены все другие сеансы.', ip, device);
        sendSessionsList(client);
      }

      else if (msg.type === 'update_avatar') {
        if (!client.username) return;
        const avatarUrl = (msg.avatarUrl || '').trim();
        client.avatarUrl = avatarUrl;
        const acc = usersMap.get(client.username.toLowerCase());
        if (acc) {
          acc.avatarUrl = avatarUrl;
          saveUsers();
        }
        const avatarPayload = JSON.stringify({ 
          type: 'avatar_updated', 
          username: client.username, 
          avatarUrl 
        });
        for (const c of connectedClients) {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(avatarPayload);
          }
        }
        broadcastGlobalUserList();
      }

      else if (msg.type === 'get_user_profile') {
        const targetUser = (msg.targetUser || msg.username || '').trim().replace(/^@/, '').toLowerCase();
        const acc = usersMap.get(targetUser);
        if (acc && ws.readyState === WebSocket.OPEN) {
          const isOnline = Array.from(connectedClients).some(c => c.username && c.username.toLowerCase() === targetUser);
          ws.send(JSON.stringify({
            type: 'user_profile',
            user: {
              username: acc.username,
              nickname: acc.nickname || acc.username,
              color: acc.color,
              avatarUrl: acc.avatarUrl || '',
              bannerUrl: acc.bannerUrl || '',
              bio: acc.bio || '',
              statusText: acc.statusText || '',
              birthday: acc.birthday || '',
              gamingStatus: acc.gamingStatus || '',
              isOnline,
              isVip: Boolean(acc.isVip),
              gifts: acc.gifts || [],
              badges: acc.badges || [],
              neons: typeof acc.neons === 'number' ? acc.neons : 5000
            }
          }));
        }
      }

      else if (msg.type === 'chat') {
        const content = (msg.content || '').trim();
        const hasFile = Boolean(msg.fileData);

        if (!client.username) return;

        const targetRoom = msg.room || client.room;
        if (!targetRoom) return;

        if (targetRoom.toLowerCase().includes('vesperchat')) {
          return sendError(ws, '🔒 В системный чат VesperChat нельзя отправлять сообщения.');
        }

        if (!content && !hasFile) return;

        const roomObj = roomsMap.get(targetRoom);
        if (roomObj && roomObj.isAnnouncement) {
          const uLower = client.username.toLowerCase();
          const isOwner = roomObj.owner === uLower;
          const isAdmin = (roomObj.admins || []).includes(uLower);
          if (!isOwner && !isAdmin) {
            return sendError(ws, '📢 В каналах объявлений создавать сообщения могут только администраторы!');
          }
        }

        if (targetRoom.startsWith('DM:')) {
          const parts = targetRoom.substring(3).split('_');
          const otherUser = parts.find(p => p.toLowerCase() !== client.username.toLowerCase());
          if (otherUser) {
            const recipientAcc = usersMap.get(otherUser.toLowerCase());
            if (recipientAcc && recipientAcc.blockedUsers && recipientAcc.blockedUsers.includes(client.username.toLowerCase())) {
              return sendError(ws, '🚫 Пользователь заблокировал вас.');
            }
            const senderAcc = usersMap.get(client.username.toLowerCase());
            if (senderAcc && senderAcc.blockedUsers && senderAcc.blockedUsers.includes(otherUser.toLowerCase())) {
              return sendError(ws, '🚫 Вы заблокировали этого пользователя. Разблокируйте его для отправки сообщений.');
            }
          }
        }

        client.room = targetRoom;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msgId = msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));

        let isReadInDm = false;
        if (targetRoom.startsWith('DM:')) {
          const parts = targetRoom.substring(3).split('_');
          const recipientName = parts.find(p => p.toLowerCase() !== client.username.toLowerCase());
          if (recipientName) {
            isReadInDm = Array.from(connectedClients).some(c => c.username && c.username.toLowerCase() === recipientName.toLowerCase() && c.room === targetRoom);
          }
        }

        const senderAccount = usersMap.get(client.username.toLowerCase());

        broadcastToRoom(targetRoom, {
          id: msgId,
          type: 'chat',
          username: client.username,
          nickname: client.nickname || senderAccount?.nickname || client.username,
          isVip: Boolean(client.isVip || senderAccount?.isVip),
          content,
          room: targetRoom,
          timestamp: timeStr,
          color: client.color || senderAccount?.color || '#8b5cf6',
          avatarUrl: client.avatarUrl || senderAccount?.avatarUrl || '',
          bannerUrl: client.bannerUrl || senderAccount?.bannerUrl || '',
          fileName: msg.fileName,
          fileType: msg.fileType,
          fileData: msg.fileData,
          fileSize: msg.fileSize,
          isVoice: msg.isVoice,
          duration: msg.duration,
          replyTo: msg.replyTo,
          isRead: isReadInDm,
          isSticker: msg.isSticker,
          stickerPack: msg.stickerPack,
          isVideoNote: msg.isVideoNote,
          isPoll: msg.isPoll,
          pollData: msg.pollData,
          isScheduled: msg.isScheduled,
          reactions: msg.reactions
        });
      }

      else if (msg.type === 'thread_reply') {
        const targetRoom = msg.room || client.room;
        const messageId = msg.messageId;
        const content = (msg.content || '').trim();
        if (!client.username || !targetRoom || !messageId || (!content && !msg.fileData)) return;

        let room = roomsMap.get(targetRoom);
        if (!room) return;

        let targetMsg = room.history.find(m => m.id === messageId);
        if (!targetMsg) return;

        if (!targetMsg.threadReplies) targetMsg.threadReplies = [];
        const replyId = 'reply_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const replyObj = {
          id: replyId,
          username: client.username,
          color: client.color,
          avatarUrl: client.avatarUrl,
          content,
          timestamp: timeStr,
          fileName: msg.fileName,
          fileType: msg.fileType,
          fileData: msg.fileData,
          fileSize: msg.fileSize
        };

        targetMsg.threadReplies.push(replyObj);
        targetMsg.threadCount = targetMsg.threadReplies.length;

        saveRooms();
        if (targetRoom.startsWith('DM:')) saveDMHistoryToFile(targetRoom, room.history);

        broadcastToRoom(targetRoom, {
          type: 'thread_reply_added',
          room: targetRoom,
          messageId,
          reply: replyObj,
          threadCount: targetMsg.threadCount
        });
      }

      else if (msg.type === 'create_poll') {
        const targetRoom = msg.room || client.room;
        if (!client.username || !targetRoom || !msg.poll || !msg.poll.question || !Array.isArray(msg.poll.options)) return;

        const roomObj = roomsMap.get(targetRoom);
        if (roomObj && roomObj.isAnnouncement) {
          const uLower = client.username.toLowerCase();
          const isOwner = roomObj.owner === uLower;
          const isAdmin = (roomObj.admins || []).includes(uLower);
          if (!isOwner && !isAdmin) {
            return sendError(ws, '📢 В каналах объявлений опросы могут создавать только администраторы!');
          }
        }

        const msgId = 'poll_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const pollData: PollData = {
          question: msg.poll.question.trim(),
          options: msg.poll.options.map((opt: any, idx: number) => ({
            id: typeof opt === 'object' && opt ? (opt.id ?? idx) : idx,
            text: (typeof opt === 'object' && opt ? opt.text : String(opt || '')).trim(),
            votes: Array.isArray(opt?.votes) ? opt.votes : []
          })),
          isQuiz: Boolean(msg.poll.isQuiz),
          correctOptionId: typeof msg.poll.correctOptionId === 'number' ? msg.poll.correctOptionId : undefined
        };

        broadcastToRoom(targetRoom, {
          id: msgId,
          type: 'chat',
          username: client.username,
          room: targetRoom,
          timestamp: timeStr,
          color: client.color,
          avatarUrl: client.avatarUrl,
          poll: pollData
        });
      }

      else if (msg.type === 'vote_poll') {
        const targetRoom = msg.room || client.room;
        const messageId = msg.messageId;
        const optionId = msg.optionId;
        if (!client.username || !targetRoom || !messageId || typeof optionId !== 'number') return;

        let room = roomsMap.get(targetRoom);
        if (!room || !room.history) return;

        let targetMsg = room.history.find(m => m.id === messageId);
        if (!targetMsg || !targetMsg.poll) return;

        const username = client.username;
        targetMsg.poll.options.forEach(opt => {
          if (opt.id === optionId) {
            if (opt.votes.includes(username)) {
              opt.votes = opt.votes.filter(u => u !== username);
            } else {
              opt.votes.push(username);
            }
          } else {
            opt.votes = opt.votes.filter(u => u !== username);
          }
        });

        saveRooms();
        if (targetRoom.startsWith('DM:')) saveDMHistoryToFile(targetRoom, room.history);

        broadcastToRoom(targetRoom, {
          type: 'poll_updated',
          room: targetRoom,
          messageId,
          poll: targetMsg.poll
        });
      }

      else if (msg.type === 'add_reaction') {
        const targetRoom = msg.room || client.room;
        const messageId = msg.messageId;
        const emoji = (msg.emoji || '').trim();
        if (!client.username || !targetRoom || (!messageId && !msg.timestamp) || !emoji) return;

        let room = roomsMap.get(targetRoom);
        if (!room) {
          for (const [k, r] of roomsMap.entries()) {
            if (k.toLowerCase() === targetRoom.toLowerCase()) {
              room = r;
              break;
            }
          }
        }
        if (!room && targetRoom.startsWith('DM:')) {
          const loadedHist = loadDMHistoryFromFile(targetRoom);
          room = {
            name: targetRoom,
            clients: new Set(),
            history: loadedHist,
            isDM: true
          };
          roomsMap.set(targetRoom, room);
        }

        let targetMsg: any = null;
        if (room && room.history) {
          targetMsg = room.history.find(m => m.id === messageId);
          if (!targetMsg && msg.timestamp) {
            targetMsg = room.history.find(m => m.timestamp === msg.timestamp && (m.content === msg.content || (!m.content && !msg.content)));
          }
          if (!targetMsg && msg.timestamp) {
            targetMsg = room.history.find(m => m.timestamp === msg.timestamp);
          }
          if (!targetMsg && msg.content) {
            targetMsg = room.history.find(m => m.content === msg.content);
          }
        }

        // Global history fallback if room mismatched
        if (!targetMsg) {
          for (const [rName, rObj] of roomsMap.entries()) {
            if (rObj && rObj.history) {
              const found = rObj.history.find((m: any) => (messageId && m.id === messageId) || (msg.timestamp && m.timestamp === msg.timestamp));
              if (found) {
                targetMsg = found;
                room = rObj;
                break;
              }
            }
          }
        }

        if (!targetMsg) return;
        if (!targetMsg.id) {
          targetMsg.id = messageId || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
        }

        targetMsg.reactions = targetMsg.reactions || {};
        const userLower = client.username.toLowerCase();
        let users = targetMsg.reactions[emoji] || [];

        const idx = users.findIndex((u: string) => u.toLowerCase() === userLower);
        if (idx !== -1) {
          users.splice(idx, 1);
        } else {
          users.push(client.username);
        }

        if (users.length > 0) {
          targetMsg.reactions[emoji] = users;
        } else {
          delete targetMsg.reactions[emoji];
        }

        saveRooms();
        if (targetRoom.startsWith('DM:')) {
          saveDMHistoryToFile(targetRoom, room ? room.history : []);
        }

        const reactionUpdatePayload = {
          type: 'message_reaction_updated',
          messageId: targetMsg.id,
          timestamp: targetMsg.timestamp,
          reactions: targetMsg.reactions,
          room: targetRoom
        };

        broadcastToRoom(targetRoom, reactionUpdatePayload);
        // Also broadcast to all clients to guarantee real-time update
        const payloadStr = JSON.stringify(reactionUpdatePayload);
        for (const c of connectedClients) {
          if (c.ws && c.ws.readyState === WebSocket.OPEN) {
            try { c.ws.send(payloadStr); } catch (e) {}
          }
        }
      }

      else if (msg.type === 'edit_message') {
        const targetRoom = msg.room || client.room;
        const messageId = msg.messageId;
        const newContent = (msg.content || '').trim();
        if (!client.username || !targetRoom || (!messageId && !msg.timestamp) || !newContent) return;

        let room = roomsMap.get(targetRoom);
        if (!room) {
          for (const [k, r] of roomsMap.entries()) {
            if (k.toLowerCase() === targetRoom.toLowerCase()) {
              room = r;
              break;
            }
          }
        }
        if (!room && targetRoom.startsWith('DM:')) {
          const loadedHist = loadDMHistoryFromFile(targetRoom);
          room = {
            name: targetRoom,
            clients: new Set(),
            history: loadedHist,
            isDM: true
          };
          roomsMap.set(targetRoom, room);
        }

        let targetMsg: any = null;
        if (room && room.history) {
          targetMsg = room.history.find(m => m.id === messageId);
          if (!targetMsg && msg.timestamp) {
            targetMsg = room.history.find(m => m.timestamp === msg.timestamp && m.username?.toLowerCase() === client.username.toLowerCase());
          }
          if (!targetMsg && msg.timestamp) {
            targetMsg = room.history.find(m => m.timestamp === msg.timestamp);
          }
        }

        if (!targetMsg) return;

        if (targetMsg.username?.toLowerCase() !== client.username.toLowerCase()) {
          return sendError(ws, 'Вы можете редактировать только свои сообщения!');
        }

        targetMsg.content = newContent;
        targetMsg.isEdited = true;

        saveRooms();
        if (targetRoom.startsWith('DM:')) {
          saveDMHistoryToFile(targetRoom, room ? room.history : []);
        }

        const editPayload = {
          type: 'message_edited',
          messageId: targetMsg.id || messageId,
          timestamp: targetMsg.timestamp,
          content: newContent,
          isEdited: true,
          room: targetRoom
        };

        broadcastToRoom(targetRoom, editPayload);
        const editPayloadStr = JSON.stringify(editPayload);
        for (const c of connectedClients) {
          if (c.ws && c.ws.readyState === WebSocket.OPEN) {
            try { c.ws.send(editPayloadStr); } catch (e) {}
          }
        }
      }

      else if (msg.type === 'delete_message') {
        const targetRoom = msg.room || client.room;
        const messageId = msg.messageId;
        const mode = msg.mode || 'for_everyone';
        if (!client.username || !targetRoom || (!messageId && !msg.timestamp)) return;

        let room = roomsMap.get(targetRoom);
        if (!room) {
          for (const [k, r] of roomsMap.entries()) {
            if (k.toLowerCase() === targetRoom.toLowerCase()) {
              room = r;
              break;
            }
          }
        }
        if (!room && targetRoom.startsWith('DM:')) {
          const loadedHist = loadDMHistoryFromFile(targetRoom);
          room = {
            name: targetRoom,
            clients: new Set(),
            history: loadedHist,
            isDM: true
          };
          roomsMap.set(targetRoom, room);
        }

        let targetMsg: any = null;
        if (room && room.history) {
          targetMsg = room.history.find(m => m.id === messageId);
          if (!targetMsg && msg.timestamp) {
            targetMsg = room.history.find(m => m.timestamp === msg.timestamp && m.username?.toLowerCase() === client.username.toLowerCase());
          }
          if (!targetMsg && msg.timestamp) {
            targetMsg = room.history.find(m => m.timestamp === msg.timestamp);
          }
        }

        // Global search fallback
        if (!targetMsg) {
          for (const [rName, rObj] of roomsMap.entries()) {
            if (rObj && rObj.history) {
              const found = rObj.history.find((m: any) => (messageId && m.id === messageId) || (msg.timestamp && m.timestamp === msg.timestamp));
              if (found) {
                targetMsg = found;
                room = rObj;
                break;
              }
            }
          }
        }

        if (!targetMsg) return;

        const userLower = client.username.toLowerCase();
        const isAuthor = targetMsg.username?.toLowerCase() === userLower;
        const isOwner = room && room.owner?.toLowerCase() === userLower;
        const isAdmin = room && (room.admins || []).map((a: string) => a.toLowerCase()).includes(userLower);

        const realId = targetMsg.id || messageId;

        if (mode === 'for_me') {
          targetMsg.deletedFor = targetMsg.deletedFor || [];
          if (!targetMsg.deletedFor.map((u: string) => u.toLowerCase()).includes(userLower)) {
            targetMsg.deletedFor.push(client.username);
          }

          saveRooms();
          if (targetRoom.startsWith('DM:') && room) {
            saveDMHistoryToFile(targetRoom, room.history);
          }

          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'message_deleted',
              messageId: realId,
              timestamp: targetMsg.timestamp,
              room: targetRoom,
              forMeOnly: true
            }));
          }
        } else {
          if (!isAuthor && !isOwner && !isAdmin) {
            return sendError(ws, 'Вы можете удалить чужое сообщение только для себя!');
          }

          if (room && room.history) {
            room.history = room.history.filter((m: any) => m !== targetMsg && (realId ? m.id !== realId : true));
          }

          saveRooms();
          if (targetRoom.startsWith('DM:') && room) {
            saveDMHistoryToFile(targetRoom, room.history);
          }

          const deletePayload = {
            type: 'message_deleted',
            messageId: realId,
            timestamp: targetMsg.timestamp,
            room: targetRoom
          };

          broadcastToRoom(targetRoom, deletePayload);
          const delPayloadStr = JSON.stringify(deletePayload);
          for (const c of connectedClients) {
            if (c.ws && c.ws.readyState === WebSocket.OPEN) {
              try { c.ws.send(delPayloadStr); } catch (e) {}
            }
          }
        }
      }
      else if (msg.type === 'delete_chat' || msg.type === 'delete_dm') {
        if (!client.username) return;
        const targetUser = (msg.targetUser || msg.recipient || '').trim().replace(/^@/, '');
        const targetRoom = msg.room || (targetUser ? getDMKey(client.username, targetUser) : client.room);

        if (!targetRoom) return;

        let room = roomsMap.get(targetRoom);
        if (!room && targetRoom.startsWith('DM:')) {
          room = {
            name: targetRoom,
            clients: new Set(),
            history: [],
            isDM: true
          };
          roomsMap.set(targetRoom, room);
        }
        if (room) {
          room.history = [];
        }

        if (targetRoom.startsWith('DM:')) {
          saveDMHistoryToFile(targetRoom, []);
          firestoreSaveRoom(room || { name: targetRoom, isDM: true, history: [] });
        } else {
          saveRooms();
        }

        const userAccount = usersMap.get(client.username.toLowerCase());
        if (userAccount && userAccount.dmContacts) {
          if (targetUser) {
            userAccount.dmContacts = userAccount.dmContacts.filter(c => c.toLowerCase() !== targetUser.toLowerCase());
          } else if (targetRoom.startsWith('DM:')) {
            const parts = targetRoom.substring(3).split('_');
            const other = parts.find(p => p.toLowerCase() !== client.username.toLowerCase());
            if (other) {
              userAccount.dmContacts = userAccount.dmContacts.filter(c => c.toLowerCase() !== other.toLowerCase());
            }
          }
          saveUsers();
        }

        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'chat_deleted',
            room: targetRoom,
            targetUser: targetUser,
            dmContacts: userAccount ? userAccount.dmContacts : []
          }));
        }
      }

      else if (msg.type === 'typing') {
        const targetRoom = msg.room || client.room;
        if (targetRoom && client.username) {
          broadcastToRoomExceptSender(targetRoom, {
            type: 'user_typing',
            username: client.username,
            room: targetRoom
          }, ws);
        }
      }

      else if (msg.type === 'activate_vip') {
        if (!client.username) return;
        const password = (msg.password || '').trim();
        if (password !== 'vees' && password !== 'caREND') {
          return sendError(ws, 'Неверный пароль для активации VIP!');
        }
        const acc = usersMap.get(client.username.toLowerCase());
        if (acc) {
          acc.isVip = true;
          client.isVip = true;
          saveUsers();
        }
        const vipPayload = JSON.stringify({ type: 'vip_status_updated', username: client.username, isVip: true });
        for (const c of connectedClients) {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(vipPayload);
          }
        }
        broadcastGlobalUserList();
      }

      else if (msg.type === 'deactivate_vip') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        if (acc) {
          acc.isVip = false;
          client.isVip = false;
          saveUsers();
        }
        const vipPayload = JSON.stringify({ type: 'vip_status_updated', username: client.username, isVip: false });
        for (const c of connectedClients) {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(vipPayload);
          }
        }
        broadcastGlobalUserList();
      }

      else if (msg.type === 'upload_story') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        if (!acc || !acc.isVip) {
          return sendError(ws, 'Загрузка сторис доступна только для VIP-пользователей!');
        }
        if (!msg.videoData) {
          return sendError(ws, 'Не переданы данные видео!');
        }
        const newStory = {
          id: 'story_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          videoData: msg.videoData,
          videoType: msg.fileType || 'video/mp4',
          createdAt: Date.now(),
          likes: []
        };
        acc.story = newStory;
        saveUsers();
        ws.send(JSON.stringify({ type: 'story_uploaded', story: newStory }));
        broadcastGlobalUserList();
      }

      else if (msg.type === 'like_story') {
        if (!client.username) return;
        const authorName = (msg.authorUsername || '').toLowerCase();
        const authorAcc = usersMap.get(authorName);
        if (authorAcc && authorAcc.story) {
          const story = authorAcc.story;
          if (Date.now() - story.createdAt < 24 * 60 * 60 * 1000) {
            if (!story.likes) story.likes = [];
            const userIdx = story.likes.indexOf(client.username);
            if (userIdx > -1) {
              story.likes.splice(userIdx, 1);
            } else {
              story.likes.push(client.username);
            }
            saveUsers();
            broadcastGlobalUserList();
          }
        }
      }

      else if (msg.type === 'toggle_block_user') {
        if (!client.username) return;
        const target = (msg.targetUsername || '').trim();
        if (!target || target.toLowerCase() === client.username.toLowerCase()) return;

        const acc = usersMap.get(client.username.toLowerCase());
        if (acc) {
          if (!acc.blockedUsers) acc.blockedUsers = [];
          const targetLower = target.toLowerCase();
          const idx = acc.blockedUsers.map(u => u.toLowerCase()).indexOf(targetLower);
          if (idx > -1) {
            acc.blockedUsers.splice(idx, 1);
          } else {
            acc.blockedUsers.push(targetLower);
          }
          client.blockedUsers = acc.blockedUsers;
          saveUsers();
          ws.send(JSON.stringify({ type: 'blocked_users_updated', blockedUsers: acc.blockedUsers }));
        }
      }

      else if (msg.type === 'delete_account') {
        if (!client.username) return;
        const userLower = client.username.toLowerCase();

        console.log(`[AUTH] Account deletion requested for ${client.username}`);

        // Delete user account from storage
        usersMap.delete(userLower);
        saveUsers();
        firestoreDeleteUser(userLower).catch(e => console.warn('Firestore delete user error:', e));

        // Send confirmation to client before closing
        ws.send(JSON.stringify({
          type: 'account_deleted',
          message: 'Аккаунт успешно и полностью удален'
        }));

        // Remove client from room and connections
        if (client.room) {
          const room = roomsMap.get(client.room);
          if (room) {
            room.clients.delete(client);
            broadcastUserList(client.room);
          }
        }

        connectedClients.delete(client);

        // Broadcast updated user list to remaining users
        broadcastGlobalUserList();
      }

      else if (msg.type === 'switch_room') {
        let newRoomName = msg.room;
        if (!newRoomName || !client.username) return;

        if (!isUserAuthorizedForRoom(client.username, newRoomName)) {
          newRoomName = 'Разговоры';
        }

        if (client.room && client.room !== newRoomName) {
          const oldRoomName = client.room;
          const oldRoom = roomsMap.get(oldRoomName);
          if (oldRoom) {
            oldRoom.clients.delete(client);
            broadcastUserList(oldRoomName);
          }
        }

        client.room = newRoomName;

        let newRoom = roomsMap.get(newRoomName);
        if (!newRoom) {
          if (newRoomName.startsWith('DM:')) {
            const loadedHist = loadDMHistoryFromFile(newRoomName);
            newRoom = {
              name: newRoomName,
              clients: new Set(),
              history: loadedHist,
              isDM: true
            };
            roomsMap.set(newRoomName, newRoom);
          } else {
            newRoomName = 'Разговоры';
            newRoom = roomsMap.get('Разговоры')!;
            client.room = newRoomName;
          }
        }

        newRoom.clients.add(client);

        client.ws.send(JSON.stringify({
          type: 'init',
          username: client.username,
          room: newRoomName,
          color: client.color,
          rooms: getPublicRooms(),
          groups: getGroupsForUser(client.username),
          onlineUsers: Array.from(newRoom.clients).map(c => c.username),
          usersList: getAllUsersInfo(),
          history: filterHistoryForUser(newRoom.history, client.username),
          groupInfo: getGroupDetails(newRoomName)
        }));

        broadcastUserList(newRoomName);
      }

      else if (msg.type === 'start_dm' || msg.type === 'init_dm') {
        const rawTarget = (msg.targetUser || msg.recipient || '').trim().replace(/^@/, '');
        if (!rawTarget || !client.username) return;

        let dmRoomKey = '';
        let targetUsername = rawTarget;
        let targetColor = '#8b5cf6';

        if (rawTarget.toLowerCase() === 'vesperchat') {
          targetUsername = 'VesperChat';
          dmRoomKey = `DM:VesperChat_${client.username.toLowerCase()}`;
        } else if (rawTarget.toLowerCase() === 'избранное' || rawTarget === 'Избранное') {
          targetUsername = 'Избранное';
          dmRoomKey = `DM:favorited_${client.username.toLowerCase()}`;
        } else {
          if (rawTarget.toLowerCase() === client.username.toLowerCase()) {
            return sendError(ws, 'Нельзя создать личный чат с самим собой!');
          }
          const targetAccount = usersMap.get(rawTarget.toLowerCase());
          targetUsername = targetAccount ? targetAccount.username : rawTarget;
          targetColor = targetAccount ? targetAccount.color : '#8b5cf6';
          dmRoomKey = getDMKey(client.username, targetUsername);
        }

        let dmRoom = roomsMap.get(dmRoomKey);
        if (!dmRoom) {
          const loadedHist = loadDMHistoryFromFile(dmRoomKey);
          dmRoom = {
            name: dmRoomKey,
            clients: new Set(),
            history: loadedHist,
            isDM: true
          };
          roomsMap.set(dmRoomKey, dmRoom);
          saveRooms();
        } else if (!dmRoom.history || dmRoom.history.length === 0) {
          dmRoom.history = loadDMHistoryFromFile(dmRoomKey);
        }

        // Add to persistent DM contacts for current user account
        const userAccount = usersMap.get(client.username.toLowerCase());
        if (userAccount) {
          userAccount.dmContacts = userAccount.dmContacts || [];
          if (!userAccount.dmContacts.map(c => c.toLowerCase()).includes(targetUsername.toLowerCase())) {
            userAccount.dmContacts.push(targetUsername);
            saveUsers();
          }
        }

        // If target account exists, also add to target account's dmContacts
        const targetAccount = usersMap.get(targetUsername.toLowerCase());
        if (targetAccount) {
          targetAccount.dmContacts = targetAccount.dmContacts || [];
          if (!targetAccount.dmContacts.map(c => c.toLowerCase()).includes(client.username.toLowerCase())) {
            targetAccount.dmContacts.push(client.username);
            saveUsers();
          }
        }

        // Leave old room
        const oldRoomName = client.room;
        const oldRoom = roomsMap.get(oldRoomName);
        if (oldRoom) {
          oldRoom.clients.delete(client);
          broadcastUserList(oldRoomName);
        }

        client.room = dmRoomKey;
        dmRoom.clients.add(client);

        const cleanHistory = filterHistoryForUser(dmRoom.history, client.username);

        client.ws.send(JSON.stringify({
          type: 'dm_started',
          recipient: targetUsername,
          recipientColor: targetColor,
          room: dmRoomKey,
          history: cleanHistory,
          dmContacts: userAccount ? userAccount.dmContacts : [targetUsername]
        }));
      }

      else if (msg.type === 'create_room' || msg.type === 'create_group') {
        const roomName = (msg.room || '').trim();
        const selectedMembers = (msg.members || []).map((m: string) => m.toLowerCase());
        const isAnnouncement = Boolean(msg.isAnnouncement);

        if (!roomName) {
          return sendError(ws, 'Название группы не может быть пустым!');
        }
        if (roomsMap.has(roomName)) {
          return sendError(ws, 'Группа с таким названием уже существует!');
        }

        const ownerLower = client.username.toLowerCase();
        const allMembersSet = new Set([ownerLower, ...selectedMembers]);

        const newGroupObj: Room = {
          name: roomName,
          clients: new Set(),
          history: [],
          isGroup: true,
          isAnnouncement,
          owner: ownerLower,
          admins: [ownerLower],
          members: Array.from(allMembersSet)
        };

        roomsMap.set(roomName, newGroupObj);
        saveRooms();

        broadcastRoomsAndGroups();

        // Switch creator to the new room immediately
        client.room = roomName;
        newGroupObj.clients.add(client);

        client.ws.send(JSON.stringify({
          type: 'init',
          username: client.username,
          room: roomName,
          color: client.color,
          rooms: getPublicRooms(),
          groups: getGroupsForUser(client.username),
          onlineUsers: Array.from(newGroupObj.clients).map(c => c.username),
          usersList: getAllUsersInfo(),
          history: newGroupObj.history,
          groupInfo: getGroupDetails(roomName)
        }));

        broadcastUserList(roomName);
      }

      else if (msg.type === 'update_group_info') {
        const roomName = (msg.room || '').trim();
        const newName = (msg.newName || '').trim();

        const room = roomsMap.get(roomName);
        if (!room || !room.isGroup) {
          return sendError(ws, 'Группа не найдена!');
        }

        const userLower = client.username.toLowerCase();
        const isOwner = room.owner === userLower;
        const isAdmin = (room.admins || []).includes(userLower);

        if (!isOwner && !isAdmin) {
          return sendError(ws, 'Только создатель или администратор группы может изменять её параметры!');
        }

        if (newName && newName !== roomName) {
          if (roomsMap.has(newName)) {
            return sendError(ws, 'Группа с таким названием уже существует!');
          }

          // Move room in map
          roomsMap.delete(roomName);
          room.name = newName;
          roomsMap.set(newName, room);

          for (const c of connectedClients) {
            if (c.room === roomName) {
              c.room = newName;
            }
          }

          saveRooms();
          broadcastRoomsAndGroups();

          broadcastToRoom(newName, {
            type: 'system',
            content: `✏️ Пользователь @${client.username} переименовал группу в "${newName}"`,
            room: newName
          });

          // Notify all clients in the group of updated details
          const details = getGroupDetails(newName);
          const payload = JSON.stringify({
            type: 'group_info_updated',
            room: newName,
            oldName: roomName,
            groupInfo: details
          });

          for (const c of connectedClients) {
            if (c.room === newName && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(payload);
            }
          }
        }
      }

      else if (msg.type === 'get_room_details') {
        const roomName = (msg.roomName || msg.room || '').trim();
        const details = getGroupDetails(roomName);
        ws.send(JSON.stringify({
          type: 'room_details_response',
          roomName,
          groupInfo: details
        }));
      }

      else if (msg.type === 'update_room_avatar') {
        const roomName = (msg.roomName || msg.room || '').trim();
        const avatarUrl = (msg.avatarUrl || '').trim();
        const room = roomsMap.get(roomName);
        if (!room) return sendError(ws, 'Канал не найден!');
        const userLower = client.username.toLowerCase();
        const isOwner = room.owner === userLower || (room.admins && room.admins.includes(userLower)) || (!room.isGroup);
        if (!isOwner) return sendError(ws, 'Только создатель или администратор может менять аватарку!');

        room.avatarUrl = avatarUrl;
        saveRooms();
        broadcastRoomsAndGroups();

        const details = getGroupDetails(roomName);
        ws.send(JSON.stringify({
          type: 'group_info_updated',
          room: roomName,
          groupInfo: details
        }));
      }

      else if (msg.type === 'request_channel_verification') {
        const roomName = (msg.roomName || msg.room || '').trim();
        const room = roomsMap.get(roomName);
        if (!room) {
          return sendError(ws, 'Канал или группа не найдена!');
        }
        const userLower = client.username.toLowerCase();
        const isOwner = room.owner === userLower || (room.admins && room.admins.includes(userLower)) || (!room.isGroup);
        if (!isOwner) {
          return sendError(ws, 'Только создатель или администратор может запросить верификацию!');
        }
        if (!room.owner) {
          room.owner = userLower;
        }
        if (room.isVerified) {
          return sendError(ws, 'Канал уже верифицирован!');
        }
        room.verificationPending = true;
        saveRooms();
        broadcastRoomsAndGroups();

        ws.send(JSON.stringify({
          type: 'verification_requested_ack',
          roomName,
          message: 'Запрос на верификацию отправлен модераторам!'
        }));

        for (const c of connectedClients) {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'verification_requested_notice',
              roomName,
              requestedBy: client.username
            }));
          }
        }
      }

      else if (msg.type === 'get_pending_verifications') {
        const pending: any[] = [];
        for (const [name, room] of roomsMap.entries()) {
          if (room.verificationPending) {
            pending.push({
              name: room.name,
              owner: room.owner || 'Создатель',
              membersCount: room.members ? room.members.length : 1,
              isGroup: Boolean(room.isGroup)
            });
          }
        }
        ws.send(JSON.stringify({
          type: 'pending_verifications_list',
          pending
        }));
      }

      else if (msg.type === 'approve_channel_verification') {
        const roomName = (msg.roomName || msg.room || '').trim();
        const room = roomsMap.get(roomName);
        if (!room) return sendError(ws, 'Канал не найден!');

        room.isVerified = true;
        room.verificationPending = false;
        saveRooms();
        broadcastRoomsAndGroups();

        const ownerLower = (room.owner || '').toLowerCase();
        for (const c of connectedClients) {
          if (c.ws.readyState === WebSocket.OPEN && c.username && (c.username.toLowerCase() === ownerLower || !ownerLower)) {
            c.ws.send(JSON.stringify({
              type: 'channel_verified_owner_banner',
              roomName
            }));
          }
        }

        broadcastToRoom(roomName, {
          type: 'system',
          content: `🎉 Канал "${roomName}" официально получил статус верифицированного!`,
          room: roomName
        });
      }

      else if (msg.type === 'decline_channel_verification') {
        const roomName = (msg.roomName || msg.room || '').trim();
        const room = roomsMap.get(roomName);
        if (room) {
          room.verificationPending = false;
          saveRooms();
          broadcastRoomsAndGroups();
        }
      }

      else if (msg.type === 'manage_group_role') {
        const roomName = (msg.room || '').trim();
        const targetUser = (msg.targetUser || '').trim().toLowerCase();
        const action = msg.action; // 'promote_admin' | 'demote_admin' | 'kick_member' | 'add_member'

        const room = roomsMap.get(roomName);
        if (!room || !room.isGroup) {
          return sendError(ws, 'Группа не найдена!');
        }

        const userLower = client.username.toLowerCase();
        const isOwner = room.owner === userLower;
        const isAdmin = (room.admins || []).includes(userLower);

        if (!isOwner && !isAdmin) {
          return sendError(ws, 'У вас недостаточно прав для управления участниками группы!');
        }

        if (!room.admins) room.admins = [room.owner || ''];
        if (!room.members) room.members = [];

        if (action === 'promote_admin') {
          if (!room.admins.includes(targetUser)) {
            room.admins.push(targetUser);
          }
        } else if (action === 'demote_admin') {
          if (targetUser === room.owner) {
            return sendError(ws, 'Нельзя снять административные права с Создателя группы!');
          }
          room.admins = room.admins.filter(a => a !== targetUser);
        } else if (action === 'kick_member') {
          if (targetUser === room.owner) {
            return sendError(ws, 'Нельзя исключить Создателя группы!');
          }
          room.members = room.members.filter(m => m !== targetUser);
          room.admins = room.admins.filter(a => a !== targetUser);
        } else if (action === 'add_member') {
          if (!room.members.includes(targetUser)) {
            room.members.push(targetUser);
          }
        }

        saveRooms();
        broadcastRoomsAndGroups();

        const details = getGroupDetails(roomName);
        const payload = JSON.stringify({
          type: 'group_info_updated',
          room: roomName,
          groupInfo: details
        });

        for (const c of connectedClients) {
          if (c.room === roomName && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(payload);
          }
        }
      }

      else if (msg.type === 'search_users') {
        const query = (msg.query || msg.content || '').trim().replace(/^@/, '').toLowerCase();
        const clientLower = (client.username || '').toLowerCase();

        const allUsers = getAllUsersInfo();
        const results = allUsers.filter(u => {
          const uLower = u.username.toLowerCase();
          if (uLower === clientLower) return false;
          if (!query) return false;
          // Exact match on username (non-searchable by nickname, and prevents partial matching e.g. 'v' or 've' finding 've1')
          return uLower === query;
        });

        client.ws.send(JSON.stringify({
          type: 'search_users_result',
          query: msg.query || '',
          usersList: results,
          results: results
        }));
      }

      else if (msg.type === 'change_password') {
        const oldPass = (msg.oldPassword || '').trim();
        const newPass = (msg.newPassword || '').trim();

        if (!client.username) {
          return sendError(ws, 'Вы не авторизованы!');
        }

        const lowerUser = client.username.toLowerCase();
        const account = usersMap.get(lowerUser);

        if (!account || account.password !== oldPass) {
          return sendError(ws, 'Неверный старый пароль!');
        }

        if (newPass.length < 4) {
          return sendError(ws, 'Новый пароль должен содержать минимум 4 символа!');
        }

        account.password = newPass;
        saveUsers();

        client.ws.send(JSON.stringify({
          type: 'password_changed',
          message: 'Пароль успешно изменен!'
        }));
      }

      else if (msg.type === 'update_profile') {
        if (!client.username) return;

        const lowerUser = client.username.toLowerCase();
        const account = usersMap.get(lowerUser);

        if (account) {
          if (msg.nickname !== undefined) {
            account.nickname = (msg.nickname || '').trim().slice(0, 15);
            client.nickname = account.nickname;
          }
          if (msg.color !== undefined) {
            account.color = msg.color;
            client.color = msg.color;
          }
          if (msg.avatarUrl !== undefined) {
            account.avatarUrl = (msg.avatarUrl || '').trim();
            client.avatarUrl = account.avatarUrl;
          }
          if (msg.bannerUrl !== undefined) {
            account.bannerUrl = (msg.bannerUrl || '').trim();
            client.bannerUrl = account.bannerUrl;
          }
          if (msg.bio !== undefined) {
            account.bio = (msg.bio || '').trim();
            client.bio = account.bio;
          }
          if (msg.birthday !== undefined) {
            account.birthday = (msg.birthday || '').trim();
            client.birthday = account.birthday;
          }
          if (msg.statusText !== undefined) {
            account.statusText = (msg.statusText || '').trim();
            client.statusText = account.statusText;
          }
          if (msg.gamingStatus !== undefined) {
            account.gamingStatus = (msg.gamingStatus || '').trim().slice(0, 30);
            client.gamingStatus = account.gamingStatus;
          }

          saveUsers();
          sqliteSaveUser(account);

          const updatePayload = JSON.stringify({
            type: 'profile_updated',
            username: client.username,
            nickname: client.nickname || account.nickname || '',
            color: client.color,
            avatarUrl: client.avatarUrl || '',
            bannerUrl: client.bannerUrl || '',
            bio: client.bio || '',
            statusText: client.statusText || '',
            birthday: client.birthday || '',
            gamingStatus: client.gamingStatus || ''
          });

          for (const c of connectedClients) {
            if (c.ws.readyState === WebSocket.OPEN) {
              try { c.ws.send(updatePayload); } catch(e) {}
            }
          }

          broadcastGlobalUserList();
        }
      }

      else if (msg.type === 'save_stickers' || msg.type === 'update_stickers') {
        if (!client.username) return;
        const lowerUser = client.username.toLowerCase();
        const account = usersMap.get(lowerUser);
        if (account && Array.isArray((msg as any).stickers)) {
          account.customStickers = (msg as any).stickers.slice(-200);
          saveUsers();
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                type: 'stickers_saved',
                stickers: account.customStickers
              }));
            } catch(e) {}
          }
        }
      }

      else if (msg.type === 'change_username') {
        if (!client.username) return;
        const oldUsername = client.username;
        const oldLower = oldUsername.toLowerCase();
        const newUsername = (msg.newUsername || '').trim();
        const newLower = newUsername.toLowerCase();

        if (!newUsername || newUsername.length < 1 || newUsername.length > 24) {
          return sendError(ws, 'Юзернейм должен содержать от 1 до 24 символов!');
        }

        if (!/^[a-zA-Z0-9_]{1,24}$/.test(newUsername)) {
          return sendError(ws, 'В юзернейме разрешены только английские буквы, цифры и символ _');
        }

        if (oldLower !== newLower) {
          if (usersMap.has(newLower)) {
            return sendError(ws, 'Пользователь с таким юзернеймом уже существует!');
          }

          const account = usersMap.get(oldLower);
          if (account) {
            usersMap.delete(oldLower);
            account.username = newUsername;
            usersMap.set(newLower, account);
            client.username = newUsername;
            saveUsers();

            // Migrate sessions
            const sessions = userSessionsMap.get(oldLower);
            if (sessions) {
              userSessionsMap.delete(oldLower);
              userSessionsMap.set(newLower, sessions);
            }

            // Update all client sockets for this user
            for (const c of connectedClients) {
              if (c.username && c.username.toLowerCase() === oldLower) {
                c.username = newUsername;
              }
            }

            // Update rooms and DMs
            for (const [rName, rObj] of roomsMap.entries()) {
              if (rObj.owner && rObj.owner.toLowerCase() === oldLower) {
                rObj.owner = newLower;
              }
              if (rObj.admins) {
                rObj.admins = rObj.admins.map(a => a.toLowerCase() === oldLower ? newLower : a);
              }
              if (rObj.members) {
                rObj.members = rObj.members.map(m => m.toLowerCase() === oldLower ? newLower : m);
              }
              if (rName.startsWith('DM:')) {
                const parts = rName.substring(3).split('_');
                if (parts.some(p => p.toLowerCase() === oldLower)) {
                  const newParts = parts.map(p => p.toLowerCase() === oldLower ? newUsername : p);
                  const newDmName = `DM:${newParts.join('_')}`;
                  roomsMap.delete(rName);
                  rObj.name = newDmName;
                  roomsMap.set(newDmName, rObj);
                  for (const c of connectedClients) {
                    if (c.room === rName) c.room = newDmName;
                  }
                }
              }
              for (const m of rObj.history) {
                if (m.username && m.username.toLowerCase() === oldLower) {
                  m.username = newUsername;
                }
              }
            }
            saveRooms();

            const changePayload = JSON.stringify({
              type: 'username_changed',
              oldUsername: oldUsername,
              newUsername: newUsername
            });

            for (const c of connectedClients) {
              if (c.ws.readyState === WebSocket.OPEN) {
                try { c.ws.send(changePayload); } catch(e) {}
              }
            }

            broadcastGlobalUserList();
          }
        } else {
          const account = usersMap.get(oldLower);
          if (account) {
            account.username = newUsername;
            client.username = newUsername;
            saveUsers();

            const changePayload = JSON.stringify({
              type: 'username_changed',
              oldUsername: oldUsername,
              newUsername: newUsername
            });

            for (const c of connectedClients) {
              if (c.ws.readyState === WebSocket.OPEN) {
                try { c.ws.send(changePayload); } catch(e) {}
              }
            }

            broadcastGlobalUserList();
          }
        }
      }

      else if (msg.type === 'call_start') {
        let targetUser = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
        const targetRoom = msg.targetRoom || client.room;
        const isVideo = Boolean(msg.isVideo);
        const callId = msg.callId || ('call_' + Date.now());
        if (!client.username) return;

        if (!targetUser && targetRoom && targetRoom.startsWith('DM:')) {
          const parts = targetRoom.substring(3).split('_');
          const otherUser = parts.find(p => p.toLowerCase() !== client.username.toLowerCase());
          if (otherUser) targetUser = otherUser.trim().replace(/^@/, '').toLowerCase();
        }

        addClientToCall(callId, client);

        let sentCount = 0;
        if (targetUser) {
          for (const c of connectedClients) {
            if (c.username && c.username.trim().replace(/^@/, '').toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'incoming_call',
                fromUser: client.username,
                fromColor: client.color,
                isVideo,
                callId,
                room: targetRoom
              }));
              sentCount++;
            }
          }
        }

        if (sentCount === 0 && targetRoom && !targetRoom.startsWith('DM:')) {
          const roomObj = roomsMap.get(targetRoom);
          if (roomObj) {
            for (const c of roomObj.clients) {
              if (c !== client && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(JSON.stringify({
                  type: 'incoming_call',
                  fromUser: client.username,
                  fromColor: client.color,
                  isVideo,
                  callId,
                  room: targetRoom
                }));
                sentCount++;
              }
            }
          }
        }

        // If target is an offline user in DM, inform caller so they don't wait forever
        if (sentCount === 0 && targetUser && (!targetRoom || targetRoom.startsWith('DM:'))) {
          const isBotOrSupport = ['support', 'поддержка', 'vesperchat', 'vesper_bot', 'bot'].includes(targetUser);
          if (!isBotOrSupport) {
            client.ws.send(JSON.stringify({
              type: 'call_declined',
              fromUser: targetUser,
              callId,
              reason: 'Пользователь сейчас не в сети'
            }));
          }
        }
      }
      else if (msg.type === 'call_accept' || msg.type === 'call_join') {
        let targetUser = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
        const callId = msg.callId;
        if (!client.username || !callId) return;

        const existingMembers = getCallClients(callId).filter(c => c !== client).map(c => c.username);
        addClientToCall(callId, client);

        if (targetUser) {
          for (const c of connectedClients) {
            if (c.username && c.username.trim().replace(/^@/, '').toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'call_accepted',
                fromUser: client.username,
                callId
              }));
            }
          }
        }

        for (const c of getCallClients(callId)) {
          if (c !== client && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'user_joined_call',
              username: client.username,
              callId
            }));
          }
        }

        client.ws.send(JSON.stringify({
          type: 'call_participants_update',
          callId,
          participants: existingMembers
        }));
      }
      else if (msg.type === 'call_decline') {
        let targetUser = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
        const callId = msg.callId;
        if (!client.username || !targetUser) return;

        for (const c of connectedClients) {
          if (c.username && c.username.trim().replace(/^@/, '').toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'call_declined',
              fromUser: client.username,
              callId,
              reason: msg.reason || 'Отклонено'
            }));
          }
        }
      }
      else if (msg.type === 'webrtc_offer') {
        let targetUser = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
        if (!client.username || !targetUser) return;
        for (const c of connectedClients) {
          if (c.username && c.username.trim().replace(/^@/, '').toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'webrtc_offer',
              fromUser: client.username,
              callId: msg.callId,
              offer: msg.offer
            }));
          }
        }
      }
      else if (msg.type === 'webrtc_answer') {
        let targetUser = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
        if (!client.username || !targetUser) return;
        for (const c of connectedClients) {
          if (c.username && c.username.trim().replace(/^@/, '').toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'webrtc_answer',
              fromUser: client.username,
              callId: msg.callId,
              answer: msg.answer
            }));
          }
        }
      }
      else if (msg.type === 'webrtc_ice') {
        let targetUser = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
        if (!client.username || !targetUser) return;
        for (const c of connectedClients) {
          if (c.username && c.username.trim().replace(/^@/, '').toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'webrtc_ice',
              fromUser: client.username,
              callId: msg.callId,
              candidate: msg.candidate
            }));
          }
        }
      }
      else if (msg.type === 'call_mute_state') {
        const callId = msg.callId;
        if (!client.username || !callId) return;
        const payload = JSON.stringify({
          type: 'call_mute_state',
          fromUser: client.username,
          callId,
          micMuted: Boolean(msg.micMuted),
          camOff: Boolean(msg.camOff),
          isScreenSharing: Boolean(msg.isScreenSharing)
        });
        for (const c of getCallClients(callId)) {
          if (c !== client && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(payload);
          }
        }
        if (msg.targetUser) {
          const target = (msg.targetUser || '').trim().replace(/^@/, '').toLowerCase();
          for (const c of connectedClients) {
            if (c !== client && c.username && c.username.trim().replace(/^@/, '').toLowerCase() === target && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(payload);
            }
          }
        }
      }
      else if (msg.type === 'call_soundboard_play') {
        const callId = msg.callId;
        const soundId = msg.soundId;
        if (!client.username || !callId || !soundId) return;
        const payload = JSON.stringify({
          type: 'call_soundboard_play',
          fromUser: client.username,
          callId,
          soundId
        });
        for (const c of getCallClients(callId)) {
          if (c !== client && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(payload);
          }
        }
      }
      else if (msg.type === 'call_leave' || msg.type === 'call_end') {
        const targetUser = (msg.targetUser || '').trim().toLowerCase();
        const targetRoom = msg.targetRoom;
        const callId = msg.callId;
        if (!client.username) return;

        if (callId) {
          removeClientFromCall(callId, client);
        }

        if (targetUser) {
          for (const c of connectedClients) {
            if (c.username && c.username.toLowerCase() === targetUser && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'call_ended',
                fromUser: client.username,
                callId
              }));
            }
          }
        }
        if (targetRoom && !targetRoom.startsWith('DM:')) {
          const roomObj = roomsMap.get(targetRoom);
          if (roomObj) {
            for (const c of roomObj.clients) {
              if (c !== client && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(JSON.stringify({
                  type: 'call_ended',
                  fromUser: client.username,
                  callId
                }));
              }
            }
          }
        }
      }
      else if (msg.type === 'mark_read') {
        const targetRoom = msg.room || client.room;
        if (!client.username || !targetRoom || !targetRoom.startsWith('DM:')) return;

        let room = roomsMap.get(targetRoom);
        if (!room) {
          const loadedHist = loadDMHistoryFromFile(targetRoom);
          room = { name: targetRoom, clients: new Set(), history: loadedHist, isDM: true };
          roomsMap.set(targetRoom, room);
        }
        if (!room || !room.history) return;

        let modified = false;
        room.history.forEach(m => {
          if (m.username && m.username.toLowerCase() !== client.username.toLowerCase() && !m.isRead) {
            m.isRead = true;
            modified = true;
          }
        });

        if (modified) {
          saveRooms();
          saveDMHistoryToFile(targetRoom, room.history);
          broadcastToRoom(targetRoom, {
            type: 'messages_read',
            room: targetRoom,
            readBy: client.username
          });
        }
      }

      // ==========================================================================
      // WALLET & NEON CURRENCY HANDLERS
      // ==========================================================================
      else if (msg.type === 'wallet_get_balance') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        const neons = typeof acc?.neons === 'number' ? acc.neons : 5000;
        const walletTransactions = acc?.walletTransactions || [];
        client.ws.send(JSON.stringify({
          type: 'wallet_updated',
          neons,
          walletTransactions,
          lastDailyBonusClaim: acc?.lastDailyBonusClaim || 0
        }));
      }

      else if (msg.type === 'wallet_top_up') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        if (!acc) return;

        const amount = Math.max(1, typeof msg.amount === 'number' ? msg.amount : (parseInt(String(msg.amount || 0), 10) || 500));
        const method = (msg.method || 'Банковская карта').trim();
        const promoCode = (msg.promoCode || '').trim().toUpperCase();

        if (typeof acc.neons !== 'number') acc.neons = 5000;
        if (!acc.walletTransactions) acc.walletTransactions = [];

        let txTitle = `Пополнение через ${method}`;
        let txDesc = `Зачисление на баланс`;

        if (promoCode) {
          txTitle = `Активация промокода: ${promoCode}`;
          txDesc = `Бонусные Неоны за промокод`;
        }

        acc.neons += amount;
        const newTx = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: promoCode ? 'bonus' : 'top_up',
          title: txTitle,
          desc: txDesc,
          amount: amount,
          timestamp: Date.now(),
          status: 'completed'
        };
        acc.walletTransactions.unshift(newTx);
        if (acc.walletTransactions.length > 50) acc.walletTransactions.pop();
        saveUsers();

        client.ws.send(JSON.stringify({
          type: 'wallet_updated',
          neons: acc.neons,
          walletTransactions: acc.walletTransactions,
          lastDailyBonusClaim: acc.lastDailyBonusClaim || 0,
          toastMessage: `⚡ Баланс успешно пополнен на +${amount.toLocaleString('ru-RU')} Неонов!`
        }));
      }

      else if (msg.type === 'wallet_transfer') {
        const activeWs = client.ws || ws;
        if (!client.username) {
          activeWs.send(JSON.stringify({ type: 'wallet_error', error: 'Сначала выполните вход в аккаунт!' }));
          return;
        }
        const senderAcc = usersMap.get(client.username.toLowerCase());
        if (!senderAcc) {
          activeWs.send(JSON.stringify({ type: 'wallet_error', error: 'Аккаунт отправителя не найден!' }));
          return;
        }

        const targetRaw = String(msg.targetUser || msg.recipient || msg.to || msg.target || '').trim().replace(/^@/, '').toLowerCase();
        const amount = Math.floor(typeof msg.amount === 'number' ? msg.amount : (parseInt(String(msg.amount || 0), 10) || 0));
        const comment = (msg.comment || '').trim();

        if (!targetRaw || targetRaw === client.username.toLowerCase()) {
          activeWs.send(JSON.stringify({ type: 'wallet_error', error: 'Нельзя перевести Неоны самому себе или некорректный получатель!' }));
          return;
        }

        if (isNaN(amount) || amount <= 0) {
          activeWs.send(JSON.stringify({ type: 'wallet_error', error: 'Укажите положительную сумму перевода!' }));
          return;
        }

        let recipientAcc = usersMap.get(targetRaw);
        if (!recipientAcc) {
          // Search case-insensitively or by nickname
          for (const acc of usersMap.values()) {
            if (acc.username.toLowerCase() === targetRaw || (acc.nickname && acc.nickname.toLowerCase() === targetRaw)) {
              recipientAcc = acc;
              break;
            }
          }
        }

        if (!recipientAcc) {
          activeWs.send(JSON.stringify({ type: 'wallet_error', error: `Пользователь @${targetRaw} не найден в системе!` }));
          return;
        }

        if (typeof senderAcc.neons !== 'number') senderAcc.neons = 5000;
        if (senderAcc.neons < amount) {
          activeWs.send(JSON.stringify({
            type: 'wallet_error',
            error: `Недостаточно Неонов! Ваш баланс: ${senderAcc.neons.toLocaleString('ru-RU')} ⚛️, сумма: ${amount.toLocaleString('ru-RU')} ⚛️.`
          }));
          return;
        }

        if (typeof recipientAcc.neons !== 'number') recipientAcc.neons = 5000;
        if (!senderAcc.walletTransactions) senderAcc.walletTransactions = [];
        if (!recipientAcc.walletTransactions) recipientAcc.walletTransactions = [];

        // Deduct from sender
        senderAcc.neons -= amount;
        const senderTx = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'transfer_out',
          title: `Перевод @${recipientAcc.username}`,
          desc: comment ? `«${comment}»` : 'Прямой перевод Неонов',
          amount: -amount,
          recipient: recipientAcc.username,
          timestamp: Date.now(),
          status: 'completed'
        };
        senderAcc.walletTransactions.unshift(senderTx);
        if (senderAcc.walletTransactions.length > 50) senderAcc.walletTransactions.pop();

        // Credit to recipient
        recipientAcc.neons += amount;
        const recipientTx = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_in',
          type: 'transfer_in',
          title: `Перевод от @${client.username}`,
          desc: comment ? `«${comment}»` : 'Получен перевод Неонов',
          amount: amount,
          sender: client.username,
          timestamp: Date.now(),
          status: 'completed'
        };
        recipientAcc.walletTransactions.unshift(recipientTx);
        if (recipientAcc.walletTransactions.length > 50) recipientAcc.walletTransactions.pop();

        saveUsers();

        // Notify sender
        activeWs.send(JSON.stringify({
          type: 'wallet_updated',
          neons: senderAcc.neons,
          walletTransactions: senderAcc.walletTransactions,
          lastDailyBonusClaim: senderAcc.lastDailyBonusClaim || 0,
          toastMessage: `💸 Успешно переведено ${amount.toLocaleString('ru-RU')} Неонов пользователю @${recipientAcc.username}`
        }));

        // Notify online recipient if connected
        const targetRecipientLower = recipientAcc.username.toLowerCase();
        for (const c of connectedClients) {
          if (c.username && c.username.toLowerCase() === targetRecipientLower && c.ws && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'wallet_updated',
              neons: recipientAcc.neons,
              walletTransactions: recipientAcc.walletTransactions,
              lastDailyBonusClaim: recipientAcc.lastDailyBonusClaim || 0,
              toastMessage: `🎁 Вам переведено +${amount.toLocaleString('ru-RU')} Неонов от @${client.username}!`
            }));
          }
        }
      }

      else if (msg.type === 'wallet_spend') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        if (!acc) return;

        const price = Math.max(1, typeof msg.price === 'number' ? msg.price : (typeof msg.amount === 'number' ? msg.amount : (parseInt(String(msg.price || msg.amount || 0), 10) || 0)));
        const itemType = (msg.itemType || '').trim();
        const itemTitle = (msg.title || 'Покупка в магазине').trim();

        if (typeof acc.neons !== 'number') acc.neons = 5000;
        if (acc.neons < price) {
          return sendError(ws, `Недостаточно Неонов на балансе! Требуется ${price.toLocaleString('ru-RU')} ⚛️, а у вас ${acc.neons.toLocaleString('ru-RU')} ⚛️.`);
        }

        acc.neons -= price;
        if (!acc.walletTransactions) acc.walletTransactions = [];

        // Apply item effect
        if (itemType === 'vip_30' || itemType === 'vip_forever' || itemType === 'vip') {
          acc.isVip = true;
          client.isVip = true;
          for (const c of connectedClients) {
            if (c.username && c.username.toLowerCase() === client.username.toLowerCase()) {
              c.isVip = true;
            }
          }
        }

        const spendTx = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'spend',
          title: itemTitle,
          desc: itemType === 'vip' || itemType.startsWith('vip') ? 'Подписка Vesper VIP' : 'Покупка в Vesper Store',
          amount: -price,
          timestamp: Date.now(),
          status: 'completed'
        };
        acc.walletTransactions.unshift(spendTx);
        if (acc.walletTransactions.length > 50) acc.walletTransactions.pop();

        saveUsers();

        client.ws.send(JSON.stringify({
          type: 'wallet_updated',
          neons: acc.neons,
          walletTransactions: acc.walletTransactions,
          lastDailyBonusClaim: acc.lastDailyBonusClaim || 0,
          isVip: Boolean(acc.isVip),
          toastMessage: `🛍️ Покупка «${itemTitle}» успешно совершена!`
        }));

        if (acc.isVip) {
          broadcastGlobalUserList();
        }
      }

      else if (msg.type === 'wallet_claim_daily') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        if (!acc) return;

        const now = Date.now();
        const twoDays = 2 * 24 * 60 * 60 * 1000;
        const lastClaim = acc.lastDailyBonusClaim || 0;

        if (now - lastClaim < twoDays) {
          const remainingMs = twoDays - (now - lastClaim);
          const hours = Math.floor(remainingMs / (60 * 60 * 1000));
          const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
          return sendError(ws, `Бонус уже получен! Следующий бонус (каждые 2 дня) доступен через ${hours}ч ${mins}м.`);
        }

        if (typeof acc.neons !== 'number') acc.neons = 5000;
        if (!acc.walletTransactions) acc.walletTransactions = [];

        const currentStreak = Math.max(1, acc.bonusMonthStreak || 1);
        const bonusAmount = currentStreak * 50;
        acc.neons += bonusAmount;
        acc.lastDailyBonusClaim = now;
        acc.bonusMonthStreak = currentStreak + 1;

        const bonusTx = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'bonus',
          title: `Бонус каждые 2 дня (${currentStreak} этап)`,
          desc: `Накопительный бонус раз в 2 дня: ${bonusAmount} Неонов`,
          amount: bonusAmount,
          timestamp: now,
          status: 'completed'
        };
        acc.walletTransactions.unshift(bonusTx);
        if (acc.walletTransactions.length > 50) acc.walletTransactions.pop();

        saveUsers();

        client.ws.send(JSON.stringify({
          type: 'wallet_updated',
          neons: acc.neons,
          walletTransactions: acc.walletTransactions,
          lastDailyBonusClaim: acc.lastDailyBonusClaim,
          bonusMonthStreak: acc.bonusMonthStreak,
          toastMessage: `🎁 Вы забрали бонус +${bonusAmount} Неонов! (${currentStreak} этап)`
        }));
      }

      else if (msg.type === 'submit_suggestion') {
        if (!client.username) return;
        const acc = usersMap.get(client.username.toLowerCase());
        if (!acc) return;

        const now = Date.now();
        const oneHour = 60 * 60 * 1000; // 1 hour anti-spam block
        const lastSug = acc.lastSuggestionTimestamp || 0;

        if (now - lastSug < oneHour) {
          const remainingMs = oneHour - (now - lastSug);
          const mins = Math.floor(remainingMs / (60 * 1000));
          const secs = Math.floor((remainingMs % (60 * 1000)) / 1000);
          return sendError(ws, `⏳ Вы уже отправляли предложение! Защита от спама: следующая отправка будет доступна через ${mins}м ${secs}с.`);
        }

        const category = (msg.category || 'Идея').trim().slice(0, 50);
        const title = (msg.title || '').trim().slice(0, 150);
        const content = (msg.content || '').trim().slice(0, 4000);

        if (!title || title.length < 3) {
          return sendError(ws, 'Укажите тему предложения (не менее 3 символов)!');
        }
        if (!content || content.length < 5) {
          return sendError(ws, 'Опишите ваше предложение подробнее (не менее 5 символов)!');
        }

        if (!acc.suggestions) acc.suggestions = [];
        const newSuggestion = {
          id: 'sug_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          category,
          title,
          content,
          timestamp: now,
          status: 'sent'
        };

        acc.suggestions.unshift(newSuggestion);
        if (acc.suggestions.length > 30) acc.suggestions.pop();
        acc.lastSuggestionTimestamp = now;

        saveUsers();

        const { ip } = detectDeviceAndIp(client.req);
        // Send email to vesperchats@gmai.com asynchronously
        sendSuggestionEmail(client.username, category, title, content, ip);

        client.ws.send(JSON.stringify({
          type: 'suggestion_submitted',
          lastSuggestionTimestamp: acc.lastSuggestionTimestamp,
          suggestions: acc.suggestions,
          toastMessage: '💡 Ваше предложение отправлено разработчикам на vesperchats@gmai.com!'
        }));
      }

      else if (msg.type === 'admin_login' || msg.type === 'admin_get_users') {
        if (!client.username) return;
        const pwd = (msg.adminPassword || msg.password || '').trim();
        if (pwd !== 'caREND') {
          return sendError(ws, 'Неверный пароль администратора!');
        }

        const allUsersData = Array.from(usersMap.values()).map(u => ({
          username: u.username,
          nickname: u.nickname || u.username,
          color: u.color,
          avatarUrl: u.avatarUrl || '',
          neons: typeof u.neons === 'number' ? u.neons : 5000,
          isVip: Boolean(u.isVip),
          createdAt: u.createdAt,
          txCount: u.walletTransactions ? u.walletTransactions.length : 0
        }));

        client.ws.send(JSON.stringify({
          type: 'admin_auth_success',
          users: allUsersData,
          serverStats: {
            totalUsers: usersMap.size,
            onlineCount: connectedClients.size,
            totalNeons: Array.from(usersMap.values()).reduce((sum, u) => sum + (typeof u.neons === 'number' ? u.neons : 5000), 0)
          }
        }));
      }

      else if (msg.type === 'send_gift' || msg.type === 'buy_gift') {
        if (!client.username) return;
        const senderAcc = usersMap.get(client.username.toLowerCase());
        if (!senderAcc) return sendError(ws, 'Пользователь не найден');

        const anyMsg = msg as any;
        const GIFT_CATALOG: Record<string, { price: number; name: string; icon: string }> = {
          'teddy_bear': { price: 20, name: 'Плюшевый мишка', icon: '/gift_teddy.svg' },
          'vip_crown': { price: 50, name: 'Корона VIP', icon: '/gift_vip_crown.svg' },
          'neon_crystal': { price: 35, name: 'Неоновый Кристалл', icon: '/gift_neon_crystal.svg' },
          'space_rocket': { price: 75, name: 'Космическая Ракета', icon: '/gift_space_rocket.svg' },
          'cyber_cat': { price: 40, name: 'Кибер-Кот', icon: '/gift_cyber_cat.svg' },
          'neon_rose': { price: 25, name: 'Неоновая Роза', icon: '/gift_neon_rose.svg' }
        };

        const giftId = anyMsg.giftId || 'teddy_bear';
        const catalogItem = GIFT_CATALOG[giftId];
        const giftPrice = catalogItem ? catalogItem.price : (parseInt(anyMsg.giftPrice || anyMsg.price, 10) || 20);
        const giftName = anyMsg.giftName || (catalogItem ? catalogItem.name : 'Подарок VesperChat');
        const giftIcon = anyMsg.giftIcon || (catalogItem ? catalogItem.icon : '/gift_teddy.svg');
        const comment = (anyMsg.comment || '').trim();
        let targetUsername = (anyMsg.targetUser || anyMsg.recipient || anyMsg.to || client.username).trim().replace(/^@/, '');
        const isForSelf = !targetUsername || targetUsername.toLowerCase() === client.username.toLowerCase();

        if (isForSelf) {
          targetUsername = client.username;
        }

        const targetAcc = usersMap.get(targetUsername.toLowerCase());
        if (!targetAcc) {
          return sendError(ws, `Пользователь @${targetUsername} не найден!`);
        }

        if (typeof senderAcc.neons !== 'number') senderAcc.neons = 5000;
        if (senderAcc.neons < giftPrice) {
          return sendError(ws, `Недостаточно Неонов! Требуется ${giftPrice} ⚛️, а у вас ${senderAcc.neons} ⚛️`);
        }

        // Deduct from sender
        senderAcc.neons -= giftPrice;
        if (!senderAcc.walletTransactions) senderAcc.walletTransactions = [];

        const dateNow = new Date();
        const giftFormattedTime = dateNow.toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit'
        });

        const giftObj = {
          id: 'gift_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          giftId,
          giftName,
          giftIcon,
          giftPrice,
          from: client.username,
          fromNickname: client.nickname || senderAcc.nickname || client.username,
          fromAvatar: client.avatarUrl || senderAcc.avatarUrl || '',
          fromColor: client.color || senderAcc.color || '#8b5cf6',
          to: targetUsername,
          toNickname: targetAcc.nickname || targetUsername,
          comment: comment || undefined,
          timestamp: Date.now(),
          timestampFormatted: giftFormattedTime
        };

        if (!targetAcc.gifts) targetAcc.gifts = [];
        targetAcc.gifts.unshift(giftObj);

        // Record sender transaction
        senderAcc.walletTransactions.unshift({
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          type: 'spend',
          title: isForSelf ? `Покупка подарка себе «${giftName}»` : `Подарок «${giftName}» для @${targetUsername}`,
          desc: comment || undefined,
          amount: -giftPrice,
          timestamp: Date.now(),
          recipient: `@${targetUsername}`,
          status: 'completed'
        });

        if (!isForSelf) {
          if (!senderAcc.dmContacts) senderAcc.dmContacts = [];
          if (!senderAcc.dmContacts.map(c => c.toLowerCase()).includes(targetUsername.toLowerCase())) {
            senderAcc.dmContacts.push(targetUsername);
          }
          if (!targetAcc.dmContacts) targetAcc.dmContacts = [];
          if (!targetAcc.dmContacts.map(c => c.toLowerCase()).includes(client.username.toLowerCase())) {
            targetAcc.dmContacts.push(client.username);
          }
        }

        saveUsers();
        broadcastGlobalUserList();

        // 1. Notify sender with wallet & gift update
        client.ws.send(JSON.stringify({
          type: 'gift_sent_success',
          neons: senderAcc.neons,
          walletTransactions: senderAcc.walletTransactions,
          gifts: senderAcc.gifts,
          gift: giftObj,
          targetUser: targetUsername,
          isForSelf: isForSelf,
          dmContacts: senderAcc.dmContacts,
          toastMessage: isForSelf 
            ? `🎁 Подарок «${giftName}» добавлен в ваш профиль!`
            : `🎁 Вы успешно подарили «${giftName}» пользователю @${targetAcc.nickname || targetUsername}!`
        }));

        // 2. Notify recipient ONLY (not public) with full details
        if (!isForSelf) {
          for (const c of connectedClients) {
            if (c.username && c.username.toLowerCase() === targetUsername.toLowerCase()) {
              c.ws.send(JSON.stringify({
                type: 'gift_received',
                gifts: targetAcc.gifts,
                gift: giftObj,
                giftName: giftName,
                giftIcon: giftIcon,
                giftPrice: giftPrice,
                from: client.username,
                fromNickname: client.nickname || senderAcc.nickname || client.username,
                fromAvatar: client.avatarUrl || senderAcc.avatarUrl || '',
                fromColor: client.color || senderAcc.color || '#8b5cf6',
                timestampFormatted: giftFormattedTime,
                comment: comment || undefined,
                dmContacts: targetAcc.dmContacts,
                toastMessage: `🎁 @${client.nickname || client.username} подарил(а) вам «${giftName}»!`
              }));
            }
          }
        }

        // 3. Post gift message ONLY in the private DM channel between sender and recipient
        const chatRoom = isForSelf ? (client.room || 'Разговоры') : getDMKey(client.username, targetUsername);
        const giftChatMsg = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'chat',
          room: chatRoom,
          username: client.username,
          nickname: client.nickname || senderAcc.nickname || client.username,
          color: client.color || senderAcc.color || '#8b5cf6',
          avatarUrl: client.avatarUrl || senderAcc.avatarUrl || '',
          content: isForSelf
            ? `🎁 Добавил(а) себе в профиль подарок «${giftName}»`
            : `🎁 Подарил(а) @${targetUsername} подарок «${giftName}»!${comment ? `\n💬 «${comment}»` : ''}`,
          isGift: true,
          giftData: giftObj,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        broadcastToRoom(chatRoom, giftChatMsg as any);
      }

      else if (msg.type === 'admin_give_neons') {
        if (!client.username) return;
        const pwd = (msg.adminPassword || msg.password || '').trim();
        if (pwd !== 'caREND') {
          return sendError(ws, 'Ошибка доступа: неверный пароль администратора!');
        }

        const targetUserRaw = (msg.targetUsername || msg.targetUser || msg.recipient || msg.to || '').trim().replace(/^@/, '').toLowerCase();
        let amount = typeof msg.amount === 'number' ? msg.amount : (parseInt(String(msg.amount || 0), 10) || 0);
        const action = msg.action || (amount < 0 ? 'deduct' : 'add');
        const reason = (msg.reason || msg.comment || '').trim() || (action === 'deduct' ? 'Списание администратором' : 'Начисление администратором');

        if (!targetUserRaw) {
          return sendError(ws, 'Укажите юзернейм получателя!');
        }
        if (isNaN(amount)) {
          return sendError(ws, 'Укажите корректную сумму Неонов!');
        }

        const targetAcc = usersMap.get(targetUserRaw);
        if (!targetAcc) {
          return sendError(ws, `Пользователь @${targetUserRaw} не найден в базе!`);
        }

        if (typeof targetAcc.neons !== 'number') targetAcc.neons = 5000;

        let diff = 0;
        if (action === 'set') {
          diff = amount - targetAcc.neons;
          targetAcc.neons = Math.max(0, amount);
        } else if (action === 'deduct') {
          const toDeduct = Math.abs(amount);
          targetAcc.neons = Math.max(0, targetAcc.neons - toDeduct);
          diff = -toDeduct;
        } else {
          const toAdd = Math.abs(amount);
          targetAcc.neons += toAdd;
          diff = toAdd;
        }

        if (!targetAcc.walletTransactions) targetAcc.walletTransactions = [];

        const adminTx = {
          id: 'tx_adm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          type: diff >= 0 ? 'topup' : 'spend',
          title: diff >= 0 ? 'Административное начисление' : 'Административное списание',
          desc: reason,
          amount: diff,
          timestamp: Date.now(),
          sender: `@${client.username} (Админ)`,
          status: 'completed'
        };

        targetAcc.walletTransactions.unshift(adminTx);
        if (targetAcc.walletTransactions.length > 50) targetAcc.walletTransactions.pop();
        saveUsers();
        broadcastGlobalUserList();

        // Notify target user if connected
        for (const c of connectedClients) {
          if (c.username && c.username.toLowerCase() === targetUserRaw) {
            c.ws.send(JSON.stringify({
              type: 'wallet_updated',
              neons: targetAcc.neons,
              walletTransactions: targetAcc.walletTransactions,
              lastDailyBonusClaim: targetAcc.lastDailyBonusClaim || 0,
              bonusMonthStreak: targetAcc.bonusMonthStreak || 1,
              toastMessage: diff >= 0 
                ? `⚡ Администратор начислил вам +${diff.toLocaleString('ru-RU')} Неонов! (${reason})`
                : `⚠️ Администратор списал ${Math.abs(diff).toLocaleString('ru-RU')} Неонов. (${reason})`
            }));
          }
        }

        // Return updated users list to admin
        const updatedUsers = Array.from(usersMap.values()).map(u => ({
          username: u.username,
          nickname: u.nickname || u.username,
          color: u.color,
          avatarUrl: u.avatarUrl || '',
          neons: typeof u.neons === 'number' ? u.neons : 5000,
          isVip: Boolean(u.isVip),
          isOnline: Array.from(connectedClients).some(c => (c.username || '').toLowerCase() === u.username.toLowerCase()),
          createdAt: u.createdAt,
          txCount: u.walletTransactions ? u.walletTransactions.length : 0
        }));

        client.ws.send(JSON.stringify({
          type: 'admin_action_success',
          users: updatedUsers,
          serverStats: {
            totalUsers: usersMap.size,
            onlineCount: connectedClients.size,
            totalNeons: Array.from(usersMap.values()).reduce((sum, u) => sum + (typeof u.neons === 'number' ? u.neons : 5000), 0)
          },
          notice: `✅ Успешно! @${targetAcc.username}: ${diff >= 0 ? 'начислено +' + diff.toLocaleString('ru-RU') : 'списано ' + diff.toLocaleString('ru-RU')} ⚛️. Новый баланс: ${targetAcc.neons.toLocaleString('ru-RU')} ⚛️`
        }));
      }

    } catch (err) {
      console.error('WebSocket error processing message:', err);
    }
  });

  ws.on('close', () => {
    connectedClients.delete(client);
    removeClientFromAllCalls(client);

    // Clean up QR sessions
    for (const [token, waitingClient] of qrSessions.entries()) {
      if (waitingClient === client) {
        qrSessions.delete(token);
      }
    }

    if (client.room && roomsMap.has(client.room)) {
      const room = roomsMap.get(client.room)!;
      room.clients.delete(client);

      if (client.username && !room.isDM) {
        broadcastUserList(client.room);
      }
    }
    broadcastGlobalUserList();
  });

  ws.on('error', (err) => {
    console.warn('WebSocket client socket error:', err.message);
  });
});



// Helper function to build native 32-bit Windows PE GUI executable launcher (.exe)
function createWindowsExeBuffer(cmdLine: string): Buffer {
  const imageBase = 0x00400000;
  const sectionAlignment = 0x1000;
  const fileAlignment = 0x0200;
  const fileSectionBase = 0x0200;

  const codeRva = 0x1000;
  const iatRva = 0x1030;
  const importDirRva = 0x1040;
  const iltRva = 0x1068;
  const dllNameRva = 0x1078;
  const winexecHintRva = 0x1088;
  const exitprocHintRva = 0x1098;
  const cmdStrRva = 0x10A8;

  const vaCmdStr = imageBase + cmdStrRva;
  const vaIatWinexec = imageBase + iatRva;
  const vaIatExitproc = imageBase + iatRva + 4;

  const code = Buffer.alloc(0x30, 0x90);
  let off = 0;
  code.writeUInt8(0x6A, off++);
  code.writeUInt8(0x00, off++);
  code.writeUInt8(0x68, off++);
  code.writeUInt32LE(vaCmdStr, off); off += 4;
  code.writeUInt8(0xFF, off++);
  code.writeUInt8(0x15, off++);
  code.writeUInt32LE(vaIatWinexec, off); off += 4;
  code.writeUInt8(0x6A, off++);
  code.writeUInt8(0x00, off++);
  code.writeUInt8(0xFF, off++);
  code.writeUInt8(0x15, off++);
  code.writeUInt32LE(vaIatExitproc, off); off += 4;
  code.writeUInt8(0xC3, off++);

  const iat = Buffer.alloc(12);
  iat.writeUInt32LE(winexecHintRva, 0);
  iat.writeUInt32LE(exitprocHintRva, 4);
  iat.writeUInt32LE(0, 8);

  const importDir = Buffer.alloc(40, 0);
  importDir.writeUInt32LE(iltRva, 0);
  importDir.writeUInt32LE(0, 4);
  importDir.writeUInt32LE(0, 8);
  importDir.writeUInt32LE(dllNameRva, 12);
  importDir.writeUInt32LE(iatRva, 16);

  const ilt = Buffer.alloc(12);
  ilt.writeUInt32LE(winexecHintRva, 0);
  ilt.writeUInt32LE(exitprocHintRva, 4);
  ilt.writeUInt32LE(0, 8);

  const dllNameBytes = Buffer.from('kernel32.dll\0', 'ascii');
  const winexecHintBytes = Buffer.from('\0\0WinExec\0', 'ascii');
  const exitprocHintBytes = Buffer.from('\0\0ExitProcess\0', 'ascii');
  const cmdBytes = Buffer.from(cmdLine + '\0', 'utf-8');

  let secBody = Buffer.alloc(0);
  function appendBuf(b: Buffer) { secBody = Buffer.concat([secBody, b]); }
  function padTo(targetLen: number) {
    if (secBody.length < targetLen) {
      secBody = Buffer.concat([secBody, Buffer.alloc(targetLen - secBody.length, 0)]);
    }
  }

  appendBuf(code);              // 0x00
  appendBuf(iat);               // 0x30
  padTo(0x40);
  appendBuf(importDir);         // 0x40
  padTo(0x68);
  appendBuf(ilt);               // 0x68
  padTo(0x78);
  appendBuf(dllNameBytes);      // 0x78
  padTo(0x88);
  appendBuf(winexecHintBytes);  // 0x88
  padTo(0x98);
  appendBuf(exitprocHintBytes); // 0x98
  padTo(0xA8);
  appendBuf(cmdBytes);          // 0xA8

  const secRawSize = Math.ceil(secBody.length / fileAlignment) * fileAlignment;
  const secVirtSize = Math.ceil(secBody.length / sectionAlignment) * sectionAlignment;
  padTo(secRawSize);

  const dosHeader = Buffer.alloc(64, 0);
  dosHeader.write('MZ', 0, 'ascii');
  dosHeader.writeUInt32LE(0x80, 60);

  const dosStub = Buffer.alloc(64, 0);
  const stubContent = Buffer.from([
    0x0E, 0x1F, 0xBA, 0x0E, 0x00, 0xB4, 0x09, 0xCD, 0x21, 0xB8, 0x01, 0x4C, 0xCD, 0x21,
    0x54, 0x68, 0x69, 0x73, 0x20, 0x70, 0x72, 0x6F, 0x67, 0x72, 0x61, 0x6D, 0x20, 0x63,
    0x61, 0x6E, 0x6E, 0x6F, 0x74, 0x20, 0x62, 0x65, 0x20, 0x72, 0x75, 0x6E, 0x20, 0x69,
    0x6E, 0x20, 0x44, 0x4F, 0x53, 0x20, 0x6D, 0x6F, 0x64, 0x65, 0x2E, 0x0D, 0x0D, 0x0A,
    0x24, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  stubContent.copy(dosStub, 0);

  const peSig = Buffer.from('PE\0\0', 'ascii');

  const coffHeader = Buffer.alloc(20, 0);
  coffHeader.writeUInt16LE(0x014C, 0);
  coffHeader.writeUInt16LE(1, 2);
  coffHeader.writeUInt16LE(224, 16);
  coffHeader.writeUInt16LE(0x0102, 18);

  const optHeader = Buffer.alloc(224, 0);
  let o = 0;
  optHeader.writeUInt16LE(0x010B, o); o += 2;
  optHeader.writeUInt8(14, o++);
  optHeader.writeUInt8(0, o++);
  optHeader.writeUInt32LE(secRawSize, o); o += 4;
  optHeader.writeUInt32LE(0, o); o += 4;
  optHeader.writeUInt32LE(0, o); o += 4;
  optHeader.writeUInt32LE(codeRva, o); o += 4;
  optHeader.writeUInt32LE(codeRva, o); o += 4;
  optHeader.writeUInt32LE(0x1000, o); o += 4;
  optHeader.writeUInt32LE(imageBase, o); o += 4;
  optHeader.writeUInt32LE(sectionAlignment, o); o += 4;
  optHeader.writeUInt32LE(fileAlignment, o); o += 4;
  optHeader.writeUInt16LE(6, o); o += 2;
  optHeader.writeUInt16LE(0, o); o += 2;
  optHeader.writeUInt16LE(0, o); o += 2;
  optHeader.writeUInt16LE(0, o); o += 2;
  optHeader.writeUInt16LE(6, o); o += 2;
  optHeader.writeUInt16LE(0, o); o += 2;
  optHeader.writeUInt32LE(0, o); o += 4;
  optHeader.writeUInt32LE(sectionAlignment + secVirtSize, o); o += 4;
  optHeader.writeUInt32LE(fileSectionBase, o); o += 4;
  optHeader.writeUInt32LE(0, o); o += 4;
  optHeader.writeUInt16LE(2, o); o += 2; // IMAGE_SUBSYSTEM_WINDOWS_GUI
  optHeader.writeUInt16LE(0x8000, o); o += 2;
  optHeader.writeUInt32LE(0x100000, o); o += 4;
  optHeader.writeUInt32LE(0x1000, o); o += 4;
  optHeader.writeUInt32LE(0x100000, o); o += 4;
  optHeader.writeUInt32LE(0x1000, o); o += 4;
  optHeader.writeUInt32LE(0, o); o += 4;
  optHeader.writeUInt32LE(16, o); o += 4;

  optHeader.writeUInt32LE(importDirRva, 96 + 8);
  optHeader.writeUInt32LE(40, 96 + 12);
  optHeader.writeUInt32LE(iatRva, 96 + 96);
  optHeader.writeUInt32LE(12, 96 + 100);

  const secHeader = Buffer.alloc(40, 0);
  secHeader.write('.text\0\0\0', 0, 'ascii');
  secHeader.writeUInt32LE(secVirtSize, 8);
  secHeader.writeUInt32LE(codeRva, 12);
  secHeader.writeUInt32LE(secRawSize, 16);
  secHeader.writeUInt32LE(fileSectionBase, 20);
  secHeader.writeUInt32LE(0x60000020, 36);

  let headers = Buffer.concat([dosHeader, dosStub, peSig, coffHeader, optHeader, secHeader]);
  if (headers.length < fileSectionBase) {
    headers = Buffer.concat([headers, Buffer.alloc(fileSectionBase - headers.length, 0)]);
  }

  return Buffer.concat([headers, secBody]);
}

// Serve direct downloadable CyberChord.exe (Launches local index.html app without localhost dependency)
const handleExeDownload = (req: express.Request, res: express.Response) => {
  const launchCmd = `cmd.exe /c start msedge --app="%CD%\\index.html" || start chrome --app="%CD%\\index.html" || start "" "%CD%\\index.html"`;
  const exeBuffer = createWindowsExeBuffer(launchCmd);

  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', 'attachment; filename="CyberChord.exe"');
  res.setHeader('Content-Length', exeBuffer.length.toString());
  return res.send(exeBuffer);
};

app.get('/download/CyberChord.exe', handleExeDownload);
app.get('/api/download-exe', handleExeDownload);

// Serve PowerShell installation script
const handleInstallPs1 = (req: express.Request, res: express.Response) => {
  const host = req.headers.host || 'ais-dev-qlpdofbuctuxkj4rb7scoc-339218718444.us-east5.run.app';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const appUrl = `${proto}://${host}`;

  const psScript = `$Host.UI.RawUI.WindowTitle = 'Установщик CyberChord';
Clear-Host;
Write-Host '============================================================' -ForegroundColor Cyan;
Write-Host '           УСТАНОВЩИК ПРИЛОЖЕНИЯ CYBERCHORD MESSENGER' -ForegroundColor Yellow;
Write-Host '============================================================' -ForegroundColor Cyan;
Write-Host '';
$defaultDir = "$env:USERPROFILE\\Desktop\\CyberChord";
Write-Host "Папка установки по умолчанию: $defaultDir" -ForegroundColor Gray;
Write-Host '';
$inputDir = Read-Host "Введите путь к папке установки (или нажмите Enter для выбора по умолчанию): ";
if ([string]::IsNullOrWhitespace($inputDir)) { $installDir = $defaultDir } else { $installDir = $inputDir };

Write-Host '';
Write-Host "[1/3] Создание папки установки: $installDir ..." -ForegroundColor Green;
New-Item -ItemType Directory -Path $installDir -Force | Out-Null;

Write-Host "[2/3] Скачивание файлов приложения в папку..." -ForegroundColor Green;
$htmlPath = Join-Path $installDir 'index.html';
$exePath = Join-Path $installDir 'CyberChord.exe';

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;
(New-Object System.Net.WebClient).DownloadFile('${appUrl}/', $htmlPath);
(New-Object System.Net.WebClient).DownloadFile('${appUrl}/download/CyberChord.exe', $exePath);

Write-Host "[3/3] Создание ярлыка на Рабочем Столе..." -ForegroundColor Green;
$desktop = [System.Environment]::GetFolderPath('Desktop');
$shortcutPath = Join-Path $desktop 'CyberChord.lnk';
$ws = New-Object -ComObject WScript.Shell;
$s = $ws.CreateShortcut($shortcutPath);
$s.TargetPath = $exePath;
$s.WorkingDirectory = $installDir;
$s.Save();

Write-Host '';
Write-Host '============================================================' -ForegroundColor Cyan;
Write-Host '  Установка успешно завершена!' -ForegroundColor Green;
Write-Host "  Файлы установлены в папку: $installDir" -ForegroundColor White;
Write-Host '  Ярлык приложения создан на Рабочем Столе.' -ForegroundColor White;
Write-Host '============================================================' -ForegroundColor Cyan;
Write-Host '';
Write-Host 'Запуск CyberChord...' -ForegroundColor Yellow;
Start-Process $exePath;
Start-Sleep -Seconds 2;
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send(psScript);
};

app.get('/download/install.ps1', handleInstallPs1);

// Interactive Windows Setup Installer (.exe) - Executes short PowerShell bootstrap command
const handleSetupExeDownload = (req: express.Request, res: express.Response) => {
  const host = req.headers.host || 'ais-dev-qlpdofbuctuxkj4rb7scoc-339218718444.us-east5.run.app';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const appUrl = `${proto}://${host}`;

  const shortCmd = `powershell -ExecutionPolicy Bypass -Command "iwr '${appUrl}/download/install.ps1' -O '$env:TEMP\\s.ps1'; & '$env:TEMP\\s.ps1'"`;
  const exeBuffer = createWindowsExeBuffer(shortCmd);

  res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
  res.setHeader('Content-Disposition', 'attachment; filename="CyberChord_Setup.exe"');
  res.setHeader('Content-Length', exeBuffer.length.toString());
  return res.send(exeBuffer);
};

app.get('/download/CyberChord_Setup.exe', handleSetupExeDownload);
app.get('/api/download-installer', handleSetupExeDownload);

// Downloadable Batch Script Setup (.bat / .cmd)
const handleSetupBatDownload = (req: express.Request, res: express.Response) => {
  const host = req.headers.host || 'ais-dev-qlpdofbuctuxkj4rb7scoc-339218718444.us-east5.run.app';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const appUrl = `${proto}://${host}`;

  const batContent = `@echo off
chcp 65001 >nul
title Установщик CyberChord Messenger
color 0A
cls
echo ============================================================
echo           УСТАНОВКА ПРИЛОЖЕНИЯ CYBERCHORD MESSENGER
echo ============================================================
echo.
set "DEFAULT_DIR=%USERPROFILE%\\Desktop\\CyberChord"
echo Папка установки по умолчанию: %DEFAULT_DIR%
echo.
set /p "INSTALL_DIR=Введите путь к папке установки (или Enter для выбора по умолчанию): "
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%DEFAULT_DIR%"

echo.
echo [1/3] Создание папки установки: %INSTALL_DIR% ...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [2/3] Скачивание файлов приложения в папку...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object System.Net.WebClient; $wc.DownloadFile('${appUrl}/', '%INSTALL_DIR%\\index.html'); $wc.DownloadFile('${appUrl}/download/CyberChord.exe', '%INSTALL_DIR%\\CyberChord.exe')"

echo [3/3] Создание ярлыка на Рабочем Столе...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%USERPROFILE%\\Desktop\\CyberChord.lnk'); $s.TargetPath = '%INSTALL_DIR%\\CyberChord.exe'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Save()"

echo.
echo ============================================================
echo   Установка успешно завершена!
echo   Файлы установлены в папку: %INSTALL_DIR%
echo   Ярлык приложения создан на Рабочем Столе.
echo ============================================================
echo.
echo Запуск CyberChord...
cd /d "%INSTALL_DIR%"
start "" "%INSTALL_DIR%\\CyberChord.exe"
timeout /t 3 >nul
exit
`;

  res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="CyberChord_Setup.bat"');
  return res.send(batContent);
};

app.get('/download/CyberChord_Setup.bat', handleSetupBatDownload);
app.get('/download/CyberChord_Setup.cmd', handleSetupBatDownload);

// Serve Real Native Signed Android APK
const handleApkDownload = (req: express.Request, res: express.Response) => {
  const apkPath = path.join(APP_ROOT, 'public', 'downloads', 'VesperChat_v2.4.apk');
  try {
    if (!fs.existsSync(apkPath)) {
      console.log('Building APK on demand...');
      execSync('python3 scripts/build_apk.py', { stdio: 'inherit' });
    }
    const apkBuffer = fs.readFileSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="VesperChat_v2.4.apk"');
    res.setHeader('Content-Length', apkBuffer.length.toString());
    return res.send(apkBuffer);
  } catch (err) {
    console.error('Error serving APK:', err);
    res.status(500).json({ error: 'Failed to generate APK package' });
  }
};

app.get('/download/VesperChat_v2.4.apk', handleApkDownload);
app.get('/download/VesperChat.apk', handleApkDownload);
app.get('/api/download-apk', handleApkDownload);

app.get('/api/database/info', async (req, res) => {
  try {
    const db = await getSqliteDb();
    const userCountStmt = db.prepare("SELECT count(*) as count FROM users");
    userCountStmt.step();
    const userCount = userCountStmt.getAsObject().count || 0;
    userCountStmt.free();

    const roomCountStmt = db.prepare("SELECT count(*) as count FROM rooms");
    roomCountStmt.step();
    const roomCount = roomCountStmt.getAsObject().count || 0;
    roomCountStmt.free();

    const msgCountStmt = db.prepare("SELECT count(*) as count FROM messages");
    msgCountStmt.step();
    const msgCount = msgCountStmt.getAsObject().count || 0;
    msgCountStmt.free();

    const suggCountStmt = db.prepare("SELECT count(*) as count FROM suggestions");
    suggCountStmt.step();
    const suggCount = suggCountStmt.getAsObject().count || 0;
    suggCountStmt.free();

    const sqlitePath = path.join(DATA_DIR, 'vesperchat.sqlite');
    let fileSize = 0;
    if (fs.existsSync(sqlitePath)) {
      fileSize = fs.statSync(sqlitePath).size;
    }

    res.json({
      engine: 'SQLite 3 (Embedded Relational Database)',
      storageFile: 'data/vesperchat.sqlite',
      fileSizeBytes: fileSize,
      tables: {
        users: userCount,
        rooms: roomCount,
        messages: msgCount,
        suggestions: suggCount
      },
      status: 'healthy'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// WEB PUSH & SERVICE WORKER API ENDPOINTS
// ==========================================================================

// Get VAPID Public Key for client subscription
app.get('/api/push/vapid-public-key', (req, res) => {
  try {
    const key = getVapidPublicKey();
    res.json({ publicKey: key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Register or update user push subscription
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { username, subscription } = req.body;
    if (!username || !subscription) {
      return res.status(400).json({ error: 'Username and subscription are required' });
    }
    const userAgent = req.headers['user-agent'] || '';
    const success = await savePushSubscription(username, subscription, userAgent);
    if (success) {
      res.json({ success: true, message: `Subscribed @${username} to Web Push` });
    } else {
      res.status(500).json({ error: 'Failed to save push subscription' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unsubscribe endpoint
app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await removePushSubscription(endpoint);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send a test push notification to user
app.post('/api/push/test', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const result = await sendPushToUser(username, {
      title: '🔔 Тестовое Push-уведомление',
      body: `Привет, @${username}! Service Worker успешно работает и готов присылать уведомления даже при закрытой вкладке.`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: '/',
        timestamp: Date.now()
      }
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get user push subscription status
app.get('/api/push/status', async (req, res) => {
  try {
    const username = String(req.query.username || '');
    if (!username) {
      return res.json({ registered: false, count: 0 });
    }
    const subs = await getUserSubscriptions(username);
    res.json({
      registered: subs.length > 0,
      count: subs.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/manifest.json', '/manifest.webmanifest'], (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.json({
    name: "VesperChat",
    short_name: "VesperChat",
    description: "Защищенный игровой мессенджер с видеозвонками, сторис и шифрованием",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0d0a1a",
    theme_color: "#8b5cf6",
    categories: ["social", "communication"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      }
    ]
  });
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  const swPath = path.join(APP_ROOT, 'public', 'sw.js');
  if (fs.existsSync(swPath)) {
    res.sendFile(swPath);
  } else {
    res.send(`
      self.addEventListener('install', (e) => self.skipWaiting());
      self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
    `);
  }
});

app.get(['/', '/index.html'], (req, res) => {
  const rootIndex = path.join(APP_ROOT, 'index.html');
  const distIndex = path.join(APP_ROOT, 'dist', 'index.html');
  if (fs.existsSync(rootIndex)) {
    res.sendFile(rootIndex);
  } else if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.status(200).send('VesperChat Server is running.');
  }
});


// server.listen was here, moved to the initialization IIFE above
