'use client'

import React from "react"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type ServiceResource, type ServiceDurationOption } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { getResourceTypeLabel } from '@/lib/resource-display'
import { isPlanLimitReached } from '@/lib/plan-limits'
import { UpgradeModal } from '@/components/upgrade-modal'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Clock,
  DollarSign,
  Briefcase,
  Building,
  Search,
  Loader2,
  X,
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
  const { currentBusiness } = useBusinesses()
  const { profile } = useAuth()
  const isPremium = profile?.plan === 'premium'
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

  const handleNewServiceClick = async () => {
    if (!isPremium && currentBusiness && (await isPlanLimitReached(currentBusiness.id, 'services'))) {
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

  const handleOpenServiceModal = (service?: Service) => {
    setDurationOptionsError('')
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
        business_id: currentBusiness.id,
      }

      let serviceId: string

      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id)
        if (error) throw error
        serviceId = editingService.id
      } else {
        const { data, error } = await supabase
          .from('services')
          .insert(serviceData)
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
          business_id: currentBusiness.id,
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
            business_id: currentBusiness.id,
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

      <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.services.serviceCol}</TableHead>
                  <TableHead>{t.services.durationCol}</TableHead>
                  <TableHead>{t.services.priceCol}</TableHead>
                  <TableHead>{t.services.statusCol}</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredServices.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: service.color }}
                        />
                        <div>
                          <p className="font-medium">{service.name}</p>
                          {service.description && (
                            <p className="text-sm text-muted-foreground">
                              {service.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3" />
                        {service.pricing_mode === 'hourly'
                          ? `${service.min_hours ?? '?'}-${service.max_hours ?? '?'} h`
                          : `${service.duration_minutes} min`}
                      </div>
                    </TableCell>
                    <TableCell>
                      {service.pricing_mode === 'preset' ? (
                        (() => {
                          const options = serviceDurationOptions.filter((o) => o.service_id === service.id)
                          const prices = options
                            .map((o) => (isUSD ? o.price_usd : o.price))
                            .filter((p): p is number => p != null)
                          if (prices.length === 0) {
                            return (
                              <Badge variant="destructive" className="text-xs">
                                {t.services.noDurationOptionsWarning}
                              </Badge>
                            )
                          }
                          const min = Math.min(...prices)
                          return (
                            <div className="text-sm">
                              {t.services.fromPrice} {isUSD ? '$' : 'S/'} {min}
                            </div>
                          )
                        })()
                      ) : service.pricing_mode === 'hourly' ? (
                        (() => {
                          const rate = isUSD ? service.hourly_rate_usd : service.hourly_rate
                          if (!rate) {
                            return (
                              <Badge variant="destructive" className="text-xs">
                                {t.services.noHourlyRateWarning}
                              </Badge>
                            )
                          }
                          return (
                            <div className="text-sm">
                              {isUSD ? '$' : 'S/'} {rate} {t.services.perHour}
                            </div>
                          )
                        })()
                      ) : isUSD ? (
                        service.price_usd ? (
                          <div className="text-sm">$ {service.price_usd}</div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : service.price ? (
                        <div className="text-sm">S/ {service.price}</div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.is_active ? 'default' : 'secondary'}>
                        {service.is_active ? t.services.active : t.services.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenServiceModal(service)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t.services.edit}
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
                    </TableCell>
                  </TableRow>
                ))}
                {filteredServices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center">
                      <p className="text-muted-foreground">{t.services.notFoundServices}</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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
          <form onSubmit={handleSaveService} className="space-y-4">
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
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        placeholder={t.services.durationLabel}
                        value={option.duration}
                        onChange={(e) =>
                          updateDurationOption(index, 'duration', e.target.value !== '' ? parseInt(e.target.value) : '')
                        }
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
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
                  <Input
                    id="service-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={serviceForm.duration}
                    onChange={(e) => setServiceForm({ ...serviceForm, duration: parseInt(e.target.value) || 0 })}
                    required
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

            {resources.length > 0 && (
              <div className="space-y-2">
                <Label>Recursos asociados</Label>
                <div className="max-h-32 overflow-y-auto rounded-md border p-2 space-y-1">
                  {resources.map((resource) => (
                    <label key={resource.id} className="flex items-center gap-2 cursor-pointer text-sm py-1">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedResourceIds.includes(resource.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedResourceIds([...selectedResourceIds, resource.id])
                          } else {
                            setSelectedResourceIds(selectedResourceIds.filter((id) => id !== resource.id))
                          }
                        }}
                      />
                      {resource.name}
                      <span className="text-muted-foreground text-xs">({getResourceTypeLabel(resource.type, t.services)})</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Si no seleccionas ninguno, el servicio estará disponible con cualquier recurso.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t.services.colorLabel}</Label>
              <div className="flex gap-2">
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
