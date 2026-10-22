import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User } from '../lib/types';
import { getMe, login as apiLogin, register as apiRegister, googleAuth, appleAuth, RegisterData } from '../lib/api';
import { setKitchenAuth } from '../lib/kitchen-store';

const TOKEN_KEY = 'auth_token';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (identityToken: string, fullName?: string) => Promise<void>;
  /** Resolves true when Core signed the new member in (token stored), false otherwise. */
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Keeps the profile card in step after the kitchen profile screen saves. */
  setKitchenProfileCompleted: (completed: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadToken = useCallback(async () => {
    try {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        const userData = await getMe(storedToken);
        if (userData) {
          setUser(userData);
        } else {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setToken(null);
        }
      }
    } catch (error) {
      console.error('Auth load error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  // Bu Hafta / Alışveriş sync on the account follows the signed-in token.
  useEffect(() => { setKitchenAuth(token); }, [token]);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    const jwt = data.token;
    await SecureStore.setItemAsync(TOKEN_KEY, jwt);
    setToken(jwt);
    const userData = await getMe(jwt);
    setUser(userData);
  };

  const loginWithGoogle = async (idToken: string) => {
    const data = await googleAuth(idToken);
    const jwt = data.token;
    await SecureStore.setItemAsync(TOKEN_KEY, jwt);
    setToken(jwt);
    const userData = await getMe(jwt);
    setUser(userData);
  };

  const loginWithApple = async (identityToken: string, fullName?: string) => {
    const data = await appleAuth(identityToken, fullName);
    const jwt = data.token;
    await SecureStore.setItemAsync(TOKEN_KEY, jwt);
    setToken(jwt);
    const userData = await getMe(jwt);
    setUser(userData);
  };

  const register = async (userData: RegisterData) => {
    const data = await apiRegister(userData);
    const jwt = typeof data?.token === 'string' && data.token ? data.token : null;
    // Older Core returns only {message, user_id}: the member signs in manually.
    if (!jwt) return false;
    // Same as login: persist, then load the account.
    await SecureStore.setItemAsync(TOKEN_KEY, jwt);
    setToken(jwt);
    const me = await getMe(jwt);
    setUser(me);
    return true;
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    const userData = await getMe(token);
    if (userData) {
      setUser(userData);
    } else {
      await logout();
    }
  };

  const setKitchenProfileCompleted = useCallback((completed: boolean) => {
    setUser(current => (current && current.kitchen_profile_completed !== completed
      ? { ...current, kitchen_profile_completed: completed } : current));
  }, []);

  return (
    <AuthContext.Provider value={{
      user, token, isLoading, login, loginWithGoogle, loginWithApple, register, logout, refreshUser, setKitchenProfileCompleted,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
