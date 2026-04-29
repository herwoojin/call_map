import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, updateDoc, arrayUnion, arrayRemove, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Send, Plus, Trash2, LogOut, Users, Mic, MicOff, Volume2, VolumeX, Image as ImageIcon, X, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { compressImageToWebp } from '../lib/imageUtils';
import CreateRoomModal from './CreateRoomModal';
import ImageLightbox from './ImageLightbox';

export default function GlobalChat() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const myEmail = (currentUser?.email || '').toLowerCase();

  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [recording, setRecording] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const fileInputRef = useRef(null);

  // Subscribe to rooms
  useEffect(() => {
    if (!myEmail) return;
    const q = query(collection(db, 'globalChatRooms'), where('members', 'array-contains', myEmail));
    const unsub = onSnapshot(q, snap => {
      const r = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRooms(r);
      if (selectedRoom && !r.find(x => x.id === selectedRoom.id)) setSelectedRoom(null);
    });
    return unsub;
  }, [myEmail]);

  // Subscribe to messages
  useEffect(() => {
    if (!selectedRoom) { setMessages([]); return; }
    const q = query(collection(db, 'globalChatRooms', selectedRoom.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);

      // Mark unread messages
      msgs.forEach(msg => {
        if (msg.senderEmail !== myEmail && msg.readBy && !msg.readBy.includes(myEmail)) {
          updateDoc(doc(db, 'globalChatRooms', selectedRoom.id, 'messages', msg.id), { readBy: arrayUnion(myEmail) }).catch(() => {});
        }
      });

      // Auto TTS for new messages
      if (autoVoice && msgs.length > prevMsgCountRef.current) {
        const newMsg = msgs[msgs.length - 1];
        if (newMsg && newMsg.senderEmail !== myEmail && newMsg.text) speakText(newMsg.text, newMsg.sourceLanguage);
      }
      prevMsgCountRef.current = msgs.length;
    });
    return unsub;
  }, [selectedRoom, myEmail, autoVoice]);

  // Auto scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Send message
  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !selectedRoom) return;
    const msgText = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'globalChatRooms', selectedRoom.id, 'messages'), {
        text: msgText, senderEmail: myEmail,
        senderName: currentUser.displayName || '', sourceLanguage: 'ko',
        timestamp: serverTimestamp(), readBy: [myEmail],
      });
    } catch (err) { console.error(err); }
  };

  // Delete message
  const handleDeleteMsg = async (msgId) => {
    try { await deleteDoc(doc(db, 'globalChatRooms', selectedRoom.id, 'messages', msgId)); } catch (err) { console.error(err); }
  };

  // Delete room
  const handleDeleteRoom = async () => {
    if (!selectedRoom) return;
    if (!confirm(t('chat.confirmDelete', '대화방을 삭제하시겠습니까?'))) return;
    try {
      const msgsSnap = await getDocs(collection(db, 'globalChatRooms', selectedRoom.id, 'messages'));
      const batch = writeBatch(db);
      msgsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await deleteDoc(doc(db, 'globalChatRooms', selectedRoom.id));
      setSelectedRoom(null);
    } catch (err) { console.error(err); }
  };

  // Leave room
  const handleLeaveRoom = async () => {
    if (!selectedRoom) return;
    try {
      const roomRef = doc(db, 'globalChatRooms', selectedRoom.id);
      await updateDoc(roomRef, { members: arrayRemove(myEmail) });
      setSelectedRoom(null);
    } catch (err) { console.error(err); }
  };

  // STT
  const toggleSTT = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition not supported'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      setText(transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  // TTS
  const speakText = (text, lang = 'ko') => {
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN' };
    utterance.lang = langMap[lang] || 'ko-KR';
    speechSynthesis.speak(utterance);
  };

  // Image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRoom) return;
    setUploading(true);
    try {
      const { blob, width, height } = await compressImageToWebp(file);
      const fileName = `${Date.now()}.webp`;
      const storagePath = `globalChatImages/${selectedRoom.id}/${currentUser.uid}/${fileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob, { contentType: 'image/webp' });
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'globalChatRooms', selectedRoom.id, 'messages'), {
        text: '', imageUrl: url, imagePath: storagePath, imageWidth: width, imageHeight: height,
        senderEmail: myEmail, senderName: currentUser.displayName || '',
        sourceLanguage: 'ko', timestamp: serverTimestamp(), readBy: [myEmail],
      });
    } catch (err) { console.error(err); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const isOwner = selectedRoom?.createdBy === myEmail;
  const roomMembers = selectedRoom ? (selectedRoom.memberNames || {}) : {};

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" style={{ height: '32rem' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50">
        <select id="room-select" value={selectedRoom?.id || ''} onChange={e => {
          const room = rooms.find(r => r.id === e.target.value);
          setSelectedRoom(room || null);
        }} className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none">
          <option value="">{t('chat.selectRoom', '대화방 선택...')}</option>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {selectedRoom && (
          <button onClick={() => setShowMembers(!showMembers)} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors" title={t('chat.members', '참여자')}>
            <Users className="w-4 h-4 text-slate-600" />
          </button>
        )}

        <button onClick={() => setAutoVoice(!autoVoice)} className={`p-1.5 rounded-lg transition-colors ${autoVoice ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-200 text-slate-600'}`}
          title={autoVoice ? t('chat.autoVoiceOff', '자동 음성 OFF') : t('chat.autoVoiceOn', '자동 음성 ON')}>
          {autoVoice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <button id="create-room-btn" onClick={() => setShowCreateModal(true)}
          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors" title={t('chat.newRoom', '새 대화방')}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Members panel */}
      {showMembers && selectedRoom && (
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <h4 className="text-xs font-semibold text-slate-500 mb-1.5">{t('chat.memberList', '참여자 목록')}</h4>
          {Object.entries(roomMembers).map(([email, name]) => (
            <div key={email} className="flex items-center gap-2 py-1 text-sm">
              <span className="truncate">{name}</span>
              {email === selectedRoom.createdBy && <span className="text-yellow-500 text-xs">★</span>}
              {email === myEmail && <span className="text-xs text-indigo-500">({t('chat.me', '나')})</span>}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            {isOwner ? (
              <button onClick={handleDeleteRoom} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                <Trash2 className="w-3 h-3" /> {t('chat.deleteRoom', '대화방 삭제')}
              </button>
            ) : (
              <button onClick={handleLeaveRoom} className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700">
                <LogOut className="w-3 h-3" /> {t('chat.leaveRoom', '나가기')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar" style={{ height: showMembers ? 'calc(100% - 11rem)' : 'calc(100% - 7rem)' }}>
        {!selectedRoom ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            {t('chat.selectRoomPrompt', '대화방을 선택하거나 새로 만드세요')}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            {t('chat.noMessages', '메시지가 없습니다')}
          </div>
        ) : messages.map(msg => {
          const isMine = msg.senderEmail === myEmail;
          const allRead = selectedRoom?.members?.length > 0 && msg.readBy?.length >= selectedRoom.members.length;
          const ts = msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : '';
          return (
            <div key={msg.id} className={`chat-bubble-enter flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${isMine ? 'order-2' : ''}`}>
                {!isMine && <p className="text-xs text-slate-500 mb-0.5 ml-1">{msg.senderName}</p>}
                <div className={`px-3 py-2 rounded-2xl text-sm ${isMine ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                  {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="" onClick={() => setLightboxImg(msg.imageUrl)}
                      className="mt-1 rounded-lg cursor-pointer hover:opacity-90 transition-opacity" style={{ maxWidth: 220 }} />
                  )}
                </div>
                <div className={`flex items-center gap-1.5 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'} px-1`}>
                  <span className="text-[10px] text-slate-400">{ts}</span>
                  {isMine && <span className={`text-[10px] ${allRead ? 'text-blue-500' : 'text-slate-400'}`}>✓✓</span>}
                  {msg.text && (
                    <button onClick={() => speakText(msg.text, msg.sourceLanguage)} className="opacity-60 hover:opacity-100">
                      <Volume2 className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                  {isMine && (
                    <button onClick={() => handleDeleteMsg(msg.id)} className="opacity-60 hover:opacity-100">
                      <Trash2 className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {selectedRoom && (
        <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-200 bg-white">
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            {uploading ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : <ImageIcon className="w-5 h-5 text-slate-400" />}
          </button>
          <button type="button" onClick={toggleSTT}
            className={`p-1.5 rounded-lg transition-colors ${recording ? 'bg-red-100 text-red-500' : 'hover:bg-slate-100 text-slate-400'}`}>
            {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input id="chat-input" value={text} onChange={e => setText(e.target.value)}
            placeholder={t('chat.inputPlaceholder', '메시지를 입력하세요...')}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <button type="submit" disabled={!text.trim()}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Modals */}
      {showCreateModal && <CreateRoomModal onClose={() => setShowCreateModal(false)} />}
      {lightboxImg && <ImageLightbox src={lightboxImg} onClose={() => setLightboxImg(null)} />}
    </div>
  );
}
