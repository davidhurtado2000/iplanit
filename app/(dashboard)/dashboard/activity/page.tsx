'use client'

import { useEffect, useState } from 'react'
import { Briefcase, Users, Layers, Building2, Clock, UserPlus, UserCog, History, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage, type Translations } from '@/context/language-context'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type EntityType = 'service' | 'client' | 'resource' | 'business' | 'business_hours' | 'staff' | 'worker'
type ActivityAction = 'created' | 'updated' | 'deleted'
type EntityFilter = 'all' | EntityType

interface ActivityItem {
  id: string
  action: ActivityAction
  entity_type: EntityType
  entity_label: string
  actor_name: string
  created_at: string
}

const PAGE_SIZE = 20

const ENTITY_ICON: Record<EntityType, typeof Briefcase> = {
  service: Briefcase,
  client: Users,
  resource: Layers,
  business: Building2,
  business_hours: Clock,
  staff: UserPlus,
  worker: UserCog,
}

function describeActivity(item: ActivityItem, t: Translations): string {
  const name = item.entity_label
  const key = `${item.entity_type}:${item.action}`
  switch (key) {
    case 'service:created': return t.activity.tmplServiceCreated.replace('{name}', name)
    case 'service:updated': return t.activity.tmplServiceUpdated.replace('{name}', name)
    case 'service:deleted': return t.activity.tmplServiceDeleted.replace('{name}', name)
    case 'client:created': return t.activity.tmplClientCreated.replace('{name}', name)
    case 'client:updated': return t.activity.tmplClientUpdated.replace('{name}', name)
    case 'client:deleted': return t.activity.tmplClientDeleted.replace('{name}', name)
    case 'resource:created': return t.activity.tmplResourceCreated.replace('{name}', name)
    case 'resource:updated': return t.activity.tmplResourceUpdated.replace('{name}', name)
    case 'resource:deleted': return t.activity.tmplResourceDeleted.replace('{name}', name)
    case 'business:updated': return t.activity.tmplBusinessUpdated
    case 'business_hours:updated': return t.activity.tmplBusinessHoursUpdated
    case 'staff:created': return t.activity.tmplStaffCreated.replace('{name}', name)
    case 'staff:updated': return t.activity.tmplStaffUpdated.replace('{name}', name)
    case 'staff:deleted': return t.activity.tmplStaffDeleted.replace('{name}', name)
    case 'worker:created': return t.activity.tmplWorkerCreated.replace('{name}', name)
    case 'worker:updated': return t.activity.tmplWorkerUpdated.replace('{name}', name)
    case 'worker:deleted': return t.activity.tmplWorkerDeleted.replace('{name}', name)
    default: return ''
  }
}

export default function ActivityPage() {
  const { t, locale } = useLanguage()
  const { currentBusiness } = useBusinesses()
  const supabase = createClient()

  const [filter, setFilter] = useState<EntityFilter>('all')
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [loadError, setLoadError] = useState(false)

  const loadPage = async (targetPage: number) => {
    if (!currentBusiness) return
    targetPage === 0 ? setLoading(true) : setLoadingMore(true)
    setLoadError(false)
    try {
      let query = supabase
        .from('activity_log')
        .select('id, action, entity_type, entity_label, actor_name, created_at')
        .eq('business_id', currentBusiness.id)
        .order('created_at', { ascending: false })
        .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE - 1)
      if (filter !== 'all') query = query.eq('entity_type', filter)

      const { data, error } = await query
      if (error) {
        // Most likely cause: scripts/056-activity-log.sql hasn't been run
        // yet - surface that instead of silently rendering the same empty
        // state as "genuinely no activity yet".
        console.error('[iplanit] Error loading activity log:', error)
        setLoadError(true)
        if (targetPage === 0) setItems([])
        setHasMore(false)
        return
      }
      const rows = (data || []) as ActivityItem[]
      setItems((prev) => (targetPage === 0 ? rows : [...prev, ...rows]))
      setHasMore(rows.length === PAGE_SIZE)
      setPage(targetPage)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    setItems([])
    setHasMore(true)
    loadPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBusiness?.id, filter])

  const filters: { value: EntityFilter; label: string }[] = [
    { value: 'all', label: t.activity.filterAll },
    { value: 'service', label: t.activity.entityService },
    { value: 'client', label: t.activity.entityClient },
    { value: 'resource', label: t.activity.entityResource },
    { value: 'business', label: t.activity.entityBusiness },
    { value: 'business_hours', label: t.activity.entityBusinessHours },
    { value: 'staff', label: t.activity.entityStaff },
    { value: 'worker', label: t.activity.entityWorker },
  ]

  if (currentBusiness && currentBusiness.role !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.activity.accessRestricted}</h2>
        <p className="mt-2 text-muted-foreground">{t.activity.accessRestrictedDesc}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t.activity.title}</h1>
        <p className="text-muted-foreground">{t.activity.pageSubtitle}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="activity-filter" className="text-sm text-muted-foreground">
            {t.activity.filterLabel}
          </Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as EntityFilter)}>
            <SelectTrigger id="activity-filter" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/40 py-16 text-center">
            <History className="h-8 w-8 text-destructive/60" />
            <p className="text-sm text-destructive">{t.activity.loadError}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
            <History className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t.activity.empty}</p>
          </div>
        ) : (
          <>
            <div className="divide-y rounded-lg border">
              {items.map((item) => {
                const Icon = ENTITY_ICON[item.entity_type]
                return (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        item.action === 'deleted'
                          ? 'text-destructive'
                          : item.action === 'created'
                            ? 'text-primary'
                            : 'text-muted-foreground'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{item.actor_name || t.activity.unknownActor}</span>{' '}
                        {describeActivity(item, t)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => loadPage(page + 1)}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t.activity.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
