'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { HeroKpiCard } from '@/components/dashboard/hero-kpi-card'
import { cn } from '@/lib/utils'
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
import { useDashboardData, type Resource } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { Plus, MoreHorizontal, Pencil, Trash2, Loader2, ParkingSquare, Building2 } from 'lucide-react'

export default function ParkingPage() {
  const { currentBusiness } = useBusinesses()
  const { t } = useLanguage()
  const { resources, reservations, loading, refetchServicesAndResources } = useDashboardData()
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSpot, setEditingSpot] = useState<Resource | null>(null)
  const [deletingSpot, setDeletingSpot] = useState<Resource | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [spotForm, setSpotForm] = useState({ name: '', isActive: true })
  const supabase = createClient()

  const spots = resources.filter((r) => r.type === 'parking')
  const activeSpots = spots.filter((s) => s.is_active)

  const now = new Date()
  const occupiedSpotIds = new Set(
    reservations
      .filter(
        (r) =>
          r.parking_resource_id &&
          r.status !== 'cancelled' &&
          new Date(r.start_time) <= now &&
          new Date(r.end_time) > now
      )
      .map((r) => r.parking_resource_id)
  )
  const occupiedCount = activeSpots.filter((s) => occupiedSpotIds.has(s.id)).length

  // Instant on/off from the card, same pattern as Services/Resources.
  const [togglingSpotId, setTogglingSpotId] = useState<string | null>(null)
  const handleQuickToggleActive = async (spot: Resource) => {
    setTogglingSpotId(spot.id)
    try {
      const { error } = await supabase.from('resources').update({ is_active: !spot.is_active }).eq('id', spot.id)
      if (error) throw error
      await refetchServicesAndResources()
    } catch (err) {
      console.error('[iplanit] Error toggling parking spot active state:', err)
      toast.error(t.saveError)
    } finally {
      setTogglingSpotId(null)
    }
  }

  const handleOpenModal = (spot?: Resource) => {
    if (spot) {
      setEditingSpot(spot)
      setSpotForm({ name: spot.name, isActive: spot.is_active })
    } else {
      setEditingSpot(null)
      setSpotForm({ name: '', isActive: true })
    }
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return
    setSaving(true)
    try {
      const spotData = {
        name: spotForm.name,
        type: 'parking' as const,
        is_active: spotForm.isActive,
        business_id: currentBusiness.id,
      }
      if (editingSpot) {
        const { error } = await supabase.from('resources').update(spotData).eq('id', editingSpot.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('resources').insert(spotData)
        if (error) throw error
      }
      await refetchServicesAndResources()
      setIsModalOpen(false)
    } catch (err) {
      console.error('[v0] Error saving parking spot:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingSpot) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('resources').delete().eq('id', deletingSpot.id)
      if (error) throw error
      await refetchServicesAndResources()
    } catch (err) {
      console.error('[v0] Error deleting parking spot:', err)
    } finally {
      setIsDeleting(false)
      setDeletingSpot(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!currentBusiness) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.parking.setupRequired}</h2>
      </div>
    )
  }

  if (currentBusiness.role === 'sales') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.services.accessRestricted}</h2>
        <p className="mt-2 text-muted-foreground">{t.services.accessRestrictedDesc}</p>
      </div>
    )
  }

  if (!currentBusiness.offers_parking) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ParkingSquare className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.parking.notEnabledTitle}</h2>
        <p className="mt-2 text-muted-foreground">{t.parking.notEnabledDesc}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.parking.title}
        subtitle={t.parking.subtitle}
        actions={
          <Button onClick={() => handleOpenModal()} className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            {t.parking.newSpot}
          </Button>
        }
      />

      <HeroKpiCard
        label={t.parking.occupancyTitle}
        icon={ParkingSquare}
        iconClassName="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
        value={`${occupiedCount} / ${activeSpots.length}`}
        caption={t.parking.occupancyDesc}
      />

      {spots.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <ParkingSquare className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">{t.parking.noSpots}</p>
          <Button onClick={() => handleOpenModal()} className="gap-2">
            <Plus className="h-4 w-4" />
            {t.parking.newSpot}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spots.map((spot) => (
            <Card
              key={spot.id}
              className={cn(
                'flex h-full cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md',
                !spot.is_active && 'opacity-70'
              )}
              onClick={() => handleOpenModal(spot)}
            >
              <div className="h-1.5 w-full bg-primary" />
              <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ParkingSquare className="h-4 w-4" />
                    </div>
                    <h3 className="truncate font-semibold text-foreground">{spot.name}</h3>
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
                      <DropdownMenuItem onClick={() => handleOpenModal(spot)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t.services.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeletingSpot(spot)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.services.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {spot.is_active && occupiedSpotIds.has(spot.id) ? (
                    <Badge variant="destructive">{t.parking.occupiedNow}</Badge>
                  ) : (
                    <span />
                  )}
                  <Switch
                    checked={spot.is_active}
                    disabled={togglingSpotId === spot.id}
                    onCheckedChange={() => handleQuickToggleActive(spot)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={spot.is_active ? t.services.active : t.services.inactive}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSpot ? t.parking.editSpotTitle : t.parking.newSpotTitle}</DialogTitle>
            <DialogDescription>{t.parking.spotFormDesc}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="spot-name">{t.parking.spotNameLabel}</Label>
              <Input
                id="spot-name"
                value={spotForm.name}
                onChange={(e) => setSpotForm({ ...spotForm, name: e.target.value })}
                placeholder={t.parking.spotNamePlaceholder}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="spot-active">{t.services.serviceActive}</Label>
              <Switch
                id="spot-active"
                checked={spotForm.isActive}
                onCheckedChange={(checked) => setSpotForm({ ...spotForm, isActive: checked })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                {t.services.cancelBtn}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingSpot ? t.services.saveBtn : t.parking.createSpotBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingSpot} onOpenChange={(open) => !open && setDeletingSpot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.parking.deleteSpotTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingSpot && `"${deletingSpot.name}" — `}
              {t.parking.deleteSpotDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t.services.cancelBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
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
