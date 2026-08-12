'use client'

import React from "react"

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { sedeAbbr, sedeTint, buildBusinessColorIndex } from '@/lib/sede-colors'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { getResourceIcon, getResourceTypeLabel } from '@/lib/resource-display'
import { isPlanLimitReached } from '@/lib/plan-limits'
import { UpgradeModal } from '@/components/upgrade-modal'
import { cn } from '@/lib/utils'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Building,
  User,
  Video,
  Briefcase,
  Search,
  Loader2,
  Copy,
  Palette,
} from 'lucide-react'

interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
  color: string
  is_active: boolean
  duplicate_group_id: string | null
}

const RESOURCE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
]

export default function ResourcesPage() {
  const { currentBusiness, businesses } = useBusinesses()
  const { t } = useLanguage()
  const {
    resources: allResources,
    serviceResources,
    loading,
    refetchServicesAndResources,
  } = useDashboardData()
  // Parking spots are their own resource type but are managed exclusively on
  // the dedicated Cochera page - they don't belong here since a client never
  // picks "a parking spot" as the resource for a service the way they'd pick
  // a room or a stylist.
  const resources = allResources.filter((r) => r.type !== 'parking')
  const [saving, setSaving] = useState(false)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingResource, setDeletingResource] = useState<Resource | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [saveError, setSaveError] = useState('')
  const supabase = createClient()

  // Resources are per-sede by design (no organization_id) - when the
  // account has multiple sedes, a new (or duplicated) resource can target
  // any of them directly instead of being recreated from scratch there.
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
  // "Tambien en Sede X" (scripts/054) - same pattern as services/page.tsx.
  const duplicateSiblings = useDuplicateSiblings('resources', resources, orgBusinessIds, currentBusiness?.id, hasMultipleSedes)
  // Only meaningful while creating (editingResource === null) - editing an
  // existing resource never moves its sede via this modal.
  const [targetBusinessId, setTargetBusinessId] = useState<string>('')
  // Set only by handleDuplicateResource below - lets handleSaveResource know
  // this create is a duplicate, so it can assign/reuse a duplicate_group_id.
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null)

  const handleNewResourceClick = async () => {
    if (currentBusiness && (await isPlanLimitReached(currentBusiness.id, 'resources'))) {
      setShowUpgradeModal(true)
      return
    }
    handleOpenResourceModal()
  }

  const [resourceForm, setResourceForm] = useState({
    name: '',
    description: '',
    type: 'room' as 'room' | 'person' | 'equipment' | 'virtual',
    color: RESOURCE_COLORS[0],
    isActive: true,
  })

  const filteredResources = resources.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Instant on/off from the card, same reasoning as Services' equivalent -
  // toggling active status doesn't need the full edit modal.
  const [togglingResourceId, setTogglingResourceId] = useState<string | null>(null)
  const handleQuickToggleActive = async (resource: Resource) => {
    setTogglingResourceId(resource.id)
    try {
      const { error } = await supabase
        .from('resources')
        .update({ is_active: !resource.is_active })
        .eq('id', resource.id)
      if (error) throw error
      await refetchServicesAndResources()
    } catch (err) {
      console.error('[iplanit] Error toggling resource active state:', err)
      toast.error(t.saveError)
    } finally {
      setTogglingResourceId(null)
    }
  }

  const handleOpenResourceModal = (resource?: Resource) => {
    setTargetBusinessId(currentBusiness?.id || '')
    setDuplicateSourceId(null)
    if (resource) {
      setEditingResource(resource)
      setResourceForm({
        name: resource.name,
        description: resource.description || '',
        type: resource.type as 'room' | 'person' | 'equipment' | 'virtual',
        color: resource.color || RESOURCE_COLORS[0],
        isActive: resource.is_active,
      })
    } else {
      setEditingResource(null)
      setResourceForm({
        name: '',
        description: '',
        type: 'room',
        color: RESOURCE_COLORS[0],
        isActive: true,
      })
    }
    setSaveError('')
    setIsResourceModalOpen(true)
  }

  // Prefills a NEW resource's form from an existing one (create mode, not
  // edit) - same pattern as services' handleDuplicateService.
  const handleDuplicateResource = (resource: Resource) => {
    setEditingResource(null)
    setTargetBusinessId(currentBusiness?.id || '')
    setDuplicateSourceId(resource.id)
    setResourceForm({
      name: `${resource.name}${t.services.duplicateSuffix}`,
      description: resource.description || '',
      type: resource.type as 'room' | 'person' | 'equipment' | 'virtual',
      color: resource.color || RESOURCE_COLORS[0],
      isActive: resource.is_active,
    })
    setSaveError('')
    setIsResourceModalOpen(true)
  }

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaveError('')
    setSaving(true)
    try {
      const resourceData = {
        name: resourceForm.name,
        description: resourceForm.description || null,
        type: resourceForm.type,
        color: resourceForm.color,
        is_active: resourceForm.isActive,
      }

      if (editingResource) {
        const { error } = await supabase
          .from('resources')
          .update(resourceData)
          .eq('id', editingResource.id)

        if (error) throw error
      } else {
        // Duplicate tracking (scripts/054) - same reuse-or-mint logic as
        // services/page.tsx's saveService.
        let duplicateGroupId: string | undefined
        if (duplicateSourceId) {
          const source = resources.find((r) => r.id === duplicateSourceId)
          duplicateGroupId = source?.duplicate_group_id || crypto.randomUUID()
          if (source && !source.duplicate_group_id) {
            await supabase.from('resources').update({ duplicate_group_id: duplicateGroupId }).eq('id', duplicateSourceId)
          }
        }
        const { error } = await supabase
          .from('resources')
          .insert({ ...resourceData, business_id: targetBusinessId || currentBusiness.id, duplicate_group_id: duplicateGroupId ?? null })

        if (error) throw error
      }
      await refetchServicesAndResources()
      setIsResourceModalOpen(false)
      setDuplicateSourceId(null)
      toast.success(editingResource ? t.services.resourceUpdateSuccess : t.services.resourceCreateSuccess)
    } catch (err: any) {
      console.error('[v0] Error saving resource:', err)
      // PLN04 = free-plan resource limit trigger (scripts/048) - only
      // reachable here as a race-condition backstop, since
      // handleNewResourceClick already checks this before the form opens.
      if (err?.code === 'PLN04') {
        setIsResourceModalOpen(false)
        setShowUpgradeModal(true)
      } else {
        setSaveError(t.saveError)
        toast.error(t.saveError)
      }
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
      <PageHeader
        title={t.services.resourcesTab}
        subtitle={t.services.resourcesExplainer}
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.services.searchResources}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        }
        actions={
          <Button onClick={handleNewResourceClick} className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            {t.services.newResource}
          </Button>
        }
      />

      {/* Resources Grid */}
      {filteredResources.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Building className="h-10 w-10 text-muted-foreground/50" />
          {resources.length === 0 ? (
            <>
              <div>
                <p className="font-medium text-foreground">{t.services.resourceEmptyStateTitle}</p>
                <p className="text-sm text-muted-foreground">{t.services.resourceEmptyStateDesc}</p>
              </div>
              <Button onClick={handleNewResourceClick} className="gap-2">
                <Plus className="h-4 w-4" />
                {t.services.newResource}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t.services.notFoundResources}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredResources.map((resource) => {
            const Icon = getResourceIcon(resource.type)
            const linkedCount = serviceResources.filter((sr) => sr.resource_id === resource.id).length
            const resourceColor = resource.color || '#3B82F6'
            return (
              <Card
                key={resource.id}
                className={cn(
                  'flex h-full cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md',
                  !resource.is_active && 'opacity-70'
                )}
                onClick={() => handleOpenResourceModal(resource)}
              >
                <div className="h-1.5 w-full" style={{ backgroundColor: resourceColor }} />
                <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${resourceColor}20`, color: resourceColor }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-foreground">{resource.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {getResourceTypeLabel(resource.type, t.services)}
                          </p>
                          {resource.duplicate_group_id && duplicateSiblings[resource.duplicate_group_id]?.length > 0 && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">{t.services.alsoAtLabel}</span>
                              {duplicateSiblings[resource.duplicate_group_id].map((businessId) => (
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
                          <DropdownMenuItem onClick={() => handleOpenResourceModal(resource)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t.services.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicateResource(resource)}>
                            <Copy className="mr-2 h-4 w-4" />
                            {t.services.duplicate}
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
                    </div>
                    {resource.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{resource.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {linkedCount > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {linkedCount}{' '}
                        {linkedCount === 1
                          ? t.services.resourceLinkedServiceSingular
                          : t.services.resourceLinkedServicesPlural}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <Switch
                      checked={resource.is_active}
                      disabled={togglingResourceId === resource.id}
                      onCheckedChange={() => handleQuickToggleActive(resource)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={resource.is_active ? t.services.active : t.services.inactive}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

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
            {!editingResource && hasMultipleSedes && (
              <div className="space-y-2">
                <Label htmlFor="resource-sede">{t.services.sedeLabel}</Label>
                <Select value={targetBusinessId} onValueChange={setTargetBusinessId}>
                  <SelectTrigger id="resource-sede">
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
              </div>
            )}
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
              <div className="flex flex-wrap gap-2">
                {RESOURCE_COLORS.map((color) => (
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
                {/* 9th swatch: native color input, same pattern as
                    services/page.tsx's color picker. */}
                <label
                  className={cn(
                    'relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 transition-transform',
                    !RESOURCE_COLORS.includes(resourceForm.color)
                      ? 'scale-110 border-foreground'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{
                    background: !RESOURCE_COLORS.includes(resourceForm.color)
                      ? resourceForm.color
                      : 'conic-gradient(from 0deg, #EF4444, #F59E0B, #84CC16, #10B981, #06B6D4, #3B82F6, #8B5CF6, #EC4899, #EF4444)',
                  }}
                  title={t.services.customColorLabel}
                >
                  {RESOURCE_COLORS.includes(resourceForm.color) && (
                    <Palette className="h-3.5 w-3.5 text-white drop-shadow" />
                  )}
                  <input
                    type="color"
                    value={RESOURCE_COLORS.includes(resourceForm.color) ? '#3B82F6' : resourceForm.color}
                    onChange={(e) => setResourceForm({ ...resourceForm, color: e.target.value })}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t.services.customColorLabel}
                  />
                </label>
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

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

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

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={t.upgradeModal.featureUnlimitedRecordsTitle}
      />
    </div>
  )
}
