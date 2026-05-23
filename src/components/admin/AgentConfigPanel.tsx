'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Save, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Profile } from '@/lib/types'

const PERSONAS = [
  { value: 'helpful_assistant', label: 'Helpful Assistant', description: 'Friendly, balanced, professional' },
  { value: 'technical_expert', label: 'Technical Expert', description: 'Detailed, precise, uses technical terminology' },
  { value: 'tutor', label: 'Patient Tutor', description: 'Educational, breaks down concepts, encouraging' },
  { value: 'casual_friend', label: 'Casual Friend', description: 'Relaxed, conversational, approachable' },
  { value: 'professional', label: 'Professional Consultant', description: 'Formal, concise, business-focused' },
]

const PERSONA_PROMPTS: Record<string, string> = {
  helpful_assistant: 'You are a helpful AI assistant with access to the user\'s knowledge base. Answer questions based on the provided context, cite your sources, and be concise and accurate.',
  technical_expert: 'You are a technical expert. Provide precise, detailed answers using technical terminology when appropriate. Reference specific implementations and best practices from the knowledge base.',
  tutor: 'You are a patient tutor helping someone learn. Break down complex concepts into simple terms, use analogies, and provide step-by-step explanations. Encourage curiosity.',
  casual_friend: 'You are a friendly, approachable assistant. Use conversational language, be warm and helpful. Explain things clearly without being overly formal.',
  professional: 'You are a professional consultant. Provide concise, actionable insights. Focus on practical recommendations and business value. Be formal and to the point.',
}

const OLLAMA_MODELS = ['llama3.2:3b', 'llama3.1:8b', 'mistral:7b', 'phi3:3.8b', 'gemma2:9b']
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']

type ConfigForm = Pick<Profile,
  | 'system_prompt' | 'temperature' | 'top_k' | 'similarity_threshold'
  | 'role' | 'llm_model' | 'agent_persona' | 'llm_provider'
  | 'max_tokens' | 'enable_citations' | 'enable_streaming'
>

const DEFAULTS: ConfigForm = {
  system_prompt: 'You are a helpful assistant. Answer questions based only on the provided context. Always cite your sources.',
  temperature: 0.7,
  top_k: 7,
  similarity_threshold: 0.5,
  role: null,
  llm_model: 'llama3.2:3b',
  agent_persona: 'helpful_assistant',
  llm_provider: 'ollama',
  max_tokens: 2048,
  enable_citations: true,
  enable_streaming: true,
}

function RangeInput({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-slate-300">{label}</Label>
        <span className="text-sm font-mono text-indigo-400">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-indigo-500"
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function AgentConfigPanel() {
  const [form, setForm] = useState<ConfigForm>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        if (data.profile) {
          const p: Profile = data.profile
          setForm({
            system_prompt: p.system_prompt ?? DEFAULTS.system_prompt,
            temperature: p.temperature ?? DEFAULTS.temperature,
            top_k: p.top_k ?? DEFAULTS.top_k,
            similarity_threshold: p.similarity_threshold ?? DEFAULTS.similarity_threshold,
            role: p.role ?? DEFAULTS.role,
            llm_model: p.llm_model ?? DEFAULTS.llm_model,
            agent_persona: p.agent_persona ?? DEFAULTS.agent_persona,
            llm_provider: p.llm_provider ?? DEFAULTS.llm_provider,
            max_tokens: p.max_tokens ?? DEFAULTS.max_tokens,
            enable_citations: p.enable_citations ?? DEFAULTS.enable_citations,
            enable_streaming: p.enable_streaming ?? DEFAULTS.enable_streaming,
          })
        }
      })
      .catch(() => toast.error('Failed to load configuration'))
      .finally(() => setLoading(false))
  }, [])

  function patch(updates: Partial<ConfigForm>) {
    setForm(prev => ({ ...prev, ...updates }))
  }

  function applyPersona(persona: string) {
    patch({ agent_persona: persona, system_prompt: PERSONA_PROMPTS[persona] ?? form.system_prompt })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Configuration saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function resetDefaults() {
    if (!confirm('Reset all settings to defaults?')) return
    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULTS),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setForm(DEFAULTS)
      toast.success('Reset to defaults')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    )
  }

  const modelOptions = form.llm_provider === 'openai' ? OPENAI_MODELS : OLLAMA_MODELS

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={resetDefaults}
          disabled={saving}
          className="text-slate-400 hover:text-white gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset defaults
        </Button>
        <Button
          size="sm"
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </Button>
      </div>

      <Tabs defaultValue="persona">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="persona" className="text-xs gap-1 data-[state=active]:bg-indigo-600">
            Persona &amp; Prompt
          </TabsTrigger>
          <TabsTrigger value="model" className="text-xs gap-1 data-[state=active]:bg-indigo-600">
            Model
          </TabsTrigger>
          <TabsTrigger value="retrieval" className="text-xs gap-1 data-[state=active]:bg-indigo-600">
            Retrieval
          </TabsTrigger>
          <TabsTrigger value="features" className="text-xs gap-1 data-[state=active]:bg-indigo-600">
            Features
          </TabsTrigger>
        </TabsList>

        {/* ── Persona & Prompt ────────────────────────────── */}
        <TabsContent value="persona" className="mt-4 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-300">Domain / Role</Label>
            <p className="text-xs text-slate-500">
              The subject this agent specialises in — e.g. <em>Finance</em>, <em>Art History</em>, <em>Cooking</em>.
              Automatically woven into every response.
            </p>
            <Input
              value={form.role ?? ''}
              onChange={e => patch({ role: e.target.value || null })}
              placeholder="e.g. Personal Finance, Art History, Fitness"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-slate-300">Agent persona</Label>
            <p className="text-xs text-slate-500">Choosing a persona auto-fills the system prompt below.</p>
            <div className="grid gap-2">
              {PERSONAS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => applyPersona(p.value)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                    form.agent_persona === p.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <p className="text-sm font-medium text-slate-200">{p.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-slate-300">System prompt</Label>
            <p className="text-xs text-slate-500">Sent with every request. Be specific about tone, grounding, and response format.</p>
            <Textarea
              value={form.system_prompt}
              onChange={e => patch({ system_prompt: e.target.value })}
              className="bg-slate-800 border-slate-700 text-white min-h-[140px] font-mono text-xs"
            />
          </div>
        </TabsContent>

        {/* ── Model ────────────────────────────────────────── */}
        <TabsContent value="model" className="mt-4 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Provider</Label>
              <Select
                value={form.llm_provider}
                onValueChange={(v) => { if (v) patch({ llm_provider: v, llm_model: v === 'openai' ? 'gpt-4o-mini' : 'llama3.2:3b' }) }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (local)</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Active provider is set via <code className="text-indigo-400">LLM_PROVIDER</code> env var.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Model</Label>
              <Select
                value={form.llm_model}
                onValueChange={(v) => { if (v) patch({ llm_model: v }) }}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Overrides <code className="text-indigo-400">OLLAMA_LLM_MODEL</code> / <code className="text-indigo-400">OPENAI_LLM_MODEL</code>.</p>
            </div>
          </div>

          <RangeInput
            label="Temperature"
            hint="Lower = more focused/deterministic. Higher = more creative/varied."
            value={form.temperature}
            min={0}
            max={1}
            step={0.05}
            onChange={v => patch({ temperature: v })}
            display={`${form.temperature.toFixed(2)} · ${form.temperature < 0.3 ? 'Focused' : form.temperature < 0.7 ? 'Balanced' : 'Creative'}`}
          />

          <RangeInput
            label="Max output tokens"
            hint="Maximum response length (1 token ≈ 0.75 words)."
            value={form.max_tokens}
            min={512}
            max={8192}
            step={256}
            onChange={v => patch({ max_tokens: v })}
            display={form.max_tokens.toLocaleString()}
          />
        </TabsContent>

        {/* ── Retrieval ────────────────────────────────────── */}
        <TabsContent value="retrieval" className="mt-4 space-y-5">
          <RangeInput
            label="Top K chunks"
            hint="Number of chunks retrieved per query. More = richer context but slower."
            value={form.top_k}
            min={1}
            max={20}
            step={1}
            onChange={v => patch({ top_k: v })}
          />

          <RangeInput
            label="Similarity threshold"
            hint="Minimum cosine similarity to include a chunk. Higher = stricter, fewer false-positives."
            value={form.similarity_threshold}
            min={0.3}
            max={0.9}
            step={0.05}
            onChange={v => patch({ similarity_threshold: v })}
            display={`${form.similarity_threshold.toFixed(2)} · ${form.similarity_threshold < 0.5 ? 'Permissive' : form.similarity_threshold < 0.7 ? 'Balanced' : 'Strict'}`}
          />

          <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-300">Tuning tips</p>
            <p>↑ Top K → more context, possible noise</p>
            <p>↑ Threshold → higher precision, may miss content</p>
            <p>↓ Threshold → higher recall, may include weak matches</p>
          </div>
        </TabsContent>

        {/* ── Features ─────────────────────────────────────── */}
        <TabsContent value="features" className="mt-4 space-y-3">
          {[
            {
              key: 'enable_citations' as const,
              label: 'Citations',
              description: 'Show source references alongside responses.',
            },
            {
              key: 'enable_streaming' as const,
              label: 'Streaming responses',
              description: 'Stream tokens as they are generated for lower perceived latency.',
            },
          ].map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
              </div>
              <Switch
                checked={form[key]}
                onCheckedChange={(checked: boolean) => patch({ [key]: checked })}
              />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
