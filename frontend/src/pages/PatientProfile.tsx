import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getPatientProfile, updatePatientProfile, type PatientDemographics, type ProfilePayload } from '../services/patient'

type FormState = {
  date_of_birth: string
  sex_at_birth: string
  blood_type: string
  emergency_contact_name: string
  emergency_contact_phone: string
}

const emptyForm: FormState = { date_of_birth: '', sex_at_birth: '', blood_type: '', emergency_contact_name: '', emergency_contact_phone: '' }

function toForm(patient: PatientDemographics): FormState {
  return {
    date_of_birth: patient.date_of_birth || '',
    sex_at_birth: patient.sex_at_birth || '',
    blood_type: patient.blood_type || '',
    emergency_contact_name: patient.emergency_contact_name || '',
    emergency_contact_phone: patient.emergency_contact_phone || '',
  }
}

export default function PatientProfilePage() {
  const { session } = useAuth()
  const [payload, setPayload] = useState<ProfilePayload | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let active = true
    void getPatientProfile(session.access_token).then((result) => {
      if (!active) return
      setPayload(result)
      setForm(toForm(result.patient))
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Unable to load your profile.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await updatePatientProfile(session.access_token, {
        date_of_birth: form.date_of_birth || null,
        sex_at_birth: form.sex_at_birth.trim() || null,
        blood_type: form.blood_type.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      })
      if (payload) setPayload({ ...payload, patient: result.patient })
      setSuccess('Your demographic details have been saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10'
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading profile…</div>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Personal information</p><h1 className="mt-2 text-3xl font-bold tracking-tight">My profile</h1><p className="mt-2 text-sm leading-6 text-slate-500">Review and update your demographic details. Only your account can edit this patient profile.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
      {payload && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="mb-7 flex items-center gap-4 border-b border-slate-100 pb-6"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-xl font-bold text-teal-800">{(payload.user.full_name || payload.user.email || 'P').slice(0, 1).toUpperCase()}</span><div><h2 className="text-lg font-bold">{payload.user.full_name || 'Patient account'}</h2><p className="mt-1 text-sm text-slate-500">{payload.user.email}</p><p className="mt-1 text-xs font-medium uppercase tracking-wide text-teal-700">Patient account</p></div></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Date of birth<input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className={fieldClass} /></label>
            <label className="block text-sm font-medium text-slate-700">Sex at birth<select value={form.sex_at_birth} onChange={(e) => setForm({ ...form, sex_at_birth: e.target.value })} className={fieldClass}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="other">Other</option></select></label>
            <label className="block text-sm font-medium text-slate-700">Blood type<select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })} className={fieldClass}><option value="">Not provided</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="block text-sm font-medium text-slate-700">Emergency contact name<input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} className={fieldClass} placeholder="Contact name" maxLength={160} /></label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Emergency contact phone<input type="tel" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} className={fieldClass} placeholder="Contact phone number" maxLength={40} /></label>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-5"><button disabled={saving} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </section>}
      <p className="text-xs leading-5 text-slate-500">Enter accurate information when available. This development portal does not replace medical advice or an emergency service.</p>
    </div>
  )
}
