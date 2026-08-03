'use client'

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PasswordStrength } from '@/components/password-strength'
import { UpgradeModal } from '@/components/upgrade-modal'
import { PremiumFeature, PremiumBadge } from '@/components/premium-feature'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { translateAuthError, withAuthLockRetry, withTimeout, AuthTimeoutError } from '@/lib/supabase/auth-errors'
import { getPasswordChecks, isPasswordStrongEnough } from '@/lib/password'
import { cn } from '@/lib/utils'
import { FREE_LIMITS } from '@/lib/plan-limits'
import {
  User,
  Building2,
  Clock,
  Bell,
  CreditCard,
  Shield,
  Globe,
  Save,
  Crown,
  Check,
  Loader2,
  Plus,
  KeyRound,
  Eye,
  EyeOff,
  Users,
  Trash2,
  Copy,
  ExternalLink,
  Link2,
  AlertTriangle,
} from 'lucide-react'

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

const TIMEZONES = [
  { value: 'America/Lima', label: 'Lima, Peru (GMT-5)' },
  { value: 'America/Denver', label: 'Denver, Colorado (GMT-7/6)' },
  { value: 'America/New_York', label: 'New York (GMT-5/4)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (GMT-8/7)' },
  { value: 'America/Mexico_City', label: 'Ciudad de Mexico (GMT-6)' },
  { value: 'America/Bogota', label: 'Bogota, Colombia (GMT-5)' },
]

const DEFAULT_BUSINESS_HOURS: { dayOfWeek: DayOfWeek; startTime: string; endTime: string; isOpen: boolean }[] = [
  { dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'wednesday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'thursday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'friday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'saturday', startTime: '09:00', endTime: '14:00', isOpen: true },
  { dayOfWeek: 'sunday', startTime: '09:00', endTime: '14:00', isOpen: false },
]

interface PlanUsage {
  reservations_this_month: number
  clients: number
  services: number
  resources: number
}

// business_hours.day_of_week is 0-6 (0=Sunday), matching the convention
// already used for reservation validation elsewhere in the app.
const DAY_KEY_TO_NUMBER: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

export default function SettingsPage() {
  const { user, profile: authProfile, loading: authLoading, refreshProfile, signOut } = useAuth()
  const { currentBusiness, businesses, loading: businessLoading, updateBusiness } = useBusinesses()
  const { businessHours: realBusinessHours, refetchBusinessHours } = useDashboardData()
  const { language, setLanguage, t } = useLanguage()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false)
  const [isSavingHours, setIsSavingHours] = useState(false)
  const [hoursSaveStatus, setHoursSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [linkCopied, setLinkCopied] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
  const supabase = createClient()

  // Free-plan usage vs. the caps enforced in scripts/048-free-plan-limits.sql
  // - only fetched for free accounts, since Premium has no limits to show.
  useEffect(() => {
    if (!currentBusiness?.id || authProfile?.plan !== 'free') {
      setPlanUsage(null)
      return
    }
    let cancelled = false
    supabase.rpc('get_plan_usage', { p_business_id: currentBusiness.id }).then(({ data }) => {
      if (!cancelled && data && typeof data === 'object' && !('error' in data)) {
        setPlanUsage(data as unknown as PlanUsage)
      }
    })
    return () => {
      cancelled = true
    }
  }, [currentBusiness?.id, authProfile?.plan, supabase])

  // Picks up the redirect back from Stripe Checkout (success_url/cancel_url
  // in app/api/stripe/checkout) - the webhook usually updates profiles.plan
  // before this even runs, but refreshProfile() here means the UI reflects
  // Premium immediately instead of waiting for the next natural refetch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    if (checkout === 'success') {
      refreshProfile()
      toast.success(t.settings.checkoutSuccess)
      router.replace('/dashboard/settings')
    } else if (checkout === 'cancelled') {
      toast(t.settings.checkoutCancelled)
      router.replace('/dashboard/settings')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleManageSubscription = async () => {
    setIsPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      toast.error(t.settings.portalError)
    } catch (err) {
      console.error('[iplanit] Error opening billing portal:', err)
      toast.error(t.settings.portalError)
    } finally {
      setIsPortalLoading(false)
    }
  }

  const ownedBusinessesCount = businesses.filter((b) => b.role === 'owner').length

  const handleConfirmDeleteAccount = async () => {
    setDeleteAccountError('')
    setIsDeletingAccount(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error('request_failed')
      toast.success(t.accountDeletion.requestSuccess)
      setShowDeleteAccountDialog(false)
      // The dashboard layout itself will show the "scheduled for deletion"
      // screen on next load - signing out here is simplest and matches the
      // "you're being logged out either way" framing in the success toast.
      setTimeout(() => signOut(), 1500)
    } catch (err) {
      console.error('[iplanit] Error requesting account deletion:', err)
      setDeleteAccountError(t.accountDeletion.requestError)
    } finally {
      setIsDeletingAccount(false)
    }
  }

  // Staff (Premium team members) can't see/edit Configuracion or manage the
  // team themselves - only the owner can. Defaults to owner when there's no
  // business yet (the "create your business" flow).
  const isOwner = currentBusiness ? currentBusiness.role === 'owner' : true

  // Team State
  const [teamMembers, setTeamMembers] = useState<
    { id: string; email: string; full_name: string | null; created_at: string; role: 'admin' | 'sales' }[]
  >([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'sales'>('admin')
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)

  // DAYS computed from translations so they update when language changes
  const DAYS: { value: DayOfWeek; label: string }[] = [
    { value: 'monday', label: t.settings.days.monday },
    { value: 'tuesday', label: t.settings.days.tuesday },
    { value: 'wednesday', label: t.settings.days.wednesday },
    { value: 'thursday', label: t.settings.days.thursday },
    { value: 'friday', label: t.settings.days.friday },
    { value: 'saturday', label: t.settings.days.saturday },
    { value: 'sunday', label: t.settings.days.sunday },
  ]

  // Profile State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
  })

  // Business State
  const [business, setBusiness] = useState({
    name: '',
    slug: '',
    timezone: 'America/Lima',
    address: '',
    phone: '',
    email: '',
    country: 'PE' as 'PE' | 'US',
    tax_id: '',
    currency: 'PEN' as 'PEN' | 'USD',
    cancellation_policy_hours: 24,
    offers_parking: false,
  })
  const [slugError, setSlugError] = useState('')

  // Business Hours State
  const [businessHours, setBusinessHours] = useState(DEFAULT_BUSINESS_HOURS)

  // Notifications State - see scripts/041-email-notifications.sql. Toggles
  // are meaningful regardless of whether RESEND_API_KEY is configured yet
  // (a business can opt out ahead of time), but actual sending only starts
  // once that env var exists.
  const [notifications, setNotifications] = useState({
    emailConfirmations: true,
    emailReminders: true,
    emailCancellations: true,
    reminderHours: 24,
  })
  const [isSavingNotifications, setIsSavingNotifications] = useState(false)
  const [notifSaveStatus, setNotifSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // next-themes reads the resolved theme from localStorage/system on the
  // client only - rendering the Select before that resolves would show the
  // wrong value for a flash and risk a hydration mismatch.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize form with user/business data
  useEffect(() => {
    if (authProfile) {
      setProfileForm({
        name: authProfile.full_name || '',
        email: authProfile.email || '',
      })
    } else if (user) {
      setProfileForm({
        name: user.user_metadata?.full_name || '',
        email: user.email || '',
      })
    }

    if (currentBusiness) {
      setBusiness({
        name: currentBusiness.name,
        slug: currentBusiness.slug || '',
        timezone: currentBusiness.timezone,
        address: currentBusiness.address || '',
        phone: currentBusiness.phone || '',
        email: currentBusiness.email || '',
        country: currentBusiness.country || 'PE',
        tax_id: currentBusiness.tax_id || '',
        currency: currentBusiness.currency || (currentBusiness.country === 'US' ? 'USD' : 'PEN'),
        cancellation_policy_hours: currentBusiness.cancellation_policy_hours ?? 24,
        offers_parking: currentBusiness.offers_parking ?? false,
      })
      setNotifications({
        emailConfirmations: currentBusiness.notify_confirmations ?? true,
        emailReminders: currentBusiness.notify_reminders ?? true,
        emailCancellations: currentBusiness.notify_cancellations ?? true,
        reminderHours: currentBusiness.reminder_hours ?? 24,
      })
    }
  }, [authProfile, user, currentBusiness])

  // Team roster - only the owner can see the full list (RLS), so staff
  // never triggers this fetch since they never see the Team tab.
  useEffect(() => {
    if (!currentBusiness || !isOwner) {
      setTeamMembers([])
      return
    }
    const loadTeam = async () => {
      setLoadingTeam(true)
      const { data } = await supabase
        .from('business_members')
        .select('id, email, full_name, created_at, role')
        .eq('business_id', currentBusiness.id)
        .order('created_at', { ascending: true })
      setTeamMembers(data || [])
      setLoadingTeam(false)
    }
    loadTeam()
  }, [currentBusiness?.id, isOwner])

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentBusiness || !inviteEmail.trim()) return

    setIsInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      const { data, error } = await supabase.rpc('add_business_staff', {
        p_business_id: currentBusiness.id,
        p_email: inviteEmail.trim(),
        p_role: inviteRole,
      })
      if (error) throw error

      const result = data as { success?: boolean; error?: string; name?: string; email?: string }
      if (result.error) {
        const key = (
          {
            user_not_found: 'errorNotFound',
            not_premium: 'errorNotPremium',
            is_owner: 'errorIsOwner',
          } as const
        )[result.error] ?? 'errorGeneric'
        setInviteError(t.settings.team[key])
        return
      }

      setInviteSuccess(t.settings.team.added.replace('{name}', result.name || result.email || ''))
      setInviteEmail('')
      const { data: refreshed } = await supabase
        .from('business_members')
        .select('id, email, full_name, created_at, role')
        .eq('business_id', currentBusiness.id)
        .order('created_at', { ascending: true })
      setTeamMembers(refreshed || [])
    } catch (err) {
      console.error('[v0] Error inviting team member:', err)
      setInviteError(t.settings.team.errorGeneric)
    } finally {
      setIsInviting(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    setRemovingMemberId(memberId)
    try {
      const { error } = await supabase.from('business_members').delete().eq('id', memberId)
      if (error) throw error
      setTeamMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err) {
      console.error('[v0] Error removing team member:', err)
    } finally {
      setRemovingMemberId(null)
    }
  }

  const handleChangeRole = async (memberId: string, role: 'admin' | 'sales') => {
    setUpdatingRoleId(memberId)
    try {
      const { error } = await supabase.from('business_members').update({ role }).eq('id', memberId)
      if (error) throw error
      setTeamMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
    } catch (err) {
      console.error('[v0] Error updating team member role:', err)
    } finally {
      setUpdatingRoleId(null)
    }
  }

  // Business hours already come from DashboardDataProvider (fetched once for
  // the calendar/reservation validation) - derive the editable local form
  // from that instead of fetching the same table again here. Falls back to
  // DEFAULT_BUSINESS_HOURS when nothing's been saved yet (new business).
  useEffect(() => {
    if (realBusinessHours.length === 0) return
    setBusinessHours(
      DEFAULT_BUSINESS_HOURS.map((def) => {
        const dayNum = DAY_KEY_TO_NUMBER[def.dayOfWeek]
        const row = realBusinessHours.find((h) => h.day_of_week === dayNum)
        if (!row) return def
        return {
          dayOfWeek: def.dayOfWeek,
          startTime: row.open_time.slice(0, 5),
          endTime: row.close_time.slice(0, 5),
          isOpen: !row.is_closed,
        }
      })
    )
  }, [realBusinessHours])

  const handleCreateBusiness = async () => {
    if (!user || !business.name) return

    setIsCreatingBusiness(true)
    try {
      const slug = business.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { error } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: business.name,
          slug: slug,
          timezone: business.timezone,
          country: business.country,
          currency: business.country === 'US' ? 'USD' : 'PEN',
        })

      if (error) throw error
      window.location.reload()
    } catch (err) {
      console.error('[v0] Error creating business:', err)
    } finally {
      setIsCreatingBusiness(false)
    }
  }

  const bookingLink =
    currentBusiness?.slug && typeof window !== 'undefined'
      ? `${window.location.origin}/reservar/${currentBusiness.slug}`
      : ''

  const handleCopyLink = async () => {
    if (!bookingLink) return
    await navigator.clipboard.writeText(bookingLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    setSlugError('')
    try {
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: profileForm.name })
          .eq('id', user.id)
        if (profileError) throw profileError
      }

      if (currentBusiness) {
        const sanitizedSlug = business.slug
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')

        if (!sanitizedSlug) {
          setSlugError(t.settings.slugRequired)
          setIsSaving(false)
          return
        }

        try {
          await updateBusiness(currentBusiness.id, {
            name: business.name,
            slug: sanitizedSlug,
            timezone: business.timezone,
            address: business.address || null,
            phone: business.phone || null,
            email: business.email || null,
            country: business.country,
            tax_id: business.tax_id || null,
            currency: business.currency,
            cancellation_policy_hours: business.cancellation_policy_hours,
            offers_parking: business.offers_parking,
          })
        } catch (businessErr: any) {
          if (businessErr?.code === '23505') {
            setSlugError(t.settings.slugTaken)
            setIsSaving(false)
            return
          }
          throw businessErr
        }
        setBusiness((prev) => ({ ...prev, slug: sanitizedSlug }))
      }

      await refreshProfile()

      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('[v0] Error saving settings:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveNotifications = async () => {
    if (!currentBusiness) return
    setIsSavingNotifications(true)
    setNotifSaveStatus('idle')
    try {
      await updateBusiness(currentBusiness.id, {
        notify_confirmations: notifications.emailConfirmations,
        notify_cancellations: notifications.emailCancellations,
        notify_reminders: notifications.emailReminders,
        reminder_hours: notifications.reminderHours,
      })
      setNotifSaveStatus('success')
      setTimeout(() => setNotifSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('[iplanit] Error saving notification preferences:', err)
      setNotifSaveStatus('error')
      setTimeout(() => setNotifSaveStatus('idle'), 4000)
    } finally {
      setIsSavingNotifications(false)
    }
  }

  const handleSaveBusinessHours = async () => {
    if (!currentBusiness) return
    setIsSavingHours(true)
    setHoursSaveStatus('idle')
    try {
      const rows = businessHours.map((h) => ({
        business_id: currentBusiness.id,
        day_of_week: DAY_KEY_TO_NUMBER[h.dayOfWeek],
        open_time: h.startTime,
        close_time: h.endTime,
        is_closed: !h.isOpen,
      }))
      const { error } = await supabase
        .from('business_hours')
        .upsert(rows, { onConflict: 'business_id,day_of_week' })
      if (error) throw error

      // Refresh the shared copy so the calendar/reservation validation picks
      // up the new hours immediately, without a page reload.
      await refetchBusinessHours()

      setHoursSaveStatus('success')
      setTimeout(() => setHoursSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('[iplanit] Error saving business hours:', err)
      setHoursSaveStatus('error')
      setTimeout(() => setHoursSaveStatus('idle'), 4000)
    } finally {
      setIsSavingHours(false)
    }
  }

  const newPasswordChecks = getPasswordChecks(newPassword)

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError('')

    if (!isPasswordStrongEnough(newPasswordChecks)) {
      setPasswordError(t.auth.resetPassword.passwordRequirements)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t.auth.resetPassword.passwordsDontMatch)
      return
    }

    setIsSavingPassword(true)
    try {
      const { error } = await withTimeout(
        withAuthLockRetry(() => supabase.auth.updateUser({ password: newPassword })),
        8000
      )
      if (error) {
        setPasswordError(translateAuthError(error.message, language))
        return
      }
      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        setShowPasswordDialog(false)
        setPasswordSuccess(false)
      }, 1500)
    } catch (err) {
      if (err instanceof AuthTimeoutError) {
        setPasswordError(t.auth.resetPassword.timeoutDesc)
      } else {
        console.error('[iplanit] Error changing password:', err)
        setPasswordError(translateAuthError(null, language))
      }
    } finally {
      setIsSavingPassword(false)
    }
  }

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file || !user) return

    setPhotoError('')

    if (!file.type.startsWith('image/')) {
      setPhotoError(t.settings.photoInvalidType)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError(t.settings.photoTooLarge)
      return
    }

    setIsUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-bust so the browser doesn't keep showing the previous photo
      // after an overwrite at the same path.
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
      if (updateError) throw updateError

      await refreshProfile()
    } catch (err) {
      console.error('[iplanit] Error uploading avatar:', err)
      setPhotoError(t.settings.photoUploadError)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentBusiness) return

    setLogoError('')

    if (!file.type.startsWith('image/')) {
      setLogoError(t.settings.photoInvalidType)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError(t.settings.photoTooLarge)
      return
    }

    setIsUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${currentBusiness.id}/logo.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('business-logos')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('business-logos').getPublicUrl(path)
      // Cache-bust so the browser doesn't keep showing the previous logo
      // after an overwrite at the same path.
      const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`

      await updateBusiness(currentBusiness.id, { logo_url: logoUrl })
    } catch (err) {
      console.error('[iplanit] Error uploading business logo:', err)
      setLogoError(t.settings.photoUploadError)
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const updateBusinessHour = (
    dayOfWeek: DayOfWeek,
    field: 'startTime' | 'endTime' | 'isOpen',
    value: string | boolean
  ) => {
    setBusinessHours(
      businessHours.map((h) =>
        h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
      )
    )
  }

  return (
    <div className="space-y-6">
      {authLoading || businessLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
        <p className="text-muted-foreground">{t.settings.subtitle}</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList
          className={cn(
            'grid h-auto w-full grid-cols-2 gap-2 bg-muted/50 p-2 lg:w-auto',
            isOwner ? 'sm:grid-cols-5' : 'sm:grid-cols-3'
          )}
        >
          <TabsTrigger
            value="profile"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <User className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.profileTab}</span>
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger
              value="business"
              className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
            >
              <Building2 className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">{t.settings.businessTab}</span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="notifications"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <Bell className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.notificationsTab}</span>
          </TabsTrigger>
          <TabsTrigger
            value="plan"
            className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
          >
            <CreditCard className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm">{t.settings.planTab}</span>
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger
              value="team"
              className="flex-col gap-1 py-3 data-[state=active]:bg-card data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:py-2"
            >
              <Users className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="flex items-center gap-1 text-xs sm:text-sm">
                {t.settings.teamTab}
                <PremiumBadge />
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.profileTitle}</CardTitle>
              <CardDescription>{t.settings.profileDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={authProfile?.avatar_url || undefined} alt={profileForm.name} />
                    <AvatarFallback className="text-xl">
                      {getInitials(profileForm.name)}
                    </AvatarFallback>
                  </Avatar>
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {isUploadingPhoto ? t.settings.photoUploading : t.settings.changePhoto}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.settings.photoHint}
                  </p>
                  {photoError && (
                    <p className="mt-1 text-xs text-destructive">{photoError}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">{t.settings.fullName}</Label>
                  <Input
                    id="profile-name"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">{t.settings.emailLabel}</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={profileForm.email}
                    disabled
                    placeholder="tu@email.com"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.settings.emailHint}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-language">{t.language.label}</Label>
                <Select value={language} onValueChange={(value) => setLanguage(value as 'es' | 'en')}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">{t.language.es}</SelectItem>
                    <SelectItem value="en">{t.language.en}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-theme">{t.theme.label}</Label>
                <Select value={mounted ? theme : undefined} onValueChange={(value) => setTheme(value)}>
                  <SelectTrigger className="w-full sm:w-[200px]" id="profile-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t.theme.light}</SelectItem>
                    <SelectItem value="dark">{t.theme.dark}</SelectItem>
                    <SelectItem value="system">{t.theme.system}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-medium">
                  <Shield className="h-4 w-4" />
                  {t.settings.securityTitle}
                </h4>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
                    {t.settings.changePassword}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.lastUpdated}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                  {isSaving
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : saveStatus === 'success'
                      ? <Check className="h-4 w-4" />
                      : <Save className="h-4 w-4" />}
                  {t.saveChanges}
                </Button>
                {saveStatus === 'success' && (
                  <p className="text-sm text-green-600">{t.changesSaved}</p>
                )}
                {saveStatus === 'error' && (
                  <p className="text-sm text-destructive">{t.saveError}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {t.accountDeletion.dangerZoneTitle}
              </CardTitle>
              <CardDescription>{t.accountDeletion.dangerZoneDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setDeleteConfirmText('')
                  setDeleteAccountError('')
                  setShowDeleteAccountDialog(true)
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t.accountDeletion.deleteAccountBtn}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Tab - owner only, staff never sees the trigger either */}
        {isOwner && (
        <TabsContent value="business" className="space-y-6">
          {currentBusiness ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t.settings.businessTitle}</CardTitle>
                  <CardDescription>{t.settings.businessDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar className="h-20 w-20 rounded-lg">
                        <AvatarImage src={currentBusiness.logo_url || undefined} alt={business.name} />
                        <AvatarFallback className="rounded-lg text-xl">
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      {isUploadingLogo && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isUploadingLogo}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {isUploadingLogo ? t.settings.logoUploading : t.settings.changeLogo}
                      </Button>
                      <p className="mt-1 text-xs text-muted-foreground">{t.settings.logoHint}</p>
                      {logoError && (
                        <p className="mt-1 text-xs text-destructive">{logoError}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="business-name">{t.settings.businessName}</Label>
                      <Input
                        id="business-name"
                        value={business.name}
                        onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-country">{t.settings.businessCountry}</Label>
                      <Select
                        value={business.country}
                        onValueChange={(value: 'PE' | 'US') => setBusiness({ ...business, country: value })}
                      >
                        <SelectTrigger id="business-country">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PE">{t.settings.countryPE}</SelectItem>
                          <SelectItem value="US">{t.settings.countryUS}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-currency">{t.settings.businessCurrency}</Label>
                    <Select
                      value={business.currency}
                      onValueChange={(value: 'PEN' | 'USD') => setBusiness({ ...business, currency: value })}
                    >
                      <SelectTrigger id="business-currency" className="w-full sm:w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PEN">{t.settings.currencyPEN}</SelectItem>
                        <SelectItem value="USD">{t.settings.currencyUSD}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t.settings.businessCurrencyHint}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-slug">{t.settings.slugLabel}</Label>
                    <Input
                      id="business-slug"
                      value={business.slug}
                      onChange={(e) => {
                        setSlugError('')
                        setBusiness({ ...business, slug: e.target.value })
                      }}
                      placeholder="mi-negocio"
                      className={slugError ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {slugError ? (
                      <p className="text-xs text-destructive">{slugError}</p>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/reservar/
                        {business.slug
                          .toLowerCase()
                          .trim()
                          .replace(/\s+/g, '-')
                          .replace(/[^a-z0-9-]/g, '') || '...'}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-tax-id">
                      {business.country === 'US' ? t.settings.einLabel : t.settings.rucLabel}
                    </Label>
                    <Input
                      id="business-tax-id"
                      value={business.tax_id}
                      onChange={(e) => setBusiness({ ...business, tax_id: e.target.value })}
                      placeholder={business.country === 'US' ? '12-3456789' : '20123456789'}
                      maxLength={20}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-cancellation-policy">{t.settings.cancellationPolicyLabel}</Label>
                    <Input
                      id="business-cancellation-policy"
                      type="number"
                      min={0}
                      step={1}
                      value={business.cancellation_policy_hours}
                      onChange={(e) =>
                        setBusiness({ ...business, cancellation_policy_hours: parseInt(e.target.value) || 0 })
                      }
                      className="w-full sm:w-[140px]"
                    />
                    <p className="text-xs text-muted-foreground">{t.settings.cancellationPolicyHint}</p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="business-offers-parking" className="cursor-pointer">
                        {t.settings.offersParkingLabel}
                      </Label>
                      <p className="text-xs text-muted-foreground">{t.settings.offersParkingDesc}</p>
                    </div>
                    <Switch
                      id="business-offers-parking"
                      checked={business.offers_parking}
                      onCheckedChange={(checked) => setBusiness({ ...business, offers_parking: checked })}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="business-timezone">{t.settings.timezone}</Label>
                      <Select
                        value={business.timezone}
                        onValueChange={(value) => setBusiness({ ...business, timezone: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-address">{t.settings.address}</Label>
                      <Input
                        id="business-address"
                        value={business.address}
                        onChange={(e) => setBusiness({ ...business, address: e.target.value })}
                        placeholder={t.settings.addressPlaceholder}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="business-phone">{t.settings.phone}</Label>
                      <Input
                        id="business-phone"
                        value={business.phone}
                        onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
                        placeholder={t.settings.phonePlaceholder}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-email">{t.settings.contactEmail}</Label>
                      <Input
                        id="business-email"
                        type="email"
                        value={business.email}
                        onChange={(e) => setBusiness({ ...business, email: e.target.value })}
                        placeholder={t.settings.contactEmailPlaceholder}
                      />
                    </div>
                  </div>

                  <Separator />

                  <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Save className="h-4 w-4" />
                    {t.saveChanges}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    {t.settings.bookingLinkTitle}
                  </CardTitle>
                  <CardDescription>{t.settings.bookingLinkDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {bookingLink ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={bookingLink} readOnly className="font-mono text-xs sm:text-sm" />
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={handleCopyLink} className="gap-2">
                          {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          {linkCopied ? t.settings.linkCopied : t.settings.copyLink}
                        </Button>
                        <Button type="button" variant="outline" size="icon" asChild>
                          <a href={bookingLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.settings.bookingLinkUnavailable}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t.settings.hoursTitle}
                  </CardTitle>
                  <CardDescription>{t.settings.hoursDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {DAYS.map((day) => {
                      const hours = businessHours.find((h) => h.dayOfWeek === day.value)
                      if (!hours) return null
                      return (
                        <div
                          key={day.value}
                          className="flex flex-col gap-3 rounded-lg border p-3 sm:h-16 sm:flex-row sm:items-center"
                        >
                          <div className="flex h-9 w-36 shrink-0 items-center justify-between">
                            <span className="shrink-0 whitespace-nowrap text-sm font-medium">{day.label}</span>
                            <Switch
                              checked={hours.isOpen}
                              onCheckedChange={(checked) =>
                                updateBusinessHour(day.value, 'isOpen', checked)
                              }
                              className="shrink-0"
                            />
                          </div>
                          {hours.isOpen ? (
                            <div className="flex h-9 flex-1 items-center gap-2">
                              <Input
                                type="time"
                                value={hours.startTime}
                                onChange={(e) =>
                                  updateBusinessHour(day.value, 'startTime', e.target.value)
                                }
                                className="h-9 w-full sm:w-auto"
                              />
                              <span className="text-muted-foreground">{t.settings.to}</span>
                              <Input
                                type="time"
                                value={hours.endTime}
                                onChange={(e) =>
                                  updateBusinessHour(day.value, 'endTime', e.target.value)
                                }
                                className="h-9 w-full sm:w-auto"
                              />
                            </div>
                          ) : (
                            <div className="flex h-9 flex-1 items-center">
                              <span className="text-sm text-muted-foreground">{t.settings.closed}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <Separator className="my-6" />

                  <div className="flex items-center gap-3">
                    <Button onClick={handleSaveBusinessHours} disabled={isSavingHours} className="gap-2">
                      {isSavingHours
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : hoursSaveStatus === 'success'
                          ? <Check className="h-4 w-4" />
                          : <Save className="h-4 w-4" />}
                      {t.saveChanges}
                    </Button>
                    {hoursSaveStatus === 'success' && (
                      <p className="text-sm text-green-600">{t.changesSaved}</p>
                    )}
                    {hoursSaveStatus === 'error' && (
                      <p className="text-sm text-destructive">{t.saveError}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t.settings.createBusinessTitle}</CardTitle>
                <CardDescription>{t.settings.createBusinessDesc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="new-biz-name">{t.settings.businessName}</Label>
                  <Input
                    id="new-biz-name"
                    value={business.name}
                    onChange={(e) => setBusiness({ ...business, name: e.target.value })}
                    placeholder="Ej: Mi Clínica Dental"
                  />
                </div>

                <div>
                  <Label htmlFor="new-timezone">{t.settings.timezone}</Label>
                  <Select
                    value={business.timezone}
                    onValueChange={(value) => setBusiness({ ...business, timezone: value })}
                  >
                    <SelectTrigger id="new-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleCreateBusiness}
                  disabled={isCreatingBusiness || !business.name}
                  className="gap-2"
                >
                  {isCreatingBusiness && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Plus className="h-4 w-4" />
                  {t.settings.createBusinessBtn}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        )}

        {/* Notifications Tab - wired to real columns on businesses (see
            scripts/041-email-notifications.sql) and actually sent via Resend
            (lib/email) once RESEND_API_KEY is configured. */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.notifTitle}</CardTitle>
              <CardDescription>{t.settings.notifDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.confirmations}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.confirmationsDesc}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailConfirmations}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, emailConfirmations: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.reminders}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.remindersDesc}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailReminders}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, emailReminders: checked })}
                />
              </div>

              {notifications.emailReminders && (
                <div className="ml-4 space-y-2 border-l-2 pl-4">
                  <Label>{t.settings.reminderTiming}</Label>
                  <Select
                    value={String(notifications.reminderHours)}
                    onValueChange={(value) => setNotifications({ ...notifications, reminderHours: Number(value) })}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t.settings.reminderH1}</SelectItem>
                      <SelectItem value="2">{t.settings.reminderH2}</SelectItem>
                      <SelectItem value="24">{t.settings.reminderH24}</SelectItem>
                      <SelectItem value="48">{t.settings.reminderH48}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t.settings.cancellations}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.cancellationsDesc}
                  </p>
                </div>
                <Switch
                  checked={notifications.emailCancellations}
                  onCheckedChange={(checked) => setNotifications({ ...notifications, emailCancellations: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveNotifications} disabled={isSavingNotifications || !currentBusiness} className="gap-2">
                  {isSavingNotifications
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : notifSaveStatus === 'success'
                      ? <Check className="h-4 w-4" />
                      : <Save className="h-4 w-4" />}
                  {t.saveChanges}
                </Button>
                {notifSaveStatus === 'success' && (
                  <span className="text-sm text-green-600">{t.changesSaved}</span>
                )}
                {notifSaveStatus === 'error' && (
                  <span className="text-sm text-destructive">{t.saveError}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.planTitle}</CardTitle>
              <CardDescription>
                {authProfile?.plan === 'premium'
                  ? t.settings.premiumPlanDesc
                  : t.settings.freePlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <Crown className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="font-semibold">
                      {authProfile?.plan === 'premium'
                        ? t.settings.premiumPlanName
                        : t.settings.freePlanName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {authProfile?.plan === 'premium'
                        ? t.settings.premiumFeatures
                        : t.settings.freeFeatures}
                    </p>
                  </div>
                </div>
                {authProfile?.plan === 'premium' ? (
                  <div className="flex flex-col items-end gap-2">
                    <Badge>
                      <Check className="mr-1 h-3 w-3" />
                      {t.settings.activeStatus}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManageSubscription}
                      disabled={isPortalLoading}
                    >
                      {isPortalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t.settings.manageSubscription}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => setShowUpgradeModal(true)}>{t.settings.upgradePremium}</Button>
                )}
              </div>

              {authProfile?.plan === 'free' && planUsage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t.settings.usageTitle}</CardTitle>
                    <CardDescription>{t.settings.usageDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(
                      [
                        ['reservations_this_month', t.upgradeModal.reservationsPerMonthLabel, FREE_LIMITS.reservationsPerMonth],
                        ['clients', t.upgradeModal.clientsLabel, FREE_LIMITS.clients],
                        ['services', t.upgradeModal.servicesLabel, FREE_LIMITS.services],
                        ['resources', t.upgradeModal.resourcesLabel, FREE_LIMITS.resources],
                      ] as const
                    ).map(([key, label, limit]) => {
                      const used = planUsage[key]
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{label}</span>
                            <span className={cn('font-medium', used >= limit && 'text-destructive')}>
                              {used} / {limit}
                            </span>
                          </div>
                          <Progress value={Math.min(100, (used / limit) * 100)} className="h-2" />
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}

              {authProfile?.plan === 'free' && (
                <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900 dark:from-amber-950/40 dark:to-orange-950/30">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Crown className="h-5 w-5 text-amber-500" />
                      {t.settings.premiumFeaturesTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {t.settings.premiumFeaturesList.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-amber-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab - owner only, Premium-gated */}
        {isOwner && (
        <TabsContent value="team" className="space-y-6">
          <PremiumFeature featureName={t.settings.team.featureName}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {t.settings.team.title}
                </CardTitle>
                <CardDescription>{t.settings.team.desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleInvite} className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="invite-email" className="sr-only">
                      {t.settings.team.emailLabel}
                    </Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder={t.settings.team.emailPlaceholder}
                      disabled={isInviting}
                    />
                  </div>
                  <Select value={inviteRole} onValueChange={(v: 'admin' | 'sales') => setInviteRole(v)} disabled={isInviting}>
                    <SelectTrigger className="sm:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t.settings.team.roleAdmin}</SelectItem>
                      <SelectItem value="sales">{t.settings.team.roleSales}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={isInviting || !inviteEmail.trim()} className="gap-2">
                    {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {t.settings.team.addBtn}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  {inviteRole === 'admin' ? t.settings.team.roleAdminDesc : t.settings.team.roleSalesDesc}
                </p>
                {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
                {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}

                <Separator />

                {loadingTeam ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t.settings.team.empty}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teamMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback>
                              {(member.full_name || member.email)[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="overflow-hidden">
                            <p className="truncate text-sm font-medium">
                              {member.full_name || member.email}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        <Select
                          value={member.role}
                          onValueChange={(v: 'admin' | 'sales') => handleChangeRole(member.id, v)}
                          disabled={updatingRoleId === member.id}
                        >
                          <SelectTrigger className="w-[140px] shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">{t.settings.team.roleAdmin}</SelectItem>
                            <SelectItem value="sales">{t.settings.team.roleSales}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removingMemberId === member.id}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          {removingMemberId === member.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">{t.settings.team.hint}</p>
              </CardContent>
            </Card>
          </PremiumFeature>
        </TabsContent>
        )}
      </Tabs>
        </>
      )}

      <UpgradeModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />

      <Dialog
        open={showPasswordDialog}
        onOpenChange={(open) => {
          setShowPasswordDialog(open)
          if (!open) {
            setNewPassword('')
            setConfirmPassword('')
            setPasswordError('')
            setPasswordSuccess(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              {t.settings.changePassword}
            </DialogTitle>
            <DialogDescription>{t.auth.resetPassword.subtitle}</DialogDescription>
          </DialogHeader>

          {passwordSuccess ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Check className="h-8 w-8 text-green-600" />
              <p className="font-medium">{t.auth.resetPassword.successTitle}</p>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {passwordError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">{t.auth.resetPassword.newPassword}</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder={t.auth.resetPassword.passwordPlaceholderMin}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSavingPassword}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrength
                  password={newPassword}
                  labels={{ ...t.auth.register.passwordStrength, ...t.auth.register.passwordReq }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">{t.auth.resetPassword.confirmPassword}</Label>
                <Input
                  id="confirm-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder={t.auth.resetPassword.passwordPlaceholderMin}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSavingPassword}
                  required
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordDialog(false)}
                  disabled={isSavingPassword}
                >
                  {t.services.cancelBtn}
                </Button>
                <Button type="submit" disabled={isSavingPassword} className="gap-2">
                  {isSavingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSavingPassword ? t.auth.resetPassword.updating : t.auth.resetPassword.updateBtn}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDeleteAccountDialog}
        onOpenChange={(open) => {
          if (isDeletingAccount) return
          setShowDeleteAccountDialog(open)
          if (!open) {
            setDeleteConfirmText('')
            setDeleteAccountError('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.accountDeletion.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {ownedBusinessesCount > 0
                ? t.accountDeletion.deleteOwnerWarning.replace('{count}', String(ownedBusinessesCount))
                : t.accountDeletion.deleteStaffWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-text" className="text-sm">
              {t.accountDeletion.typeToConfirm}
            </Label>
            <Input
              id="delete-confirm-text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={t.accountDeletion.confirmPlaceholder}
              disabled={isDeletingAccount}
              autoComplete="off"
            />
            {deleteAccountError && (
              <p className="text-sm text-destructive">{deleteAccountError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteAccountDialog(false)}
              disabled={isDeletingAccount}
            >
              {t.accountDeletion.cancelBtn}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeleteAccount}
              disabled={isDeletingAccount || deleteConfirmText !== t.accountDeletion.confirmWord}
              className="gap-2"
            >
              {isDeletingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.accountDeletion.confirmBtn}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
