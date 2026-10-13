const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 sm:px-10">
      <section className="mx-auto max-w-4xl">
        <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-teal-100 bg-white px-4 py-2 text-sm font-medium text-teal-800 shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-500" aria-hidden="true" />
          Phase 2 · Foundation scaffold
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Care that connects.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          Patientshell is the starting point for a patient-centered healthcare platform. The application foundation is ready for the next development steps.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Frontend</p>
            <h2 className="mt-2 text-xl font-semibold">React + TypeScript</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Vite development server with Tailwind CSS v4 configured.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Backend</p>
            <h2 className="mt-2 text-xl font-semibold">FastAPI</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">API base URL: <span className="break-all font-mono">{apiBaseUrl}</span></p>
            <p className="mt-3 text-sm text-slate-500">Health endpoint: /api/health</p>
          </article>
        </div>
        <p className="mt-8 text-sm text-slate-500">Scaffold only — authentication, database schema, and product workflows are not implemented yet.</p>
      </section>
    </main>
  )
}
