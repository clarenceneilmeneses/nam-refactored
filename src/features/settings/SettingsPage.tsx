import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  ALargeSmall,
  Camera,
  Clock,
  Database,
  Home,
  ImageOff,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  Palette,
  RefreshCw,
  Rows3,
  Sun,
  UserRound,
} from 'lucide-react'
import { HOME_ROUTE_OPTIONS, useAuth } from '@/hooks/useAuth'
import { useAvatarUrl, useUpdatePassword, useUpdateProfileName, useUploadAvatar } from '@/hooks/useProfile'
import { useTheme, type ThemeMode } from '@/hooks/useTheme'
import { useSettings, ACCENTS, FONT_SCALES } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import { logAction } from '@/lib/log'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { AvatarCropDialog } from './AvatarCropDialog'
import { cn } from '@/lib/utils'

/** Quote images + e-signatures cached by FormalQuotePreview under cache_img_*. */
function quoteImageCache(): { keys: string[]; kb: number } {
  const keys: string[] = []
  let bytes = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('cache_img_')) {
        keys.push(key)
        bytes += (localStorage.getItem(key) ?? '').length
      }
    }
  } catch {
    // storage unavailable — report empty
  }
  return { keys, kb: Math.round(bytes / 1024) }
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  const { profile, session, permissions } = useAuth()
  const avatarUrl = useAvatarUrl()
  const { mode, setMode } = useTheme()
  const {
    accent,
    setAccent,
    customAccent,
    setCustomAccent,
    clock24,
    setClock24,
    startCollapsed,
    setStartCollapsed,
    fontScale,
    setFontScale,
    homeRoute,
    setHomeRoute,
    compactTables,
    setCompactTables,
  } = useSettings()
  const updateName = useUpdateProfileName()
  const updatePassword = useUpdatePassword()
  const uploadAvatar = useUploadAvatar()
  const queryClient = useQueryClient()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cacheStamp, setCacheStamp] = useState(0) // re-reads the image cache after clearing
  const [signOutAllOpen, setSignOutAllOpen] = useState(false)
  const [signingOutAll, setSigningOutAll] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const nameDirty = fullName.trim() !== (profile?.full_name ?? '').trim()
  const homeOptions = HOME_ROUTE_OPTIONS.filter((o) => o.perms.some((p) => permissions.has(p)))
  void cacheStamp
  const imageCache = quoteImageCache()

  async function onSaveName() {
    if (!fullName.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    try {
      await updateName.mutateAsync(fullName.trim())
      toast.success('Name updated')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function onPickAvatar(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB')
      return
    }
    setCropFile(file) // open the cropper; upload happens on confirm
  }

  async function onCropped(blob: Blob) {
    setCropFile(null)
    try {
      await uploadAvatar.mutateAsync(blob)
      toast.success('Profile photo updated')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function onChangePassword() {
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    try {
      await updatePassword.mutateAsync(password)
      toast.success('Password changed')
      setPassword('')
      setConfirm('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" subtitle="Manage your profile, appearance, and device preferences." />

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4 text-accent" /> Profile
          </CardTitle>
          <CardDescription>How your account appears across the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar url={avatarUrl} name={profile?.full_name} fallback={profile?.username} className="h-16 w-16 text-lg" />
              {uploadAvatar.isPending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
              )}
            </div>
            <div>
              <Button variant="outline" size="sm" disabled={uploadAvatar.isPending} onClick={() => fileRef.current?.click()}>
                <Camera className="h-3.5 w-3.5" /> {avatarUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              <p className="mt-1 text-xs text-ink-muted">JPG or PNG, up to 3 MB.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onPickAvatar(e.target.files?.[0] ?? undefined)
                  e.target.value = '' // allow re-picking the same file
                }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="set-name">Full name</Label>
              <Input id="set-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="set-username">Username</Label>
              <Input id="set-username" value={profile?.username ?? ''} readOnly tabIndex={-1} className="bg-page text-ink-muted" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              Role: <span className="font-medium text-ink-secondary">{profile?.role_name ?? '—'}</span>
            </span>
            {session?.user.email && (
              <span>
                Login: <span className="font-medium text-ink-secondary">{session.user.email}</span>
              </span>
            )}
            {profile?.created_at && (
              <span>
                Member since: <span className="font-medium text-ink-secondary">{formatDate(profile.created_at)}</span>
              </span>
            )}
          </div>

          <div className="flex justify-end">
            <Button disabled={!nameDirty || updateName.isPending} onClick={onSaveName}>
              {updateName.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-accent" /> Appearance
          </CardTitle>
          <CardDescription>Choose a theme and accent colour for this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors cursor-pointer',
                    mode === opt.value
                      ? 'border-accent bg-accent-soft text-accent-strong'
                      : 'border-hairline text-ink-secondary hover:bg-page',
                  )}
                  aria-pressed={mode === opt.value}
                >
                  <opt.icon className="h-5 w-5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Accent colour</Label>
            <div className="flex flex-wrap items-center gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAccent(a.key)}
                  title={a.label}
                  aria-label={a.label}
                  aria-pressed={accent === a.key}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform cursor-pointer hover:scale-110',
                    accent === a.key ? 'ring-2 ring-offset-2 ring-offset-surface' : 'ring-1 ring-black/10',
                  )}
                  style={{ backgroundColor: a.swatch, ...(accent === a.key ? { '--tw-ring-color': a.swatch } as React.CSSProperties : {}) }}
                />
              ))}
              <label
                title="Custom colour"
                className={cn(
                  'relative h-8 w-8 rounded-full transition-transform cursor-pointer hover:scale-110',
                  accent === 'custom' ? 'ring-2 ring-offset-2 ring-offset-surface' : 'ring-1 ring-black/10',
                )}
                style={{
                  background:
                    accent === 'custom'
                      ? customAccent
                      : 'conic-gradient(#d93025, #eda100, #1e8e3e, #129eaf, #1a73e8, #9334e6, #d93025)',
                  ...(accent === 'custom' ? ({ '--tw-ring-color': customAccent } as React.CSSProperties) : {}),
                }}
              >
                <input
                  type="color"
                  value={customAccent}
                  onChange={(e) => setCustomAccent(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Custom accent colour"
                />
              </label>
            </div>
            <p className="text-xs text-ink-muted">
              The last swatch picks any colour — the app re-tones it automatically so buttons and highlights stay readable in
              both themes.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Text size</Label>
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              {FONT_SCALES.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFontScale(f.key)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors cursor-pointer',
                    fontScale === f.key
                      ? 'border-accent bg-accent-soft text-accent-strong'
                      : 'border-hairline text-ink-secondary hover:bg-page',
                  )}
                  aria-pressed={fontScale === f.key}
                >
                  <ALargeSmall className={cn('h-5 w-5', i === 0 && 'scale-75', i === 2 && 'scale-125')} />
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">Scales all text and spacing across the app on this device.</p>
          </div>
        </CardContent>
      </Card>

      {/* System preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4 text-accent" /> System
          </CardTitle>
          <CardDescription>Defaults for how the app behaves on this device.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-hairline">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">24-hour clock</p>
                <p className="text-xs text-ink-muted">Show times as 14:30 instead of 2:30 PM.</p>
              </div>
            </div>
            <Switch checked={clock24} onChange={setClock24} label="24-hour clock" />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-start gap-3">
              <PanelLeftClose className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Start with sidebar collapsed</p>
                <p className="text-xs text-ink-muted">Open the app with a slim icon-only sidebar.</p>
              </div>
            </div>
            <Switch checked={startCollapsed} onChange={setStartCollapsed} label="Start with sidebar collapsed" />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-start gap-3">
              <Rows3 className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Compact tables</p>
                <p className="text-xs text-ink-muted">Tighter rows across all tables to fit more on screen.</p>
              </div>
            </div>
            <Switch checked={compactTables} onChange={setCompactTables} label="Compact tables" />
          </div>
          <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div className="flex items-start gap-3">
              <Home className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Home page after login</p>
                <p className="text-xs text-ink-muted">Where the app opens when you sign in on this device.</p>
              </div>
            </div>
            <Select
              className="w-40 shrink-0"
              value={homeRoute}
              onChange={(e) => setHomeRoute(e.target.value)}
              aria-label="Home page after login"
            >
              <option value="">Automatic</option>
              {homeOptions.map((o) => (
                <option key={o.path} value={o.path}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data & storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-accent" /> Data & storage
          </CardTitle>
          <CardDescription>Freshness and local caches on this device.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-hairline">
          <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Refresh all data</p>
                <p className="text-xs text-ink-muted">Re-fetch every table from the server right now.</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries()
                toast.success('Refreshing all data from the server')
              }}
            >
              Refresh
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <div className="flex items-start gap-3">
              <ImageOff className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Clear cached quote images</p>
                <p className="text-xs text-ink-muted">
                  Item photos and e-signatures saved by the quotation preview
                  {imageCache.keys.length > 0 ? ` — ${imageCache.keys.length} cached (~${imageCache.kb.toLocaleString()} KB).` : ' — nothing cached.'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={imageCache.keys.length === 0}
              onClick={() => {
                for (const key of imageCache.keys) localStorage.removeItem(key)
                setCacheStamp((s) => s + 1)
                toast.success(`Cleared ${imageCache.keys.length} cached image${imageCache.keys.length === 1 ? '' : 's'}`)
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-accent" /> Password
          </CardTitle>
          <CardDescription>Set a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="set-pass">New password</Label>
              <Input
                id="set-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                placeholder="At least 6 characters"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="set-pass2">Confirm password</Label>
              <Input
                id="set-pass2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={!password || !confirm || updatePassword.isPending} onClick={onChangePassword}>
              {updatePassword.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-hairline pt-4">
            <div className="flex items-start gap-3">
              <LogOut className="mt-0.5 h-4 w-4 text-ink-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Sign out of all devices</p>
                <p className="text-xs text-ink-muted">Ends every active session, including this one.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-critical" onClick={() => setSignOutAllOpen(true)}>
              Sign out everywhere
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={signOutAllOpen}
        onClose={() => setSignOutAllOpen(false)}
        title="Sign out of all devices"
        description="This ends every active session for your account, including this one — you'll be back at the login screen. Use it if you left yourself logged in somewhere."
        confirmLabel="Sign out everywhere"
        destructive
        busy={signingOutAll}
        onConfirm={async () => {
          setSigningOutAll(true)
          try {
            // Log while the session is still valid (RLS needs it), then revoke globally.
            if (profile) await logAction(profile.id, 'Logged Out', `User "${profile.username}" signed out of all devices`)
            const { error } = await supabase.auth.signOut({ scope: 'global' })
            if (error) throw new Error(error.message)
          } catch (e) {
            toast.error((e as Error).message)
            setSigningOutAll(false)
          }
        }}
      />

      {cropFile && (
        <AvatarCropDialog file={cropFile} onCancel={() => setCropFile(null)} onCropped={onCropped} />
      )}
    </div>
  )
}
