import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.projectId &&
    firebaseConfig.projectId.trim() !== '' &&
    firebaseConfig.projectId !== 'your-project-id'
  );
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseConfigured()) {
  try {
    appInstance = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    dbInstance = getFirestore(appInstance);
  } catch (err) {
    console.error('Failed to initialize Firebase:', err);
  }
}

export const app = appInstance;
export const db = dbInstance;

/**
 * Storage helpers for Firestore with fallback
 */

export async function loadStudentsFromFirestore(): Promise<Record<string, any>> {
  if (!db) return {};
  try {
    // 1. Check collection 'students'
    const snap = await getDocs(collection(db, 'students'));
    if (!snap.empty) {
      const map: Record<string, any> = {};
      snap.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      return map;
    }
    // 2. Check doc 'crm/students' or 'crm/yim_students'
    const crmDoc = await getDoc(doc(db, 'crm', 'students'));
    if (crmDoc.exists()) {
      const data = crmDoc.data();
      if (typeof data.v === 'string') {
        try { return JSON.parse(data.v); } catch {}
      }
      return data;
    }
    return {};
  } catch (e) {
    console.warn('Error loading students from Firestore:', e);
    return {};
  }
}

export async function saveStudentToFirestore(student: any): Promise<boolean> {
  if (!db || !student?.id) return false;
  try {
    await setDoc(doc(db, 'students', String(student.id)), student, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving student to Firestore:', e);
    return false;
  }
}

export async function deleteStudentFromFirestore(id: string): Promise<boolean> {
  if (!db || !id) return false;
  try {
    await deleteDoc(doc(db, 'students', String(id)));
    return true;
  } catch (e) {
    console.error('Error deleting student from Firestore:', e);
    return false;
  }
}

export async function loadLeadsFromFirestore(): Promise<Record<string, any>> {
  if (!db) return {};
  try {
    // 1. Check collection 'leads'
    const snap = await getDocs(collection(db, 'leads'));
    if (!snap.empty) {
      const map: Record<string, any> = {};
      snap.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      return map;
    }
    // 2. Check doc 'crm/leads'
    const crmDoc = await getDoc(doc(db, 'crm', 'leads'));
    if (crmDoc.exists()) {
      const data = crmDoc.data();
      if (typeof data.v === 'string') {
        try { return JSON.parse(data.v); } catch {}
      }
      return data;
    }
    return {};
  } catch (e) {
    console.warn('Error loading leads from Firestore:', e);
    return {};
  }
}

export async function saveLeadToFirestore(lead: any): Promise<boolean> {
  if (!db || !lead?.id) return false;
  try {
    await setDoc(doc(db, 'leads', String(lead.id)), lead, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving lead to Firestore:', e);
    return false;
  }
}

export async function deleteLeadFromFirestore(id: string): Promise<boolean> {
  if (!db || !id) return false;
  try {
    await deleteDoc(doc(db, 'leads', String(id)));
    return true;
  } catch (e) {
    console.error('Error deleting lead from Firestore:', e);
    return false;
  }
}

export async function loadSettingsFromFirestore(): Promise<any | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'settings', 'general'));
    if (snap.exists()) return snap.data();
    const crmSnap = await getDoc(doc(db, 'crm', 'settings'));
    if (crmSnap.exists()) {
      const data = crmSnap.data();
      if (typeof data.v === 'string') {
        try { return JSON.parse(data.v); } catch {}
      }
      return data;
    }
    return null;
  } catch (e) {
    console.warn('Error loading settings from Firestore:', e);
    return null;
  }
}

export async function saveSettingsToFirestore(settings: any): Promise<boolean> {
  if (!db) return false;
  try {
    await setDoc(doc(db, 'settings', 'general'), settings, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving settings to Firestore:', e);
    return false;
  }
}

export async function loadUsersFromFirestore(): Promise<any[] | null> {
  if (!db) return null;
  try {
    const snap = await getDocs(collection(db, 'users'));
    if (!snap.empty) {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      return list;
    }
    const crmSnap = await getDoc(doc(db, 'crm', 'users'));
    if (crmSnap.exists()) {
      const data = crmSnap.data();
      if (typeof data.v === 'string') {
        try { return JSON.parse(data.v); } catch {}
      }
      if (Array.isArray(data)) return data;
    }
    return null;
  } catch (e) {
    console.warn('Error loading users from Firestore:', e);
    return null;
  }
}

export async function saveUsersToFirestore(users: any[]): Promise<boolean> {
  if (!db || !Array.isArray(users)) return false;
  try {
    for (const u of users) {
      if (u.id) {
        await setDoc(doc(db, 'users', String(u.id)), u, { merge: true });
      }
    }
    return true;
  } catch (e) {
    console.error('Error saving users to Firestore:', e);
    return false;
  }
}

export function subscribeToStudents(cb: (students: Record<string, any>) => void): Unsubscribe | null {
  if (!db) return null;
  try {
    return onSnapshot(collection(db, 'students'), (snapshot) => {
      if (snapshot.empty) return;
      const map: Record<string, any> = {};
      snapshot.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      cb(map);
    });
  } catch (e) {
    console.warn('Error in subscribeToStudents:', e);
    return null;
  }
}

export function subscribeToLeads(cb: (leads: Record<string, any>) => void): Unsubscribe | null {
  if (!db) return null;
  try {
    return onSnapshot(collection(db, 'leads'), (snapshot) => {
      if (snapshot.empty) return;
      const map: Record<string, any> = {};
      snapshot.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      cb(map);
    });
  } catch (e) {
    console.warn('Error in subscribeToLeads:', e);
    return null;
  }
}
