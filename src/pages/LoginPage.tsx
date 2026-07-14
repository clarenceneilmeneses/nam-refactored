import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, FileText, Loader2, Lock, Mail, Moon, ShieldCheck, Sun, TrendingUp, Truck } from 'lucide-react'
import { useAuth, landingRoute } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import namLogoWhite from '@/assets/nam-logo-white.png'
import namMark from '@/assets/nam-mark.png'

const KEY_LOGIN_EMAIL = 'nam-login-email'

const FEATURES = [
  { icon: TrendingUp, text: 'Live analytics' },
  { icon: FileText, text: 'One-click quotations' },
  { icon: Truck, text: 'Delivery tracking' },
  { icon: ShieldCheck, text: 'Role-based access' },
]

export function LoginPage() {
  const { session, profile, permissions, loading, signIn } = useAuth()
  const { resolved, setMode } = useTheme()
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(KEY_LOGIN_EMAIL) ?? ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
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
    try {
      localStorage.setItem(KEY_LOGIN_EMAIL, email.trim())
    } catch {
      // storage unavailable — skip remembering
    }
    const { error } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (error) setError(error)
  }

  function onPasswordKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  }

  return (
    // Full-bleed brand backdrop — deep NAM blue in both themes so the white lockup always reads
    <div
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-6 py-12"
      style={{ backgroundImage: 'linear-gradient(150deg, #1e5bb8 0%, #123f83 55%, #0a2a5c 100%)' }}
    >
      {/* soft decorative depth */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/[0.07] blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* watermark monogram, rendered as a white silhouette */}
      <img
        src={namMark}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-16 -bottom-20 w-80 opacity-[0.06] brightness-0 invert"
      />

      <button
        type="button"
        onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 rounded-full border border-white/20 bg-white/10 p-2 text-white/80 transition-colors hover:text-white cursor-pointer"
        aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <img src={namLogoWhite} alt="NAM Builders and Supply Corp." className="w-44" />

        <div className="mt-6 w-full rounded-2xl border border-hairline bg-surface p-6 shadow-e2">
          <h1 className="text-xl font-bold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-subtitle">Sign in to your sales dashboard.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus={!email}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nam.local"
                  className="h-10 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus={!!email}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onPasswordKey}
                  onKeyUp={onPasswordKey}
                  placeholder="••••••••"
                  className="h-10 pr-10 pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-ink-muted transition-colors hover:text-ink cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLock && (
                <p className="text-xs font-medium text-warning-text" role="status">
                  Caps Lock is on.
                </p>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-critical/10 px-3 py-2 text-xs text-critical" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-1.5 h-10 w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-muted">
            Trouble signing in? Ask your administrator to reset your password.
          </p>
        </div>

        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-1.5 text-xs text-white/70">
              <f.icon className="h-3.5 w-3.5" aria-hidden />
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      <p className="absolute inset-x-0 bottom-4 text-center text-[11px] text-white/50">
        © {new Date().getFullYear()} NAM Builders and Supply Corp. · Sales Dashboard
      </p>
    </div>
  )
}
