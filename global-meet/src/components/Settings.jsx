import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { COL } from '../lib/collections';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, User, Mail, Shield, LogOut, Check, Edit2, X, Eye, EyeOff, Languages, Bell, BellOff, Smartphone, Loader2 } from 'lucide-react';
import { LANGUAGES, languageLabel } from '../lib/languages';
import {
  enablePush, disablePush, permissionState, isDeviceRegistered,
  isPushSupported, isIos, isStandalone, hasVapidKey,
} from '../lib/notifications';

export default function Settings() {
  const { currentUser, logout, myLanguage, updateUserProfile, userProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState(currentUser?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [discoverable, setDiscoverable] = useState(true);
  const [savingLang, setSavingLang] = useState(false);

  // ── 알림
  const [pushPermission, setPushPermission] = useState(() => permissionState());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState('');
  const pushOn = pushPermission === 'granted' && isDeviceRegistered(userProfile);

  // ── 홈 화면 설치 (안드로이드/데스크톱 크롬). iOS 는 아래 수동 안내로 처리.
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const pushFailureMessage = (reason) => ({
    unsupported: t('settings.pushUnsupported', '이 브라우저는 알림을 지원하지 않습니다.'),
    'ios-needs-install': t('settings.pushIosInstall', 'iPhone/iPad 는 홈 화면에 설치한 뒤에만 알림을 받을 수 있습니다.'),
    denied: t('settings.pushDenied', '기기에서 알림이 차단되어 있습니다. 휴대폰 설정에서 이 사이트의 알림을 허용해 주세요.'),
    'no-vapid-key': t('settings.pushNoKey', '알림 키가 아직 설정되지 않았습니다. 관리자 설정이 필요합니다.'),
    'no-token': t('settings.pushNoToken', '알림 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
    'token-error': t('settings.pushNoToken', '알림 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
  }[reason] || t('settings.pushFailed', '알림을 켜지 못했습니다.'));

  const handleTogglePush = async () => {
    if (!currentUser?.uid) return;
    setPushBusy(true);
    setPushNote('');
    try {
      if (pushOn) {
        await disablePush(currentUser.uid);
      } else {
        const result = await enablePush(currentUser.uid);
        if (!result.ok) setPushNote(pushFailureMessage(result.reason));
      }
      setPushPermission(permissionState());
    } finally {
      setPushBusy(false);
    }
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    setInstallPrompt(null);
  };

  // 채팅 번역 타깃 언어. 저장하면 AuthContext 구독이 즉시 반영한다.
  const handleLanguageChange = async (code) => {
    if (!code || code === myLanguage) return;
    setSavingLang(true);
    try {
      await updateUserProfile({ preferredLanguage: code });
    } catch (err) {
      console.error(err);
      alert(t('settings.languageSaveFailed', '언어 설정을 저장하지 못했습니다.'));
    } finally {
      setSavingLang(false);
    }
  };

  useEffect(() => {
    if (currentUser?.uid) {
      getDoc(doc(db, COL.users, currentUser.uid)).then(docSnap => {
        if (docSnap.exists() && docSnap.data().discoverable !== undefined) {
          setDiscoverable(docSnap.data().discoverable);
        }
      });
    }
  }, [currentUser]);

  const handleToggleDiscoverable = async () => {
    if (!currentUser?.uid) return;
    const newVal = !discoverable;
    setDiscoverable(newVal);
    try {
      await updateDoc(doc(db, COL.users, currentUser.uid), {
        discoverable: newVal
      });
    } catch (err) {
      console.error(err);
      setDiscoverable(!newVal); // revert
    }
  };

  const handleUpdate = async () => {
    if (!nickname.trim()) return;
    setLoading(true);
    try {
      // Firebase Auth Update
      await updateProfile(auth.currentUser, {
        displayName: nickname.trim()
      });
      
      // Firestore Update
      const userRef = doc(db, COL.users, currentUser.uid);
      await updateDoc(userRef, {
        displayName: nickname.trim()
      });
      
      setIsEditing(false);
      window.location.reload(); // Refresh to update AuthContext and UI globally
    } catch (err) {
      console.error(err);
      alert(t('settings.updateFailed', '프로필 업데이트에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">{t('settings.title', '내 프로필')}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Profile Header Background */}
          <div className="h-32 bg-gradient-to-r from-indigo-500 to-blue-600 relative"></div>
          
          {/* Profile Info */}
          <div className="px-6 pb-6 relative">
            <div className="absolute -top-12 left-6">
              <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-slate-200 shadow-md">
                {currentUser?.photoURL ? (
                  <img src={currentUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 m-auto mt-5 text-slate-400" />
                )}
              </div>
            </div>

            <div className="pt-14 pb-4 border-b border-slate-100 flex items-start justify-between">
              <div className="flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button 
                      onClick={handleUpdate}
                      disabled={loading}
                      className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-slate-800">{currentUser?.displayName || '이름 없음'}</h2>
                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                <p className="text-sm text-slate-500 mt-2 flex items-center gap-1.5">
                  <span className="text-indigo-500">🌐</span>
                  {t('settings.preferredLanguage', '선호 언어')}: {languageLabel(myLanguage)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  가입일: {new Date(parseInt(currentUser?.metadata?.createdAt || Date.now())).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Readonly Info */}
            <div className="py-4 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">{t('settings.email', '이메일')}</p>
                  <p className="text-slate-800 font-medium">{currentUser?.email}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">{t('settings.userId', '사용자 ID')}</p>
                  <p className="text-slate-800 font-mono text-sm break-all">{currentUser?.uid}</p>
                </div>
              </div>

              {/* 챗.첵 번역 언어 — 받는 메시지가 이 언어로 번역된다 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-4">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Languages className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 font-medium">{t('settings.myLanguage', '내 언어')}</p>
                  <p className="text-xs text-slate-500 mb-2">
                    {t('settings.myLanguageHelp', '받는 대화 메시지가 이 언어로 번역됩니다.')}
                  </p>
                  <select
                    value={myLanguage}
                    disabled={savingLang}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 홈 화면에 앱으로 설치 — 이미 설치해서 실행 중이면 숨긴다 */}
              {!isStandalone() && (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-start gap-4">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 font-medium">{t('settings.installApp', '앱으로 설치')}</p>
                    {installPrompt ? (
                      <>
                        <p className="text-xs text-slate-500 mb-2">
                          {t('settings.installHelp', '홈 화면에 추가하면 앱처럼 전체 화면으로 실행됩니다.')}
                        </p>
                        <button onClick={handleInstall}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                          {t('settings.installNow', '설치하기')}
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {isIos()
                          ? t('settings.installIos', 'Safari 하단의 공유 버튼 → "홈 화면에 추가" 를 눌러 설치하세요. iPhone 은 설치해야 알림을 받을 수 있습니다.')
                          : t('settings.installManual', '브라우저 메뉴의 "홈 화면에 추가" 또는 "앱 설치" 를 눌러 설치하세요.')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 새 대화 알림 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${pushOn ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                    {pushOn ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-800 font-medium">{t('settings.pushTitle', '새 대화 알림')}</p>
                    <p className="text-xs text-slate-500">
                      {pushOn
                        ? t('settings.pushOn', '참여 중인 대화방에 새 메시지가 오면 알려드립니다. 이미 읽은 대화는 알림이 오지 않습니다.')
                        : t('settings.pushOff', '알림을 받지 않습니다.')}
                    </p>
                    {pushNote && <p className="text-xs text-red-500 mt-1.5">{pushNote}</p>}
                    {pushOn && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {t('settings.pushOsHint', '휴대폰 설정에서 이 사이트의 알림을 끄면 여기서도 받지 않습니다.')}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleTogglePush}
                  disabled={pushBusy || !isPushSupported() || !hasVapidKey()}
                  role="switch"
                  aria-checked={pushOn}
                  aria-label={t('settings.pushTitle', '새 대화 알림')}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${pushOn ? 'bg-amber-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all flex items-center justify-center ${pushOn ? 'left-6' : 'left-1'}`}>
                    {pushBusy && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                  </span>
                </button>
              </div>

              {/* Discoverability Toggle */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${discoverable ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                    {discoverable ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-slate-800 font-medium">{t('settings.discoverable', '대화 상대로 검색 허용')}</p>
                    <p className="text-xs text-slate-500 font-medium">
                      {discoverable ? t('settings.discoverableOn', '다른 사용자가 대화창에서 나를 찾을 수 있습니다.') : t('settings.discoverableOff', '다른 사용자가 대화창에서 나를 찾을 수 없습니다.')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleDiscoverable}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${discoverable ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${discoverable ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* Logout Button */}
            <div className="pt-4 border-t border-slate-100 mt-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-medium transition-colors"
              >
                <LogOut className="w-5 h-5" />
                {t('settings.logout', '로그아웃')}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
