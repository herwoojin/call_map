import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { COL } from '../lib/collections';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../lib/languages';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const profileUnsubRef = useRef(null);

  async function login() {
    const result = await signInWithPopup(auth, googleProvider);
    // 프로필 문서 생성은 아래 onAuthStateChanged 가 책임진다.
    // (세션 복원으로 로그인하는 경우에도 똑같이 보장되어야 하므로)
    return result.user;
  }

  async function logout() {
    await signOut(auth);
  }

  // 내 프로필 부분 갱신. 언어 설정·닉네임 등에서 사용한다.
  async function updateUserProfile(patch) {
    if (!auth.currentUser) return;
    await updateDoc(doc(db, COL.users, auth.currentUser.uid), patch);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // 이전 프로필 구독 정리 (로그아웃 · 계정 전환)
      if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null; }

      setCurrentUser(user);
      if (!user) { setUserProfile(null); setLoading(false); return; }

      const userRef = doc(db, COL.users, user.uid);

      // 1) 문서가 없으면 만든다. 실패해도 아래 onSnapshot 이 재시도한다.
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            email: user.email || '',
            // 알림 발송 함수가 이 필드로 수신자를 찾는다. 대화방 members 가
            // 소문자 이메일이라 대소문자 섞인 email 로는 매칭이 어긋난다.
            emailLower: (user.email || '').toLowerCase(),
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            preferredLanguage: DEFAULT_LANGUAGE,
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            emailSanitized: (user.email || '').replace(/\./g, '_'),
          });
        } else {
          // emailLower 는 나중에 추가된 필드다. 기존 사용자도 다음 접속 때
          // 자동으로 채워지도록 여기서 함께 갱신한다.
          setDoc(userRef, {
            lastSeen: new Date().toISOString(),
            photoURL: user.photoURL || '',
            emailLower: (user.email || '').toLowerCase(),
          }, { merge: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('[Auth] 프로필 초기 확인 실패 (구독이 재시도함):', err?.code);
      }

      // 2) 일회성 read 가 아니라 실시간 구독.
      //    로그인 직후 auth 토큰이 Firestore 로 전파되기 전 짧은 순간
      //    permission-denied 가 날 수 있는데, getDoc 이면 프로필이 null 로
      //    굳어버린다. onSnapshot 은 자동 재시도 + 변경 즉시 반영이 된다.
      profileUnsubRef.current = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) setUserProfile(snap.data());
          setLoading(false);
        },
        (err) => { console.warn('[Auth] 프로필 구독 오류:', err?.code); setLoading(false); },
      );
    });

    return () => {
      unsubscribe();
      if (profileUnsubRef.current) profileUnsubRef.current();
    };
  }, []);

  // 채팅 번역의 타깃 언어. 설정 전이거나 목록에 없는 값이면 기본값으로 떨어뜨린다.
  const rawLang = userProfile?.preferredLanguage;
  const myLanguage = isSupportedLanguage(rawLang) ? rawLang : DEFAULT_LANGUAGE;

  const value = { currentUser, userProfile, myLanguage, login, logout, updateUserProfile, loading };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
