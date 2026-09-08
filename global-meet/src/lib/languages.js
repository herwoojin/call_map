// 챗.첵(CHAT.CHECK) 지원 언어 — PRD 4.8 F-SET-06 표 그대로, 순서 고정.
//
// 여기서 정한 code 가 그대로
//   users(callMapUsers)/{uid}.preferredLanguage
//   messages/{id}.sourceLanguage
//   messages/{id}.translations[code] / pronunciations[code]
// 의 키가 된다. 절대 임의로 바꾸지 말 것 (바꾸면 기존 번역 캐시가 전부 무효화됨).

export const LANGUAGES = [
  { code: 'ko',    label: '🇰🇷 한국어(Korean)' },
  { code: 'en',    label: '🇺🇸 English(영어)' },
  { code: 'zh-CN', label: '🇨🇳 中文(Chinese)' },
  { code: 'ja',    label: '🇯🇵 日本語(Japanese)' },
  { code: 'ru',    label: '🇷🇺 Русский(Russian)' },
  { code: 'es',    label: '🇪🇸 Español(Spanish)' },
  { code: 'vi',    label: '🇻🇳 Tiếng Việt(Vietnamese)' },
  { code: 'mn',    label: '🇲🇳 Монгол(Mongolian)' },
  { code: 'ar',    label: '🇸🇦 العربية(Arabic)' },
  { code: 'fr',    label: '🇫🇷 Français(French)' },
  { code: 'km',    label: '🇰🇭 ភាសាខ្មែរ(Cambodian)' },
  { code: 'bn',    label: '🇧🇩 বাংলা(Bengali / 방글라데시)' },
  { code: 'uz',    label: '🇺🇿 Oʻzbek(Uzbek / 우즈베키스탄)' },
  { code: 'si',    label: '🇱🇰 සිංහල(Sinhala / 스리랑카)' },
  { code: 'my',    label: '🇲🇲 မြန်မာ(Burmese / 미얀마)' },
  { code: 'tl',    label: '🇵🇭 Filipino(Tagalog / 필리핀)' },
  { code: 'th',    label: '🇹🇭 ไทย(Thai / 태국)' },
  { code: 'id',    label: '🇮🇩 Bahasa Indonesia(인도네시아)' },
  { code: 'ne',    label: '🇳🇵 नेपाली(Nepali / 네팔)' },
];

export const DEFAULT_LANGUAGE = 'ko';

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const isSupportedLanguage = (code) => BY_CODE.has(code);

export const languageLabel = (code) => BY_CODE.get(code)?.label || code || '';

// 국기 이모지만 (뱃지·칩 표시용)
export const languageFlag = (code) => (languageLabel(code).match(/^\p{Emoji}+/u) || [''])[0];

// 오른쪽→왼쪽 표기 언어. 말풍선 정렬에 사용한다.
const RTL = new Set(['ar']);
export const isRtl = (code) => RTL.has(code);

// Web Speech / Google TTS 용 BCP-47 태그.
const SPEECH_TAG = {
  ko: 'ko-KR', en: 'en-US', 'zh-CN': 'zh-CN', ja: 'ja-JP', ru: 'ru-RU',
  es: 'es-ES', vi: 'vi-VN', mn: 'mn-MN', ar: 'ar-SA', fr: 'fr-FR',
  km: 'km-KH', bn: 'bn-BD', uz: 'uz-UZ', si: 'si-LK', my: 'my-MM',
  tl: 'fil-PH', th: 'th-TH', id: 'id-ID', ne: 'ne-NP',
};
export const speechTag = (code) => SPEECH_TAG[code] || code || 'ko-KR';
