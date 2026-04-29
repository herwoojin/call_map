import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function login() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          preferredLanguage: 'ko',
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          emailSanitized: (user.email || '').replace(/\./g, '_'),
        });
      } else {
        await updateDoc(userRef, {
          lastSeen: new Date().toISOString(),
        });
      }
      return user;
    } catch (err) {
      console.error('Login failed:', err);
      throw err;
    }
  }

  async function logout() {
    await signOut(auth);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = { currentUser, login, logout, loading };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
