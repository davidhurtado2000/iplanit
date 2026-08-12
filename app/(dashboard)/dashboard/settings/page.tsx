'use client'

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { PasswordStrength } from '@/components/password-strength'
import { UpgradeModal } from '@/components/upgrade-modal'
import { PremiumFeature, PremiumBadge, PremiumButton } from '@/components/premium-feature'
import { FormSection } from '@/components/dashboard/form-section'
import { TimeSelect } from '@/components/dashboard/time-select'
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
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/plan-limits'
import { sedeAbbr, sedeTint, buildBusinessColorIndex } from '@/lib/sede-colors'
import {
  User,
  Building2,
  Clock,
  Bell,
  CreditCard,
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
  plan: 'free' | 'pro' | 'premium'
  reservations_this_month: number
  clients: number
  services: number
  resources: number
  team_seats: number
}

// business_hours.day_of_week is 0-6 (0=Sunday), matching the convention
// already used for reservation validation elsewhere in the app.
const DAY_KEY_TO_NUMBER: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

export default function SettingsPage() {
  const { user, profile: authProfile, loading: authLoading, refreshProfile } = useAuth()
  const { currentBusiness, businesses, loading: businessLoading, updateBusiness, fetchBusinesses, switchBusiness } = useBusinesses()
  const { businessHours: realBusinessHours, refetchBusinessHours } = useDashboardData()
  const { language, setLanguage, t } = useLanguage()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [isChangingPlan, setIsChangingPlan] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false)
  const [isSavingHours, setIsSavingHours] = useState(false)
  const [hoursSaveStatus, setHoursSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [linkCopied, setLinkCopied] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  // Which tier the modal should emphasize - unset from the free-plan CTA
  // (both cards shown equally), 'premium' when a Pro account clicks the
  // "upgrade to Premium" upsell link.
  const [upgradeModalPlan, setUpgradeModalPlan] = useState<'pro' | 'premium' | undefined>(undefined)
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
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null)
  const supabase = createClient()

  // Usage vs. the caps enforced in scripts/048-free-plan-limits.sql. Fetched
  // for both plans - free shows "used / limit" bars, premium shows the same
  // counts labeled "Unlimited" since is_business_premium() bypasses every
  // cap in those triggers.
  useEffect(() => {
    if (!currentBusiness?.id) {
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

  // For an existing subscriber changing tiers - modifies the current
  // subscription's price (see app/api/stripe/change-plan) instead of
  // Checkout, which would create a second subscription. profiles.plan
  // itself updates via the Stripe webhook once it processes the change, so
  // this refetches shortly after to reflect it without a manual reload.
  const handleChangePlan = async (tier: 'pro' | 'premium') => {
    setIsChangingPlan(true)
    try {
      const res = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(t.settings.changePlanSuccess)
        await refreshProfile()
        setTimeout(() => refreshProfile(), 2000)
        return
      }
      toast.error(t.settings.changePlanError)
    } catch (err) {
      console.error('[iplanit] Error changing plan:', err)
      toast.error(t.settings.changePlanError)
    } finally {
      setIsChangingPlan(false)
    }
  }

  // Staff (Premium team members) can't see/edit Configuracion or manage the
  // team themselves - only the owner can. Defaults to owner when there's no
  // business yet (the "create your business" flow).
  const isOwner = currentBusiness ? currentBusiness.role === 'owner' : true
  const plan = (authProfile?.plan ?? 'free') as 'free' | 'pro' | 'premium'
  const sedes = businesses.filter((b) => b.organization_id === currentBusiness?.organization_id)
  const orgBusinessIds = sedes.map((s) => s.id)
  const hasMultipleSedes = sedes.length > 1
  const businessNameById = Object.fromEntries(sedes.map((s) => [s.id, s.name]))
  const businessColorIndexById = buildBusinessColorIndex(orgBusinessIds)

  // Team State - business_id kept per row (not just id) so a multi-sede
  // roster can be grouped by person instead of showing one row per sede.
  const [teamMembers, setTeamMembers] = useState<
    { id: string; business_id: string; email: string; full_name: string | null; created_at: string; role: 'admin' | 'sales' }[]
  >([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'sales'>('admin')
  // Which sedes to invite into - defaults to every sede in the org (the
  // common case: "add this person everywhere"), only relevant/shown when
  // hasMultipleSedes. Single-sede accounts always just invite into
  // currentBusiness.id, no picker shown.
  const [inviteBusinessIds, setInviteBusinessIds] = useState<string[]>([])
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)
  // Seat cap is per-business (Pro = 2 seats/sede) - only block the whole
  // form when every currently-targeted sede is already at cap.
  const seatCountByBusiness = teamMembers.reduce<Record<string, number>>((acc, m) => {
    acc[m.business_id] = (acc[m.business_id] || 0) + 1
    return acc
  }, {})
  const targetBusinessIds = hasMultipleSedes ? inviteBusinessIds : currentBusiness ? [currentBusiness.id] : []
  const atSeatCap =
    plan === 'pro' &&
    targetBusinessIds.length > 0 &&
    targetBusinessIds.every((id) => (seatCountByBusiness[id] || 0) >= 2)

  useEffect(() => {
    setInviteBusinessIds(orgBusinessIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusiness?.organization_id])

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
    worker_label_singular: '',
    worker_label_plural: '',
  })
  const [slugError, setSlugError] = useState('')

  // Sedes state (scripts/053-organizations-and-sedes.sql) - Premium-only,
  // gated via the same PremiumButton pattern used everywhere else.
  const [isSedeDialogOpen, setIsSedeDialogOpen] = useState(false)
  const [isCreatingSede, setIsCreatingSede] = useState(false)
  const [sedeError, setSedeError] = useState('')
  const [newSede, setNewSede] = useState({ name: '', timezone: 'America/Lima', country: 'PE' as 'PE' | 'US' })

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
        worker_label_singular: currentBusiness.worker_label_singular || '',
        worker_label_plural: currentBusiness.worker_label_plural || '',
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
  // never triggers this fetch since they never see the Team tab. Fetches
  // across every sede in the org (not just currentBusiness) when the
  // account has more than one, so the roster can group a person's
  // memberships instead of only showing whichever sede is active.
  const refetchTeam = async () => {
    if (!currentBusiness || !isOwner) return
    setLoadingTeam(true)
    const { data } = await supabase
      .from('business_members')
      .select('id, business_id, email, full_name, created_at, role')
      .in('business_id', hasMultipleSedes ? orgBusinessIds : [currentBusiness.id])
      .order('created_at', { ascending: true })
    setTeamMembers(data || [])
    setLoadingTeam(false)
  }

  useEffect(() => {
    if (!currentBusiness || !isOwner) {
      setTeamMembers([])
      return
    }
    refetchTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusiness?.id, currentBusiness?.organization_id, isOwner, hasMultipleSedes])

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentBusiness || !inviteEmail.trim()) return
    const targets = hasMultipleSedes ? inviteBusinessIds : [currentBusiness.id]
    if (targets.length === 0) return

    setIsInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      // Each sede's membership/seat-cap is independent (add_business_staff,
      // scripts/052) - looping is a series of independent operations, not
      // one atomic transaction, so a cap hit on one sede doesn't roll back
      // a success on another.
      const results = await Promise.all(
        targets.map(async (businessId) => {
          const { data, error } = await supabase.rpc('add_business_staff', {
            p_business_id: businessId,
            p_email: inviteEmail.trim(),
            p_role: inviteRole,
          })
          if (error) return { businessId, error: 'errorGeneric' as const }
          const result = data as { success?: boolean; error?: string; name?: string; email?: string }
          if (result.error) {
            const key = (
              {
                user_not_found: 'errorNotFound',
                plan_required: 'errorPlanRequired',
                seat_limit_reached: 'errorSeatLimit',
                is_owner: 'errorIsOwner',
              } as const
            )[result.error] ?? 'errorGeneric'
            return { businessId, error: key, name: result.name }
          }
          return { businessId, name: result.name || result.email }
        })
      )

      const succeeded = results.filter((r) => !r.error)
      const failed = results.filter((r) => r.error)

      if (succeeded.length > 0) {
        const name = succeeded[0].name || inviteEmail.trim()
        const sedeNames = succeeded.map((r) => businessNameById[r.businessId]).join(', ')
        setInviteSuccess(
          hasMultipleSedes
            ? t.settings.team.addedToSedes.replace('{name}', name).replace('{sedes}', sedeNames)
            : t.settings.team.added.replace('{name}', name)
        )
        setInviteEmail('')
      }
      if (failed.length > 0) {
        const failedText = failed
          .map((r) => `${businessNameById[r.businessId]}: ${t.settings.team[r.error as keyof typeof t.settings.team]}`)
          .join(' · ')
        setInviteError(succeeded.length > 0 ? failedText : (t.settings.team[failed[0].error as keyof typeof t.settings.team] as string))
      }

      if (succeeded.length > 0) await refetchTeam()
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

  // Removes every sede-membership row for this person in one go ("quitar de
  // todas las sedes") instead of clicking remove once per row.
  const handleRemoveMemberFromAllSedes = async (memberIds: string[]) => {
    setRemovingMemberId(memberIds[0])
    try {
      const { error } = await supabase.from('business_members').delete().in('id', memberIds)
      if (error) throw error
      setTeamMembers((prev) => prev.filter((m) => !memberIds.includes(m.id)))
    } catch (err) {
      console.error('[v0] Error removing team member from all sedes:', err)
    } finally {
      setRemovingMemberId(null)
    }
  }

  // Groups the (possibly org-wide) flat membership rows by person, so a
  // staffer added to 3 sedes renders as one roster entry with 3 sede
  // badges instead of 3 duplicate-looking rows.
  const groupedTeamMembers = Object.values(
    teamMembers.reduce<Record<string, { email: string; full_name: string | null; earliest: string; entries: typeof teamMembers }>>(
      (acc, m) => {
        if (!acc[m.email]) acc[m.email] = { email: m.email, full_name: m.full_name, earliest: m.created_at, entries: [] }
        acc[m.email].entries.push(m)
        if (m.created_at < acc[m.email].earliest) acc[m.email].earliest = m.created_at
        return acc
      },
      {}
    )
  ).sort((a, b) => a.earliest.localeCompare(b.earliest))

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
      // Only reachable when the signup completed with zero businesses (no
      // business_name at signup, so handle_new_user() never created one -
      // and therefore never created an organization either). Bootstrap one
      // here, same pattern handle_new_user() uses server-side.
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ owner_id: user.id, name: business.name })
        .select('id')
        .single()
      if (orgError) throw orgError

      const slug = business.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { error } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          organization_id: org.id,
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

  // Adds a sede to the CURRENT business's organization (scripts/053) -
  // unlike handleCreateBusiness above, this is the Premium multi-location
  // path, gated by the create_sede RPC itself (sede_requires_premium /
  // sede_limit_reached). Lands on the new sede via switchBusiness() rather
  // than a reload - dashboard-data-context already re-fetches everything
  // reactively on currentBusiness.id change.
  const handleCreateSede = async () => {
    if (!currentBusiness || !newSede.name.trim()) return

    setIsCreatingSede(true)
    setSedeError('')
    try {
      const { data, error } = await supabase.rpc('create_sede', {
        p_business_id: currentBusiness.id,
        p_name: newSede.name.trim(),
        p_timezone: newSede.timezone,
        p_country: newSede.country,
      })
      if (error) throw error

      const result = data as { success?: boolean; error?: string; business_id?: string }
      if (result.error) {
        const key = (
          {
            sede_requires_premium: 'errorRequiresPremium',
            sede_limit_reached: 'errorLimitReached',
            no_existing_business: 'errorNoExistingBusiness',
            name_required: 'errorNameRequired',
          } as const
        )[result.error] ?? 'errorGeneric'
        setSedeError(t.settings.sedes[key])
        return
      }

      await fetchBusinesses()
      if (result.business_id) switchBusiness(result.business_id)
      setIsSedeDialogOpen(false)
      setNewSede({ name: '', timezone: 'America/Lima', country: 'PE' })
    } catch (err) {
      console.error('[iplanit] Error creating sede:', err)
      setSedeError(t.settings.sedes.errorGeneric)
    } finally {
      setIsCreatingSede(false)
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
            worker_label_singular: business.worker_label_singular.trim() || null,
            worker_label_plural: business.worker_label_plural.trim() || null,
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
      // The inline red text next to the button is easy to miss if you've
      // scrolled away or aren't looking right at it - a toast makes a
      // failed save (as opposed to the more forgiving "nothing happened
      // yet") hard to miss regardless of scroll position.
      toast.error(t.saveError)
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
      toast.error(t.saveError)
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
      toast.error(t.saveError)
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

  // Quick "same hours every day" - only touches start/end time, never
  // isOpen, so a day deliberately marked closed stays closed (it just
  // picks up the same times in the background in case it's reopened later).
  const [bulkStartTime, setBulkStartTime] = useState('09:00')
  const [bulkEndTime, setBulkEndTime] = useState('18:00')
  const applyHoursToAllDays = () => {
    setBusinessHours(
      businessHours.map((h) => ({ ...h, startTime: bulkStartTime, endTime: bulkEndTime }))
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
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

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
              <FormSection title={t.settings.sectionPhotoAndPersonal} bordered>
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
                      placeholder={t.settings.emailFieldPlaceholder}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.settings.emailHint}
                    </p>
                  </div>
                </div>
              </FormSection>

              <Separator />

              <FormSection title={t.settings.sectionPreferences} bordered>
                <div className="space-y-2">
                  <Label htmlFor="profile-language">{t.language.label}</Label>
                  <Select value={language} onValueChange={(value) => setLanguage(value as 'es' | 'en')}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t.language.en}</SelectItem>
                      <SelectItem value="es">{t.language.es}</SelectItem>
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
              </FormSection>

              <Separator />

              <FormSection title={t.settings.securityTitle} bordered>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
                    {t.settings.changePassword}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {t.settings.lastUpdated}
                  </p>
                </div>
              </FormSection>

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
        </TabsContent>

        {/* Business Tab - owner only, staff never sees the trigger either */}
        {isOwner && (
        <TabsContent value="business" className="space-y-6">
          {currentBusiness ? (
            <>
              {isOwner && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t.settings.sedes.sectionTitle}</CardTitle>
                    <CardDescription>{t.settings.sedes.sectionDesc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sedes.map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm font-medium">{b.name}</span>
                        {b.id === currentBusiness.id && (
                          <Badge variant="outline">{t.settings.sedes.currentBadge}</Badge>
                        )}
                      </div>
                    ))}
                    <PremiumButton
                      requiredPlan="premium"
                      variant="outline"
                      featureName={t.settings.sedes.featureName}
                      onClick={() => setIsSedeDialogOpen(true)}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {t.settings.sedes.addBtn}
                    </PremiumButton>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{t.settings.businessTitle}</CardTitle>
                  <CardDescription>{t.settings.businessDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormSection title={t.settings.sectionBasicInfo} bordered>
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
                  </FormSection>

                  <Separator />

                  <FormSection title={t.settings.sectionTerminology} bordered>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="worker-label-singular">{t.settings.workerLabelSingularField}</Label>
                        <Input
                          id="worker-label-singular"
                          value={business.worker_label_singular}
                          onChange={(e) => setBusiness({ ...business, worker_label_singular: e.target.value })}
                          placeholder={t.settings.workerLabelSingularPlaceholder}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="worker-label-plural">{t.settings.workerLabelPluralField}</Label>
                        <Input
                          id="worker-label-plural"
                          value={business.worker_label_plural}
                          onChange={(e) => setBusiness({ ...business, worker_label_plural: e.target.value })}
                          placeholder={t.settings.workerLabelPluralPlaceholder}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.settings.workerLabelHint}</p>
                  </FormSection>

                  <Separator />

                  <FormSection title={t.settings.sectionBookingSettings} bordered>
                    <div className="space-y-2">
                      <Label htmlFor="business-slug">{t.settings.slugLabel}</Label>
                      <Input
                        id="business-slug"
                        value={business.slug}
                        onChange={(e) => {
                          setSlugError('')
                          setBusiness({ ...business, slug: e.target.value })
                        }}
                        placeholder={t.settings.slugPlaceholder}
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
                  </FormSection>

                  <Separator />

                  <FormSection title={t.settings.sectionContact} bordered>
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
                  </FormSection>

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
                    <Link2 className="h-5 w-5 text-primary" />
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
                    <Clock className="h-5 w-5 text-primary" />
                    {t.settings.hoursTitle}
                  </CardTitle>
                  <CardDescription>{t.settings.hoursDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center">
                    <span className="shrink-0 text-sm font-medium">{t.settings.applyToAllLabel}</span>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <TimeSelect value={bulkStartTime} onChange={setBulkStartTime} className="h-9 w-[140px]" />
                      <span className="text-sm text-muted-foreground">{t.settings.to}</span>
                      <TimeSelect value={bulkEndTime} onChange={setBulkEndTime} className="h-9 w-[140px]" />
                      <Button type="button" variant="outline" size="sm" onClick={applyHoursToAllDays}>
                        {t.settings.applyToAllBtn}
                      </Button>
                    </div>
                  </div>

                  <div className="divide-y rounded-lg border">
                    {DAYS.map((day) => {
                      const hours = businessHours.find((h) => h.dayOfWeek === day.value)
                      if (!hours) return null
                      return (
                        <div
                          key={day.value}
                          className="flex flex-col gap-3 p-3 sm:h-16 sm:flex-row sm:items-center"
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
                              <TimeSelect
                                value={hours.startTime}
                                onChange={(value) => updateBusinessHour(day.value, 'startTime', value)}
                                className="h-9 w-full sm:w-[140px]"
                              />
                              <span className="text-muted-foreground">{t.settings.to}</span>
                              <TimeSelect
                                value={hours.endTime}
                                onChange={(value) => updateBusinessHour(day.value, 'endTime', value)}
                                className="h-9 w-full sm:w-[140px]"
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
                    placeholder={t.settings.businessNamePlaceholder}
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
                    <SelectTrigger className="w-full sm:w-[200px]">
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
                {plan === 'premium'
                  ? t.settings.premiumPlanDesc
                  : plan === 'pro'
                    ? t.settings.proPlanDesc
                    : t.settings.freePlanDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <Crown className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="font-semibold">
                      {plan === 'premium'
                        ? t.settings.premiumPlanName
                        : plan === 'pro'
                          ? t.settings.proPlanName
                          : t.settings.freePlanName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {plan === 'premium'
                        ? t.settings.premiumFeatures
                        : plan === 'pro'
                          ? t.settings.proFeatures
                          : t.settings.freeFeatures}
                    </p>
                  </div>
                </div>
                {plan !== 'free' ? (
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
                    {plan === 'pro' && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-primary underline hover:text-primary/80 disabled:opacity-50"
                        disabled={isChangingPlan}
                        onClick={() => handleChangePlan('premium')}
                      >
                        {isChangingPlan && <Loader2 className="h-3 w-3 animate-spin" />}
                        {t.settings.upgradeToPremiumBtn}
                      </button>
                    )}
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      setUpgradeModalPlan(undefined)
                      setShowUpgradeModal(true)
                    }}
                  >
                    {t.settings.upgradePremium}
                  </Button>
                )}
              </div>

              {plan === 'free' && planUsage && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{t.settings.usageTitle}</h3>
                      <p className="text-sm text-muted-foreground">{t.settings.usageDesc}</p>
                    </div>
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
                  </div>
                </>
              )}

              {plan === 'pro' && planUsage && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{t.settings.proUsageTitle}</h3>
                      <p className="text-sm text-muted-foreground">{t.settings.proUsageDesc}</p>
                    </div>
                    {(
                      [
                        ['reservations_this_month', t.upgradeModal.reservationsPerMonthLabel],
                        ['clients', t.upgradeModal.clientsLabel],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{planUsage[key]}</span>
                          <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
                            {t.settings.unlimitedLabel}
                          </Badge>
                        </span>
                      </div>
                    ))}
                    {(
                      [
                        ['services', t.upgradeModal.servicesLabel, PRO_LIMITS.services],
                        ['resources', t.upgradeModal.resourcesLabel, PRO_LIMITS.resources],
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
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t.settings.teamSeatsLabel}</span>
                        <span className={cn('font-medium', planUsage.team_seats >= PRO_LIMITS.teamSeats && 'text-destructive')}>
                          {planUsage.team_seats} / {PRO_LIMITS.teamSeats}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, (planUsage.team_seats / PRO_LIMITS.teamSeats) * 100)}
                        className="h-2"
                      />
                    </div>
                  </div>
                </>
              )}

              {plan === 'premium' && planUsage && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{t.settings.premiumUsageTitle}</h3>
                      <p className="text-sm text-muted-foreground">{t.settings.premiumUsageDesc}</p>
                    </div>
                    {(
                      [
                        ['reservations_this_month', t.upgradeModal.reservationsPerMonthLabel],
                        ['clients', t.upgradeModal.clientsLabel],
                        ['services', t.upgradeModal.servicesLabel],
                        ['resources', t.upgradeModal.resourcesLabel],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{planUsage[key]}</span>
                          <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
                            {t.settings.unlimitedLabel}
                          </Badge>
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t.settings.teamSeatsLabel}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{planUsage.team_seats}</span>
                        <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
                          {t.settings.unlimitedLabel}
                        </Badge>
                      </span>
                    </div>
                  </div>
                </>
              )}

              {plan === 'free' && (
                <>
                  <Separator />
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-900 dark:from-amber-950/40 dark:to-orange-950/30">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Crown className="h-4 w-4 text-amber-500" />
                      {t.settings.premiumFeaturesTitle}
                    </h3>
                    <ul className="space-y-2">
                      {t.settings.premiumFeaturesList.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-amber-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setUpgradeModalPlan(undefined)
                        setShowUpgradeModal(true)
                      }}
                    >
                      {t.settings.viewPlansBtn}
                    </Button>
                  </div>
                </>
              )}

              {plan === 'pro' && (
                <>
                  <Separator />
                  <div className="space-y-3 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-teal-950/30">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Crown className="h-4 w-4 text-amber-500" />
                      {t.settings.proIncludedTitle}
                    </h3>
                    <ul className="space-y-2">
                      {t.settings.proFeaturesList.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary underline hover:text-primary/80 disabled:opacity-50"
                      disabled={isChangingPlan}
                      onClick={() => handleChangePlan('premium')}
                    >
                      {isChangingPlan && <Loader2 className="h-3 w-3 animate-spin" />}
                      {t.settings.premiumUpsellFromProLabel}
                    </button>
                  </div>
                </>
              )}

              {plan === 'premium' && (
                <>
                  <Separator />
                  <div className="space-y-3 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 dark:border-emerald-900 dark:from-emerald-950/40 dark:to-teal-950/30">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Crown className="h-4 w-4 text-amber-500" />
                      {t.settings.premiumIncludedTitle}
                    </h3>
                    <ul className="space-y-2">
                      {t.settings.premiumFeaturesList.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab - owner only, Premium-gated */}
        {isOwner && (
        <TabsContent value="team" className="space-y-6">
          <PremiumFeature featureName={t.settings.team.featureName} requiredPlan="pro">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {t.settings.team.title}
                </CardTitle>
                <CardDescription>{t.settings.team.desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {plan === 'pro' && currentBusiness && (
                  <p className="text-xs font-medium text-muted-foreground">
                    {t.settings.team.seatsUsedLabel.replace('{used}', String(seatCountByBusiness[currentBusiness.id] || 0))}
                  </p>
                )}
                <form onSubmit={handleInvite} className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
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
                        disabled={isInviting || atSeatCap}
                      />
                    </div>
                    <Select value={inviteRole} onValueChange={(v: 'admin' | 'sales') => setInviteRole(v)} disabled={isInviting || atSeatCap}>
                      <SelectTrigger className="sm:w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t.settings.team.roleAdmin}</SelectItem>
                        <SelectItem value="sales">{t.settings.team.roleSales}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="submit" disabled={isInviting || atSeatCap || !inviteEmail.trim() || (hasMultipleSedes && inviteBusinessIds.length === 0)} className="gap-2">
                      {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {t.settings.team.addBtn}
                    </Button>
                  </div>
                  {hasMultipleSedes && (
                    <div className="space-y-1.5 rounded-lg border p-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={inviteBusinessIds.length === orgBusinessIds.length}
                          onCheckedChange={(checked) =>
                            setInviteBusinessIds(checked === true ? orgBusinessIds : [])
                          }
                        />
                        {t.settings.team.allSedesLabel}
                      </label>
                      <div className="flex flex-wrap gap-3 pl-6">
                        {sedes.map((s) => (
                          <label key={s.id} className="flex items-center gap-1.5 text-sm">
                            <Checkbox
                              checked={inviteBusinessIds.includes(s.id)}
                              onCheckedChange={(checked) =>
                                setInviteBusinessIds((prev) =>
                                  checked === true ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                                )
                              }
                            />
                            {s.name}
                          </label>
                        ))}
                      </div>
                      <p className="pl-6 text-xs text-muted-foreground">{t.settings.team.allSedesHint}</p>
                    </div>
                  )}
                </form>
                <p className="text-xs text-muted-foreground">
                  {inviteRole === 'admin' ? t.settings.team.roleAdminDesc : t.settings.team.roleSalesDesc}
                </p>
                {atSeatCap && (
                  <p className="text-sm text-destructive">
                    {t.settings.team.errorSeatLimit}
                    {' '}
                    <button
                      type="button"
                      className="underline disabled:opacity-50"
                      disabled={isChangingPlan}
                      onClick={() => handleChangePlan('premium')}
                    >
                      {t.settings.upgradeToPremiumBtn}
                    </button>
                  </p>
                )}
                {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
                {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}

                <Separator />

                {loadingTeam ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : groupedTeamMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t.settings.team.empty}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedTeamMembers.map((person) => (
                      <div key={person.email} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback>
                                {(person.full_name || person.email)[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="overflow-hidden">
                              <p className="truncate text-sm font-medium">
                                {person.full_name || person.email}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                            </div>
                          </div>
                          {hasMultipleSedes && person.entries.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMemberFromAllSedes(person.entries.map((e) => e.id))}
                              disabled={person.entries.some((e) => removingMemberId === e.id)}
                              className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                            >
                              {t.settings.team.removeFromAllSedes}
                            </Button>
                          )}
                        </div>
                        <div className="mt-2.5 space-y-1.5 pl-12">
                          {person.entries.map((member) => (
                            <div key={member.id} className="flex items-center gap-2">
                              {hasMultipleSedes && (
                                <span
                                  className={cn(
                                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                    sedeTint(businessColorIndexById[member.business_id])?.bg,
                                    sedeTint(businessColorIndexById[member.business_id])?.text
                                  )}
                                  title={businessNameById[member.business_id]}
                                >
                                  {sedeAbbr(businessNameById[member.business_id] || '')}
                                </span>
                              )}
                              <Select
                                value={member.role}
                                onValueChange={(v: 'admin' | 'sales') => handleChangeRole(member.id, v)}
                                disabled={updatingRoleId === member.id}
                              >
                                <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs">
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
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
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

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        requiredPlan={upgradeModalPlan}
      />

      <Dialog
        open={isSedeDialogOpen}
        onOpenChange={(open) => {
          setIsSedeDialogOpen(open)
          if (!open) setSedeError('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.settings.sedes.dialogTitle}</DialogTitle>
            <DialogDescription>{t.settings.sedes.dialogDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sede-name">{t.settings.sedes.nameLabel}</Label>
              <Input
                id="sede-name"
                value={newSede.name}
                onChange={(e) => setNewSede({ ...newSede, name: e.target.value })}
                placeholder={t.settings.sedes.namePlaceholder}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sede-country">{t.settings.businessCountry}</Label>
                <Select
                  value={newSede.country}
                  onValueChange={(value: 'PE' | 'US') => setNewSede({ ...newSede, country: value })}
                >
                  <SelectTrigger id="sede-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PE">{t.settings.countryPE}</SelectItem>
                    <SelectItem value="US">{t.settings.countryUS}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sede-timezone">{t.settings.timezone}</Label>
                <Select
                  value={newSede.timezone}
                  onValueChange={(value) => setNewSede({ ...newSede, timezone: value })}
                >
                  <SelectTrigger id="sede-timezone">
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
            </div>
            {sedeError && <p className="text-sm text-destructive">{sedeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSedeDialogOpen(false)}>
              {t.settings.sedes.cancelBtn}
            </Button>
            <Button onClick={handleCreateSede} disabled={isCreatingSede || !newSede.name.trim()} className="gap-2">
              {isCreatingSede && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.settings.sedes.createBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
