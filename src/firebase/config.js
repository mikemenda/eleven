import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Replace with your Firebase project config
// To get this: Firebase Console → Project Settings → Your Apps → Web App → Config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCprKDL60Irg0L9TgprsoyY-L6NUjRz0Jo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "eleven-c44a0.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "eleven-c44a0",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "eleven-c44a0.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "819905625943",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:819905625943:web:0cce4d7d95ab84f16e0812"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export default app
