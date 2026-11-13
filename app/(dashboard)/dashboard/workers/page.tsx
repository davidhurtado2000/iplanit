'use client'

import React from "react"

import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/page-header'
import { CatalogItemCard, CatalogItemIcon } from '@/components/dashboard/catalog-item-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { LogoLoader } from '@/components/logo-loader'
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useBusinesses } from '@/hooks/use-businesses'
import { useAuth } from '@/hooks/use-auth'
import { meetsPlan } from '@/lib/plan-limits'
import { WorkerPaySettingsDialog } from '@/components/dashboard/worker-pay-settings-dialog'
import { useLanguage } from '@/context/language-context'
import { getWorkerLabel } from '@/lib/worker-label'
import { useDashboardData } from '@/context/dashboard-data-context'
import { TimeSelect } from '@/components/dashboard/time-select'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { sedeAbbr, sedeTint, buildBusinessColorIndex } from '@/lib/sede-colors'
import { deleteStorageImage, resizeImageFile, useStagedImage } from '@/lib/image-upload'
import { weekParity } from '@/lib/availability'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserCog,
  Search,
  Loader2,
  Palette,
  Clock,
  Building,
  Banknote,
  CalendarDays,
  Copy,
  Check,
  KeyRound,
  X,
} from 'lucide-react'

const WORKER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
]

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

// day_of_week is 0-6 (0=Sunday), matching business_hours' own convention.
const DAY_KEY_TO_NUMBER: Record<DayOfWeek, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

const DEFAULT_WORKER_HOURS: {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  isOpen: boolean
  /** scripts/108: null = every week, 0 = "Semanas A", 1 = "Semanas B". */
  rotation: number | null
}[] = [
  { dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00', isOpen: true, rotation: null },
  { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '18:00', isOpen: true, rotation: null },
  { dayOfWeek: 'wednesday', startTime: '09:00', endTime: '18:00', isOpen: true, rotation: null },
  { dayOfWeek: 'thursday', startTime: '09:00', endTime: '18:00', isOpen: true, rotation: null },
  { dayOfWeek: 'friday', startTime: '09:00', endTime: '18:00', isOpen: true, rotation: null },
  { dayOfWeek: 'saturday', startTime: '09:00', endTime: '14:00', isOpen: true, rotation: null },
  { dayOfWeek: 'sunday', startTime: '09:00', endTime: '14:00', isOpen: false, rotation: null },
]

interface Worker {
  id: string
  business_id: string
  name: string
  color: string
  is_active: boolean
  worker_group_id: string
  allows_concurrent_services: boolean
  calendar_feed_token: string
  photo_url: string | null
  user_id?: string | null
  invite_email?: string | null
  pay_type?: 'commission' | 'salary' | null
  commission_pct?: number | null
}

type PayTypeChoice = 'none' | 'commission' | 'salary'

export default function WorkersPage() {
  const { currentBusiness, businesses, aiAddonStatus } = useBusinesses()
  const { profile } = useAuth()
  // Resolved through the business owner, same as Analytics - a staff
  // member's own profile.plan is usually 'free'.
  const payEnabled = meetsPlan(aiAddonStatus?.plan ?? profile?.plan, 'pro')
  const [paySettingsOpen, setPaySettingsOpen] = useState(false)
  const { t, language, locale } = useLanguage()
  const workerLabel = getWorkerLabel(currentBusiness, t)
  const {
    workers,
    workerHours,
    workerServices,
    services,
    loading,
    refetchWorkers,
    refetchWorkerHours,
    refetchWorkerServices,
  } = useDashboardData()
  const [saving, setSaving] = useState(false)
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingWorker, setDeletingWorker] = useState<Worker | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const supabase = createClient()

  // Sedes (scripts/053-organizations-and-sedes.sql) - same derivation as
  // app/(dashboard)/dashboard/settings/page.tsx's Team roster.
  const sedes = businesses.filter((b) => b.organization_id === currentBusiness?.organization_id)
  const hasMultipleSedes = sedes.length > 1
  const businessNameById = Object.fromEntries(sedes.map((s) => [s.id, s.name]))
  const businessColorIndexById = buildBusinessColorIndex(sedes.map((s) => s.id))

  // Lightweight org-wide worker roster (id/business_id/name/worker_group_id
  // only) used purely to render "also at" badges and "add to sede" chips -
  // kept local to this page rather than in DashboardDataProvider, since
  // reservation-modal.tsx's worker picker and analytics/page.tsx's worker
  // breakdown both depend on the context's `workers` staying scoped to just
  // the current sede (scripts/062-worker-multi-sede.sql). Skipped entirely
  // for single-sede businesses - the common case pays zero extra query.
  const [orgWorkers, setOrgWorkers] = useState<
    { id: string; business_id: string; name: string; worker_group_id: string }[]
  >([])
  const [addingSedeFor, setAddingSedeFor] = useState<string | null>(null)

  const sedeIdsKey = sedes.map((s) => s.id).join(',')
  const refetchOrgWorkers = useCallback(async () => {
    if (!currentBusiness || sedes.length <= 1) {
      setOrgWorkers([])
      return
    }
    const { data } = await supabase
      .from('workers')
      .select('id, business_id, name, worker_group_id')
      .in('business_id', sedes.map((s) => s.id))
    setOrgWorkers(data || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusiness?.organization_id, sedeIdsKey])

  useEffect(() => {
    refetchOrgWorkers()
  }, [refetchOrgWorkers])

  const handleAddWorkerToSede = async (worker: Worker, businessId: string) => {
    const key = `${worker.id}:${businessId}`
    setAddingSedeFor(key)
    try {
      const { error } = await supabase.from('workers').insert({
        business_id: businessId,
        name: worker.name,
        color: worker.color,
        worker_group_id: worker.worker_group_id,
      })
      if (error) throw error
      await refetchOrgWorkers()
    } catch (err) {
      console.error('[iplanit] Error adding worker to sede:', err)
      toast.error(t.saveError)
    } finally {
      setAddingSedeFor(null)
    }
  }

  const [workerForm, setWorkerForm] = useState({
    name: '',
    color: WORKER_COLORS[0],
    isActive: true,
    allowsConcurrentServices: false,
    photoUrl: null as string | null,
    // Pay (scripts/114, lib/worker-pay.ts). Commission kept as text so the
    // field can be empty while typing.
    payType: 'none' as PayTypeChoice,
    commissionPct: '',
  })
  // Shown to clients on the public link's "¿Con quién?" step
  // (scripts/102) so they can recognize their barber.
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const stagedPhoto = useStagedImage(supabase, 'worker-photos')

  useEffect(() => {
    if (!isWorkerModalOpen) stagedPhoto.discard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerModalOpen])

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentBusiness) return
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
      // Square-ish avatar shown at most ~48px - 600px is plenty.
      const resized = await resizeImageFile(file, 600)
      const path = `${currentBusiness.id}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage
        .from('worker-photos')
        .upload(path, resized, { upsert: true, cacheControl: '3600' })
      if (error) throw error
      const { data } = supabase.storage.from('worker-photos').getPublicUrl(path)
      stagedPhoto.track(data.publicUrl)
      setWorkerForm((prev) => ({ ...prev, photoUrl: data.publicUrl }))
    } catch (err) {
      console.error('[iplanit] Error uploading worker photo:', err)
      setPhotoError(t.settings.photoUploadError)
    } finally {
      setIsUploadingPhoto(false)
    }
  }
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [useCustomHours, setUseCustomHours] = useState(false)
  const [hoursForm, setHoursForm] = useState(DEFAULT_WORKER_HOURS)

  const DAYS: { value: DayOfWeek; label: string }[] = [
    { value: 'monday', label: t.settings.days.monday },
    { value: 'tuesday', label: t.settings.days.tuesday },
    { value: 'wednesday', label: t.settings.days.wednesday },
    { value: 'thursday', label: t.settings.days.thursday },
    { value: 'friday', label: t.settings.days.friday },
    { value: 'saturday', label: t.settings.days.saturday },
    { value: 'sunday', label: t.settings.days.sunday },
  ]

  const filteredWorkers = workers.filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const [calendarLinkWorker, setCalendarLinkWorker] = useState<Worker | null>(null)
  const [calendarLinkCopied, setCalendarLinkCopied] = useState(false)
  const calendarLinkInputRef = useRef<HTMLInputElement>(null)
  const calendarFeedUrl =
    calendarLinkWorker && typeof window !== 'undefined'
      ? `${window.location.origin}/api/public/calendar/${calendarLinkWorker.calendar_feed_token}`
      : ''
  // One-click subscribe instead of making someone copy a URL and hunt for
  // the right menu themselves. Google's own "render?cid=" endpoint opens
  // its add-external-calendar screen pre-filled; webcal:// is the long-
  // standing convention browsers/OSes hand off to the default calendar app
  // (Apple Calendar, Outlook) with the same "subscribe?" prompt - no
  // deep-link equivalent exists for Google, which is why it needs its own
  // URL instead of also using webcal://.
  const googleCalendarAddUrl = calendarFeedUrl
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarFeedUrl)}`
    : ''
  const webcalUrl = calendarFeedUrl ? calendarFeedUrl.replace(/^https?:\/\//, 'webcal://') : ''
  const handleCopyCalendarLink = async () => {
    if (!calendarFeedUrl) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(calendarFeedUrl)
      setCalendarLinkCopied(true)
      setTimeout(() => setCalendarLinkCopied(false), 2000)
    } catch (err) {
      console.error('[iplanit] Clipboard write failed, falling back to text selection:', err)
      calendarLinkInputRef.current?.select()
    }
  }

  // Worker accounts (scripts/104): free, read-only, own agenda only. The
  // dialog reads the worker fresh from `workers` (not a stale copy) so its
  // state flips from "invitado" to "con acceso" after a refetch.
  const [accessWorkerId, setAccessWorkerId] = useState<string | null>(null)
  const accessWorker = workers.find((w) => w.id === accessWorkerId) ?? null
  const [accessEmail, setAccessEmail] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [accessCopied, setAccessCopied] = useState(false)

  const openAccessDialog = (worker: Worker) => {
    setAccessWorkerId(worker.id)
    setAccessEmail(worker.invite_email ?? '')
    setAccessError('')
    setAccessCopied(false)
  }

  const accessUrl = (worker: Worker) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.iplanit.io'
    return worker.user_id || !worker.invite_email
      ? `${origin}/login`
      : `${origin}/register?invite=staff&email=${encodeURIComponent(worker.invite_email)}`
  }

  const sendAccessEmail = async (workerId: string) => {
    const res = await fetch('/api/workers/invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId, language }),
    })
    return res.ok
  }

  const handleGiveAccess = async () => {
    if (!accessWorker) return
    setAccessBusy(true)
    setAccessError('')
    try {
      const { data, error } = await supabase.rpc('invite_worker_access', {
        p_worker_id: accessWorker.id,
        p_email: accessEmail,
      })
      const result = data as { success?: boolean; error?: string } | null
      if (error || !result?.success) {
        const messages: Record<string, string> = {
          invalid_email: t.workers.accessErrorInvalidEmail,
          email_in_use: t.workers.accessErrorEmailInUse,
        }
        setAccessError(messages[result?.error || ''] || t.saveError)
        return
      }
      await refetchWorkers()
      const emailed = await sendAccessEmail(accessWorker.id)
      if (emailed) toast.success(t.workers.accessInviteSent)
      else toast.error(t.workers.accessEmailFailed)
    } finally {
      setAccessBusy(false)
    }
  }

  const handleResendAccess = async () => {
    if (!accessWorker) return
    setAccessBusy(true)
    const emailed = await sendAccessEmail(accessWorker.id)
    setAccessBusy(false)
    if (emailed) toast.success(t.workers.accessInviteSent)
    else toast.error(t.workers.accessEmailFailed)
  }

  const handleRevokeAccess = async () => {
    if (!accessWorker) return
    setAccessBusy(true)
    try {
      const { data, error } = await supabase.rpc('revoke_worker_access', { p_worker_id: accessWorker.id })
      if (error || !(data as { success?: boolean } | null)?.success) {
        toast.error(t.saveError)
        return
      }
      await refetchWorkers()
      setAccessEmail('')
      toast.success(t.workers.accessRevoked)
    } finally {
      setAccessBusy(false)
    }
  }

  // WhatsApp is how most owners actually reach their barbers - a ready
  // message is friendlier than "check your email".
  const handleCopyAccessMessage = async () => {
    if (!accessWorker) return
    const message = t.workers.accessWhatsappMessage
      .replace('{name}', accessWorker.name.split(' ')[0])
      .replace('{business}', currentBusiness?.name || '')
      .replace('{url}', accessUrl(accessWorker))
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(message)
      setAccessCopied(true)
      setTimeout(() => setAccessCopied(false), 2000)
    } catch (err) {
      console.error('[iplanit] Clipboard write failed:', err)
      toast.error(t.saveError)
    }
  }

  const [togglingWorkerId, setTogglingWorkerId] = useState<string | null>(null)
  const handleQuickToggleActive = async (worker: Worker) => {
    setTogglingWorkerId(worker.id)
    try {
      const { error } = await supabase.from('workers').update({ is_active: !worker.is_active }).eq('id', worker.id)
      if (error) throw error
      await refetchWorkers()
    } catch (err) {
      console.error('[iplanit] Error toggling worker active state:', err)
      toast.error(t.saveError)
    } finally {
      setTogglingWorkerId(null)
    }
  }

  // Next three dates of this weekday that fall on the given group's weeks,
  // e.g. "dom 8 nov, dom 22 nov, dom 6 dic" for Semanas A.
  const upcomingRotationDates = (dayNumber: number, rotation: number) => {
    const tz = currentBusiness?.timezone || 'America/Lima'
    let date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    const out: string[] = []
    for (let i = 0; i < 28 && out.length < 3; i++) {
      const d = new Date(date + 'T12:00:00Z')
      if (d.getUTCDay() === dayNumber && weekParity(date) === rotation) {
        out.push(d.toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }))
      }
      d.setUTCDate(d.getUTCDate() + 1)
      date = d.toISOString().slice(0, 10)
    }
    return out
  }

  const updateWorkerHour = (dayOfWeek: DayOfWeek, field: 'startTime' | 'endTime' | 'isOpen' | 'rotation', value: string | boolean | number | null) => {
    setHoursForm((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h)))
  }

  const handleOpenWorkerModal = (worker?: Worker) => {
    if (worker) {
      setEditingWorker(worker)
      setWorkerForm({
        name: worker.name,
        color: worker.color || WORKER_COLORS[0],
        isActive: worker.is_active,
        allowsConcurrentServices: worker.allows_concurrent_services,
        photoUrl: worker.photo_url,
        payType: worker.pay_type ?? 'none',
        commissionPct: worker.commission_pct === null || worker.commission_pct === undefined ? '' : String(worker.commission_pct),
      })
      stagedPhoto.begin(worker.photo_url)
      setSelectedServiceIds(workerServices.filter((ws) => ws.worker_id === worker.id).map((ws) => ws.service_id))
      const existingHours = workerHours.filter((h) => h.worker_id === worker.id)
      if (existingHours.length > 0) {
        setUseCustomHours(true)
        setHoursForm(
          DEFAULT_WORKER_HOURS.map((def) => {
            const row = existingHours.find((h) => h.day_of_week === DAY_KEY_TO_NUMBER[def.dayOfWeek])
            return row
              ? { dayOfWeek: def.dayOfWeek, startTime: row.open_time.slice(0, 5), endTime: row.close_time.slice(0, 5), isOpen: !row.is_closed, rotation: row.week_rotation ?? null }
              : def
          })
        )
      } else {
        setUseCustomHours(false)
        setHoursForm(DEFAULT_WORKER_HOURS)
      }
    } else {
      setEditingWorker(null)
      setWorkerForm({
        name: '',
        color: WORKER_COLORS[0],
        isActive: true,
        allowsConcurrentServices: false,
        photoUrl: null,
        payType: 'none',
        commissionPct: '',
      })
      stagedPhoto.begin(null)
      setSelectedServiceIds([])
      setUseCustomHours(false)
      setHoursForm(DEFAULT_WORKER_HOURS)
    }
    setSaveError('')
    setPhotoError('')
    setIsWorkerModalOpen(true)
  }

  const commissionNum = Number(workerForm.commissionPct.replace(',', '.'))
  const commissionInvalid =
    payEnabled &&
    workerForm.payType === 'commission' &&
    (workerForm.commissionPct.trim() === '' || !Number.isFinite(commissionNum) || commissionNum < 0 || commissionNum > 100)

  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaveError('')
    if (commissionInvalid) {
      setSaveError(t.pay.invalidPct)
      return
    }
    setSaving(true)
    try {
      const payType = workerForm.payType === 'none' ? null : workerForm.payType
      const commissionPct = payType === 'commission' ? Number(workerForm.commissionPct.replace(',', '.')) : null
      const previousPct =
        editingWorker?.commission_pct === undefined || editingWorker?.commission_pct === null
          ? null
          : Number(editingWorker.commission_pct)
      const payChanged = payType !== (editingWorker?.pay_type ?? null) || commissionPct !== previousPct
      const workerData = {
        name: workerForm.name,
        color: workerForm.color,
        is_active: workerForm.isActive,
        allows_concurrent_services: workerForm.allowsConcurrentServices,
        // Only sent when it changed, so saving a worker keeps working even
        // if this deploys before scripts/102 adds the column.
        ...(workerForm.photoUrl !== (editingWorker?.photo_url ?? null) ? { photo_url: workerForm.photoUrl } : {}),
        // Same for pay: only sent when changed, so saving keeps working
        // before scripts/114 adds the columns.
        ...(payEnabled && payChanged ? { pay_type: payType, commission_pct: commissionPct } : {}),
      }

      let workerId: string
      if (editingWorker) {
        const { error } = await supabase.from('workers').update(workerData).eq('id', editingWorker.id)
        if (error) throw error
        workerId = editingWorker.id
      } else {
        const { data, error } = await supabase
          .from('workers')
          .insert({ ...workerData, business_id: currentBusiness.id })
          .select('id')
          .single()
        if (error) throw error
        workerId = data.id
      }

      // Work schedule - only meaningful when the toggle is on; off means
      // "follows business hours", so any previously-saved custom rows are
      // cleared.
      if (useCustomHours) {
        // week_rotation only sent when this worker uses (or used to use)
        // alternating weeks, so saving schedules keeps working even before
        // scripts/108 adds the column.
        const usesRotation =
          hoursForm.some((h) => h.rotation !== null) ||
          workerHours.some((h) => h.worker_id === workerId && h.week_rotation != null)
        const hoursRows = hoursForm.map((h) => ({
          business_id: currentBusiness.id,
          worker_id: workerId,
          day_of_week: DAY_KEY_TO_NUMBER[h.dayOfWeek],
          open_time: h.startTime,
          close_time: h.endTime,
          is_closed: !h.isOpen,
          ...(usesRotation ? { week_rotation: h.isOpen ? h.rotation : null } : {}),
        }))
        const { error: hoursError } = await supabase.from('worker_hours').upsert(hoursRows, { onConflict: 'worker_id,day_of_week' })
        if (hoursError) throw hoursError
      } else {
        const { error: clearError } = await supabase.from('worker_hours').delete().eq('worker_id', workerId)
        if (clearError) throw clearError
      }
      await refetchWorkerHours()

      // Sync worker_services links - same delete-then-insert pattern as
      // services/page.tsx's service_resources sync.
      await supabase.from('worker_services').delete().eq('worker_id', workerId)
      if (selectedServiceIds.length > 0) {
        const links = selectedServiceIds.map((service_id) => ({
          worker_id: workerId,
          service_id,
          business_id: currentBusiness.id,
        }))
        const { error: linkError } = await supabase.from('worker_services').insert(links)
        if (linkError) throw linkError
      }
      await refetchWorkerServices()

      await refetchWorkers()
      await refetchOrgWorkers()
      await stagedPhoto.commit(workerForm.photoUrl)
      setIsWorkerModalOpen(false)
      toast.success(editingWorker ? t.workers.updateSuccess : t.workers.createSuccess)
    } catch (err: any) {
      console.error('[iplanit] Error saving worker:', err)
      setSaveError(t.saveError)
      toast.error(t.saveError)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDeleteWorker = async () => {
    if (!deletingWorker) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('workers').delete().eq('id', deletingWorker.id)
      if (error) throw error
      if (deletingWorker.photo_url) await deleteStorageImage(supabase, 'worker-photos', deletingWorker.photo_url)
      await refetchWorkers()
      await refetchWorkerHours()
      await refetchWorkerServices()
      await refetchOrgWorkers()
    } catch (err) {
      console.error('[iplanit] Error deleting worker:', err)
      toast.error(t.saveError)
    } finally {
      setIsDeleting(false)
      setDeletingWorker(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LogoLoader />
      </div>
    )
  }

  if (!currentBusiness) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.services.setupRequired}</h2>
        <p className="mt-2 text-muted-foreground">{t.services.setupRequiredDesc}</p>
      </div>
    )
  }

  if (currentBusiness.role === 'sales') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.workers.accessRestricted}</h2>
        <p className="mt-2 text-muted-foreground">{t.workers.accessRestrictedDesc}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={workerLabel.plural}
        subtitle={t.workers.explainer}
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.workers.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {payEnabled && (
              <Button variant="outline" onClick={() => setPaySettingsOpen(true)} className="w-full gap-2 sm:w-auto">
                <Banknote className="h-4 w-4" />
                {t.pay.settingsBtn}
              </Button>
            )}
            <Button onClick={() => handleOpenWorkerModal()} className="w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" />
              {t.workers.newWorker}
            </Button>
          </div>
        }
      />

      {filteredWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <UserCog className="h-10 w-10 text-muted-foreground/50" />
          {workers.length === 0 ? (
            <>
              <div>
                <p className="font-medium text-foreground">{t.workers.emptyStateTitle}</p>
                <p className="text-sm text-muted-foreground">{t.workers.emptyStateDesc}</p>
              </div>
              <Button onClick={() => handleOpenWorkerModal()} className="gap-2">
                <Plus className="h-4 w-4" />
                {t.workers.newWorker}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t.workers.notFound}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredWorkers.map((worker) => {
            const linkedCount = workerServices.filter((ws) => ws.worker_id === worker.id).length
            const hasCustomHours = workerHours.some((h) => h.worker_id === worker.id)
            const workerColor = worker.color || '#3B82F6'
            const siblingSedes = hasMultipleSedes
              ? orgWorkers.filter((w) => w.worker_group_id === worker.worker_group_id && w.business_id !== currentBusiness?.id)
              : []
            const missingSedes = hasMultipleSedes
              ? sedes.filter((s) => s.id !== currentBusiness?.id && !siblingSedes.some((w) => w.business_id === s.id))
              : []
            return (
              <CatalogItemCard
                key={worker.id}
                color={workerColor}
                isActive={worker.is_active}
                onClick={() => handleOpenWorkerModal(worker)}
              >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        {worker.photo_url ? (
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={worker.photo_url} alt={worker.name} className="object-cover" />
                            <AvatarFallback>{worker.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <CatalogItemIcon icon={UserCog} color={workerColor} />
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-foreground">{worker.name}</h3>
                          {hasCustomHours && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {t.workers.customScheduleBadge}
                            </p>
                          )}
                          {payEnabled && worker.pay_type && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Banknote className="h-3 w-3" />
                              {worker.pay_type === 'salary'
                                ? t.pay.typeSalary
                                : `${t.pay.typeCommission} ${Number(worker.commission_pct ?? 0)}%`}
                            </p>
                          )}
                          {(worker.user_id || worker.invite_email) && (
                            <p
                              className={cn(
                                'flex items-center gap-1 text-xs',
                                worker.user_id ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                              )}
                            >
                              <KeyRound className="h-3 w-3" />
                              {worker.user_id ? t.workers.accessBadgeLinked : t.workers.accessBadgeInvited}
                            </p>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="-mt-1 -mr-2 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => handleOpenWorkerModal(worker)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t.services.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAccessDialog(worker)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            {t.workers.accessMenuItem}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setCalendarLinkWorker(worker)}>
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {t.workers.calendarLinkMenuItem}
                          </DropdownMenuItem>
                          {missingSedes.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              {missingSedes.map((s) => {
                                const key = `${worker.id}:${s.id}`
                                const isAdding = addingSedeFor === key
                                return (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={() => handleAddWorkerToSede(worker, s.id)}
                                    disabled={isAdding}
                                  >
                                    {isAdding ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="mr-2 h-4 w-4" />
                                    )}
                                    {t.workers.addToSedeLabel} {s.name}
                                  </DropdownMenuItem>
                                )
                              })}
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingWorker(worker)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t.services.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {linkedCount > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {linkedCount}{' '}
                        {linkedCount === 1 ? t.workers.linkedServiceSingular : t.workers.linkedServicesPlural}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <Switch
                      checked={worker.is_active}
                      disabled={togglingWorkerId === worker.id}
                      onCheckedChange={() => handleQuickToggleActive(worker)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={worker.is_active ? t.services.active : t.services.inactive}
                    />
                  </div>

                  {siblingSedes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                      <span className="text-[10px] text-muted-foreground">{t.workers.alsoAtLabel}</span>
                      {siblingSedes.map((w) => (
                        <span
                          key={w.business_id}
                          className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            sedeTint(businessColorIndexById[w.business_id])?.bg,
                            sedeTint(businessColorIndexById[w.business_id])?.text
                          )}
                          title={businessNameById[w.business_id]}
                        >
                          {sedeAbbr(businessNameById[w.business_id] || '')}
                        </span>
                      ))}
                    </div>
                  )}
              </CatalogItemCard>
            )
          })}
        </div>
      )}

      <Dialog open={isWorkerModalOpen} onOpenChange={setIsWorkerModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingWorker ? t.workers.editTitle : t.workers.newTitle}</DialogTitle>
            <DialogDescription>{editingWorker ? t.workers.editDesc : t.workers.newDesc}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveWorker} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker-name">{t.services.nameLabel}</Label>
              <Input
                id="worker-name"
                value={workerForm.name}
                onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })}
                placeholder={t.workers.namePlaceholder}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t.workers.photoLabel}</Label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={workerForm.photoUrl || undefined} alt="" className="object-cover" />
                    <AvatarFallback className="text-lg" style={{ backgroundColor: `${workerForm.color}22`, color: workerForm.color }}>
                      {workerForm.name.trim().slice(0, 1).toUpperCase() || <UserCog className="h-6 w-6" />}
                    </AvatarFallback>
                  </Avatar>
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploadingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {workerForm.photoUrl ? t.services.changeImageBtn : t.services.uploadImageBtn}
                    </Button>
                    {workerForm.photoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isUploadingPhoto}
                        onClick={() => setWorkerForm({ ...workerForm, photoUrl: null })}
                      >
                        {t.services.removeImageBtn}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.workers.photoHint}</p>
                  {photoError && <p className="text-xs text-destructive">{photoError}</p>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t.services.colorLabel}</Label>
              <div className="flex flex-wrap gap-2">
                {WORKER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      workerForm.color === color ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setWorkerForm({ ...workerForm, color })}
                  />
                ))}
                <label
                  className={cn(
                    'relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-transform',
                    !WORKER_COLORS.includes(workerForm.color)
                      ? 'scale-110 border-foreground'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{
                    background: !WORKER_COLORS.includes(workerForm.color)
                      ? workerForm.color
                      : 'conic-gradient(from 0deg, #EF4444, #F59E0B, #84CC16, #10B981, #06B6D4, #3B82F6, #8B5CF6, #EC4899, #EF4444)',
                  }}
                  title={t.services.customColorLabel}
                >
                  {WORKER_COLORS.includes(workerForm.color) && (
                    <Palette className="h-3.5 w-3.5 text-white drop-shadow" />
                  )}
                  <input
                    type="color"
                    value={WORKER_COLORS.includes(workerForm.color) ? '#3B82F6' : workerForm.color}
                    onChange={(e) => setWorkerForm({ ...workerForm, color: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t.services.customColorLabel}
                  />
                </label>
              </div>
            </div>

            {services.length > 0 && (
              <div className="space-y-2">
                <Label>{t.workers.servicesAssignedLabel}</Label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                  {services.map((service) => (
                    <label key={service.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                      <Checkbox
                        checked={selectedServiceIds.includes(service.id)}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setSelectedServiceIds([...selectedServiceIds, service.id])
                          } else {
                            setSelectedServiceIds(selectedServiceIds.filter((id) => id !== service.id))
                          }
                        }}
                      />
                      {service.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t.workers.servicesAssignedHint}</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label htmlFor="worker-active">{t.services.resourceActive}</Label>
              <Switch
                id="worker-active"
                checked={workerForm.isActive}
                onCheckedChange={(checked) => setWorkerForm({ ...workerForm, isActive: checked })}
              />
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-4">
              <div>
                <Label>{t.workers.concurrentServicesTitle}</Label>
                <p className="text-xs text-muted-foreground">{t.workers.concurrentServicesDesc}</p>
              </div>
              <Switch
                checked={workerForm.allowsConcurrentServices}
                onCheckedChange={(checked) => setWorkerForm({ ...workerForm, allowsConcurrentServices: checked })}
              />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  {t.pay.sectionTitle}
                </Label>
                <p className="text-xs text-muted-foreground">{payEnabled ? t.pay.sectionDesc : t.pay.proOnly}</p>
              </div>
              {payEnabled && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="space-y-1.5 sm:w-56">
                    <Label htmlFor="worker-pay-type" className="text-xs">{t.pay.typeLabel}</Label>
                    <select
                      id="worker-pay-type"
                      value={workerForm.payType}
                      onChange={(e) => setWorkerForm({ ...workerForm, payType: e.target.value as PayTypeChoice })}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="none" className="bg-popover text-popover-foreground">{t.pay.typeNone}</option>
                      <option value="commission" className="bg-popover text-popover-foreground">{t.pay.typeCommission}</option>
                      <option value="salary" className="bg-popover text-popover-foreground">{t.pay.typeSalary}</option>
                    </select>
                  </div>
                  {workerForm.payType === 'commission' ? (
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="worker-commission" className="text-xs">{t.pay.commissionLabel}</Label>
                      <div className="relative w-28">
                        <Input
                          id="worker-commission"
                          inputMode="decimal"
                          placeholder="40"
                          value={workerForm.commissionPct}
                          onChange={(e) => setWorkerForm({ ...workerForm, commissionPct: e.target.value.replace(/[^\d.,]/g, '') })}
                          aria-invalid={commissionInvalid || undefined}
                          className={cn('h-9 pr-8', commissionInvalid && 'border-destructive focus-visible:ring-destructive')}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                      <p className={cn('text-xs', commissionInvalid ? 'text-destructive' : 'text-muted-foreground')}>
                        {commissionInvalid ? t.pay.invalidPct : t.pay.commissionHint}
                      </p>
                    </div>
                  ) : (
                    <p className="flex-1 text-xs text-muted-foreground sm:pt-7">
                      {workerForm.payType === 'salary' ? t.pay.salaryHint : t.pay.noneHint}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {t.workers.scheduleTitle}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.workers.scheduleDesc}</p>
                </div>
                <Switch checked={useCustomHours} onCheckedChange={setUseCustomHours} />
              </div>
              {useCustomHours && (
                <div className="divide-y rounded-md border">
                  {DAYS.map((day) => {
                    const hours = hoursForm.find((h) => h.dayOfWeek === day.value)
                    if (!hours) return null
                    return (
                      <div key={day.value} className="space-y-2 p-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="flex h-8 w-28 shrink-0 items-center justify-between">
                            <span className="text-xs font-medium">{day.label}</span>
                            <Switch
                              checked={hours.isOpen}
                              onCheckedChange={(checked) => updateWorkerHour(day.value, 'isOpen', checked)}
                              className="shrink-0"
                            />
                          </div>
                          {hours.isOpen ? (
                            <div className="flex h-8 flex-1 items-center gap-1.5">
                              <TimeSelect
                                value={hours.startTime}
                                onChange={(value) => updateWorkerHour(day.value, 'startTime', value)}
                                className="h-8 w-full text-xs"
                              />
                              <span className="text-xs text-muted-foreground">{t.settings.to}</span>
                              <TimeSelect
                                value={hours.endTime}
                                onChange={(value) => updateWorkerHour(day.value, 'endTime', value)}
                                className="h-8 w-full text-xs"
                              />
                            </div>
                          ) : (
                            <div className="flex h-8 flex-1 items-center">
                              <span className="text-xs text-muted-foreground">{t.settings.closed}</span>
                            </div>
                          )}
                        </div>
                        {/* Alternating weeks (scripts/108) - e.g. half the
                            barbers work Sundays on "Semanas A", the other
                            half on "Semanas B". The next dates are spelled
                            out so the owner can check they started each
                            group on the right Sunday. */}
                        {hours.isOpen && (
                          <div className="flex flex-col gap-1 sm:ml-[7.5rem] sm:flex-row sm:items-center sm:gap-2">
                            <select
                              value={hours.rotation === null ? 'every' : String(hours.rotation)}
                              onChange={(e) =>
                                updateWorkerHour(day.value, 'rotation', e.target.value === 'every' ? null : Number(e.target.value))
                              }
                              aria-label={t.workers.rotationLabel}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="every" className="bg-popover text-popover-foreground">{t.workers.rotationEvery}</option>
                              <option value="0" className="bg-popover text-popover-foreground">{t.workers.rotationA}</option>
                              <option value="1" className="bg-popover text-popover-foreground">{t.workers.rotationB}</option>
                            </select>
                            {hours.rotation !== null && (
                              <span className="text-[11px] text-muted-foreground">
                                {t.workers.rotationNextDates.replace(
                                  '{dates}',
                                  upcomingRotationDates(DAY_KEY_TO_NUMBER[day.value], hours.rotation).join(', ')
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsWorkerModalOpen(false)} disabled={saving}>
                {t.services.cancelBtn}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingWorker ? t.services.saveBtn : t.workers.createBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingWorker} onOpenChange={(open) => !open && setDeletingWorker(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.workers.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingWorker && `"${deletingWorker.name}" — `}
              {t.workers.deleteDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t.services.cancelBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteWorker}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? t.services.deleting : t.services.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!accessWorker} onOpenChange={(open) => !open && setAccessWorkerId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.workers.accessTitle.replace('{name}', accessWorker?.name ?? '')}</DialogTitle>
            <DialogDescription>{t.workers.accessDesc}</DialogDescription>
          </DialogHeader>

          {accessWorker && (accessWorker.user_id || accessWorker.invite_email) ? (
            <div className="space-y-4">
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-sm',
                  accessWorker.user_id ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
                )}
              >
                <KeyRound
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    accessWorker.user_id ? 'text-emerald-600' : 'text-amber-600'
                  )}
                />
                <div className="min-w-0">
                  <p className="font-medium">
                    {accessWorker.user_id ? t.workers.accessStateLinked : t.workers.accessStateInvited}
                  </p>
                  <p className="truncate text-muted-foreground">{accessWorker.invite_email}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="gap-2" onClick={handleCopyAccessMessage}>
                  {accessCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {accessCopied ? t.settings.linkCopied : t.workers.accessCopyWhatsapp}
                </Button>
                {!accessWorker.user_id && (
                  <Button type="button" variant="outline" disabled={accessBusy} onClick={handleResendAccess}>
                    {t.workers.accessResend}
                  </Button>
                )}
              </div>

              <DialogFooter className="sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={accessBusy}
                  onClick={handleRevokeAccess}
                >
                  {t.workers.accessRevoke}
                </Button>
                <Button type="button" onClick={() => setAccessWorkerId(null)}>
                  {t.workers.accessDone}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleGiveAccess()
              }}
            >
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {t.workers.accessCanSee}
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {t.workers.accessCanSeeStats}
                </li>
                <li className="flex gap-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {t.workers.accessCannot}
                </li>
              </ul>
              <div className="space-y-2">
                <Label htmlFor="worker-access-email">{t.workers.accessEmailLabel}</Label>
                <Input
                  id="worker-access-email"
                  type="email"
                  value={accessEmail}
                  onChange={(e) => setAccessEmail(e.target.value)}
                  placeholder="barbero@gmail.com"
                  required
                />
                {accessError && <p className="text-sm text-destructive">{accessError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAccessWorkerId(null)}>
                  {t.services.cancelBtn}
                </Button>
                <Button type="submit" disabled={accessBusy || !accessEmail.trim()}>
                  {accessBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t.workers.accessGiveBtn}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!calendarLinkWorker} onOpenChange={(open) => !open && setCalendarLinkWorker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.workers.calendarLinkTitle}</DialogTitle>
            <DialogDescription>{t.workers.calendarLinkDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {/* Stacked, same weight for both - side by side squeezed "Add to
                Apple Calendar / Outlook" into half-width and the filled-vs-
                outline treatment made one read as the "real" option and the
                other as an afterthought. Colored icon chips (not the actual
                Google/Apple logos - brand guideline risk) give each a
                distinct identity without implying either is primary. */}
            <a
              href={googleCalendarAddUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
                <CalendarDays className="h-4 w-4" />
              </span>
              {t.workers.calendarLinkGoogleBtn}
            </a>
            <a
              href={webcalUrl}
              className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900">
                <CalendarDays className="h-4 w-4" />
              </span>
              {t.workers.calendarLinkAppleBtn}
            </a>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{t.workers.calendarLinkManualDivider}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={calendarLinkInputRef}
              value={calendarFeedUrl}
              readOnly
              className="font-mono text-xs"
              onClick={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" onClick={handleCopyCalendarLink} className="gap-2">
              {calendarLinkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {calendarLinkCopied ? t.settings.linkCopied : t.settings.copyLink}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.workers.calendarLinkInstructions}</p>
        </DialogContent>
      </Dialog>

      {payEnabled && <WorkerPaySettingsDialog open={paySettingsOpen} onOpenChange={setPaySettingsOpen} />}
    </div>
  )
}
