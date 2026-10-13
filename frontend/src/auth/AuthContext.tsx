import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { apiRequest } from '../services/api'
import { isSupabaseConfigured, supabase } from '../services/supabase'

export type AppProfile = {
  id: string
  role: 'patient' | 'doctor' | 'admin'
  full_name: string | null
  email: string | null
  phone?: string | null
}

type AuthContextValue = {
  session: Session | null
  profile: AppProfile | null
  loading: boolean
  profileLoading: boolean
  profileError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (fullName: string, email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AppProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setProfileLoading(Boolean(nextSession))
      setLoading(false)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setProfileError(error.message)
      setSession(data.session)
      setProfileLoading(Boolean(data.session))
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!session) {
      setProfile(null)
      setProfileError(null)
      setProfileLoading(false)
      return () => { active = false }
    }

    setProfileLoading(true)
    setProfileError(null)
    void apiRequest<{ user: AppProfile }>('/api/me', session.access_token)
      .then((result) => {
        if (active) setProfile(result.user)
      })
      .catch((error: unknown) => {
        if (active) {
          setProfile(null)
          setProfileError(error instanceof Error ? error.message : 'Could not load your account profile.')
        }
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => { active = false }
  }, [session])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error('Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to frontend/.env.local.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    if (!isSupabaseConfigured) throw new Error('Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to frontend/.env.local.')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName.trim() } },
    })
    if (error) throw error
    return Boolean(data.session)
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo(() => ({
    session, profile, loading, profileLoading, profileError, signIn, signUp, signOut,
  }), [session, profile, loading, profileLoading, profileError, signIn, signUp, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
