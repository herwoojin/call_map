/* eslint-env serviceworker */
/* global importScripts, firebase */

// 서비스 워커 — PWA 캐싱 + FCM 백그라운드 알림을 하나의 파일에서 처리한다.
// 여러 세대의 SW 가 공존하면 캐시와 알림이 어긋나므로 이 파일 하나만 등록하고,
// index.html 에서 나머지 SW 는 전부 unregister 한다.

const CACHE_NAME = 'jiniplus-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
];

// ─────────────────────────────────────────────
// 설치 / 활성화
// ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // 하나라도 실패해도 설치는 진행한다 (오프라인 폴백이 없는 것보다 낫다)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ─────────────────────────────────────────────
// fetch — Network First
// Firestore/구글 API 응답은 절대 캐시하지 않는다. 캐시하면 실시간 구독이
// 옛 데이터를 물고 늘어져 대화가 갱신되지 않는다.
// ─────────────────────────────────────────────
const NO_CACHE = /(?:firestore|googleapis|gstatic|firebaseio|identitytoolkit|\/\.netlify\/functions\/)/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin && NO_CACHE.test(request.url)) return;
  if (NO_CACHE.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // 페이지 이동인데 네트워크도 캐시도 없으면 오프라인 안내
        if (request.mode === 'navigate') {
          return (await caches.match('/offline.html')) || Response.error();
        }
        return Response.error();
      }),
  );
});

// ─────────────────────────────────────────────
// FCM 백그라운드 알림
// 앱 화면이 닫혀 있거나 백그라운드일 때는 여기서 알림을 띄운다.
// (앱이 화면에 떠 있을 때는 SW 가 아니라 페이지의 onMessage 가 받는다)
// ─────────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB4b-G7Ps-hnQiwZhjBOWE6tpxnRw7a4iE',
  authDomain: 'gen-lang-client-0283055211.firebaseapp.com',
  projectId: 'gen-lang-client-0283055211',
  storageBucket: 'gen-lang-client-0283055211.firebasestorage.app',
  messagingSenderId: '997651572284',
  appId: '1:997651572284:web:cff45cef6d593e82eac539',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};

  // ★ 태그에 Date.now() 를 쓰면 안 된다.
  // 같은 대화방의 알림이 매번 새 알림으로 쌓여 잠금화면을 도배한다.
  // 서버가 보낸 안정적인 태그를 그대로 써야 브라우저가 이전 것을 교체한다.
  const tag = data.tag || data.type || 'general';

  self.registration.showNotification(data.title || '새 메시지', {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    renotify: true, // 교체하되 알림음은 다시 울린다
    data: { url: data.url || '/', tag, roomId: data.roomId || '' },
    vibrate: [200, 100, 200],
  });
});

// 알림 클릭 → 이미 열린 탭이 있으면 그쪽으로, 없으면 새로 연다
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// ─────────────────────────────────────────────
// 페이지 → SW 메시지
// 사용자가 대화방을 열면 그 방의 남은 알림을 지운다.
// "이미 확인한 대화는 알림이 남아 있으면 안 된다"를 보장하는 장치.
// ─────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, tag } = event.data || {};

  if (type === 'CLEAR_NOTIF') {
    event.waitUntil(
      self.registration.getNotifications(tag ? { tag } : {})
        .then((list) => list.forEach((n) => n.close()))
        .catch(() => {}),
    );
  }

  if (type === 'SKIP_WAITING') self.skipWaiting();
});
