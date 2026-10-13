import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

const navigation = [
  { to: '/patient', label: 'Overview', end: true, icon: '⌂' },
  { to: '/patient/timeline', label: 'Medical timeline', end: false, icon: '◷' },
  { to: '/patient/documents', label: 'My documents', end: false, icon: '▤' },
  { to: '/patient/profile', label: 'My profile', end: false, icon: '◎' },
  { to: '/patient/questions', label: 'Questions', end: false, icon: '?' },
]

export default function PortalLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    setSignOutError(null)
    try {
      await signOut()
      navigate('/auth', { replace: true })
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <NavLink to="/patient" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-600 text-lg font-bold text-white shadow-sm shadow-teal-900/10">P</span>
            <span><span className="block text-base font-bold tracking-tight">Patientshell</span><span className="block text-xs text-slate-500">Patient portal</span></span>
          </NavLink>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{profile?.full_name || 'Patient'}</p><p className="text-xs text-slate-500">{profile?.email}</p></div>
            <button onClick={() => setMenuOpen(!menuOpen)} className="grid h-10 w-10 place-items-center rounded-full bg-teal-50 font-bold text-teal-800 ring-1 ring-teal-100" aria-label="Open account menu">{(profile?.full_name || profile?.email || 'P').slice(0, 1).toUpperCase()}</button>
            {menuOpen && <div className="absolute right-4 top-16 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:right-8"><button onClick={() => void handleSignOut()} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-50">Sign out</button></div>}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 lg:py-9">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Your care</p>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)} className={({ isActive }) => \`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition \${isActive ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-100' : 'text-slate-600 hover:bg-white hover:text-slate-900'}\`}>
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/80 text-base">{item.icon}</span>{item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 hidden rounded-2xl border border-teal-100 bg-teal-50/70 p-4 lg:block">
            <p className="text-sm font-semibold text-teal-950">Your information, your control</p>
            <p className="mt-2 text-xs leading-5 text-teal-900/80">Doctors can only view records included in a package you explicitly share with them.</p>
          </div>
          {signOutError && <p role="alert" className="mt-4 text-xs text-rose-700">{signOutError}</p>}
        </aside>
        <main className="min-w-0"><Outlet /></main>
      </div>
    </div>
  )
}
