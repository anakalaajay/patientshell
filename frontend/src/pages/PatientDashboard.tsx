import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getPatientQuestions, getPatientTimeline, type PatientQuestion, type TimelinePayload } from '../services/patient'

function formatDate(value: string | null | undefined) {
  if (!value) return 'Date not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    answered: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    open: 'bg-amber-50 text-amber-800 ring-amber-100',
    in_progress: 'bg-blue-50 text-blue-700 ring-blue-100',
    processed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    shared: 'bg-teal-50 text-teal-700 ring-teal-100',
  }
  return <span className={\`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset \${styles[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}\`}>{status.replaceAll('_', ' ')}</span>
}

export default function PatientDashboard() {
  const { session, profile } = useAuth()
  const [data, setData] = useState<TimelinePayload | null>(null)
  const [questions, setQuestions] = useState<PatientQuestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    let active = true
    setLoading(true)
    void Promise.all([getPatientTimeline(session.access_token), getPatientQuestions(session.access_token)])
      .then(([timeline, questionResult]) => {
        if (!active) return
        setData(timeline)
        setQuestions(questionResult.questions)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load your dashboard.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  const recentReports = (data?.documents || []).slice(0, 3)
  const recentQuestions = questions.slice(0, 2)

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -right-10 -top-24 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Patient overview</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Good to see you, {profile?.full_name?.split(' ')[0] || 'there'}.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Your care history, reports and follow-up questions — gathered in one place.</p>
          <Link to="/patient/timeline" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-300">View medical timeline <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading your care summary…</div> : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Recorded visits', value: data?.visits.length || 0, note: 'Across your timeline', symbol: '◷' },
              { label: 'Medical reports', value: data?.documents.length || 0, note: 'Document records', symbol: '▤' },
              { label: 'Review packages', value: data?.review_packages.length || 0, note: 'Shared care summaries', symbol: '▣' },
              { label: 'Open questions', value: questions.filter((item) => item.status === 'open' || item.status === 'in_progress').length, note: 'Awaiting follow-up', symbol: '?' },
            ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]"><div className="flex items-start justify-between"><span className="text-sm font-medium text-slate-500">{item.label}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-lg text-teal-700">{item.symbol}</span></div><p className="mt-5 text-3xl font-bold tracking-tight">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.note}</p></article>)}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Recent reports</h2><p className="mt-1 text-sm text-slate-500">Latest document metadata</p></div><Link to="/patient/timeline" className="text-sm font-semibold text-teal-700 hover:text-teal-900">View all</Link></div>
              <div className="mt-5 divide-y divide-slate-100">
                {recentReports.length ? recentReports.map((report) => <div key={report.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg">▤</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{report.file_name}</p><p className="mt-1 text-xs text-slate-500">{report.document_type || 'Medical document'} · {formatDate(report.created_at)}</p></div><StatusPill status={report.processing_status} /></div>) : <p className="py-8 text-sm text-slate-500">No reports are recorded yet.</p>}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Your questions</h2><p className="mt-1 text-sm text-slate-500">Follow up on your care</p></div><Link to="/patient/questions" className="text-sm font-semibold text-teal-700 hover:text-teal-900">Open</Link></div>
              <div className="mt-5 space-y-3">
                {recentQuestions.length ? recentQuestions.map((question) => <div key={question.id} className="rounded-xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-medium">{question.question}</p><StatusPill status={question.status} /></div><p className="mt-2 text-xs text-slate-500">{formatDate(question.created_at)}</p></div>) : <p className="py-8 text-sm text-slate-500">No questions submitted yet.</p>}
              </div>
            </article>
          </section>
          <section className="rounded-2xl border border-teal-100 bg-teal-50/70 p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-teal-950">Have a question about your care?</h2><p className="mt-1 text-sm text-teal-900/80">Send a non-urgent question to be tracked in your portal.</p></div><Link to="/patient/questions" className="inline-flex w-fit rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Ask a question</Link></div></section>
        </>
      )}
    </div>
  )
}
