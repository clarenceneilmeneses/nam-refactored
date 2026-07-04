import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, landingRoute } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import namLogo from '@/assets/nam-logo.png'

export function LoginPage() {
  const { session, profile, permissions, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  // Redirect by permission once the profile has loaded (Drivers land on Logistics).
  // An unlinked account still leaves — AppShell explains the missing auth_id link.
  useEffect(() => {
    if (session && !loading) {
      navigate(profile ? landingRoute(permissions) : '/', { replace: true })
    }
  }, [session, profile, permissions, loading, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-1 px-8 pt-8 text-center">
          <img src={namLogo} alt="NAM Builders and Supply Corp." className="mx-auto mb-3 w-48" />
          <CardTitle className="text-lg">Welcome back</CardTitle>
          <CardDescription>Sign in to the sales dashboard</CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nam.local"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-lg bg-critical/10 px-3 py-2 text-xs text-critical" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-[11px] text-ink-muted">NAM Builders and Supply Corp.</p>
    </div>
  )
}
