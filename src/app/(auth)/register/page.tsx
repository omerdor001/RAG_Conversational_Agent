'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Bot, Loader2 } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    // identities is empty when the email is already registered
    if (data?.user?.identities?.length === 0) {
      toast.error('An account with this email already exists')
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500 shadow-lg">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Check your email</h1>
            <p className="text-slate-400 text-sm">
              We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
              Click it to activate your account, then{' '}
              <a href="/login" className="text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline">
                sign in
              </a>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500 shadow-lg">
            <Bot className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">RAG Agent</h1>
          <p className="text-slate-400 text-sm">Create your account</p>
        </div>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Sign up</CardTitle>
            <CardDescription className="text-slate-400">
              Start building your own knowledge base
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500"
                />
                <p className="text-xs text-slate-500">Minimum 8 characters</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-300">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-indigo-500"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <a href="/login" className="text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
