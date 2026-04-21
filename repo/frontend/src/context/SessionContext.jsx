import { createContext, useContext, useState } from 'react';
import axios from 'axios';

const SessionContext = createContext(null);

function generateSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SessionProvider({ children }) {
  const [sessionId] = useState(() => {
    const existing = sessionStorage.getItem('sessionId');
    if (existing) return existing;
    const id = generateSessionId();
    sessionStorage.setItem('sessionId', id);
    return id;
  });

  const [authState, setAuthState] = useState(() => {
    const token = sessionStorage.getItem('authToken');
    const user  = sessionStorage.getItem('authUser');
    return token && user ? { token, user: JSON.parse(user) } : null;
  });

  async function login(userId) {
    const res = await axios.post('/api/auth/token', { userId });
    const { token, user } = res.data;
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('authUser', JSON.stringify(user));
    setAuthState({ token, user });
    return user;
  }

  function logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authUser');
    setAuthState(null);
  }

  const userId = authState?.user?.id ?? '';

  return (
    <SessionContext.Provider value={{ sessionId, userId, authState, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
