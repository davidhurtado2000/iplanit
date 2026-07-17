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
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type ServiceResource } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Clock,
  DollarSign,
  Briefcase,
  Building,
  User,
  Video,
  Search,
  Loader2,
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
  is_active: boolean
}

interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  type: 'room' | 'person' | 'equipment' | 'virtual'
  color: string
  is_active: boolean
}

const SERVICE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
]

export default function ServicesPage() {
  const { businesses } = useBusinesses()
  const { t } = useLanguage()
  const { services, resources, serviceResources, loading, refetchServicesAndResources, refetchServiceResources } = useDashboardData()
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'services' | 'resources'>('services')
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingService, setDeletingService] = useState<Service | null>(null)
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const supabase = createClient()

  const currentBusiness = businesses?.[0]

  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration: 30,
    price: 0,
    priceUsd: '' as number | '',
    color: SERVICE_COLORS[0],
    isActive: true,
  })
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([])

  const [resourceForm, setResourceForm] = useState({
    name: '',
    description: '',
    type: 'room' as 'room' | 'person' | 'equipment' | 'virtual',
    color: SERVICE_COLORS[0],
    isActive: true,
  })


  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredResources = resources.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleOpenServiceModal = (service?: Service) => {
    if (service) {
      setEditingService(service)
      setServiceForm({
        name: service.name,
        description: service.description || '',
        duration: service.duration_minutes,
        price: service.price || 0,
        priceUsd: service.price_usd ?? '',
        color: service.color,
        isActive: service.is_active,
      })
      setSelectedResourceIds(
        serviceResources
          .filter((sr) => sr.service_id === service.id)
          .map((sr) => sr.resource_id)
      )
    } else {
      setEditingService(null)
      setServiceForm({
        name: '',
        description: '',
        duration: 30,
        price: 0,
        priceUsd: '',
        color: SERVICE_COLORS[0],
        isActive: true,
      })
      setSelectedResourceIds([])
    }
    setIsServiceModalOpen(true)
  }

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaving(true)
    try {
      const serviceData = {
        name: serviceForm.name,
        description: serviceForm.description || null,
        duration_minutes: serviceForm.duration,
        price: serviceForm.price || 0,
        price_usd: serviceForm.priceUsd !== '' ? serviceForm.priceUsd : null,
        color: serviceForm.color,
        is_active: serviceForm.isActive,
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

      await Promise.all([refetchServicesAndResources(), refetchServiceResources()])
      setIsServiceModalOpen(false)
    } catch (err) {
      console.error('[v0] Error saving service:', err)
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

  const handleOpenResourceModal = (resource?: Resource) => {
    if (resource) {
      setEditingResource(resource)
      setResourceForm({
        name: resource.name,
        description: resource.description || '',
        type: resource.type,
        color: resource.color || SERVICE_COLORS[0],
        isActive: resource.is_active,
      })
    } else {
      setEditingResource(null)
      setResourceForm({
        name: '',
        description: '',
        type: 'room',
        color: SERVICE_COLORS[0],
        isActive: true,
      })
    }
    setIsResourceModalOpen(true)
  }

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaving(true)
    try {
      const resourceData = {
        name: resourceForm.name,
        description: resourceForm.description || null,
        type: resourceForm.type,
        color: resourceForm.color,
        is_active: resourceForm.isActive,
        business_id: currentBusiness.id,
      }

      if (editingResource) {
        const { error } = await supabase
          .from('resources')
          .update(resourceData)
          .eq('id', editingResource.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('resources')
          .insert(resourceData)

        if (error) throw error
      }
      await refetchServicesAndResources()
      setIsResourceModalOpen(false)
    } catch (err) {
      console.error('[v0] Error saving resource:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDeleteResource = async () => {
    if (!deletingResource) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', deletingResource.id)

      if (error) throw error
      await refetchServicesAndResources()
    } catch (err) {
      console.error('[v0] Error deleting resource:', err)
    } finally {
      setIsDeleting(false)
      setDeletingResource(null)
    }
  }

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'room':
        return Building
      case 'person':
        return User
      case 'virtual':
        return Video
      default:
        return Briefcase
    }
  }

  const getResourceTypeLabel = (type: string) => {
    if (type === 'room') return t.services.roomTypeLabel
    if (type === 'person') return t.services.personType
    if (type === 'virtual') return t.services.virtualType
    return t.services.equipmentType
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.services.title}</h1>
          <p className="text-muted-foreground">{t.services.subtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'services'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('services')}
        >
          {t.services.servicesTab} ({services.length})
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'resources'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('resources')}
        >
          {t.services.resourcesTab} ({resources.length})
        </button>
      </div>

      {activeTab === 'resources' && (
        <p className="text-sm text-muted-foreground">{t.services.resourcesExplainer}</p>
      )}

      {/* Search and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={activeTab === 'services' ? t.services.searchServices : t.services.searchResources}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() =>
            activeTab === 'services'
              ? handleOpenServiceModal()
              : handleOpenResourceModal()
          }
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {activeTab === 'services' ? t.services.newService : t.services.newResource}
        </Button>
      </div>

      {/* Services Tab Content */}
      {activeTab === 'services' && (
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
                        {service.duration_minutes} min
                      </div>
                    </TableCell>
                    <TableCell>
                      {service.price || service.price_usd ? (
                        <div className="text-sm space-y-0.5">
                          {service.price ? <div>S/ {service.price}</div> : null}
                          {service.price_usd ? <div className="text-muted-foreground">$ {service.price_usd}</div> : null}
                        </div>
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
      )}

      {/* Resources Tab Content */}
      {activeTab === 'resources' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredResources.map((resource) => {
            const Icon = getResourceIcon(resource.type)
            return (
              <Card key={resource.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded-lg p-2"
                      style={{ backgroundColor: `${resource.color || '#3B82F6'}20` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: resource.color || '#3B82F6' }} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{resource.name}</CardTitle>
                      <CardDescription>
                        {getResourceTypeLabel(resource.type)}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleOpenResourceModal(resource)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t.services.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingResource(resource)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.services.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  {resource.description && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {resource.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={resource.is_active ? 'default' : 'secondary'}>
                      {resource.is_active ? t.services.active : t.services.inactive}
                    </Badge>
                    {(() => {
                      const linkedCount = serviceResources.filter((sr) => sr.resource_id === resource.id).length
                      return linkedCount > 0 ? (
                        <Badge variant="outline" className="text-xs">
                          {linkedCount} {linkedCount === 1 ? 'servicio' : 'servicios'}
                        </Badge>
                      ) : null
                    })()}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {filteredResources.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12">
              <Building className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">{t.services.notFoundResources}</p>
            </div>
          )}
        </div>
      )}

      {/* Service Modal */}
      <Dialog open={isServiceModalOpen} onOpenChange={setIsServiceModalOpen}>
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
              <div className="space-y-2">
                <Label htmlFor="service-price">{t.services.priceLabel} (S/.)</Label>
                <Input
                  id="service-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })}
                  required
                />
                <p className="text-xs text-muted-foreground">Usado en Analytics e ingresos</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-price-usd">Precio (USD $)</Label>
              <Input
                id="service-price-usd"
                type="number"
                min={0}
                step={0.01}
                placeholder="Opcional"
                value={serviceForm.priceUsd}
                onChange={(e) => setServiceForm({ ...serviceForm, priceUsd: e.target.value !== '' ? parseFloat(e.target.value) : '' })}
              />
              <p className="text-xs text-muted-foreground">Solo referencia — no se usa en reportes ni ingresos</p>
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
                      <span className="text-muted-foreground text-xs">({getResourceTypeLabel(resource.type)})</span>
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsServiceModalOpen(false)} disabled={saving}>
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

      {/* Resource Modal */}
      <Dialog open={isResourceModalOpen} onOpenChange={setIsResourceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingResource ? t.services.editResourceTitle : t.services.newResourceTitle}
            </DialogTitle>
            <DialogDescription>
              {editingResource ? t.services.editResourceDesc : t.services.newResourceDesc}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveResource} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resource-name">{t.services.nameLabel}</Label>
              <Input
                id="resource-name"
                value={resourceForm.name}
                onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })}
                placeholder={t.services.resourceNamePlaceholder}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource-description">{t.services.descLabel}</Label>
              <Textarea
                id="resource-description"
                value={resourceForm.description}
                onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                placeholder={t.services.resourceDescPlaceholder}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.services.resourceTypeLabel}</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { value: 'room', label: t.services.roomType, icon: Building },
                  { value: 'person', label: t.services.personType, icon: User },
                  { value: 'equipment', label: t.services.equipmentType, icon: Briefcase },
                  { value: 'virtual', label: t.services.virtualType, icon: Video },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
                      resourceForm.type === option.value
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setResourceForm({ ...resourceForm, type: option.value as 'room' | 'person' | 'equipment' | 'virtual' })}
                  >
                    <option.icon className="h-5 w-5" />
                    <span className="text-xs">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t.services.colorLabel}</Label>
              <div className="flex gap-2">
                {SERVICE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      resourceForm.color === color
                        ? 'scale-110 border-foreground'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setResourceForm({ ...resourceForm, color })}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="resource-active">{t.services.resourceActive}</Label>
              <Switch
                id="resource-active"
                checked={resourceForm.isActive}
                onCheckedChange={(checked) => setResourceForm({ ...resourceForm, isActive: checked })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsResourceModalOpen(false)} disabled={saving}>
                {t.services.cancelBtn}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingResource ? t.services.saveBtn : t.services.createResourceBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

      {/* Delete Resource Confirmation */}
      <AlertDialog open={!!deletingResource} onOpenChange={(open) => !open && setDeletingResource(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.services.deleteResourceTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingResource && `"${deletingResource.name}" — `}
              {t.services.deleteResourceDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t.services.cancelBtn}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteResource}
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
