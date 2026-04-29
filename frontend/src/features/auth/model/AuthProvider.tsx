import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { apiRequest } from '@/shared/api/client'
import { AuthContext } from './context'
import type {
  AuthContextValue,
  AuthSession,
  RegistrationCredentials,
  VerifyRegistrationCredentials,
} from './context'

const AUTH_STORAGE_KEY = 'marketplace_analytics_auth_session'

function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as AuthSession
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

function persistSession(session: AuthSession | null): void {
  if (typeof window === 'undefined') return
  if (session) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

function toRegistrationPayload(credentials: RegistrationCredentials) {
  return {
    email: credentials.email,
    password: credentials.password,
    organizationName: credentials.workspaceName,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession())

  const saveSession = (nextSession: AuthSession | null): void => {
    setSession(nextSession)
    persistSession(nextSession)
  }

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isAuthenticated: Boolean(session),
    login: async (credentials) => {
      const nextSession = await apiRequest<AuthSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      saveSession(nextSession)
    },
    requestRegistrationCode: async (credentials) => {
      await apiRequest<{ ok: true }>('/auth/email-code/request', {
        method: 'POST',
        body: JSON.stringify({ email: credentials.email }),
      })
    },
    verifyRegistrationCode: async (credentials: VerifyRegistrationCredentials) => {
      const nextSession = await apiRequest<AuthSession>('/auth/email-code/verify', {
        method: 'POST',
        body: JSON.stringify({
          ...toRegistrationPayload(credentials),
          code: credentials.code,
        }),
      })
      saveSession(nextSession)
    },
    logout: () => saveSession(null),
  }), [session])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
