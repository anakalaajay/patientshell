import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  createPatientQuestion,
  getPatientQuestions,
  getPatientTimeline,
  type PatientQuestion,
  type ReviewPackage,
} from '../services/patient'

function dateLabel(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

function QuestionStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: 'bg-amber-50 text-amber-800 ring-amber-200',
    in_progress: 'bg-blue-50 text-blue-800 ring-blue-200',
    answered: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    closed: 'bg-slate-100 text-slate-700 ring-slate-200',
  }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${styles[status] || styles.open}`}>{status.replaceAll('_', ' ')}</span>
}

export default function PatientQuestionsPage() {
  const { session } = useAuth()
  const [questions, setQuestions] = useState<PatientQuestion[]>([])
  const [packages, setPackages] = useState<ReviewPackage[]>([])
  const [question, setQuestion] = useState('')
  const [packageId, setPackageId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function refresh() {
    if (!session) return
    const [questionResult, timeline] = await Promise.all([
      getPatientQuestions(session.access_token),
      getPatientTimeline(session.access_token),
    ])
    setQuestions(questionResult.questions)
    setPackages(timeline.review_packages)
  }

  useEffect(() => {
    if (!session) return
    let active = true
    void Promise.all([getPatientQuestions(session.access_token), getPatientTimeline(session.access_token)])
      .then(([questionResult, timeline]) => {
        if (!active) return
        setQuestions(questionResult.questions)
        setPackages(timeline.review_packages)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load questions.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await createPatientQuestion(session.access_token, question.trim(), packageId || undefined)
      setQuestion('')
      setPackageId('')
      await refresh()
      setSuccess('Your question was submitted.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit your question.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Follow-up and clarification</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Patient questions</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Submit a non-urgent question and track its status or a doctor's written resolution.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 className="text-lg font-bold">Ask a question</h2>
        <p className="mt-1 text-sm text-slate-500">Avoid including unnecessary sensitive information. This form is not for emergencies.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Your question
            <textarea required minLength={3} maxLength={3000} rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What would you like your care team to clarify?" className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" />
            <span className="mt-1 block text-right text-xs text-slate-400">{question.length}/3000</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">Related review package <span className="font-normal text-slate-400">(optional)</span>
            <select value={packageId} onChange={(event) => setPackageId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"><option value="">General question</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
          </label>
          <div className="flex justify-end"><button disabled={submitting || question.trim().length < 3} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit question'}</button></div>
        </form>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Your questions</h2><p className="mt-1 text-sm text-slate-500">Status and responses from your care team</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{questions.length} total</span></div>
        {loading ? <p className="py-8 text-sm text-slate-500">Loading your questions…</p> : questions.length ? <div className="mt-5 space-y-4">{questions.map((item) => <article key={item.id} className="rounded-xl border border-slate-100 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-2xl whitespace-pre-wrap text-sm font-medium leading-6 text-slate-800">{item.question}</p><QuestionStatus status={item.status} /></div><p className="mt-2 text-xs text-slate-500">Submitted {dateLabel(item.created_at)}</p>{item.responses.length > 0 && <div className="mt-4 space-y-3 border-l-2 border-teal-200 pl-4">{item.responses.map((response) => <div key={response.id}><p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Care team response · {dateLabel(response.created_at)}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{response.resolution}</p></div>)}</div>}</article>)}</div> : <div className="py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-xl">?</span><h3 className="mt-3 font-semibold">No questions yet</h3><p className="mt-1 text-sm text-slate-500">When you submit a question, it will appear here.</p></div>}
      </section>
    </div>
  )
}
