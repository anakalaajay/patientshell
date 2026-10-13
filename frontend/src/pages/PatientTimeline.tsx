import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getPatientTimeline, type TimelineEntry, type TimelinePayload } from '../services/patient'

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Date not recorded'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(parsed)
}

export default function PatientTimelinePage() {
  const { session } = useAuth()
  const [data, setData] = useState<TimelinePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let active = true
    void getPatientTimeline(session.access_token).then((result) => { if (active) setData(result) })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load your timeline.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  return (
    <div className="space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Your medical history</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Medical timeline</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Visits and document metadata arranged from newest to oldest. Files themselves are not exposed through this timeline.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading timeline…</div> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            {data?.timeline.length ? <div className="relative space-y-0 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-px before:bg-slate-200">
              {data.timeline.map((entry: TimelineEntry) => <article key={`${entry.type}-${entry.id}`} className="relative flex gap-4 pb-7 last:pb-0">
                <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-4 ring-white ${entry.type === 'visit' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'}`}>{entry.type === 'visit' ? '◷' : '▤'}</span>
                <div className="min-w-0 flex-1 rounded-xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{entry.type === 'visit' ? 'Medical visit' : 'Medical document'}</p><h2 className="mt-1 font-semibold">{entry.type === 'visit' ? (entry.visit_type || 'Clinical visit') : entry.file_name}</h2></div><time className="text-xs text-slate-500">{dateLabel(entry.occurred_at)}</time></div>
                  {entry.type === 'visit' ? <><p className="mt-2 text-sm text-slate-600">{entry.facility_name || 'Facility not recorded'}{entry.status ? ` · ${entry.status.replaceAll('_', ' ')}` : ''}</p>{entry.summary && <p className="mt-2 text-sm leading-6 text-slate-600">{entry.summary}</p>}</> : <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>{entry.document_type || 'Report'}</span><span>·</span><span>{(entry.processing_status || 'pending').replaceAll('_', ' ')}</span></div>}
                </div>
              </article>)}
            </div> : <div className="py-12 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-2xl">◷</span><h2 className="mt-4 font-semibold">Your timeline starts here</h2><p className="mt-2 text-sm text-slate-500">No visits or documents are recorded yet.</p></div>}
          </section>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Review packages</h2><p className="mt-1 text-sm text-slate-500">Packages created for doctor review</p><div className="mt-4 space-y-3">{data?.review_packages.length ? data.review_packages.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.status.replaceAll('_', ' ')}</p>{item.expires_at && <p className="mt-1 text-xs text-slate-500">Expires {dateLabel(item.expires_at)}</p>}</div>) : <p className="py-3 text-sm text-slate-500">No review packages yet.</p>}</div></section>
            <section className="rounded-2xl border border-teal-100 bg-teal-50/70 p-5"><h2 className="font-bold text-teal-950">Need clarification?</h2><p className="mt-2 text-sm leading-6 text-teal-900/80">Send a question and track its status here.</p><Link to="/patient/questions" className="mt-4 inline-flex rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">My questions</Link></section>
          </aside>
        </div>
      )}
    </div>
  )
}
