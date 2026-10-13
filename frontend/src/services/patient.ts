import { apiRequest } from './api'

export type PatientDemographics = {
  user_id: string
  date_of_birth: string | null
  sex_at_birth: string | null
  blood_type: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  created_at: string
  updated_at: string
}

export type AccountProfile = {
  id: string
  role: 'patient' | 'doctor' | 'admin'
  full_name: string | null
  email: string | null
  phone: string | null
}

export type ProfilePayload = { user: AccountProfile; patient: PatientDemographics }

export type TimelineEntry = {
  id: string
  type: 'visit' | 'document'
  occurred_at: string | null
  visit_type?: string | null
  status?: string
  facility_name?: string | null
  summary?: string | null
  file_name?: string
  document_type?: string | null
  processing_status?: string
  document_date?: string | null
  mime_type?: string | null
  created_at: string
}

export type ReviewPackage = {
  id: string
  title: string
  purpose: string | null
  status: string
  expires_at: string | null
  created_at: string
}

export type TimelinePayload = {
  timeline: TimelineEntry[]
  visits: Array<{ id: string; status: string; visit_type: string | null; started_at: string | null; created_at: string }>
  documents: Array<{ id: string; file_name: string; document_type: string | null; processing_status: string; created_at: string }>
  review_packages: ReviewPackage[]
}

export type PatientQuestion = {
  id: string
  question: string
  package_id: string | null
  status: 'open' | 'in_progress' | 'answered' | 'closed' | string
  created_at: string
  updated_at: string
  responses: Array<{ id: string; resolution: string; created_at: string }>
}

export function getPatientProfile(token: string) {
  return apiRequest<ProfilePayload>('/api/patient/profile', token)
}

export function updatePatientProfile(token: string, changes: Partial<Omit<PatientDemographics, 'user_id' | 'created_at' | 'updated_at'>>) {
  return apiRequest<{ patient: PatientDemographics }>('/api/patient/profile', token, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

export function getPatientTimeline(token: string) {
  return apiRequest<TimelinePayload>('/api/patient/timeline', token)
}

export function getPatientQuestions(token: string) {
  return apiRequest<{ questions: PatientQuestion[] }>('/api/patient/questions', token)
}

export function createPatientQuestion(token: string, question: string, packageId?: string) {
  return apiRequest<{ question: Omit<PatientQuestion, 'responses'> }>('/api/patient/questions', token, {
    method: 'POST',
    body: JSON.stringify({ question, package_id: packageId || null }),
  })
}
