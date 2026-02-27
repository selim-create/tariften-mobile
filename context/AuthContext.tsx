import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User } from '../lib/types';
import { getMe, login as apiLogin, register as apiRegister, googleAuth, RegisterData } from '../lib/api';

const TOKEN_KEY = 'auth_token';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

  const register = async (userData: RegisterData) => {
    await apiRegister(userData);
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

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
