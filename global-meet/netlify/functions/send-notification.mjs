// FCM 발송 (PRD 4.10 F-NOTI-03 / TRD 4.8)
//
// 입력 POST {
//   title, body, url, tag, roomId,
//   recipientEmails: string[],   // 받을 사람 (소문자 이메일)
//   senderEmail: string          // 보낸 사람 — 자기 자신에게는 보내지 않는다
// }
//
// 필요한 환경변수 (Netlify → Site settings → Environment variables):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY      ← 서비스 계정 JSON 의 private_key. 줄바꿈은 \n 으로.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const USERS = 'callMapUsers'; // src/lib/collections.js 의 COL.users 와 반드시 일치

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

const json = (statusCode, obj) => ({ statusCode, headers: CORS, body: JSON.stringify(obj) });

// FCM Topic 헤더는 URL-safe 문자만, 최대 32자.
// 오프라인 상태에서 같은 Topic 이 여러 개 쌓이면 최신 것만 배달된다.
const sanitizeTopic = (tag) =>
  String(tag || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'default';

let ready = false;
const ensureApp = () => {
  if (ready || getApps().length) { ready = true; return; }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('missing-admin-credentials');
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  ready = true;
};

// Firestore 의 'in' 쿼리는 한 번에 30개까지만 받는다.
const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'method-not-allowed' });

  try {
    ensureApp();
  } catch (err) {
    // 환경변수가 없으면 알림만 조용히 포기한다. 채팅 자체는 이미 저장됐다.
    return json(200, { sent: 0, skipped: 'not-configured', detail: String(err.message) });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { title, body, url, tag, roomId, recipientEmails, senderEmail } = payload;

    const sender = String(senderEmail || '').toLowerCase();
    const targets = [...new Set(
      (recipientEmails || []).map((e) => String(e || '').toLowerCase()).filter((e) => e && e !== sender),
    )];
    if (targets.length === 0) return json(200, { sent: 0, reason: 'no-recipients' });

    const db = getFirestore();

    // 받는 사람들의 기기 토큰을 모은다 (한 사람이 여러 기기를 쓸 수 있다)
    const tokenOwners = new Map(); // token → 소유자 문서 ref
    for (const group of chunk(targets, 30)) {
      const snap = await db.collection(USERS).where('emailLower', 'in', group).get();
      snap.forEach((docSnap) => {
        for (const token of docSnap.get('fcmTokens') || []) {
          if (token) tokenOwners.set(token, docSnap.ref);
        }
      });
    }

    const tokens = [...tokenOwners.keys()];
    if (tokens.length === 0) return json(200, { sent: 0, reason: 'no-tokens' });

    const topic = sanitizeTopic(tag);
    const messaging = getMessaging();

    // data-only 로 보낸다. notification 필드를 함께 넣으면 브라우저가 자체
    // 알림을 한 번 더 띄워 같은 내용이 두 개 뜬다.
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title: String(title || '새 메시지'),
        body: String(body || '').slice(0, 300),
        url: String(url || '/'),
        tag: String(tag || 'general'),
        roomId: String(roomId || ''),
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400', Topic: topic },
      },
      android: { priority: 'high' },
    });

    // 더 이상 유효하지 않은 토큰은 프로필에서 지운다.
    // 안 지우면 기기를 바꿀 때마다 죽은 토큰이 쌓여 발송이 느려진다.
    const stale = [];
    response.responses.forEach((r, i) => {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        stale.push(tokens[i]);
      }
    });
    if (stale.length) {
      const { FieldValue } = await import('firebase-admin/firestore');
      await Promise.all(stale.map((token) =>
        tokenOwners.get(token).update({ fcmTokens: FieldValue.arrayRemove(token) }).catch(() => {}),
      ));
    }

    return json(200, {
      sent: response.successCount,
      failed: response.failureCount,
      removed: stale.length,
    });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
};
