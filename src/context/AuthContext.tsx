import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Role } from '../types';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  signIn: (username: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => void;
  addUser: (fullName: string, username: string, role: Role, password?: string) => { success: boolean; error?: string; password?: string };
  updateUserRole: (id: string, role: Role) => void;
  resetUserPassword: (id: string) => string;
  toggleUserActive: (id: string) => void;
  removeUser: (id: string) => { success: boolean; error?: string };
  isPartner: boolean;
}

const DEFAULT_USERS: User[] = [
  {
    id: 'u-amman',
    full_name: 'Ammanuel Esrael',
    username: 'amman',
    password_hash: 'Yimaru-2026',
    role: 'partner',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'u-endrias',
    full_name: 'Endrias',
    username: 'endrias',
    password_hash: 'Endrias-2026',
    role: 'partner',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('yim:users');
      return saved ? JSON.parse(saved) : DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const sess = localStorage.getItem('yim:session');
      if (!sess) return DEFAULT_USERS[0]; // Auto-sign-in Amman as default in prototype/dev mode
      const parsed = JSON.parse(sess);
      return users.find(u => u.id === parsed.id && u.active) || users[0] || null;
    } catch {
      return DEFAULT_USERS[0];
    }
  });

  useEffect(() => {
    localStorage.setItem('yim:users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('yim:session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('yim:session');
    }
  }, [currentUser]);

  async function signIn(username: string, password?: string) {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password?.trim();
    const user = users.find(u => u.username.toLowerCase() === cleanUser);

    if (!user || !user.active) {
      return { success: false, error: "That username and password don't match an active login. Check both and try again." };
    }

    // In dev / prototype mode allow matching plain or hash
    if (cleanPass && user.password_hash && user.password_hash !== cleanPass) {
      return { success: false, error: "That username and password don't match an active login. Check both and try again." };
    }

    setCurrentUser(user);
    return { success: true };
  }

  function signOut() {
    setCurrentUser(null);
  }

  function addUser(fullName: string, username: string, role: Role, password?: string) {
    const cleanU = username.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === cleanU)) {
      return { success: false, error: `The username “${cleanU}” is already taken.` };
    }
    const generatedPw = password || `Yimaru-${Math.floor(1000 + Math.random() * 9000)}`;
    const newUser: User = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      full_name: fullName.trim(),
      username: cleanU,
      password_hash: generatedPw,
      role,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.id
    };
    setUsers(prev => [...prev, newUser]);
    return { success: true, password: generatedPw };
  }

  function updateUserRole(id: string, role: Role) {
    if (currentUser?.id === id && role !== 'partner') return;
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, role, updated_at: new Date().toISOString() } : u)));
  }

  function resetUserPassword(id: string): string {
    const newPw = `Yimaru-${Math.floor(1000 + Math.random() * 9000)}`;
    setUsers(prev =>
      prev.map(u => (u.id === id ? { ...u, password_hash: newPw, updated_at: new Date().toISOString() } : u))
    );
    return newPw;
  }

  function toggleUserActive(id: string) {
    if (currentUser?.id === id) return; // Cannot block self
    const activePartners = users.filter(u => u.role === 'partner' && u.active);
    const target = users.find(u => u.id === id);
    if (target?.role === 'partner' && target.active && activePartners.length <= 1) {
      return; // Last active partner cannot be blocked
    }
    setUsers(prev =>
      prev.map(u => (u.id === id ? { ...u, active: !u.active, updated_at: new Date().toISOString() } : u))
    );
  }

  function removeUser(id: string) {
    if (currentUser?.id === id) {
      return { success: false, error: "You cannot remove yourself." };
    }
    const activePartners = users.filter(u => u.role === 'partner' && u.active);
    const target = users.find(u => u.id === id);
    if (target?.role === 'partner' && activePartners.length <= 1) {
      return { success: false, error: "The last active partner cannot be removed." };
    }
    setUsers(prev => prev.filter(u => u.id !== id));
    return { success: true };
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        signIn,
        signOut,
        addUser,
        updateUserRole,
        resetUserPassword,
        toggleUserActive,
        removeUser,
        isPartner: currentUser?.role === 'partner'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
