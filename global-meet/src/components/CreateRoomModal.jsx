import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { X, Search, UserPlus } from 'lucide-react';

export default function CreateRoomModal({ onClose }) {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const myEmail = (currentUser?.email || '').toLowerCase();

  const [roomName, setRoomName] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearchUsers = async () => {
    if (!searchEmail.trim()) return;
    try {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => (u.email || '').toLowerCase() !== myEmail)
        .filter(u =>
          (u.email || '').toLowerCase().includes(searchEmail.toLowerCase()) ||
          (u.displayName || '').toLowerCase().includes(searchEmail.toLowerCase())
        );
      setSearchResults(results);
    } catch (err) { console.error(err); }
  };

  const addMember = (user) => {
    const email = (user.email || '').toLowerCase();
    if (!selectedMembers.find(m => m.email === email)) {
      setSelectedMembers([...selectedMembers, { email, name: user.displayName || email }]);
    }
    setSearchResults([]);
    setSearchEmail('');
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
            <label className="text-sm font-medium text-slate-700">{t('chat.inviteMembers', '멤버 초대')}</label>
            <div className="mt-1 flex gap-2">
              <input value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearchUsers())}
                placeholder={t('chat.searchUserPlaceholder', '이메일 또는 이름 검색')}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={handleSearchUsers}
                className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800">
                <Search className="w-4 h-4" />
              </button>
            </div>

            {searchResults.length > 0 && (
              <ul className="mt-1 border border-slate-200 rounded-lg max-h-32 overflow-y-auto divide-y">
                {searchResults.map(user => (
                  <li key={user.uid} onClick={() => addMember(user)}
                    className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{user.displayName || user.email}</span>
                    <span className="text-xs text-slate-400 ml-auto">{user.email}</span>
                  </li>
                ))}
              </ul>
            )}

            {selectedMembers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedMembers.map(m => (
                  <span key={m.email} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                    {m.name}
                    <button onClick={() => removeMember(m.email)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
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
