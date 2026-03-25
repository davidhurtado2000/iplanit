'use client'

import React from "react"

import { useState, useEffect } from 'react'
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
  color: string
  is_active: boolean
}

interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  type: 'room' | 'person' | 'equipment'
  is_active: boolean
}

const SERVICE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
]

export default function ServicesPage() {
  const { businesses, loading: businessLoading } = useBusinesses()
  const { t } = useLanguage()
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'services' | 'resources'>('services')
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()

  const currentBusiness = businesses?.[0]

  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    duration: 30,
    price: 0,
    color: SERVICE_COLORS[0],
    isActive: true,
  })

  const [resourceForm, setResourceForm] = useState({
    name: '',
    description: '',
    type: 'room' as 'room' | 'person' | 'equipment',
    isActive: true,
  })

  // Fetch services and resources from Supabase
  useEffect(() => {
    const fetchData = async () => {
      if (!currentBusiness) {
        setLoading(false)
        return
      }

      try {
        const [servicesRes, resourcesRes] = await Promise.all([
          supabase
            .from('services')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .order('name'),
          supabase
            .from('resources')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .order('name'),
        ])

        if (servicesRes.data) setServices(servicesRes.data)
        if (resourcesRes.data) setResources(resourcesRes.data)
      } catch (err) {
        console.error('[v0] Error fetching services:', err)
      } finally {
        setLoading(false)
      }
    }

    if (!businessLoading) {
      fetchData()
    }
  }, [currentBusiness, businessLoading])

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
        color: service.color,
        isActive: service.is_active,
      })
    } else {
      setEditingService(null)
      setServiceForm({
        name: '',
        description: '',
        duration: 30,
        price: 0,
        color: SERVICE_COLORS[0],
        isActive: true,
      })
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
        color: serviceForm.color,
        is_active: serviceForm.isActive,
        business_id: currentBusiness.id,
      }

      if (editingService) {
        const { data, error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id)
          .select()
          .single()

        if (error) throw error
        setServices(services.map((s) => s.id === editingService.id ? data : s))
      } else {
        const { data, error } = await supabase
          .from('services')
          .insert(serviceData)
          .select()
          .single()

        if (error) throw error
        setServices([...services, data])
      }
      setIsServiceModalOpen(false)
    } catch (err) {
      console.error('[v0] Error saving service:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteService = async (id: string) => {
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id)

      if (error) throw error
      setServices(services.filter((s) => s.id !== id))
    } catch (err) {
      console.error('[v0] Error deleting service:', err)
    }
  }

  const handleOpenResourceModal = (resource?: Resource) => {
    if (resource) {
      setEditingResource(resource)
      setResourceForm({
        name: resource.name,
        description: resource.description || '',
        type: resource.type,
        isActive: resource.is_active,
      })
    } else {
      setEditingResource(null)
      setResourceForm({
        name: '',
        description: '',
        type: 'room',
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
        is_active: resourceForm.isActive,
        business_id: currentBusiness.id,
      }

      if (editingResource) {
        const { data, error } = await supabase
          .from('resources')
          .update(resourceData)
          .eq('id', editingResource.id)
          .select()
          .single()

        if (error) throw error
        setResources(resources.map((r) => r.id === editingResource.id ? data : r))
      } else {
        const { data, error } = await supabase
          .from('resources')
          .insert(resourceData)
          .select()
          .single()

        if (error) throw error
        setResources([...resources, data])
      }
      setIsResourceModalOpen(false)
    } catch (err) {
      console.error('[v0] Error saving resource:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteResource = async (id: string) => {
    try {
      const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', id)

      if (error) throw error
      setResources(resources.filter((r) => r.id !== id))
    } catch (err) {
      console.error('[v0] Error deleting resource:', err)
    }
  }

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'room':
        return Building
      case 'person':
        return User
      default:
        return Briefcase
    }
  }

  const getResourceTypeLabel = (type: string) => {
    if (type === 'room') return t.services.roomTypeLabel
    if (type === 'person') return t.services.personType
    return t.services.equipmentType
  }

  if (businessLoading || loading) {
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
                      {service.price ? (
                        <div className="flex items-center gap-1 text-sm">
                          <DollarSign className="h-3 w-3" />
                          S/ {service.price}
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
                            onClick={() => handleDeleteService(service.id)}
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
                    <div className="rounded-lg bg-muted p-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
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
                        onClick={() => handleDeleteResource(resource.id)}
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
                  <Badge variant={resource.is_active ? 'default' : 'secondary'}>
                    {resource.is_active ? t.services.active : t.services.inactive}
                  </Badge>
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
                  onChange={(e) => setServiceForm({ ...serviceForm, duration: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-price">{t.services.priceLabel}</Label>
                <Input
                  id="service-price"
                  type="number"
                  min={0}
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) })}
                />
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
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'room', label: t.services.roomType, icon: Building },
                  { value: 'person', label: t.services.personType, icon: User },
                  { value: 'equipment', label: t.services.equipmentType, icon: Briefcase },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
                      resourceForm.type === option.value
                        ? 'border-primary bg-primary/10'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setResourceForm({ ...resourceForm, type: option.value as 'room' | 'person' | 'equipment' })}
                  >
                    <option.icon className="h-5 w-5" />
                    <span className="text-xs">{option.label}</span>
                  </button>
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
    </div>
  )
}
