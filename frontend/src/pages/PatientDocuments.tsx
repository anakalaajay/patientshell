import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type MedicalDocument = {
  id: string
  file_name: string
  mime_type: string | null
  file_size_bytes: number
  document_type: string | null
  processing_status: string
  document_date: string | null
  created_at: string
}
type ExtractedItem = {
  id: string
  extracted_data: {
    entity_type?: string
    value?: string | null
    unit?: string | null
    reference_range?: string | null
    needs_human_review?: boolean
    review_reason?: string | null
    source?: { page?: number; quote?: string; bbox?: Record<string, number> | null }
  }
  review_status: string
  confidence: number | null
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const statusLabel: Record<string, string> = {
  pending: 'Pending', processing: 'Processing', processed: 'Completed',
  completed: 'Completed', review_required: 'Review needed', review_needed: 'Review needed', failed: 'Failed',
}
const statusClass: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700', processing: 'bg-blue-50 text-blue-700',
  processed: 'bg-emerald-50 text-emerald-700', completed: 'bg-emerald-50 text-emerald-700',
  review_required: 'bg-amber-50 text-amber-800', review_needed: 'bg-amber-50 text-amber-800',
  failed: 'bg-rose-50 text-rose-700',
}

export default function PatientDocumentsPage() {
  const { session } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<MedicalDocument[]>([])
  const [items, setItems] = useState<Record<string, ExtractedItem[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    if (!session) return
    const response = await fetch(\`\${apiBase}/api/patient/documents\`, {
      headers: { Authorization: \`Bearer \${session.access_token}\` },
    })
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Could not load documents.')
    const data = await response.json()
    setDocuments(data.documents || [])
  }, [session])

  useEffect(() => {
    let active = true
    void loadDocuments().catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Could not load documents.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadDocuments])

  async function uploadFile(file?: File) {
    if (!file || !session || uploading) return
    setError(null); setNotice(null)
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension || '')) {
      setError('Choose a PDF, JPG, or PNG file.')
      return
    }
    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      setError('File must be larger than 0 bytes and no more than 15 MiB.')
      return
    }
    setUploading(true); setProgress(0)
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('POST', \`\${apiBase}/api/patient/documents/upload\`)
        request.setRequestHeader('Authorization', \`Bearer \${session.access_token}\`)
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100))
        }
        request.onload = () => {
          let payload: { detail?: string; document?: MedicalDocument; extraction?: { needs_human_review?: boolean } } = {}
          try { payload = JSON.parse(request.responseText) } catch { /* invalid response is handled below */ }
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(payload.detail || 'Upload failed. Please try again.'))
            return
          }
          if (payload.document) setDocuments((current) => [payload.document!, ...current.filter((doc) => doc.id !== payload.document!.id)])
          setNotice(payload.extraction?.needs_human_review
            ? 'Uploaded and processed. Some extracted items need human review.'
            : 'Document uploaded and processed.')
          resolve()
        }
        request.onerror = () => reject(new Error('Network error while uploading.'))
        const body = new FormData()
        body.append('file', file)
        request.send(body)
      })
      await loadDocuments()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
      try { await loadDocuments() } catch { /* preserve original error */ }
    } finally {
      setUploading(false); setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function toggleExtracted(doc: MedicalDocument) {
    if (expanded === doc.id) { setExpanded(null); return }
    setExpanded(doc.id); setError(null)
    if (items[doc.id] || !session) return
    try {
      const response = await fetch(\`\${apiBase}/api/patient/documents/\${doc.id}/extracted-data\`, {
        headers: { Authorization: \`Bearer \${session.access_token}\` },
      })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Could not load extracted data.')
      const payload = await response.json()
      setItems((current) => ({ ...current, [doc.id]: payload.items || [] }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load extracted data.') }
  }

  async function reviewItem(docId: string, item: ExtractedItem, action: 'confirm' | 'reject') {
    if (!session) return
    setError(null)
    try {
      const response = await fetch(\`\${apiBase}/api/patient/documents/\${docId}/extracted-data/\${item.id}\`, {
        method: 'PATCH',
        headers: { Authorization: \`Bearer \${session.access_token}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: action === 'confirm' ? 'Confirmed by patient' : 'Rejected by patient' }),
      })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Could not save review.')
      const payload = await response.json()
      setItems((current) => ({ ...current, [docId]: (current[docId] || []).map((entry) => entry.id === item.id ? payload.item : entry) }))
      setNotice(action === 'confirm' ? 'Item marked as confirmed.' : 'Item marked as rejected.')
      await loadDocuments()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save review.') }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Medical records</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">My documents</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Upload lab reports and medical documents. Extraction is rule-based; uncertain values are clearly flagged and should be checked by a person.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">{notice}</div>}

      <section
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFile(event.dataTransfer.files[0]) }}
        className={\`rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-10 \${dragging ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-white'}\`}
      >
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-2xl text-teal-800">⇧</span>
        <h2 className="mt-4 text-lg font-bold">Drop a medical document here</h2>
        <p className="mt-2 text-sm text-slate-500">PDF, JPG, or PNG · maximum 15 MiB · stored privately</p>
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(event) => void uploadFile(event.target.files?.[0])} />
        <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="mt-5 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60">{uploading ? 'Uploading…' : 'Choose document'}</button>
        {uploading && <div className="mx-auto mt-5 max-w-sm text-left"><div className="flex justify-between text-xs text-slate-500"><span>Upload progress</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: \`\${progress}%\` }} /></div><p className="mt-2 text-xs text-slate-500">Processing status will update after extraction finishes.</p></div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Uploaded documents</h2><p className="mt-1 text-sm text-slate-500">{documents.length} record{documents.length === 1 ? '' : 's'}</p></div><Link to="/patient/timeline" className="text-sm font-semibold text-teal-700 hover:text-teal-900">View timeline</Link></div>
        {loading ? <p className="p-6 text-sm text-slate-500">Loading documents…</p> : documents.length === 0 ? <div className="p-10 text-center"><h3 className="font-semibold">No documents yet</h3><p className="mt-2 text-sm text-slate-500">Upload your first report to start your document history.</p></div> : <div className="divide-y divide-slate-100">
          {documents.map((doc) => <article key={doc.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">{doc.mime_type === 'application/pdf' ? 'PDF' : 'IMG'}</span><div className="min-w-0"><h3 className="break-words font-semibold">{doc.file_name}</h3><p className="mt-1 text-xs text-slate-500">{doc.document_date || new Date(doc.created_at).toLocaleDateString()} · {(doc.file_size_bytes / 1024).toFixed(0)} KB</p></div></div>
              <span className={\`rounded-full px-3 py-1 text-xs font-semibold \${statusClass[doc.processing_status] || statusClass.pending}\`}>{statusLabel[doc.processing_status] || doc.processing_status.replaceAll('_', ' ')}</span>
            </div>
            <button onClick={() => void toggleExtracted(doc)} className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-900">{expanded === doc.id ? 'Hide extracted data' : 'Review extracted data'}</button>
            {expanded === doc.id && <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              {!items[doc.id] ? <p className="text-sm text-slate-500">Loading extracted items…</p> : items[doc.id].length === 0 ? <p className="text-sm text-slate-500">No clinical entities were extracted. Nothing has been guessed or auto-filled.</p> : items[doc.id].map((item) => {
                const entity = item.extracted_data || {}
                const needsReview = Boolean(entity.needs_human_review) && item.review_status === 'unreviewed'
                return <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold capitalize">{(entity.entity_type || 'extracted item').replaceAll('_', ' ')}</span>{needsReview && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Human review needed</span>}<span className="text-xs text-slate-500">Status: {item.review_status.replaceAll('_', ' ')}</span></div>
                  <p className="mt-2 text-sm">{entity.value || 'Value not confidently detected'}{entity.unit ? \` \${entity.unit}\` : ''}{entity.reference_range ? \` · reference \${entity.reference_range}\` : ''}</p>
                  {entity.review_reason && <p className="mt-1 text-xs text-amber-800">{entity.review_reason}</p>}
                  {entity.source && <p className="mt-2 text-xs text-slate-500">Page {entity.source.page || '?'}{entity.source.quote ? \` · “\${entity.source.quote}”\` : ''}</p>}
                  {needsReview && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void reviewItem(doc.id, item, 'confirm')} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white">Confirm</button><button onClick={() => void reviewItem(doc.id, item, 'reject')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Reject</button></div>}
                </div>
              })}
            </div>}
          </article>)}
        </div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">Extracted values are informational only, not a diagnosis. Always verify medical results against the original document and consult a qualified clinician.</p>
    </div>
  )
}
