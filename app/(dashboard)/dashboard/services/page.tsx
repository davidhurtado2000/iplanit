'use client'

import React from "react"

import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useBusinesses } from '@/hooks/use-businesses'
import { useDuplicateSiblings } from '@/hooks/use-duplicate-siblings'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type ServiceResource, type ServiceDurationOption } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { getResourceTypeLabel } from '@/lib/resource-display'
import { isPlanLimitReached } from '@/lib/plan-limits'
import { UpgradeModal } from '@/components/upgrade-modal'
import { sedeAbbr, sedeTint, buildBusinessColorIndex } from '@/lib/sede-colors'
import { FormSection } from '@/components/dashboard/form-section'
import { DurationInput } from '@/components/dashboard/duration-input'
import { formatDuration } from '@/lib/duration'
import { cn } from '@/lib/utils'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Clock,
  Briefcase,
  Building,
  Search,
  Loader2,
  X,
  Copy,
  Palette,
} from 'lucide-react'

interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number | null
  price_usd: number | null
  color: string
  pricing_mode: 'fixed' | 'preset' | 'hourly'
  hourly_rate: number | null
  hourly_rate_usd: number | null
  min_hours: number | null
  max_hours: number | null
  buffer_before_min: number
  buffer_after_min: number
  is_active: boolean
  duplicate_group_id: string | null
}

// One row of the flexible-duration editor - price/priceUsd is whichever
// matches the business's currency, same single-field pattern as the
// service's own base price (see isUSD below).
interface DurationOptionForm {
  duration: number | ''
  price: number | ''
}

const SERVICE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
]

export default function ServicesPage() {
  const { currentBusiness, businesses } = useBusinesses()
  const { t } = useLanguage()
  const {
    services,
    resources: allResources,
    serviceResources,
    serviceDurationOptions,
    loading,
    refetchServicesAndResources,
    refetchServiceResources,
    refetchServiceDurationOptions,
  } = useDashboardData()
  // Parking spots are their own resource type but are managed exclusively
  // on the dedicated Cochera page (see app/(dashboard)/dashboard/parking) -
  // they don't belong in the generic Recursos tab or the service-linked
  // resource picker, since a client never picks "a parking spot" as the
  // resource for a service the way they'd pick a room or a stylist.
  const resources = allResources.filter((r) => r.type !== 'parking')
  const isUSD = currentBusiness?.currency === 'USD'
  const [saving, setSaving] = useState(false)
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingService, setDeletingService] = useState<Service | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [durationOptionsError, setDurationOptionsError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const supabase = createClient()

  // Services are per-sede by design (no organization_id, unlike clients) -
  // when the account has multiple sedes, a service can be created directly
  // into any of them (see targetBusinessId below), which is what makes
  // "duplicate into another sede" possible without retyping everything.
  const orgBusinessIds = useMemo(
    () => businesses.filter((b) => b.organization_id === currentBusiness?.organization_id).map((b) => b.id),
    [businesses, currentBusiness?.organization_id]
  )
  const hasMultipleSedes = orgBusinessIds.length > 1
  const businessNameById = useMemo(
    () => Object.fromEntries(businesses.filter((b) => orgBusinessIds.includes(b.id)).map((b) => [b.id, b.name])),
    [businesses, orgBusinessIds]
  )
  const businessColorIndexById = useMemo(() => buildBusinessColorIndex(orgBusinessIds), [orgBusinessIds])
  // "Tambien en Sede X" (scripts/054) - which other sedes share a service's
  // duplicate_group_id, so a duplicated offering doesn't look like an
  // unrelated coincidence once it's living in more than one sede.
  const duplicateSiblings = useDuplicateSiblings('services', services, orgBusinessIds, currentBusiness?.id, hasMultipleSedes)
  // Only meaningful while creating (editingService === null) - an existing
  // service never changes sede via this modal, so it always tracks
  // currentBusiness.id there. Defaults to the current business for both a
  // plain "new service" and a same-sede duplicate.
  const [targetBusinessId, setTargetBusinessId] = useState<string>('')
  // Set only by handleDuplicateService below - lets saveService() know this
  // create is a duplicate, so it can assign/reuse a duplicate_group_id
  // (scripts/054). Cleared for a plain "new service" and never set for edits.
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null)

  const handleNewServiceClick = async () => {
    if (currentBusiness && (await isPlanLimitReached(currentBusiness.id, 'services'))) {
      setShowUpgradeModal(true)
      return
    }
    handleOpenServiceModal()
  }

  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration: 30,
    price: 0,
    priceUsd: '' as number | '',
    color: SERVICE_COLORS[0],
    isActive: true,
    pricingMode: 'fixed' as 'fixed' | 'preset' | 'hourly',
    hourlyRate: '' as number | '',
    minHours: 1 as number | '',
    maxHours: 8 as number | '',
    bufferBeforeMin: 0 as number | '',
    bufferAfterMin: 0 as number | '',
  })
  const [durationOptions, setDurationOptions] = useState<DurationOptionForm[]>([])
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([])
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('')
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const durationText = (service: Service) =>
    service.pricing_mode === 'hourly'
      ? `${service.min_hours ?? '?'}-${service.max_hours ?? '?'} h`
      : formatDuration(service.duration_minutes)

  const renderServicePrice = (service: Service) => {
    if (service.pricing_mode === 'preset') {
      const options = serviceDurationOptions.filter((o) => o.service_id === service.id)
      const prices = options.map((o) => (isUSD ? o.price_usd : o.price)).filter((p): p is number => p != null)
      if (prices.length === 0) {
        return (
          <Badge variant="destructive" className="text-xs">
            {t.services.noDurationOptionsWarning}
          </Badge>
        )
      }
      const min = Math.min(...prices)
      return (
        <span className="text-2xl font-bold text-foreground">
          {t.services.fromPrice} {isUSD ? '$' : 'S/'} {min}
        </span>
      )
    }
    if (service.pricing_mode === 'hourly') {
      const rate = isUSD ? service.hourly_rate_usd : service.hourly_rate
      if (!rate) {
        return (
          <Badge variant="destructive" className="text-xs">
            {t.services.noHourlyRateWarning}
          </Badge>
        )
      }
      return (
        <span className="text-2xl font-bold text-foreground">
          {isUSD ? '$' : 'S/'} {rate}
          <span className="text-sm font-normal text-muted-foreground"> {t.services.perHour}</span>
        </span>
      )
    }
    const price = isUSD ? service.price_usd : service.price
    if (!price) return <span className="text-muted-foreground">—</span>
    return (
      <span className="text-2xl font-bold text-foreground">
        {isUSD ? '$' : 'S/'} {price}
      </span>
    )
  }

  // Instant on/off from the card, separate from the full edit modal - the
  // active flag doesn't need the pricing/resource validation saveService
  // does, and shouldn't need to wait for that whole flow just to pause a
  // service.
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null)
  const handleQuickToggleActive = async (service: Service) => {
    setTogglingServiceId(service.id)
    try {
      const { error } = await supabase.from('services').update({ is_active: !service.is_active }).eq('id', service.id)
      if (error) throw error
      await refetchServicesAndResources()
    } catch (err) {
      console.error('[iplanit] Error toggling service active state:', err)
      toast.error(t.saveError)
    } finally {
      setTogglingServiceId(null)
    }
  }

  const handleOpenServiceModal = (service?: Service) => {
    setDurationOptionsError('')
    setTargetBusinessId(currentBusiness?.id || '')
    setDuplicateSourceId(null)
    let nextForm: typeof serviceForm
    let nextDurationOptions: DurationOptionForm[]
    let nextResourceIds: string[]

    if (service) {
      setEditingService(service)
      nextForm = {
        name: service.name,
        description: service.description || '',
        duration: service.duration_minutes,
        price: service.price || 0,
        priceUsd: service.price_usd ?? '',
        color: service.color,
        isActive: service.is_active,
        pricingMode: service.pricing_mode,
        hourlyRate: (isUSD ? service.hourly_rate_usd : service.hourly_rate) ?? '',
        minHours: service.min_hours ?? 1,
        maxHours: service.max_hours ?? 8,
        bufferBeforeMin: service.buffer_before_min ?? 0,
        bufferAfterMin: service.buffer_after_min ?? 0,
      }
      nextDurationOptions = serviceDurationOptions
        .filter((o) => o.service_id === service.id)
        .map((o) => ({
          duration: o.duration_minutes,
          price: (isUSD ? o.price_usd : o.price) ?? '',
        }))
      nextResourceIds = serviceResources
        .filter((sr) => sr.service_id === service.id)
        .map((sr) => sr.resource_id)
    } else {
      setEditingService(null)
      nextForm = {
        name: '',
        description: '',
        duration: 30,
        price: 0,
        priceUsd: '',
        color: SERVICE_COLORS[0],
        isActive: true,
        pricingMode: 'fixed',
        hourlyRate: '',
        minHours: 1,
        maxHours: 8,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
      }
      nextDurationOptions = []
      nextResourceIds = []
    }

    setServiceForm(nextForm)
    setDurationOptions(nextDurationOptions)
    setSelectedResourceIds(nextResourceIds)
    // Snapshot of the just-loaded state, compared against current form state
    // to know whether to warn before closing - see hasUnsavedChanges below.
    setInitialFormSnapshot(JSON.stringify({ form: nextForm, durationOptions: nextDurationOptions, resourceIds: nextResourceIds }))
    setSaveError('')
    setIsServiceModalOpen(true)
  }

  // Prefills a NEW service's form from an existing one (create mode, not
  // edit - editingService stays null) so duplicating a service is just
  // "tweak a couple fields and save" instead of retyping everything.
  const handleDuplicateService = (service: Service) => {
    setDurationOptionsError('')
    setEditingService(null)
    setTargetBusinessId(currentBusiness?.id || '')
    setDuplicateSourceId(service.id)
    const nextForm: typeof serviceForm = {
      name: `${service.name}${t.services.duplicateSuffix}`,
      description: service.description || '',
      duration: service.duration_minutes,
      price: service.price || 0,
      priceUsd: service.price_usd ?? '',
      color: service.color,
      isActive: service.is_active,
      pricingMode: service.pricing_mode,
      hourlyRate: (isUSD ? service.hourly_rate_usd : service.hourly_rate) ?? '',
      minHours: service.min_hours ?? 1,
      maxHours: service.max_hours ?? 8,
      bufferBeforeMin: service.buffer_before_min ?? 0,
      bufferAfterMin: service.buffer_after_min ?? 0,
    }
    const nextDurationOptions: DurationOptionForm[] = serviceDurationOptions
      .filter((o) => o.service_id === service.id)
      .map((o) => ({
        duration: o.duration_minutes,
        price: (isUSD ? o.price_usd : o.price) ?? '',
      }))
    const nextResourceIds = serviceResources
      .filter((sr) => sr.service_id === service.id)
      .map((sr) => sr.resource_id)

    setServiceForm(nextForm)
    setDurationOptions(nextDurationOptions)
    setSelectedResourceIds(nextResourceIds)
    setInitialFormSnapshot(
      JSON.stringify({ form: nextForm, durationOptions: nextDurationOptions, resourceIds: nextResourceIds })
    )
    setSaveError('')
    setIsServiceModalOpen(true)
  }

  // Resource links only ever come from the CURRENT business's own resources
  // (useDashboardData() only loads that business's data) - if the target
  // sede is switched away from it, those picks would silently point at the
  // wrong sede's rooms/staff, so they're cleared and re-picked there instead.
  useEffect(() => {
    if (targetBusinessId && currentBusiness && targetBusinessId !== currentBusiness.id) {
      setSelectedResourceIds([])
    }
  }, [targetBusinessId, currentBusiness])

  const hasUnsavedChanges =
    isServiceModalOpen &&
    initialFormSnapshot !== JSON.stringify({ form: serviceForm, durationOptions, resourceIds: selectedResourceIds })

  // Single funnel for every way the modal can be dismissed (X button,
  // Escape, backdrop click, or the form's own Cancelar button) so unsaved
  // changes can never leak past this check.
  const handleServiceModalOpenChange = (open: boolean) => {
    if (open) {
      setIsServiceModalOpen(true)
      return
    }
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true)
      return
    }
    setIsServiceModalOpen(false)
  }

  const addDurationOption = () => {
    setDurationOptions([...durationOptions, { duration: '', price: '' }])
  }

  const updateDurationOption = (index: number, field: keyof DurationOptionForm, value: number | '') => {
    setDurationOptions(durationOptions.map((o, i) => (i === index ? { ...o, [field]: value } : o)))
  }

  const removeDurationOption = (index: number) => {
    setDurationOptions(durationOptions.filter((_, i) => i !== index))
  }

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveService()
  }

  // Extracted from handleSaveService so the "Guardar" option in the
  // unsaved-changes confirmation (triggered when closing the modal, not
  // submitting the form) can reuse the exact same validation/save logic.
  const saveService = async () => {
    if (!currentBusiness) return

    setDurationOptionsError('')
    setSaveError('')
    if (serviceForm.pricingMode === 'preset') {
      const validOptions = durationOptions.filter((o) => o.duration !== '' && o.price !== '')
      if (validOptions.length === 0) {
        // Otherwise this saves silently as an unbookable service - staff
        // and the public booking page both hit "no hay duraciones
        // configuradas" with no way to complete a reservation.
        setDurationOptionsError(t.services.durationOptionsRequired)
        return
      }
    }
    if (serviceForm.pricingMode === 'hourly') {
      if (serviceForm.hourlyRate === '' || serviceForm.minHours === '' || serviceForm.maxHours === '') {
        setDurationOptionsError(t.services.hourlyFieldsRequired)
        return
      }
      if (serviceForm.minHours > serviceForm.maxHours) {
        setDurationOptionsError(t.services.hourlyRangeInvalid)
        return
      }
    }

    setSaving(true)
    try {
      // Only one currency is ever editable at a time (matches the
      // business's own currency setting, see Settings > Negocio), so the
      // other is always saved as null instead of carrying stale data from
      // before a currency switch. Same pattern for the hourly rate.
      const serviceData = {
        name: serviceForm.name,
        description: serviceForm.description || null,
        duration_minutes: serviceForm.duration,
        price: isUSD ? 0 : serviceForm.price || 0,
        price_usd: isUSD ? (serviceForm.priceUsd !== '' ? serviceForm.priceUsd : 0) : null,
        color: serviceForm.color,
        is_active: serviceForm.isActive,
        pricing_mode: serviceForm.pricingMode,
        hourly_rate:
          serviceForm.pricingMode === 'hourly' && !isUSD && serviceForm.hourlyRate !== ''
            ? serviceForm.hourlyRate
            : null,
        hourly_rate_usd:
          serviceForm.pricingMode === 'hourly' && isUSD && serviceForm.hourlyRate !== ''
            ? serviceForm.hourlyRate
            : null,
        min_hours: serviceForm.pricingMode === 'hourly' && serviceForm.minHours !== '' ? serviceForm.minHours : null,
        max_hours: serviceForm.pricingMode === 'hourly' && serviceForm.maxHours !== '' ? serviceForm.maxHours : null,
        buffer_before_min: serviceForm.bufferBeforeMin !== '' ? serviceForm.bufferBeforeMin : 0,
        buffer_after_min: serviceForm.bufferAfterMin !== '' ? serviceForm.bufferAfterMin : 0,
      }

      let serviceId: string
      // New services (including duplicates) can target any sede in the org
      // via targetBusinessId; editing an existing one never moves its sede.
      const insertBusinessId = targetBusinessId || currentBusiness.id

      if (editingService) {
        // Editing a service (even one duplicated to other sedes) only ever
        // touches this one row - duplicates are fully independent once
        // created (duplicate_group_id, scripts/054, is kept purely as an
        // informational "also at Sede X" pointer, not a live sync).
        const { error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id)
        if (error) throw error
        serviceId = editingService.id
      } else {
        // Duplicate tracking (scripts/054) - reuse the source's existing
        // group if it's already part of one (a service can be duplicated
        // more than once, into more than one sede), otherwise this is the
        // first duplication ever for that source, so a new group is minted
        // and retroactively stamped onto the source too.
        let duplicateGroupId: string | undefined
        if (duplicateSourceId) {
          const source = services.find((s) => s.id === duplicateSourceId)
          duplicateGroupId = source?.duplicate_group_id || crypto.randomUUID()
          if (source && !source.duplicate_group_id) {
            await supabase.from('services').update({ duplicate_group_id: duplicateGroupId }).eq('id', duplicateSourceId)
          }
        }
        const { data, error } = await supabase
          .from('services')
          .insert({ ...serviceData, business_id: insertBusinessId, duplicate_group_id: duplicateGroupId ?? null })
          .select('id')
          .single()
        if (error) throw error
        serviceId = data.id
      }

      // Sync service_resources links
      await supabase
        .from('service_resources')
        .delete()
        .eq('service_id', serviceId)
        .eq('business_id', currentBusiness.id)

      if (selectedResourceIds.length > 0) {
        const links = selectedResourceIds.map((resource_id) => ({
          service_id: serviceId,
          resource_id,
          business_id: insertBusinessId,
        }))
        const { error: linkError } = await supabase.from('service_resources').insert(links)
        if (linkError) throw linkError
      }

      // Sync duration options - always cleared first so turning the toggle
      // off (or emptying the list) actually removes stale options instead
      // of leaving orphaned rows behind.
      await supabase
        .from('service_duration_options')
        .delete()
        .eq('service_id', serviceId)
        .eq('business_id', currentBusiness.id)

      if (serviceForm.pricingMode === 'preset') {
        const validOptions = durationOptions.filter((o) => o.duration !== '' && o.price !== '')
        if (validOptions.length > 0) {
          const optionRows = validOptions.map((o) => ({
            service_id: serviceId,
            business_id: insertBusinessId,
            duration_minutes: o.duration as number,
            price: isUSD ? null : (o.price as number),
            price_usd: isUSD ? (o.price as number) : null,
          }))
          const { error: optionsError } = await supabase.from('service_duration_options').insert(optionRows)
          if (optionsError) throw optionsError
        }
      }

      await Promise.all([refetchServicesAndResources(), refetchServiceResources(), refetchServiceDurationOptions()])
      setIsServiceModalOpen(false)
      setDuplicateSourceId(null)
      toast.success(editingService ? t.services.updateSuccess : t.services.createSuccess)
    } catch (err: any) {
      console.error('[v0] Error saving service:', err)
      // PLN03 = free-plan service limit trigger (scripts/048) - only
      // reachable here as a race-condition backstop, since
      // handleNewServiceClick already checks this before the form opens.
      if (err?.code === 'PLN03') {
        setIsServiceModalOpen(false)
        setShowUpgradeModal(true)
      } else {
        setSaveError(t.saveError)
        toast.error(t.saveError)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDeleteService = async () => {
    if (!deletingService) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', deletingService.id)

      if (error) throw error
      await Promise.all([refetchServicesAndResources(), refetchServiceResources()])
    } catch (err) {
      console.error('[v0] Error deleting service:', err)
    } finally {
      setIsDeleting(false)
      setDeletingService(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
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
        <h2 className="text-xl font-semibold">{t.services.accessRestricted}</h2>
        <p className="mt-2 text-muted-foreground">{t.services.accessRestrictedDesc}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.services.title}</h1>
          <p className="text-muted-foreground">{t.services.subtitle}</p>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.services.searchServices}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={handleNewServiceClick} className="gap-2">
          <Plus className="h-4 w-4" />
          {t.services.newService}
        </Button>
      </div>

      {filteredServices.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground/50" />
          {services.length === 0 ? (
            <>
              <div>
                <p className="font-medium text-foreground">{t.services.emptyStateTitle}</p>
                <p className="text-sm text-muted-foreground">{t.services.emptyStateDesc}</p>
              </div>
              <Button onClick={handleNewServiceClick} className="gap-2">
                <Plus className="h-4 w-4" />
                {t.services.newService}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t.services.notFoundServices}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <Card
              key={service.id}
              className={cn(
                'flex h-full cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md',
                !service.is_active && 'opacity-70'
              )}
              onClick={() => handleOpenServiceModal(service)}
            >
              <div className="h-1.5 w-full" style={{ backgroundColor: service.color }} />
              <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{service.name}</h3>
                    {service.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{service.description}</p>
                    )}
                    {service.duplicate_group_id && duplicateSiblings[service.duplicate_group_id]?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{t.services.alsoAtLabel}</span>
                        {duplicateSiblings[service.duplicate_group_id].map((businessId) => (
                          <span
                            key={businessId}
                            title={businessNameById[businessId]}
                            className={cn(
                              'rounded px-1 py-0.5 text-[10px] font-semibold',
                              sedeTint(businessColorIndexById[businessId])?.bg,
                              sedeTint(businessColorIndexById[businessId])?.text
                            )}
                          >
                            {sedeAbbr(businessNameById[businessId] || '')}
                          </span>
                        ))}
                      </div>
                    )}
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
                      <DropdownMenuItem onClick={() => handleOpenServiceModal(service)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t.services.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateService(service)}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t.services.duplicate}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingService(service)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.services.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div>
                    {renderServicePrice(service)}
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {durationText(service)}
                    </div>
                  </div>
                  <Switch
                    checked={service.is_active}
                    disabled={togglingServiceId === service.id}
                    onCheckedChange={() => handleQuickToggleActive(service)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={service.is_active ? t.services.active : t.services.inactive}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Service Modal */}
      <Dialog open={isServiceModalOpen} onOpenChange={handleServiceModalOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? t.services.editServiceTitle : t.services.newServiceTitle}
            </DialogTitle>
            <DialogDescription>
              {editingService ? t.services.editServiceDesc : t.services.newServiceDesc}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveService} className="space-y-6">
            <FormSection title={t.services.sectionBasicInfo}>
              {!editingService && hasMultipleSedes && (
                <div className="space-y-2">
                  <Label htmlFor="service-sede">{t.services.sedeLabel}</Label>
                  <Select value={targetBusinessId} onValueChange={setTargetBusinessId}>
                    <SelectTrigger id="service-sede">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orgBusinessIds.map((id) => (
                        <SelectItem key={id} value={id}>
                          {businessNameById[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetBusinessId !== currentBusiness?.id && (
                    <p className="text-xs text-muted-foreground">{t.services.sedeResourceHint}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="service-name">{t.services.nameLabel}</Label>
                <Input
                  id="service-name"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  placeholder={t.services.namePlaceholder}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-description">{t.services.descLabel}</Label>
                <Textarea
                  id="service-description"
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                  placeholder={t.services.descPlaceholder}
                  rows={2}
                />
              </div>
            </FormSection>

            <Separator />

            <FormSection title={t.services.sectionPricing}>
            <div className="space-y-2">
              <Label>{t.services.pricingModeLabel}</Label>
              <div className="grid grid-cols-3 gap-2 rounded-lg border p-1">
                {(['fixed', 'preset', 'hourly'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDurationOptionsError('')
                      setServiceForm({ ...serviceForm, pricingMode: mode })
                      if (mode === 'preset' && durationOptions.length === 0) {
                        setDurationOptions([{ duration: '', price: '' }])
                      }
                    }}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      serviceForm.pricingMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {mode === 'fixed' && t.services.pricingModeFixed}
                    {mode === 'preset' && t.services.pricingModePreset}
                    {mode === 'hourly' && t.services.pricingModeHourly}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {serviceForm.pricingMode === 'fixed' && t.services.pricingModeFixedDesc}
                {serviceForm.pricingMode === 'preset' && t.services.pricingModePresetDesc}
                {serviceForm.pricingMode === 'hourly' && t.services.pricingModeHourlyDesc}
              </p>
            </div>

            {serviceForm.pricingMode === 'hourly' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="service-hourly-rate">
                    {t.services.hourlyRateLabel} ({isUSD ? '$' : 'S/.'})
                  </Label>
                  <Input
                    id="service-hourly-rate"
                    type="number"
                    min={0}
                    step="any"
                    value={serviceForm.hourlyRate}
                    onChange={(e) =>
                      setServiceForm({ ...serviceForm, hourlyRate: e.target.value !== '' ? parseFloat(e.target.value) : '' })
                    }
                    onBlur={(e) => {
                      if (e.target.value === '') return
                      const rounded = Math.round(parseFloat(e.target.value) * 100) / 100
                      setServiceForm({ ...serviceForm, hourlyRate: isNaN(rounded) ? '' : rounded })
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="service-min-hours">{t.services.minHoursLabel}</Label>
                    <Input
                      id="service-min-hours"
                      type="number"
                      min={1}
                      step={1}
                      value={serviceForm.minHours}
                      onChange={(e) =>
                        setServiceForm({ ...serviceForm, minHours: e.target.value !== '' ? parseInt(e.target.value) : '' })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-max-hours">{t.services.maxHoursLabel}</Label>
                    <Input
                      id="service-max-hours"
                      type="number"
                      min={1}
                      step={1}
                      value={serviceForm.maxHours}
                      onChange={(e) =>
                        setServiceForm({ ...serviceForm, maxHours: e.target.value !== '' ? parseInt(e.target.value) : '' })
                      }
                    />
                  </div>
                </div>
                {durationOptionsError && (
                  <p className="text-xs text-destructive">{durationOptionsError}</p>
                )}
              </div>
            ) : serviceForm.pricingMode === 'preset' ? (
              <div className="space-y-2">
                <Label>{t.services.durationOptionsLabel}</Label>
                <div className="space-y-2">
                  {durationOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <DurationInput
                        key={`${editingService?.id ?? duplicateSourceId ?? 'new'}-${index}`}
                        value={option.duration}
                        onChange={(minutes) => updateDurationOption(index, 'duration', minutes)}
                        className="flex-1"
                        initialUnit={!editingService && !duplicateSourceId ? 'hours' : undefined}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder={`${t.services.priceLabel} (${isUSD ? '$' : 'S/.'})`}
                        value={option.price}
                        onChange={(e) =>
                          updateDurationOption(index, 'price', e.target.value !== '' ? parseFloat(e.target.value) : '')
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') return
                          const rounded = Math.round(parseFloat(e.target.value) * 100) / 100
                          updateDurationOption(index, 'price', isNaN(rounded) ? '' : rounded)
                        }}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDurationOption(index)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addDurationOption} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t.services.addDurationOption}
                </Button>
                {durationOptionsError && (
                  <p className="text-xs text-destructive">{durationOptionsError}</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="service-duration">{t.services.durationLabel}</Label>
                  <DurationInput
                    key={editingService?.id ?? duplicateSourceId ?? 'new'}
                    id="service-duration"
                    value={serviceForm.duration}
                    onChange={(minutes) => setServiceForm({ ...serviceForm, duration: minutes === '' ? 0 : minutes })}
                    initialUnit={!editingService && !duplicateSourceId ? 'hours' : undefined}
                  />
                </div>
                {isUSD ? (
                  <div className="space-y-2">
                    <Label htmlFor="service-price-usd">{t.services.priceLabel} ($)</Label>
                    <Input
                      id="service-price-usd"
                      type="number"
                      min={0}
                      step="any"
                      value={serviceForm.priceUsd}
                      onChange={(e) => setServiceForm({ ...serviceForm, priceUsd: e.target.value !== '' ? parseFloat(e.target.value) : '' })}
                      onBlur={(e) => {
                        if (e.target.value === '') return
                        const rounded = Math.round(parseFloat(e.target.value) * 100) / 100
                        setServiceForm({ ...serviceForm, priceUsd: isNaN(rounded) ? '' : rounded })
                      }}
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="service-price">{t.services.priceLabel} (S/.)</Label>
                    <Input
                      id="service-price"
                      type="number"
                      min={0}
                      step="any"
                      value={serviceForm.price}
                      onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })}
                      onBlur={(e) => {
                        const rounded = Math.round((parseFloat(e.target.value) || 0) * 100) / 100
                        setServiceForm({ ...serviceForm, price: rounded })
                      }}
                      required
                    />
                  </div>
                )}
              </div>
            )}
            </FormSection>

            <Separator />

            <FormSection title={t.services.sectionAdvanced}>
              <div className="space-y-2">
                <Label>{t.services.bufferLabel}</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="service-buffer-before" className="text-xs font-normal text-muted-foreground">
                      {t.services.bufferBeforeLabel}
                    </Label>
                    <Input
                      id="service-buffer-before"
                      type="number"
                      min={0}
                      step={5}
                      value={serviceForm.bufferBeforeMin}
                      onChange={(e) => setServiceForm({ ...serviceForm, bufferBeforeMin: e.target.value !== '' ? parseInt(e.target.value) || 0 : '' })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service-buffer-after" className="text-xs font-normal text-muted-foreground">
                      {t.services.bufferAfterLabel}
                    </Label>
                    <Input
                      id="service-buffer-after"
                      type="number"
                      min={0}
                      step={5}
                      value={serviceForm.bufferAfterMin}
                      onChange={(e) => setServiceForm({ ...serviceForm, bufferAfterMin: e.target.value !== '' ? parseInt(e.target.value) || 0 : '' })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t.services.bufferHint}</p>
              </div>

              {resources.length > 0 && targetBusinessId === currentBusiness?.id && (
                <div className="space-y-2">
                  <Label>{t.services.resourcesAssociatedLabel}</Label>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                    {resources.map((resource) => (
                      <label key={resource.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                        <Checkbox
                          checked={selectedResourceIds.includes(resource.id)}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              setSelectedResourceIds([...selectedResourceIds, resource.id])
                            } else {
                              setSelectedResourceIds(selectedResourceIds.filter((id) => id !== resource.id))
                            }
                          }}
                        />
                        {resource.name}
                        <span className="text-xs text-muted-foreground">({getResourceTypeLabel(resource.type, t.services)})</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.services.resourcesAssociatedHint}</p>
                </div>
              )}
            </FormSection>

            <Separator />

            <FormSection title={t.services.sectionAppearance}>
              <div className="space-y-2">
                <Label>{t.services.colorLabel}</Label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-full border-2 transition-transform ${
                        serviceForm.color === color
                          ? 'scale-110 border-foreground'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setServiceForm({ ...serviceForm, color })}
                    />
                  ))}
                  {/* 9th swatch: a real color wheel via the native color
                      input (zero extra dependency, every browser already
                      ships one) - shows a rainbow ring until a custom color
                      is picked, then shows that color solid so it reads the
                      same as the 8 presets once chosen. */}
                  <label
                    className={cn(
                      'relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-transform',
                      !SERVICE_COLORS.includes(serviceForm.color)
                        ? 'scale-110 border-foreground'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{
                      background: !SERVICE_COLORS.includes(serviceForm.color)
                        ? serviceForm.color
                        : 'conic-gradient(from 0deg, #EF4444, #F59E0B, #84CC16, #10B981, #06B6D4, #3B82F6, #8B5CF6, #EC4899, #EF4444)',
                    }}
                    title={t.services.customColorLabel}
                  >
                    {SERVICE_COLORS.includes(serviceForm.color) && (
                      <Palette className="h-3.5 w-3.5 text-white drop-shadow" />
                    )}
                    <input
                      type="color"
                      value={SERVICE_COLORS.includes(serviceForm.color) ? '#3B82F6' : serviceForm.color}
                      onChange={(e) => setServiceForm({ ...serviceForm, color: e.target.value })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label={t.services.customColorLabel}
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="service-active">{t.services.serviceActive}</Label>
                <Switch
                  id="service-active"
                  checked={serviceForm.isActive}
                  onCheckedChange={(checked) => setServiceForm({ ...serviceForm, isActive: checked })}
                />
              </div>
            </FormSection>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleServiceModalOpenChange(false)} disabled={saving}>
                {t.services.cancelBtn}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingService ? t.services.saveBtn : t.services.createServiceBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirmation */}
      <AlertDialog open={showUnsavedConfirm} onOpenChange={setShowUnsavedConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.services.unsavedChangesTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.services.unsavedChangesDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.services.keepEditingBtn}</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setShowUnsavedConfirm(false)
                setIsServiceModalOpen(false)
              }}
            >
              {t.services.discardChangesBtn}
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                await saveService()
                setShowUnsavedConfirm(false)
              }}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.services.saveBtn}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Service Confirmation */}
      <AlertDialog open={!!deletingService} onOpenChange={(open) => !open && setDeletingService(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.services.deleteServiceTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingService && `"${deletingService.name}" — `}
              {t.services.deleteServiceDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t.services.cancelBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteService}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? t.services.deleting : t.services.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={t.upgradeModal.featureUnlimitedRecordsTitle}
      />
    </div>
  )
}
