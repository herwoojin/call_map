import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { X, Search, UserPlus, Users, Loader2, Check } from 'lucide-react';

export default function CreateRoomModal({ onClose }) {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const myEmail = (currentUser?.email || '').toLowerCase();

  const [roomName, setRoomName] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load all Google-logged-in (discoverable) users when modal opens
  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const users = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => (u.email || '').toLowerCase() !== myEmail)
          .filter(u => u.discoverable !== false)
          .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
        setAllUsers(users);
      } catch (err) { console.error(err); }
      finally { setLoadingUsers(false); }
    };
    loadUsers();
  }, [myEmail]);

  const filteredUsers = allUsers.filter(u => {
    const q = searchEmail.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
    );
  });

  const isSelected = (email) => selectedMembers.some(m => m.email === email);

  const toggleMember = (user) => {
    const email = (user.email || '').toLowerCase();
    if (isSelected(email)) {
      setSelectedMembers(selectedMembers.filter(m => m.email !== email));
    } else {
      setSelectedMembers([...selectedMembers, { email, name: user.displayName || email }]);
    }
  };

  const removeMember = (email) => {
    setSelectedMembers(selectedMembers.filter(m => m.email !== email));
  };

  const handleCreate = async () => {
    if (!roomName.trim() || selectedMembers.length === 0) return;
    setLoading(true);
    try {
      const members = [myEmail, ...selectedMembers.map(m => m.email)];
      const memberNames = {
        [myEmail]: currentUser.displayName || myEmail,
        ...Object.fromEntries(selectedMembers.map(m => [m.email, m.name])),
      };
      await addDoc(collection(db, 'globalChatRooms'), {
        name: roomName.trim(),
        createdBy: myEmail,
        createdByName: currentUser.displayName || '',
        members,
        memberNames,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">{t('chat.createRoom', '새 대화방 만들기')}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">{t('chat.roomName', '대화방 이름')}</label>
            <input id="room-name-input" value={roomName} onChange={e => setRoomName(e.target.value)}
              placeholder={t('chat.roomNamePlaceholder', '이름을 입력하세요')}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" />
                {t('chat.inviteGoogleUsers', 'Google 로그인 사용자 초대')}
              </label>
              <span className="text-xs text-slate-400">
                {loadingUsers ? '...' : `${allUsers.length}명`}
              </span>
            </div>

            <div className="mt-2 relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
                placeholder={t('chat.searchUserPlaceholder', '이메일 또는 이름으로 필터링')}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <ul className="mt-2 border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y">
              {loadingUsers ? (
                <li className="px-3 py-6 flex items-center justify-center text-slate-400 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  사용자 목록 불러오는 중...
                </li>
              ) : filteredUsers.length === 0 ? (
                <li className="px-3 py-6 text-center text-slate-400 text-sm">
                  {searchEmail.trim() ? '검색 결과가 없습니다' : '초대 가능한 사용자가 없습니다'}
                </li>
              ) : filteredUsers.map(user => {
                const email = (user.email || '').toLowerCase();
                const selected = isSelected(email);
                return (
                  <li key={user.uid} onClick={() => toggleMember(user)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2.5 transition-colors ${selected ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-slate-50'}`}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full border border-slate-200 object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{user.displayName || user.email}</div>
                      <div className="text-xs text-slate-400 truncate">{user.email}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${selected ? 'bg-indigo-600 text-white' : 'border border-slate-300'}`}>
                      {selected && <Check className="w-3 h-3" />}
                    </div>
                  </li>
                );
              })}
            </ul>

            {selectedMembers.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-500 mb-1.5">선택된 멤버 ({selectedMembers.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMembers.map(m => (
                    <span key={m.email} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                      {m.name}
                      <button onClick={() => removeMember(m.email)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">{t('common.cancel', '취소')}</button>
          <button id="create-room-submit" onClick={handleCreate} disabled={loading || !roomName.trim() || selectedMembers.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {t('chat.create', '만들기')}
          </button>
        </div>
      </div>
    </div>
  );
}
