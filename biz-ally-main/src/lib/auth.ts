// src/lib/auth.ts
// Simple auth store using localStorage + React hooks.
// No external state library needed.

import { auth as authApi, type Language } from "./api";

const TOKEN_KEY = "negocio_token";
const USER_KEY = "negocio_user";

export interface StoredUser {
  id: string;
  email: string;
  preferred_language: Language;
}

export const authStore = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),

  getUser: (): StoredUser | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  isLoggedIn: (): boolean => !!localStorage.getItem(TOKEN_KEY),

  setSession: (token: string, user: StoredUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  login: async (email: string, password: string): Promise<StoredUser> => {
    const res = await authApi.login(email, password);
    // Fetch full user info
    localStorage.setItem(TOKEN_KEY, res.access_token);
    const me = await authApi.me();
    const user: StoredUser = { id: me.id, email: me.email, preferred_language: me.preferred_language };
    authStore.setSession(res.access_token, user);
    return user;
  },

  signup: async (email: string, password: string, preferred_language: Language = "en"): Promise<StoredUser> => {
    const res = await authApi.signup(email, password, preferred_language);
    localStorage.setItem(TOKEN_KEY, res.access_token);
    const me = await authApi.me();
    const user: StoredUser = { id: me.id, email: me.email, preferred_language: me.preferred_language };
    authStore.setSession(res.access_token, user);
    return user;
  },

  logout: () => {
    authStore.clear();
    window.location.href = "/login";
  },
};