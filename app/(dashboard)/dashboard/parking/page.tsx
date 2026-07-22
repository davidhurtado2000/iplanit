'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.parking.title}</h1>
          <p className="text-muted-foreground">{t.parking.subtitle}</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="gap-2">
          <Plus className="h-4 w-4" />
          {t.parking.newSpot}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.parking.occupancyTitle}</CardTitle>
          <CardDescription>{t.parking.occupancyDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {occupiedCount} / {activeSpots.length}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spots.map((spot) => (
          <Card key={spot.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <ParkingSquare className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{spot.name}</CardTitle>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant={spot.is_active ? 'default' : 'secondary'}>
                  {spot.is_active ? t.services.active : t.services.inactive}
                </Badge>
                {spot.is_active && occupiedSpotIds.has(spot.id) && (
                  <Badge variant="destructive">{t.parking.occupiedNow}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {spots.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12">
            <ParkingSquare className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">{t.parking.noSpots}</p>
          </div>
        )}
      </div>

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
