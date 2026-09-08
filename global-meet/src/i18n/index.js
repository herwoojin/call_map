import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import zh from './locales/zh.json';

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en }, zh: { translation: zh } },
  fallbackLng: 'ko',
  interpolation: { escapeValue: false },
  // localStorage 를 캐시하면서 감지 순서에는 넣지 않으면, 사용자가 고른 언어를
  // 저장만 하고 다시 읽지 않는다. 저장된 선택이 브라우저 언어보다 우선해야 한다.
  detection: { order: ['localStorage', 'navigator', 'htmlTag'], caches: ['localStorage'] },
});

export default i18n;
