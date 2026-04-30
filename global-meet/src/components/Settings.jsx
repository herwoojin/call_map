import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, User, Mail, Shield, LogOut, Check, Edit2, X, Eye, EyeOff } from 'lucide-react';

export default function Settings() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState(currentUser?.displayName || '');
  const [loading, setLoading] = useState(false);
  const [discoverable, setDiscoverable] = useState(true);

  useEffect(() => {
    if (currentUser?.uid) {
      getDoc(doc(db, 'users', currentUser.uid)).then(docSnap => {
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
      await updateDoc(doc(db, 'users', currentUser.uid), {
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
      const userRef = doc(db, 'users', currentUser.uid);
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
                  <span className="text-indigo-500">🌐</span> 선호 언어: {t('language.korean', '한국어(Korean)')}
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
