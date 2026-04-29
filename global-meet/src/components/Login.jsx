import { useAuth } from '../context/AuthContext';
import { Globe, MessageCircle, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();

  const handleLogin = async () => {
    try {
      await login();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center px-6">
        {/* Logo and title */}
        <div className="mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30 mb-6">
            <Globe className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            연결<span className="text-indigo-400">.</span>잇다<span className="text-indigo-400">.</span>
          </h1>
          <p className="text-slate-400 text-lg">
            {t('login.subtitle', 'Connect, Share, Meet — 전 세계 어디서나')}
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-sm text-slate-300">
            <MapPin className="w-4 h-4 text-red-400" /> {t('login.feature1', '위치 핀 등록')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-sm text-slate-300">
            <MessageCircle className="w-4 h-4 text-blue-400" /> {t('login.feature2', '실시간 채팅')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-sm text-slate-300">
            <Globe className="w-4 h-4 text-green-400" /> {t('login.feature3', '글로벌 연결')}
          </span>
        </div>

        {/* Login button */}
        <button
          id="google-login-btn"
          onClick={handleLogin}
          className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-gray-800 rounded-2xl font-semibold text-lg shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {t('login.button', 'Google로 로그인')}
        </button>

        <p className="mt-6 text-sm text-slate-500">
          {t('login.notice', 'Google 계정으로 간편하게 시작하세요')}
        </p>
      </div>
    </div>
  );
}
