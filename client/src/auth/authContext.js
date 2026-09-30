import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** { user, balance, status, setBalance, setUser, refresh, login, signup, logout } */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
