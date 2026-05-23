import { Bot, Code2, Globe, FileText, LayoutDashboard } from 'lucide-react'

export default function EmbedDemoPage() {
  const iframeSnippet = `<iframe
  src="https://your-app.vercel.app/chat?embed=true"
  width="100%"
  height="600px"
  frameborder="0"
  title="AI Chat Assistant"
  allow="clipboard-write"
></iframe>`

  const floatingSnippet = `<iframe
  src="https://your-app.vercel.app/chat?embed=true"
  style="
    position: fixed;
    bottom: 20px; right: 20px;
    width: 400px; height: 600px;
    border: none; border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    z-index: 9999;
  "
  title="AI Chat Assistant"
></iframe>`

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">RAG Agent — Widget Demo</h1>
              <p className="text-xs text-slate-500">Embeddable chat via iframe</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin" className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">
              Admin
            </a>
            <a href="/chat" className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">
              Back to chat
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Intro */}
        <div>
          <h2 className="text-2xl font-bold mb-2">Chat Widget — Embed Demo</h2>
          <p className="text-slate-400 max-w-2xl">
            The chat interface is fully self-contained and embeddable via a single{' '}
            <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded text-sm">&lt;iframe&gt;</code>.
            Pass <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded text-sm">?embed=true</code> to
            strip the sidebar and navigation chrome.
          </p>
        </div>

        {/* Info cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Features */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              Features
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-400">
              {[
                'Full RAG retrieval — answers from your KB',
                'Streaming responses with citations',
                'Isolated styling — no CSS conflicts',
                'Authenticated — secure per-tenant session',
                'Responsive — works at any iframe size',
              ].map(f => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Basic snippet */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-400" />
              Basic embed
            </h3>
            <pre className="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto leading-relaxed">
              <code>{iframeSnippet}</code>
            </pre>
          </div>
        </div>

        {/* Live demo */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-200">Live demo</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                The iframe below is running <code className="text-indigo-400">/chat?embed=true</code> — fully functional RAG chat
              </p>
            </div>
            <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-2.5 py-0.5">
              iframe
            </span>
          </div>

          <div className="p-5">
            <div className="rounded-lg border-2 border-dashed border-slate-700 p-1.5">
              <iframe
                src="/chat?embed=true"
                className="w-full rounded bg-slate-950"
                style={{ height: '560px', border: 'none' }}
                title="Chat Widget"
                allow="clipboard-write"
              />
            </div>
            <p className="text-xs text-slate-600 text-center mt-3">
              This widget has full RAG functionality — try asking a question about your knowledge base.
            </p>
          </div>
        </div>

        {/* Integration guide */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-6">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            Integration guide
          </h3>

          <div className="space-y-5">
            <div>
              <p className="text-sm text-slate-400 mb-2">
                <span className="text-slate-300 font-medium">Option 1 — Inline embed</span>
                {' '}(fixed height, full width):
              </p>
              <pre className="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto leading-relaxed">
                <code>{iframeSnippet}</code>
              </pre>
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">
                <span className="text-slate-300 font-medium">Option 2 — Floating widget</span>
                {' '}(fixed position, bottom-right corner):
              </p>
              <pre className="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto leading-relaxed">
                <code>{floatingSnippet}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Use cases */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: <FileText className="w-5 h-5 text-indigo-400" />,
              title: 'Documentation sites',
              desc: 'Let users ask questions without leaving your docs.',
            },
            {
              icon: <Globe className="w-5 h-5 text-indigo-400" />,
              title: 'E-commerce',
              desc: 'Surface product recommendations and support inline.',
            },
            {
              icon: <LayoutDashboard className="w-5 h-5 text-indigo-400" />,
              title: 'SaaS dashboards',
              desc: 'Provide contextual help and onboarding within your app.',
            },
          ].map(card => (
            <div key={card.title} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-2">
              {card.icon}
              <h4 className="font-medium text-slate-200 text-sm">{card.title}</h4>
              <p className="text-xs text-slate-500">{card.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
