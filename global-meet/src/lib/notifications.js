// 웹 푸시 알림 (PRD 4.10 / TRD 4.8)
//
// 알림을 켜고 끄는 층은 두 개다. 둘을 헷갈리지 말 것:
//
//   1) 기기(OS/브라우저) 권한  — 사용자가 휴대폰 설정에서 끈다.
//      앱은 이걸 되돌릴 수 없다. 한 번 "차단"되면 코드로는 못 푼다.
//   2) 앱 설정 스위치         — 이 기기의 FCM 토큰을 내 프로필에 등록/해제한다.
//      토큰이 없으면 서버가 보낼 곳을 몰라 알림이 가지 않는다.
//
// 즉 "휴대폰에서 끄기"와 "앱에서 끄기"가 각각 독립적으로 동작한다.

import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { app, db } from './firebase';
import { COL } from './collections';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const SEND_FN = '/.netlify/functions/send-notification';

// 이 기기에 등록한 토큰. 끌 때 어떤 토큰을 지울지 알아야 한다.
const TOKEN_STORAGE_KEY = 'jiniplus_fcm_token';

let messagingPromise = null;
const getMessagingIfSupported = async () => {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((ok) => (ok ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
};

/** iOS 는 홈 화면에 설치(standalone)해야만 웹 푸시가 동작한다. */
export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)')?.matches ||
  window.navigator.standalone === true;

/** 이 브라우저가 웹 푸시를 지원하는가 */
export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const permissionState = () =>
  (isPushSupported() ? Notification.permission : 'unsupported');

export const hasVapidKey = () => Boolean(VAPID_KEY);

/**
 * 알림을 켠다. 권한 요청 → FCM 토큰 발급 → 내 프로필에 저장.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function enablePush(uid) {
  if (!uid) return { ok: false, reason: 'no-user' };
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (isIos() && !isStandalone()) return { ok: false, reason: 'ios-needs-install' };
  if (!VAPID_KEY) return { ok: false, reason: 'no-vapid-key' };

  // 이미 "차단"이면 브라우저가 다시 묻지 않는다. 기기 설정에서 풀어야 한다.
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const messaging = await getMessagingIfSupported();
  if (!messaging) return { ok: false, reason: 'unsupported' };

  try {
    // FCM 기본 파일명(firebase-messaging-sw.js) 대신 우리 SW 를 쓰도록 명시한다.
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'no-token' };

    await updateDoc(doc(db, COL.users, uid), { fcmTokens: arrayUnion(token) });
    try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch { /* noop */ }
    return { ok: true };
  } catch (err) {
    console.warn('[push] 토큰 발급 실패:', err?.message);
    return { ok: false, reason: 'token-error' };
  }
}

/**
 * 이 기기에서만 알림을 끈다. 다른 기기의 토큰은 건드리지 않는다.
 * OS 권한 자체는 코드로 되돌릴 수 없으므로 기기 설정 안내가 별도로 필요하다.
 */
export async function disablePush(uid) {
  let token = '';
  try { token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''; } catch { /* noop */ }

  if (uid && token) {
    await updateDoc(doc(db, COL.users, uid), { fcmTokens: arrayRemove(token) }).catch(() => {});
  }
  try {
    const messaging = await getMessagingIfSupported();
    if (messaging) await deleteToken(messaging).catch(() => {});
  } catch { /* noop */ }
  try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* noop */ }
}

/** 이 기기가 알림 대상으로 등록돼 있는가 (앱 설정 스위치의 상태) */
export const isDeviceRegistered = (userProfile) => {
  let token = '';
  try { token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''; } catch { /* noop */ }
  if (!token) return false;
  return Boolean(userProfile?.fcmTokens?.includes(token));
};

/**
 * 앱이 화면에 떠 있을 때 오는 메시지.
 * 이 경우 SW 의 onBackgroundMessage 는 실행되지 않는다.
 * 지금 보고 있는 대화방이면 알림을 띄우지 않는 것이 자연스럽다.
 */
export async function onForegroundMessage(handler) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}

/** 이미 확인한 대화방의 알림을 잠금화면에서 지운다 */
export function clearRoomNotifications(roomId) {
  if (!roomId || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_NOTIF', tag: `chat-${roomId}` });
}

/**
 * 대화방 멤버에게 새 메시지 알림을 보낸다.
 * 실패해도 메시지 전송 자체는 이미 끝났으므로 조용히 넘어간다.
 */
export async function notifyRoomMembers({ roomId, roomName, senderName, senderEmail, text, recipients }) {
  const targets = (recipients || []).filter((e) => e && e !== senderEmail);
  if (targets.length === 0) return;

  try {
    await fetch(SEND_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: roomName ? `${roomName} · ${senderName}` : senderName,
        body: text,
        url: '/',
        tag: `chat-${roomId}`,     // 같은 방은 하나의 알림으로 계속 교체된다
        roomId,
        recipientEmails: targets,
        senderEmail,
      }),
    });
  } catch (err) {
    console.warn('[push] 알림 발송 실패:', err?.message);
  }
}
