import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../services/api'

type Entity = { id: string; extracted_data: Record<string, unknown>; confidence: number | null; review_status: string }
type DocumentItem = { id: string; file_name: string; mime_type: string; storage_path: string; signed_url: string | null; document_date: string | null; extracted_items: Entity[] }
type Question = { id: string; question: string; status: string }
type Comparison = { test_name: string; comparable: boolean; unit_consistency: string; context_consistency: string; values: Array<{ value: string | null; unit: string | null; reference_range: string | null; date: string | null; document_id: string | null }>; interpretation: string }
type Workspace = {
  package: { id: string; title: string; purpose: string | null; status: string }
  documents: DocumentItem[]
  timeline: Array<{ id: string; visit_type: string | null; started_at: string | null; facility_name: string | null; summary: string | null }>
  labs: Array<{ id: string; test_name: string; result_value: string | null; unit: string | null; reference_range: string | null; observed_at: string | null }>
  medications: Array<{ id: string; medication_name: string; dosage: string | null; route: string | null; frequency: string | null; status: string }>
  comparison: { comparisons: Comparison[]; method: string }
  review: { summary: string | null; recommendations: string | null; status: string } | null
  questions: Question[]
}
export default function DoctorReviewView() {
  const { packageId = '' } = useParams()
  const { session } = useAuth()
  const [data, setData] = useState<Workspace | null>(null)
  const [summary, setSummary] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session || !packageId) return
    const result = await apiRequest<Workspace>(\`/api/doctor/reviews/\${packageId}\`, session.access_token)
    setData(result)
    setSummary(result.review?.summary || '')
    setRecommendations(result.review?.recommendations || '')
  }, [session, packageId])
  useEffect(() => {
    let active = true
    void load().catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load review.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])

  async function saveNote() {
    if (!session || !packageId || summary.trim().length < 1) return
    setSaving(true); setError(null); setNotice(null)
    try {
      const result = await apiRequest<{ review: Workspace['review'] }>(\`/api/doctor/reviews/\${packageId}/notes\`, session.access_token, {
        method: 'POST', body: JSON.stringify({ summary, recommendations: recommendations || null }),
      })
      setNotice('Clinical review note saved.')
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save note.') }
    finally { setSaving(false) }
  }
  async function resolve(status: 'completed' | 'needs_information') {
    if (!session || !packageId || !summary.trim()) { setError('Add a review summary before resolving.'); return }
    setSaving(true); setError(null); setNotice(null)
    try {
      await apiRequest(\`/api/doctor/reviews/\${packageId}/resolve\`, session.access_token, {
        method: 'POST', body: JSON.stringify({ summary, recommendations: recommendations || null, status }),
      })
      setNotice(status === 'completed' ? 'Review marked complete.' : 'Review marked as needing more information.')
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not resolve review.') }
    finally { setSaving(false) }
  }
  async function respond(questionId: string) {
    if (!session || !responses[questionId]?.trim()) return
    setSaving(true); setError(null)
    try {
      await apiRequest(\`/api/doctor/questions/\${questionId}/respond\`, session.access_token, {
        method: 'POST', body: JSON.stringify({ resolution: responses[questionId] }),
      })
      setNotice('Response sent to the patient.')
      setResponses((current) => ({ ...current, [questionId]: '' }))
      await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not send response.') }
    finally { setSaving(false) }
  }

  if (loading) return <p className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading authorized review package…</p>
  if (!data) return <div className="space-y-4"><p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error || 'Review package unavailable.'}</p><Link to="/doctor" className="text-sm font-semibold text-indigo-700">Back to queue</Link></div>
  return <div className="space-y-6">
    <header><Link to="/doctor" className="text-sm font-semibold text-indigo-700">← Doctor queue</Link><p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Authorized review package</p><h1 className="mt-2 text-3xl font-bold">{data.package.title}</h1><p className="mt-2 text-sm text-slate-500">{data.package.purpose || 'Clinical document review'} · {data.package.status.replaceAll('_', ' ')}</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">{notice}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Documents and extracted entities</h2><p className="mt-1 text-sm text-slate-500">Source files are private. Use the original document as the authority; extracted values can contain OCR errors.</p>
      <div className="mt-4 space-y-4">{data.documents.map((doc) => <article key={doc.id} className="grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2"><div><h3 className="font-semibold">{doc.file_name}</h3><p className="mt-1 text-xs text-slate-500">{doc.document_date || 'Date not recorded'} · {doc.mime_type}</p><div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{doc.signed_url && doc.mime_type === "application/pdf" ? <iframe title={`Original document: ${doc.file_name}`} src={doc.signed_url} className="h-[640px] w-full" /> : doc.signed_url && doc.mime_type?.startsWith("image/") ? <img src={doc.signed_url} alt={`Original medical document: ${doc.file_name}`} className="max-h-[640px] w-full object-contain" /> : <p className="p-4 text-sm text-slate-600">Secure preview is unavailable. The original file remains private. Confirm that the doctor has access to this review package and that the Storage signing service is configured.</p>}{doc.signed_url && <a href={doc.signed_url} target="_blank" rel="noreferrer" className="block border-t border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 hover:text-indigo-900">Open original in new tab</a>}</div></div><div className="space-y-2">{doc.extracted_items.length ? doc.extracted_items.map((item) => { const entity = item.extracted_data as Record<string, unknown>; const source = (entity.source || {}) as Record<string, unknown>; return <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold capitalize">{String(entity.entity_type || 'extracted item').replaceAll('_', ' ')}</p><span className={\`rounded-full px-2 py-1 text-xs \${entity.needs_human_review ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}\`}>{entity.needs_human_review ? 'Review needed' : item.review_status}</span></div><p className="mt-2 text-sm">{String(entity.value ?? 'Value not detected')}{entity.unit ? \` \${String(entity.unit)}\` : ''}</p><p className="mt-1 text-xs text-slate-500">Page {String(source.page || '?')} · Confidence {item.confidence == null ? 'unknown' : \`\${Math.round(item.confidence * 100)}%\`}</p>{source.quote && <p className="mt-2 text-xs leading-5 text-slate-500">“{String(source.quote)}”</p>}</div>}) : <p className="text-sm text-slate-500">No extracted entities recorded.</p>}</div></article>)}</div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Longitudinal lab comparison</h2><p className="mt-1 text-sm text-slate-500">{data.comparison.method}</p><div className="mt-4 space-y-4">{data.comparison.comparisons.map((comparison) => <article key={comparison.test_name} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold capitalize">{comparison.test_name}</h3><span className={\`rounded-full px-2 py-1 text-xs font-semibold \${comparison.comparable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}\`}>{comparison.comparable ? 'Units/context consistent' : 'Not directly comparable'}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{comparison.values.map((value, index) => <div key={\`\${value.date}-\${index}\`} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{value.date ? new Date(value.date).toLocaleDateString() : 'Date not recorded'}</p><p className="mt-1 text-lg font-bold">{value.value ?? 'Not recorded'} <span className="text-sm font-medium">{value.unit || 'unit missing'}</span></p><p className="mt-1 text-xs text-slate-500">Reference: {value.reference_range || 'not recorded'}</p></div>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">{comparison.unit_consistency}; {comparison.context_consistency}. {comparison.interpretation}</p></article>)}</div>{data.comparison.comparisons.length === 0 && <p className="text-sm text-slate-500">No structured lab records linked to this package.</p>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Visit timeline and medications</h2><div className="mt-4 grid gap-6 md:grid-cols-2"><div><h3 className="font-semibold">Visits</h3>{data.timeline.map((visit) => <div key={visit.id} className="mt-3 rounded-xl bg-slate-50 p-3"><p className="font-medium">{visit.visit_type || 'Visit'}</p><p className="mt-1 text-xs text-slate-500">{visit.started_at ? new Date(visit.started_at).toLocaleDateString() : 'Date not recorded'} · {visit.facility_name || 'Facility not recorded'}</p>{visit.summary && <p className="mt-2 text-sm">{visit.summary}</p>}</div>)}</div><div><h3 className="font-semibold">Medications</h3>{data.medications.map((medication) => <div key={medication.id} className="mt-3 rounded-xl bg-slate-50 p-3"><p className="font-medium">{medication.medication_name}</p><p className="mt-1 text-sm text-slate-600">{medication.dosage || 'Dose not recorded'} · {medication.frequency || 'Frequency not recorded'}</p><p className="mt-1 text-xs text-slate-500">{medication.status}</p></div>)}</div></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Clinical note and recommendations</h2><label className="mt-4 block text-sm font-medium">Review summary<textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={12000} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><label className="mt-4 block text-sm font-medium">Recommendations<textarea value={recommendations} onChange={(event) => setRecommendations(event.target.value)} maxLength={12000} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><div className="mt-4 flex flex-wrap gap-2"><button disabled={saving || !summary.trim()} onClick={() => void saveNote()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Save note</button><button disabled={saving || !summary.trim()} onClick={() => void resolve('needs_information')} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Request more information</button><button disabled={saving || !summary.trim()} onClick={() => void resolve('completed')} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Complete review</button></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold">Patient questions</h2>{data.questions.length ? data.questions.map((question) => <article key={question.id} className="mt-4 rounded-xl border border-slate-100 p-4"><p className="text-sm leading-6">{question.question}</p><p className="mt-1 text-xs text-slate-500">Status: {question.status}</p>{question.status !== 'answered' && <><textarea value={responses[question.id] || ''} onChange={(event) => setResponses((current) => ({ ...current, [question.id]: event.target.value }))} rows={3} placeholder="Write a formal response for the patient" className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm" /><button disabled={saving || (responses[question.id] || '').trim().length < 3} onClick={() => void respond(question.id)} className="mt-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send response</button></>}</article>) : <p className="mt-3 text-sm text-slate-500">No questions are attached to this package.</p>}</section>
    <p className="text-xs leading-5 text-slate-500">Clinical comparison is a data-quality aid only. It does not diagnose, recommend treatment automatically, or replace professional judgment.</p>
  </div>
}
