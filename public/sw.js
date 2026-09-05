// ==========================================================================
// VesperChat PWA Service Worker - Push Notifications & Background Worker
// ==========================================================================

const CACHE_NAME = 'vesperchat-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.png'
];

// 1. Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
});

// 2. Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

// 3. Push Event - Handles Background & Inactive Tab Notifications
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'VesperChat',
        body: event.data.text() || 'Новое сообщение в VesperChat'
      };
    }
  } else {
    data = {
      title: 'VesperChat',
      body: 'Новое сообщение'
    };
  }

  const title = data.title || 'VesperChat Messenger';
  const options = {
    body: data.body || 'Вам пришло новое сообщение',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    image: data.image || undefined,
    tag: data.tag || 'vesperchat_message',
    renotify: true,
    data: data.data || {
      url: '/',
      timestamp: Date.now()
    },
    vibrate: data.vibrate || [100, 50, 100],
    actions: data.actions || [
      { action: 'open', title: '💬 Открыть чат' },
      { action: 'dismiss', title: 'Закрыть' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 4. Notification Click Event - Opens/Focuses chat window on click
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const notifData = notification.data || {};

  notification.close();

  if (action === 'dismiss') {
    return;
  }

  const targetUrl = notifData.url || '/';
  const targetRoom = notifData.room || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Look for an existing open window/tab of VesperChat
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          if (targetRoom) {
            client.postMessage({
              type: 'PUSH_NAVIGATE_ROOM',
              room: targetRoom,
              author: notifData.author
            });
          }
          return;
        }
      }

      // If no open window found, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// 5. Message Event (Client <-> SW Communication)
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'TEST_NOTIFICATION') {
    self.registration.showNotification(event.data.title || '🔔 VesperChat Push Test', {
      body: event.data.body || 'Service Worker активен и успешно получает уведомления!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'vesperchat_test',
      data: { url: '/' },
      vibrate: [100, 50, 100]
    });
  }
});

// 6. Fetch Event - Pass-through with static asset cache fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip WebSocket, API calls, and dynamic uploads from cache
  if (
    event.request.url.startsWith('ws:') ||
    event.request.url.startsWith('wss:') ||
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then((res) => {
        if (res) return res;
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
