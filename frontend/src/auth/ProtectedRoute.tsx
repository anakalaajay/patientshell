import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function ProtectedRoute() {
  const { session, profile, loading, profileLoading, profileError, signOut } = useAuth()
  const location = useLocation()

  if (loading || (session && profileLoading)) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Securing your patient portal…</div>
  }

  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  if (profileError || !profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Account setup needed</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">We couldn't load your patient profile</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{profileError || 'Your account profile is not provisioned yet.'}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Check that the Phase 3 and Phase 4 migrations are applied and the backend environment is configured.</p>
          <button className="mt-6 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => void signOut()}>Sign out</button>
        </section>
      </main>
    )
  }

  if (profile.role !== 'patient') {
    return <Navigate to="/not-authorized" replace />
  }

  return <Outlet />
}
