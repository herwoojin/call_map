import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

// 화면 자체의 언어(버튼·라벨)를 바꾼다.
//
// ※ 설정의 "내 언어"(preferredLanguage) 와는 다른 개념이다.
//    - 여기(UI 언어)   : 3종. 앱 화면 텍스트를 무엇으로 볼지.
//    - 설정(내 언어)   : 19종. 받는 채팅 메시지를 무엇으로 번역할지.
//    둘을 하나로 합치지 말 것 — 번역 대상 언어가 UI 번역본보다 훨씬 많다.
const UI_LANGUAGES = [
  { code: 'ko', short: '한국어', flag: '🇰🇷' },
  { code: 'en', short: 'English', flag: '🇺🇸' },
  { code: 'zh', short: '中文', flag: '🇨🇳' },
];

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation();

  // i18n.language 는 'en-US' 처럼 지역 코드가 붙어 올 수 있다.
  const base = (i18n.resolvedLanguage || i18n.language || 'ko').split('-')[0];
  const current = UI_LANGUAGES.find((l) => l.code === base) || UI_LANGUAGES[0];

  return (
    <label className={`relative flex items-center ${className}`}>
      <span className="sr-only">Language</span>
      <Globe className="w-4 h-4 text-slate-500 absolute left-2 pointer-events-none" aria-hidden="true" />
      <select
        value={current.code}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        title="Interface language"
        className="appearance-none pl-7 pr-6 py-1.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
      >
        {UI_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.flag} {l.short}</option>
        ))}
      </select>
    </label>
  );
}
