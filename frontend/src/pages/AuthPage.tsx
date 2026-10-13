import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { isSupabaseConfigured } from '../services/supabase'

export default function AuthPage() {
  const { signIn, signUp, session, profile, profileLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { from?: string } | null)?.from || '/patient'
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (session && !profileLoading && profile?.role === 'patient') navigate('/patient', { replace: true })
  }, [session, profile, profileLoading, navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
        navigate(returnTo, { replace: true })
      } else {
        const hasSession = await signUp(fullName, email.trim(), password)
        if (hasSession) navigate('/patient', { replace: true })
        else setMessage('Account created. Check your email to confirm your address, then sign in.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -left-24 top-24 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-3 text-lg font-bold tracking-tight">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-400 text-slate-950">P</span>
          Patientshell
        </Link>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-teal-300">Your health, in context</p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight xl:text-6xl">A clearer picture of your care.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">Keep visits, reports and questions together in one secure patient portal.</p>
          <div className="mt-10 flex items-center gap-4 text-sm text-slate-300">
            <span className="h-px w-12 bg-teal-400" />
            Built around patient ownership and consent
          </div>
        </div>
        <p className="relative text-xs text-slate-500">Private health information should only be available to the people you authorize.</p>
      </section>

      <section className="flex items-center justify-center bg-slate-50 px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-10 inline-flex items-center gap-3 text-lg font-bold text-slate-900 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white">P</span>
            Patientshell
          </Link>
          <p className="text-sm font-semibold text-teal-700">{mode === 'signin' ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{mode === 'signin' ? 'Sign in to your account' : 'Create your patient account'}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{mode === 'signin' ? 'Access your care timeline and follow up on questions.' : 'Your account is created with the patient role by the backend database trigger.'}</p>

          {!isSupabaseConfigured && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Add your Supabase project URL and publishable key to <code>frontend/.env.local</code> before using authentication.
            </div>
          )}
          {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          {message && <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {mode === 'signup' && (
              <label className="block text-sm font-medium text-slate-700">
                Full name
                <input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="Your name" />
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="you@example.com" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input required type="password" minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="At least 8 characters" />
            </label>
            <button disabled={busy || !isSupabaseConfigured} className="flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3.5 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in securely' : 'Create account'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            {mode === 'signin' ? "New to Patientshell? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null) }} className="font-semibold text-teal-700 hover:text-teal-900">
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="mt-8 text-center text-xs leading-5 text-slate-500">This portal is a development foundation. Do not use it for urgent medical care.</p>
        </div>
      </section>
    </main>
  )
}
