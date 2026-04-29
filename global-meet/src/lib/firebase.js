import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB4b-G7Ps-hnQiwZhjBOWE6tpxnRw7a4iE",
  authDomain: "gen-lang-client-0283055211.firebaseapp.com",
  projectId: "gen-lang-client-0283055211",
  storageBucket: "gen-lang-client-0283055211.firebasestorage.app",
  messagingSenderId: "997651572284",
  appId: "1:997651572284:web:cff45cef6d593e82eac539",
  measurementId: "G-YXTWQZD7BP",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
