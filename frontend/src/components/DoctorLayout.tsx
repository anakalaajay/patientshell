import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function DoctorLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  async function leave() {
    await signOut()
    navigate('/auth', { replace: true })
  }
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"><NavLink to="/doctor" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-700 font-bold text-white">D</span><span><strong className="block">Patientshell</strong><span className="text-xs text-slate-500">Doctor workspace</span></span></NavLink><div className="flex items-center gap-4"><span className="hidden text-sm text-slate-600 sm:inline">{profile?.full_name || profile?.email}</span><button onClick={() => void leave()} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">Sign out</button></div></div></header>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex gap-2"><NavLink end to="/doctor" className={({isActive}) => `rounded-xl px-4 py-2 text-sm font-semibold ${isActive ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-white'}`}>Review queue</NavLink></nav><Outlet /></div>
  </div>
}
