import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import type { AuthState, AuthUser } from './types'

interface AuthContextValue {
  authState: AuthState
  login: (user: AuthUser, accessToken: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const AUTH_STORAGE_KEY = 'universal_translator_auth'
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') + '/api/v1'

function loadStoredAuthState(): AuthState {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw === null) {
      return { status: 'anonymous', user: null, accessToken: null }
    }
    const parsed = JSON.parse(raw) as Partial<AuthState>
    if (parsed.status === 'authenticated' && parsed.user !== null && parsed.user !== undefined && typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0) {
      return {
        status: 'authenticated',
        user: parsed.user as AuthUser,
        accessToken: parsed.accessToken,
      }
    }
  } catch (error) {
    console.warn('[Auth] Failed to restore stored auth state', error)
  }
  return { status: 'anonymous', user: null, accessToken: null }
}

function storeAuthState(state: AuthState): void {
  try {
    if (state.status === 'authenticated') {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('[Auth] Failed to persist auth state', error)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => loadStoredAuthState())

  const login = (user: AuthUser, accessToken: string) => {
    const nextState: AuthState = {
      status: 'authenticated',
      user,
      accessToken,
    }
    storeAuthState(nextState)
    setAuthState(nextState)
  }

  const logout = () => {
    const nextState: AuthState = {
      status: 'anonymous',
      user: null,
      accessToken: null,
    }
    storeAuthState(nextState)
    setAuthState(nextState)
  }

  useEffect(() => {
    if (authState.status !== 'authenticated' || authState.accessToken === null) return

    let isCancelled = false

    const validateAccessToken = async () => {
      try {
        const response = await fetch(`${API_BASE}/users/me`, {
          headers: {
            Authorization: `Bearer ${authState.accessToken}`,
          },
        })

        if (isCancelled) return

        if (response.status === 401) {
          logout()
          return
        }

        if (response.ok) {
          const user = (await response.json()) as AuthUser
          const nextState: AuthState = {
            status: 'authenticated',
            user,
            accessToken: authState.accessToken,
          }
          storeAuthState(nextState)
          setAuthState(nextState)
        }
      } catch (error) {
        console.warn('[Auth] Failed to validate stored auth state', error)
      }
    }

    void validateAccessToken()

    return () => {
      isCancelled = true
    }
  }, [authState.accessToken, authState.status])

  return <AuthContext.Provider value={{ authState, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
