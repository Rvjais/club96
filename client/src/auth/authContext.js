import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** { user, balance, status, setBalance, refresh, login, signup, logout, deposit } */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
