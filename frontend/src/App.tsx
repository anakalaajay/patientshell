import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import PortalLayout from './components/PortalLayout'
import AuthPage from './pages/AuthPage'
import PatientDashboard from './pages/PatientDashboard'
import PatientDocumentsPage from './pages/PatientDocuments'
import PatientProfilePage from './pages/PatientProfile'
import PatientQuestionsPage from './pages/PatientQuestions'
import PatientTimelinePage from './pages/PatientTimeline'

function HomeRedirect() {
  const { session, profile, loading, profileLoading } = useAuth()
  if (loading || (session && profileLoading)) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading Patientshell…</div>
  }
  if (!session) return <Navigate to="/auth" replace />
  if (profile?.role === 'patient') return <Navigate to="/patient" replace />
  if (profile) return <Navigate to="/not-authorized" replace />
  return <Navigate to="/auth" replace />
}

function NotAuthorized() {
  const { signOut } = useAuth()
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-xl text-amber-800">!</span>
        <h1 className="mt-4 text-2xl font-bold">Patient portal only</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">This account does not have the patient role. Please use the portal intended for your account.</p>
        <button onClick={() => void signOut()} className="mt-6 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Sign out</button>
      </section>
    </main>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/not-authorized" element={<NotAuthorized />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/patient" element={<PortalLayout />}>
          <Route index element={<PatientDashboard />} />
          <Route path="profile" element={<PatientProfilePage />} />
          <Route path="timeline" element={<PatientTimelinePage />} />
          <Route path="documents" element={<PatientDocumentsPage />} />
          <Route path="questions" element={<PatientQuestionsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>
}
