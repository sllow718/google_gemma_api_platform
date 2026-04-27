import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LandingPage() {
  const cookieStore = await cookies()
  if (cookieStore.get('refreshToken')?.value) redirect('/dashboard')
  return (
    <main className="flex min-h-full flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 bg-white px-6 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Manage your Gemma AI API configurations in one place
        </h1>
        <p className="max-w-xl text-lg text-gray-600">
          Create reusable Gemma model configurations, call them directly from the browser, and track your usage — no code required.
        </p>
        <div className="flex gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-2xl font-semibold text-gray-900">Everything you need to work with Gemma</h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                title: 'Saved Configurations',
                description: 'Store up to 20 named API configs with model, temperature, safety settings, and system prompts.',
              },
              {
                title: 'One-Click Calls',
                description: 'Enter a prompt, override parameters on the fly, and see the response with full token usage and latency.',
              },
              {
                title: 'Call History',
                description: 'Browse a paginated log of every call — prompt, response, tokens, latency, and finish reason.',
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="mb-2 font-semibold text-gray-900">{f.title}</h3>
                <p className="text-sm text-gray-600">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tier comparison */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-2xl font-semibold text-gray-900">Two ways to use the platform</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                Shared Key
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Free tier</h3>
              <p className="mb-4 text-sm text-gray-600">Use the platform&apos;s shared Google API key. Simple to get started, no setup needed.</p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✓ Up to 50 calls per day</li>
                <li>✓ All Gemma models</li>
                <li>✓ Full call history</li>
              </ul>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
              <div className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                Your Own Key (BYOK)
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Unlimited tier</h3>
              <p className="mb-4 text-sm text-gray-600">Connect your own Google API key. No platform quota — only your Google account limits apply.</p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✓ Unlimited daily calls</li>
                <li>✓ All Gemma models</li>
                <li>✓ Key stored encrypted at rest</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-gray-200 bg-white px-6 py-12 text-center">
        <p className="mb-6 text-gray-600">Ready to get started?</p>
        <Link
          href="/login"
          className="rounded-lg bg-blue-600 px-8 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700"
        >
          Get started for free
        </Link>
      </section>
    </main>
  )
}
