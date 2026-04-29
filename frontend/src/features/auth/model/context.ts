import { createContext } from 'react'

export type AuthUser = {
  id: string
  email: string
  name: string | null
}

export type AuthOrganization = {
  id: string
  name: string
}

export type AuthSession = {
  token: string
  user: AuthUser
  organization: AuthOrganization
}

export type AuthCredentials = {
  email: string
  password: string
}

export type RegistrationCredentials = AuthCredentials & {
  workspaceName: string
}

export type VerifyRegistrationCredentials = RegistrationCredentials & {
  code: string
}

export type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  login: (credentials: AuthCredentials) => Promise<void>
  requestRegistrationCode: (credentials: RegistrationCredentials) => Promise<void>
  verifyRegistrationCode: (credentials: VerifyRegistrationCredentials) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
