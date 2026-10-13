import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

type ExplainPayload = {
  configured: boolean
  message?: string | null
  extracted_document_facts: Array<{
    entity_type?: string | null
    value?: string | null
    normalized_value?: string | null
    unit?: string | null
    reference_range?: string | null
    review_status?: string | null
    confidence?: number | null
    source?: { page?: number | null; quote?: string | null }
  }>
  source_references: Array<{ file_name?: string | null; page?: number | null; quote?: string | null }>
  explanation: { en: string; te: string } | null
  uncertainty: string
  ask_doctor_questions: string[]
  disclaimer: { en: string; te: string }
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export default function DrAnyaChat({ documentId, documentName, onClose }: {
  documentId?: string
  documentName?: string
  onClose?: () => void
}) {
  const { session } = useAuth()
  const [open, setOpen] = useState(Boolean(documentId))
  const [language, setLanguage] = useState<'en' | 'te'>('en')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<ExplainPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function explain() {
    if (!session || !documentId || busy) return
    setBusy(true); setError(null); setResult(null)
    try {
      const response = await fetch(`${apiBase}/api/patient/ai/explain`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, question: question.trim() || null, language }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.detail || 'Dr. Anya could not load this document.')
      setResult(payload as ExplainPayload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Dr. Anya is temporarily unavailable.')
    } finally { setBusy(false) }
  }

  return (
    <>
      {!open && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-xl hover:bg-teal-800" aria-label="Open Dr. Anya AI companion"><span aria-hidden="true">✦</span> Ask Dr. Anya</button>}
      {open && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="Dr. Anya AI companion">
        <section className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
          <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Patient education companion</p><h2 className="mt-1 text-xl font-bold">Dr. Anya</h2><p className="mt-1 text-sm text-slate-500">{documentName ? `Explaining: ${documentName}` : 'Choose a document to ask about its extracted facts.'}</p></div>
            <button type="button" onClick={() => { setOpen(false); onClose?.() }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" aria-label="Close Dr. Anya">Close</button>
          </header>
          <div className="flex-1 space-y-5 p-5">
            <div className="flex items-center justify-between gap-3"><label htmlFor="anya-language" className="text-sm font-semibold">Explanation language</label><select id="anya-language" value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'te')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="en">English</option><option value="te">తెలుగు (Telugu)</option></select></div>
            {!documentId && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Open Dr. Anya from a document's “Explain with Dr. Anya” button so she can use only that document's extracted facts.</div>}
            {documentId && <form onSubmit={(event) => { event.preventDefault(); void explain() }} className="space-y-3">
              <label htmlFor="anya-question" className="block text-sm font-semibold">What would you like explained? <span className="font-normal text-slate-500">(optional)</span></label>
              <textarea id="anya-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1500} rows={3} placeholder="e.g. What does this test name mean?" className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Preparing grounded explanation…' : 'Explain this document'}</button>
            </form>}
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
            {result && <>
              {!result.configured && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-bold text-amber-950">AI is not configured</h3><p className="mt-2 text-sm leading-6 text-amber-900">{result.message}</p></div>}
              {result.configured && result.message && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{result.message}</div>}
              <section className="rounded-2xl border border-slate-200 p-4"><h3 className="font-bold">Extracted Document Facts</h3><p className="mt-1 text-xs leading-5 text-slate-500">These are extracted source values, not a diagnosis. Check them against the original report.</p>
                {result.extracted_document_facts.length ? <div className="mt-3 space-y-2">{result.extracted_document_facts.map((fact, index) => <article key={`${fact.entity_type}-${index}`} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold capitalize">{(fact.entity_type || 'extracted item').replaceAll('_', ' ')}</p><p className="mt-1 text-sm">{fact.value || 'Value not confidently detected'}{fact.unit ? ` ${fact.unit}` : ''}{fact.reference_range ? ` · reference: ${fact.reference_range}` : ''}</p><p className="mt-1 text-xs text-slate-500">Review: {fact.review_status || 'not recorded'}{fact.source?.page ? ` · page ${fact.source.page}` : ''}{typeof fact.confidence === 'number' ? ` · confidence ${Math.round(fact.confidence * 100)}%` : ''}</p>{fact.source?.quote && <p className="mt-1 text-xs italic text-slate-500">Source: “{fact.source.quote}”</p>}</article>)}</div> : <p className="mt-3 text-sm text-slate-500">No extracted facts are available for this document. Dr. Anya will not fill in missing values.</p>}
              </section>
              <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4"><h3 className="font-bold text-teal-950">Dr. Anya’s Explanation</h3>{result.explanation ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800">{language === 'te' ? result.explanation.te : result.explanation.en}</p> : <p className="mt-3 text-sm text-slate-600">No explanation was generated.</p>}<p className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-600">Uncertainty: {result.uncertainty}</p></section>
              {result.source_references.length > 0 && <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Source references</h3><ul className="mt-2 space-y-2">{result.source_references.map((source, index) => <li key={index} className="text-xs leading-5 text-slate-600">{source.file_name || documentName || 'Document'}{source.page ? ` · page ${source.page}` : ''}{source.quote ? ` · “${source.quote}”` : ''}</li>)}</ul></section>}
              {result.ask_doctor_questions.length > 0 && <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">{language === 'te' ? 'మీ వైద్యుడిని అడగవచ్చే ప్రశ్నలు' : 'Questions to ask your doctor'}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{result.ask_doctor_questions.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
              <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-bold text-amber-950">{language === 'te' ? 'తదుపరి చర్యలు / మీ వైద్యుడిని అడగండి' : 'Next Steps / Ask Your Doctor'}</h3><p className="mt-2 text-sm leading-6 text-amber-950">{language === 'te' ? result.disclaimer.te : result.disclaimer.en}</p></aside>
            </>}
            <p className="text-xs leading-5 text-slate-500">Dr. Anya is for education only. AI output can be incomplete or wrong. Never use it for emergencies or to make medication decisions.</p>
          </div>
        </section>
      </div>}
    </>
  )
}
