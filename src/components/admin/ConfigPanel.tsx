'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Profile } from '@/lib/types'

interface ConfigPanelProps {
  profile: Profile
  onUpdate: (profile: Profile) => void
}

export function ConfigPanel({ profile, onUpdate }: ConfigPanelProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    system_prompt: profile.system_prompt,
    temperature: profile.temperature,
    top_k: profile.top_k,
    similarity_threshold: profile.similarity_threshold,
    display_name: profile.display_name || '',
  })

  function update(key: string, value: string | number) {
    setForm(prev => ({ ...prev, [key]: value }))
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
      onUpdate(data.profile)
      toast.success('Configuration saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label className="text-sm text-slate-300">Display name</Label>
        <Input
          value={form.display_name}
          onChange={e => update('display_name', e.target.value)}
          placeholder="Your name"
          className="bg-slate-800 border-slate-700 text-white max-w-sm"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-sm text-slate-300">System prompt</Label>
        <p className="text-xs text-slate-500">Defines how the agent responds. Be specific about tone, format, and grounding requirements.</p>
        <Textarea
          value={form.system_prompt}
          onChange={e => update('system_prompt', e.target.value)}
          className="bg-slate-800 border-slate-700 text-white min-h-[140px] font-mono text-xs"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-sm text-slate-300">Temperature</Label>
          <p className="text-xs text-slate-500">0.0 (focused) → 1.0 (creative)</p>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.temperature}
            onChange={e => update('temperature', parseFloat(e.target.value))}
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm text-slate-300">Top K chunks</Label>
          <p className="text-xs text-slate-500">How many chunks to retrieve</p>
          <Input
            type="number"
            min={1}
            max={20}
            step={1}
            value={form.top_k}
            onChange={e => update('top_k', parseInt(e.target.value))}
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm text-slate-300">Similarity threshold</Label>
          <p className="text-xs text-slate-500">Minimum match score (0-1)</p>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={form.similarity_threshold}
            onChange={e => update('similarity_threshold', parseFloat(e.target.value))}
            className="bg-slate-800 border-slate-700 text-white"
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save configuration
      </Button>
    </div>
  )
}
