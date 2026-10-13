import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../services/api'

type QueueItem = {
  package: { id: string; title: string; purpose: string | null; status: string; expires_at: string | null; created_at: string }
  patient: { id: string; full_name: string | null }
  grant: { granted_at: string; expires_at: string | null; revoked_at: string | null }
  review: { status: string; reviewed_at: string | null } | null
  urgency: string
}
export default function DoctorDashboard() {
  const { session } = useAuth()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!session) return
    let active = true
    void apiRequest<{ queue: QueueItem[] }>('/api/doctor/queue', session.access_token)
      .then((data) => { if (active) setQueue(data.queue) })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load doctor queue.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])
  return <div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Clinical workspace</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Doctor dashboard</h1><p className="mt-2 text-sm text-slate-500">Review only packages explicitly assigned to your verified doctor account.</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Assigned packages</p><p className="mt-2 text-3xl font-bold">{queue.length}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Awaiting review</p><p className="mt-2 text-3xl font-bold">{queue.filter((item) => !item.review || item.review.status !== 'completed').length}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Active grants</p><p className="mt-2 text-3xl font-bold">{queue.filter((item) => !item.grant.revoked_at).length}</p></div></div>
    <section className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Assigned review queue</h2><p className="mt-1 text-sm text-slate-500">Urgency reflects package expiry/status, not a clinical diagnosis.</p></div>
      {loading ? <p className="p-6 text-sm text-slate-500">Loading queue…</p> : queue.length ? <div className="divide-y divide-slate-100">{queue.map((item) => <article key={item.package.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.package.title}</h3><span className={\`rounded-full px-2.5 py-1 text-xs font-semibold \${item.urgency === 'high' ? 'bg-rose-50 text-rose-700' : item.urgency === 'active' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}\`}>{item.urgency === 'high' ? 'Urgent · expiring' : item.urgency === 'active' ? 'Active' : 'Routine'}</span></div><p className="mt-1 text-sm text-slate-500">Patient: {item.patient.full_name || 'Patient'} · {item.package.status.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">Grant {item.grant.expires_at ? \`expires \${new Date(item.grant.expires_at).toLocaleString()}\` : 'has no expiry set'}</p></div><Link to={\`/doctor/reviews/\${item.package.id}\`} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">Open review</Link></article>)}</div> : <div className="p-10 text-center"><h3 className="font-semibold">No assigned packages</h3><p className="mt-2 text-sm text-slate-500">When a patient grants you access to a review package, it will appear here.</p></div>}
    </section>
  </div>
}
