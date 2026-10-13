import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function DoctorProtectedRoute() {
  const { session, profile, loading, profileLoading, profileError } = useAuth()
  const location = useLocation()
  if (loading || (session && profileLoading)) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Verifying doctor access…</div>
  }
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  if (profileError || !profile) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 px-6"><section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-8"><h1 className="text-xl font-bold">Doctor profile unavailable</h1><p className="mt-2 text-sm text-slate-600">{profileError || 'Your verified doctor profile could not be loaded.'}</p></section></main>
  }
  if (profile.role !== 'doctor') return <Navigate to="/not-authorized" replace />
  return <Outlet />
}
