// 챗.첵 번역 · 음성 클라이언트.
//
// 번역/TTS 는 Netlify Function 프록시를 통해 나간다(netlify/functions/*.mjs).
// vite dev 서버에는 Function 이 없으므로, 실패하면 브라우저에서 직접
// 호출하는 경로로 한 번 더 시도한다. 그것도 막히면 예외를 던진다.

import { speechTag } from './languages';

const TRANSLATE_FN = '/.netlify/functions/translate';
const TTS_FN = '/.netlify/functions/tts';
const GTX = 'https://translate.googleapis.com/translate_a/single';

// gtx 응답 파싱. netlify/functions/translate.mjs 의 parseGtx 와 같은 형태를 만든다.
// (Function 번들과 앱 번들이 분리되어 있어 import 로 공유하지 않고 각자 둔다)
const parseGtx = (data) => {
  let text = '';
  let romanization = '';
  for (const seg of data?.[0] || []) {
    if (typeof seg?.[0] === 'string') text += seg[0];
    if (typeof seg?.[3] === 'string') romanization += seg[3];
  }
  return { text, romanization: romanization.trim(), detected: data?.[2] || '' };
};

/**
 * 텍스트를 번역한다.
 * @returns {Promise<{text:string, romanization:string, detected:string}>}
 *   romanization 은 "원문"의 로마자 표기 (발음 표기용). 없을 수도 있다.
 */
export async function translateText(text, target, source = 'auto') {
  const body = JSON.stringify({ text, target, source });

  // 1차: Netlify Function
  try {
    const res = await fetch(TRANSLATE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) return await res.json();
  } catch {
    /* 아래 직접 호출로 폴백 */
  }

  // 2차: 브라우저에서 직접 (주로 로컬 dev 용)
  const url = `${GTX}?client=gtx&sl=${encodeURIComponent(source || 'auto')}`
    + `&tl=${encodeURIComponent(target)}&dt=t&dt=rm&q=${encodeURIComponent(String(text).slice(0, 2000))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`translate failed: ${res.status}`);
  const parsed = parseGtx(await res.json());
  if (!parsed.text) throw new Error('translate failed: empty');
  return parsed;
}

/**
 * TTS 200자 제한 대응 — 문장 경계로 자른다. (TRD 4.5)
 * 그냥 잘라내면 문장이 중간에 끊기므로 문장 → 쉼표 → 공백 → 강제컷 순으로 시도한다.
 */
export function chunkTextForTTS(text, maxLen = 190) {
  const out = [];
  const sentences = String(text || '').split(/(?<=[.!?。！？…])\s+/);

  for (const raw of sentences) {
    let s = raw.trim();
    if (!s) continue;
    if (s.length <= maxLen) { out.push(s); continue; }

    while (s.length > maxLen) {
      const win = s.slice(0, maxLen + 1);
      let cut = Math.max(
        win.lastIndexOf(', '), win.lastIndexOf('; '),
        win.lastIndexOf('、'), win.lastIndexOf('，'),
      );
      if (cut < 40) cut = win.lastIndexOf(' ');
      if (cut < 40) cut = maxLen;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  }
  return out.filter(Boolean);
}

// 브라우저 내장 음성 합성. 프록시가 실패했을 때의 최후 수단.
const speakWithBrowser = (text, lang) => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechTag(lang);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
};

/**
 * 원문을 소리내어 읽는다.
 *
 * 긴 글은 조각내어 순차 재생하며, HTMLAudioElement 와 비슷한 인터페이스
 * (.play() / .pause() / onended / onerror) 를 가진 컨트롤러를 돌려준다.
 * 호출측은 재생 중인 컨트롤러를 들고 있다가 pause() 로 멈추면 된다.
 */
export function playTTS(text, lang = 'ko') {
  const chunks = chunkTextForTTS(text, 190);
  const tag = speechTag(lang);

  let idx = 0;
  let current = null;
  let stopped = false;
  let playedOne = false;
  const handlers = { onended: null, onerror: null };

  const playNext = () => {
    if (stopped) return Promise.resolve();
    if (idx >= chunks.length) { handlers.onended?.(); return Promise.resolve(); }

    const chunk = chunks[idx++];
    const audio = new Audio(`${TTS_FN}?lang=${encodeURIComponent(tag)}&text=${encodeURIComponent(chunk)}`);
    current = audio;

    audio.onended = () => { playedOne = true; current = null; playNext(); };
    audio.onerror = () => {
      current = null;
      // 앞 조각이 이미 재생됐다면 조용히 종료 (처음부터 다시 읽는 것을 막는다)
      if (playedOne) { handlers.onended?.(); return; }
      // 프록시가 아예 안 되는 환경(dev 등) → 브라우저 음성으로
      if (speakWithBrowser(text, lang)) { handlers.onended?.(); return; }
      handlers.onerror?.();
    };

    return audio.play().catch(() => {
      if (playedOne) { handlers.onended?.(); return; }
      if (speakWithBrowser(text, lang)) { handlers.onended?.(); return; }
      handlers.onerror?.();
    });
  };

  return {
    get onended() { return handlers.onended; },
    set onended(fn) { handlers.onended = fn; },
    get onerror() { return handlers.onerror; },
    set onerror(fn) { handlers.onerror = fn; },
    play: playNext,
    pause() {
      stopped = true;
      try { current?.pause(); } catch { /* noop */ }
      try { speechSynthesis.cancel(); } catch { /* noop */ }
      current = null;
    },
  };
}
