/**
 * Firebase SDK Configuration
 */

import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDzeTUrsd2taLWJFrDHVkbp2Ctx9dDpX0k",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "profitlens-f9d69.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "profitlens-f9d69",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "profitlens-f9d69.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "561648286006",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:561648286006:web:3a78b3f54209fd04391b97",
    measurementId: "G-2H4WD6NZKQ",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Connect to emulators in development
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099');
}

// Helper to call Cloud Functions
export const callFunction = (name) => httpsCallable(functions, name);

export default app;
