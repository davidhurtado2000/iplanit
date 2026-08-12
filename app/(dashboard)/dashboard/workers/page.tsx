'use client'

import React from "react"

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { getWorkerLabel } from '@/lib/worker-label'
import { useDashboardData } from '@/context/dashboard-data-context'
import { TimeSelect } from '@/components/dashboard/time-select'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
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

const DEFAULT_WORKER_HOURS: { dayOfWeek: DayOfWeek; startTime: string; endTime: string; isOpen: boolean }[] = [
  { dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'wednesday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'thursday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'friday', startTime: '09:00', endTime: '18:00', isOpen: true },
  { dayOfWeek: 'saturday', startTime: '09:00', endTime: '14:00', isOpen: true },
  { dayOfWeek: 'sunday', startTime: '09:00', endTime: '14:00', isOpen: false },
]

interface Worker {
  id: string
  business_id: string
  name: string
  color: string
  is_active: boolean
}

export default function WorkersPage() {
  const { currentBusiness } = useBusinesses()
  const { t } = useLanguage()
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

  const [workerForm, setWorkerForm] = useState({
    name: '',
    color: WORKER_COLORS[0],
    isActive: true,
  })
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

  const updateWorkerHour = (dayOfWeek: DayOfWeek, field: 'startTime' | 'endTime' | 'isOpen', value: string | boolean) => {
    setHoursForm((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h)))
  }

  const handleOpenWorkerModal = (worker?: Worker) => {
    if (worker) {
      setEditingWorker(worker)
      setWorkerForm({ name: worker.name, color: worker.color || WORKER_COLORS[0], isActive: worker.is_active })
      setSelectedServiceIds(workerServices.filter((ws) => ws.worker_id === worker.id).map((ws) => ws.service_id))
      const existingHours = workerHours.filter((h) => h.worker_id === worker.id)
      if (existingHours.length > 0) {
        setUseCustomHours(true)
        setHoursForm(
          DEFAULT_WORKER_HOURS.map((def) => {
            const row = existingHours.find((h) => h.day_of_week === DAY_KEY_TO_NUMBER[def.dayOfWeek])
            return row
              ? { dayOfWeek: def.dayOfWeek, startTime: row.open_time.slice(0, 5), endTime: row.close_time.slice(0, 5), isOpen: !row.is_closed }
              : def
          })
        )
      } else {
        setUseCustomHours(false)
        setHoursForm(DEFAULT_WORKER_HOURS)
      }
    } else {
      setEditingWorker(null)
      setWorkerForm({ name: '', color: WORKER_COLORS[0], isActive: true })
      setSelectedServiceIds([])
      setUseCustomHours(false)
      setHoursForm(DEFAULT_WORKER_HOURS)
    }
    setSaveError('')
    setIsWorkerModalOpen(true)
  }

  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaveError('')
    setSaving(true)
    try {
      const workerData = {
        name: workerForm.name,
        color: workerForm.color,
        is_active: workerForm.isActive,
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
        const hoursRows = hoursForm.map((h) => ({
          business_id: currentBusiness.id,
          worker_id: workerId,
          day_of_week: DAY_KEY_TO_NUMBER[h.dayOfWeek],
          open_time: h.startTime,
          close_time: h.endTime,
          is_closed: !h.isOpen,
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
      await refetchWorkers()
      await refetchWorkerHours()
      await refetchWorkerServices()
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
          <Button onClick={() => handleOpenWorkerModal()} className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            {t.workers.newWorker}
          </Button>
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
            return (
              <Card
                key={worker.id}
                className={cn(
                  'flex h-full cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md',
                  !worker.is_active && 'opacity-70'
                )}
                onClick={() => handleOpenWorkerModal(worker)}
              >
                <div className="h-1.5 w-full" style={{ backgroundColor: workerColor }} />
                <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${workerColor}20`, color: workerColor }}
                        >
                          <UserCog className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-foreground">{worker.name}</h3>
                          {hasCustomHours && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {t.workers.customScheduleBadge}
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
                </CardContent>
              </Card>
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
                      <div key={day.value} className="flex flex-col gap-2 p-2 sm:h-14 sm:flex-row sm:items-center">
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
    </div>
  )
}
