'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CalendarViewComponent, VISIT_BLOCK_COLOR } from '@/components/dashboard/calendar-view'
import { ReservationModal } from '@/components/dashboard/reservation-modal'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { useDashboardData } from '@/context/dashboard-data-context'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { capitalizeFirst } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { CalendarView } from '@/lib/types'
import { Plus, CalendarDays, CalendarRange, Calendar as CalendarIcon, Clock, ChevronDown, Building2, List, Eye, Loader2 } from 'lucide-react'

interface Reservation {
  id: string
  business_id: string
  client_id: string
  service_id: string | null
  resource_id: string | null
  series_id: string | null
  start_time: string
  end_time: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show'
  type: 'booking' | 'visit'
  notes: string | null
  created_at: string
}

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
}

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  color: string
}

interface Resource {
  id: string
  business_id: string
  name: string
  type: 'room' | 'person' | 'equipment' | 'virtual' | 'parking'
  color: string
}

interface BusinessHour {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

const supabase = createClient()

const VIEW_CONFIG: { value: CalendarView; icon: React.ElementType }[] = [
  { value: 'day', icon: CalendarDays },
  { value: 'week', icon: CalendarRange },
  { value: 'month', icon: CalendarIcon },
  { value: 'list', icon: List },
]

// Split out from the default export so useSearchParams() (needed to read
// ?date= from a notification click) has the Suspense boundary Next.js
// requires around it - without this, `next build` fails outright rather
// than just warning ("useSearchParams() should be wrapped in a suspense
// boundary"), since it opts the page out of static prerendering.
function CalendarPageInner() {
  const { currentBusiness, businesses, switchBusiness } = useBusinesses()
  const { t, locale } = useLanguage()
  // ?date=YYYY-MM-DD - set when arriving from a notification click
  // (notification-bell.tsx / notifications/page.tsx) so the calendar opens
  // straight on that reservation's day instead of always defaulting to
  // today. Noon UTC avoids the date shifting a day off near midnight in
  // timezones behind/ahead of UTC (same trick already used in
  // reservation-modal.tsx for the same reason).
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date')
  const initialDate = useMemo(() => (dateParam ? new Date(`${dateParam}T12:00:00Z`) : undefined), [dateParam])
  const {
    reservations,
    clients,
    services,
    resources: allResources,
    calendarStartHour,
    calendarEndHour,
    businessHours,
    loading,
    loadingMoreReservations,
    refetchReservations,
    ensureReservationsInRange,
  } = useDashboardData()
  // Parking spots are a resource type but are never the "main" resource a
  // reservation is scheduled against (see needsParking/parking_resource_id
  // in reservation-modal.tsx) - showing them as calendar columns would just
  // be an always-empty column, since no reservation ever sets resource_id
  // to a parking spot.
  const resources = allResources.filter((r) => r.type !== 'parking')

  // "Vista expandida" (scripts/053-organizations-and-sedes.sql) - optional,
  // off by default, same on/off pattern as Analytics' "todas las sedes"
  // toggle. Only ever visible for orgs with >1 sede, which already implies
  // Premium (multi-sede itself is Premium-gated at creation).
  const orgBusinessIds = useMemo(
    () => businesses.filter((b) => b.organization_id === currentBusiness?.organization_id).map((b) => b.id),
    [businesses, currentBusiness?.organization_id]
  )
  const hasMultipleSedes = orgBusinessIds.length > 1
  const [expandedMode, setExpandedMode] = useState(false)
  const [visibleRange, setVisibleRange] = useState<{ from: Date; to: Date } | null>(null)
  const [orgData, setOrgData] = useState<{
    reservations: Reservation[]
    resources: Resource[]
    services: Service[]
    clients: Client[]
  } | null>(null)

  const businessNameById = useMemo(
    () => Object.fromEntries(businesses.filter((b) => orgBusinessIds.includes(b.id)).map((b) => [b.id, b.name])),
    [businesses, orgBusinessIds]
  )
  // Stable index per sede (position in orgBusinessIds) - calendar-view.tsx
  // owns the actual tint palette, this just decides which sede gets which
  // slot, consistently across Day/Week/Month/List.
  const businessColorIndexById = useMemo(
    () => Object.fromEntries(orgBusinessIds.map((id, i) => [id, i])),
    [orgBusinessIds]
  )

  const [isLoadingOrgData, setIsLoadingOrgData] = useState(false)
  // Remembers which (sedes, date range, org) the currently-loaded orgData
  // covers, so toggling "vista expandida" off and back on re-uses it
  // instantly instead of re-running all 4 queries every single click -
  // that repeated round trip is what was actually making the toggle feel
  // slow, not the sede-color rendering. orgData itself is intentionally
  // left in place when toggled off (not cleared) - isExpanded already
  // falls back to single-sede data via the expandedMode check, so stale
  // cached org data sitting unused in memory is harmless.
  const orgDataKeyRef = useRef<string | null>(null)
  // Guards against an in-flight fetch overwriting orgData with stale
  // results after a NEWER fetch (e.g. a forced refresh right after saving
  // a reservation) has already started - only the most recently started
  // call is allowed to apply its result.
  const orgDataRequestIdRef = useRef(0)

  // force=true bypasses the cache-key check below - used right after saving
  // a reservation (see handleReservationSaved), since editing/creating one
  // doesn't otherwise change (sedes, date range, org) and so would
  // otherwise never re-trigger a fetch, leaving orgData stale until the
  // user navigates dates or toggles the business.
  const fetchOrgData = useCallback(async (force = false) => {
    if (!expandedMode || !hasMultipleSedes || !currentBusiness || !visibleRange) return

    const key = `${orgBusinessIds.join(',')}|${visibleRange.from.toISOString()}|${visibleRange.to.toISOString()}|${currentBusiness.organization_id}`
    if (!force && orgDataKeyRef.current === key) return

    const requestId = ++orgDataRequestIdRef.current
    setIsLoadingOrgData(true)
    const [{ data: res }, { data: rsc }, { data: svc }, { data: cli }] = await Promise.all([
      supabase
        .from('reservations')
        .select('*')
        .in('business_id', orgBusinessIds)
        .gte('start_time', visibleRange.from.toISOString())
        .lte('start_time', visibleRange.to.toISOString()),
      supabase.from('resources').select('*').in('business_id', orgBusinessIds).neq('type', 'parking'),
      supabase.from('services').select('*').in('business_id', orgBusinessIds),
      supabase.from('clients').select('*').eq('organization_id', currentBusiness.organization_id),
    ])
    if (requestId === orgDataRequestIdRef.current) {
      // Grouped by sede (in the same order as orgBusinessIds, which
      // mirrors the sidebar switcher) so DayView's column-grouping into
      // one spanning header per sede sees each sede's resources as a
      // single contiguous run, not fragments interleaved with another
      // sede's - Postgres/Supabase gives no ordering guarantee otherwise.
      const sortByBusiness = (a: { business_id: string }, b: { business_id: string }) =>
        orgBusinessIds.indexOf(a.business_id) - orgBusinessIds.indexOf(b.business_id)
      orgDataKeyRef.current = key
      setOrgData({
        reservations: (res || []) as Reservation[],
        resources: ((rsc || []) as Resource[]).sort(sortByBusiness),
        services: (svc || []) as Service[],
        clients: (cli || []) as Client[],
      })
      setIsLoadingOrgData(false)
    }
    // else: a newer call already landed (or is about to) - let that one be
    // the one that clears the loading state and updates orgData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedMode, hasMultipleSedes, orgBusinessIds.join(','), visibleRange, currentBusiness?.organization_id])

  useEffect(() => {
    fetchOrgData()
  }, [fetchOrgData])

  const [view, setView] = useState<CalendarView>('day')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [modalInitialType, setModalInitialType] = useState<'booking' | 'visit'>('booking')
  const [followUpPrefill, setFollowUpPrefill] = useState<{
    clientId: string
    serviceId: string | null
    reservationId: string
  } | null>(null)
  // Set when a reservation is created by clicking (or mouse-dragging) an
  // empty slot in DayView's grid (see handleCreateAtSlot) - resourceId and
  // the exact clicked/dragged time(s) are handed to the modal as
  // prefills/hints, the date drives which day the modal's own slot picker
  // opens on. endHint is only set for a real drag.
  const [createPrefill, setCreatePrefill] = useState<{
    resourceId: string | null
    startHint: string
    endHint?: string
    date: string
  } | null>(null)

  // Build view options with translated labels
  const VIEW_OPTIONS = VIEW_CONFIG.map(({ value, icon }) => ({
    value,
    icon,
    label: t.calendar[value as 'day' | 'week' | 'month' | 'list'],
  }))

  const handleCreateReservation = () => {
    setSelectedReservation(null)
    setModalMode('create')
    setModalInitialType('booking')
    setFollowUpPrefill(null)
    setCreatePrefill(null)
    setIsModalOpen(true)
  }

  const handleCreateVisit = () => {
    setSelectedReservation(null)
    setModalMode('create')
    setModalInitialType('visit')
    setFollowUpPrefill(null)
    setCreatePrefill(null)
    setIsModalOpen(true)
  }

  // Clicking (or mouse-dragging) an empty slot in DayView's grid
  // (calendar-view.tsx) - resourceId is null for the "no resource"
  // fallback column. Only ever fires for a slot DayView already confirmed
  // is inside business hours and not in the past (see its own handlers) -
  // this just wires that into the same create flow as the toolbar buttons,
  // always as a booking (a click/drag on the grid is unambiguous "book
  // this", unlike a visit, which stays an explicit button since it's the
  // less common case). A drag's end time still gets passed through as
  // endHint even though the type defaults to booking - it prefills the
  // form's visitDurationMinutes regardless, so it's already there and
  // correct if the user switches to "Visita" inside the modal, harmless
  // otherwise since that field goes unused for a real booking.
  const handleCreateAtSlot = (resourceId: string | null, dateTimeLocal: string, endDateTimeLocal?: string) => {
    // In vista expandida, a clicked column can belong to a sede other than
    // the currently active one - same switch-first reasoning as
    // handleSelectReservation, so the reservation actually gets created
    // under the sede the user visibly clicked into, not whichever one
    // happened to be active.
    const clickedBusinessId = resourceId ? resourcesMap[resourceId]?.business_id : undefined
    if (clickedBusinessId && clickedBusinessId !== currentBusiness?.id) {
      switchBusiness(clickedBusinessId)
    }
    setSelectedReservation(null)
    setModalMode('create')
    setModalInitialType('booking')
    setFollowUpPrefill(null)
    setCreatePrefill({ resourceId, startHint: dateTimeLocal, endHint: endDateTimeLocal, date: dateTimeLocal.split('T')[0] })
    setIsModalOpen(true)
  }

  const handleSelectReservation = (reservation: Reservation) => {
    // In vista expandida, a clicked block can belong to a sede other than
    // the currently active one - switching first (same mechanism the
    // sidebar switcher itself uses) means the modal, which reads
    // everything from currentBusiness via useDashboardData()/useBusinesses(),
    // opens already looking at the right sede's own data. Deliberately not
    // threading a business override through the modal itself - see plan.
    if (reservation.business_id !== currentBusiness?.id) {
      switchBusiness(reservation.business_id)
    }
    setSelectedReservation(reservation)
    setModalMode('view')
    setFollowUpPrefill(null)
    setCreatePrefill(null)
    setIsModalOpen(true)
  }

  // Switches the already-open modal from viewing the visit straight into a
  // prefilled create form - no close/reopen needed, same Dialog instance.
  const handleCreateFollowUp = (source: { clientId: string; serviceId: string | null; reservationId: string }) => {
    setSelectedReservation(null)
    setModalMode('create')
    setModalInitialType('booking')
    setFollowUpPrefill(source)
    setCreatePrefill(null)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedReservation(null)
    setFollowUpPrefill(null)
    setCreatePrefill(null)
  }

  const handleVisibleRangeChange = useCallback(
    (from: Date, to: Date) => {
      ensureReservationsInRange(from, to)
      setVisibleRange({ from, to })
    },
    [ensureReservationsInRange]
  )

  // Fires after any create/edit/status-change/cancel saved through the
  // modal. refetchReservations covers the single-sede view; orgData
  // (vista expandida) is a separate cache that a save wouldn't otherwise
  // invalidate (same sedes/range/org as before), so it'd silently keep
  // showing pre-save data until the user navigated dates or re-toggled -
  // force-refreshing it here closes that gap. The force fetch is a no-op
  // if vista expandida isn't even on (fetchOrgData's own guard).
  const handleReservationSaved = () => {
    refetchReservations()
    fetchOrgData(true)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!currentBusiness) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.calendar.setupRequired}</h2>
        <p className="mt-2 text-muted-foreground">{t.calendar.setupRequiredDesc}</p>
      </div>
    )
  }

  // Swaps every downstream read to the org-wide data in one place when
  // vista expandida is on - same single-swap-point pattern as Analytics'
  // "todas las sedes" toggle.
  const isExpanded = expandedMode && hasMultipleSedes && orgData !== null
  const effectiveReservations = isExpanded ? orgData!.reservations : reservations
  const effectiveResources = isExpanded ? orgData!.resources : resources
  const effectiveServices = isExpanded ? orgData!.services : services
  const effectiveClients = isExpanded ? orgData!.clients : clients

  // Build lookup maps for display
  const clientsMap = Object.fromEntries(effectiveClients.map((c) => [c.id, c]))
  const servicesMap = Object.fromEntries(effectiveServices.map((s) => [s.id, s]))
  const resourcesMap = Object.fromEntries(effectiveResources.map((r) => [r.id, r]))

  // Use the business timezone so "today" is correct regardless of UTC offset
  const tz = currentBusiness?.timezone || 'America/Lima'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const todayReservations = effectiveReservations.filter((r) => {
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.start_time))
    return localDate === today && r.status !== 'cancelled'
  })

  const currentViewOption = VIEW_OPTIONS.find((v) => v.value === view)

  return (
    <div className="space-y-4 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t.calendar.title}</h1>
          <p className="text-sm text-muted-foreground">{t.calendar.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                {currentViewOption && <currentViewOption.icon className="h-4 w-4" />}
                <span className="hidden xs:inline">{t.calendar.view}</span> {currentViewOption?.label}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {VIEW_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setView(option.value)}
                  className="gap-2"
                >
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleCreateReservation} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t.calendar.newReservation}</span>
            <span className="sm:hidden">{t.calendar.newShort}</span>
          </Button>
          <Button onClick={handleCreateVisit} size="sm" variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t.calendar.newVisit}</span>
            <span className="sm:hidden">{t.calendar.newVisitShort}</span>
          </Button>
        </div>
      </div>

      {hasMultipleSedes && (
        <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={expandedMode} onCheckedChange={setExpandedMode} id="expanded-mode-toggle" />
            <label htmlFor="expanded-mode-toggle" className="cursor-pointer text-sm font-medium">
              {t.calendar.expandedModeLabel}
            </label>
            {isLoadingOrgData && !isExpanded && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          {expandedMode && <p className="text-xs text-muted-foreground">{t.calendar.expandedModeHint}</p>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:gap-6">
        {/* Calendar */}
        {/* min-w-0 is required here: a CSS grid item defaults to
            min-width:auto, so without it, DayView's own wide content
            (more resources = more 160px columns) forces this whole grid
            item - and the entire page - to grow wider instead of letting
            the calendar's own overflow-auto handle the extra width. */}
        <div className="relative min-w-0">
          {loadingMoreReservations && (
            <div className="absolute right-2 top-2 z-10 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
              {t.calendar.loadingMore}
            </div>
          )}
          <CalendarViewComponent
            view={view}
            onSelectReservation={handleSelectReservation}
            onCreateAtSlot={handleCreateAtSlot}
            onViewChange={setView}
            reservations={effectiveReservations}
            resources={effectiveResources}
            clientsMap={clientsMap}
            servicesMap={servicesMap}
            resourcesMap={resourcesMap}
            startHour={calendarStartHour}
            endHour={calendarEndHour}
            timezone={tz}
            onVisibleRangeChange={handleVisibleRangeChange}
            businessNameById={isExpanded ? businessNameById : undefined}
            businessColorIndexById={isExpanded ? businessColorIndexById : undefined}
            businessHours={businessHours}
            initialDate={initialDate}
          />
        </div>

        {/* Sidebar - Today's Schedule */}
        <div className="order-first space-y-4 lg:order-last">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t.calendar.today}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {capitalizeFirst(
                  new Date().toLocaleDateString(locale, {
                    timeZone: tz,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                )}
              </p>
            </CardHeader>
            <CardContent className="pb-3">
              {todayReservations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">{t.calendar.noReservationsToday}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {todayReservations.map((reservation) => {
                    const client = clientsMap[reservation.client_id]
                    const service = reservation.service_id ? servicesMap[reservation.service_id] : undefined
                    const isVisit = reservation.type === 'visit'
                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        className="w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50"
                        onClick={() => handleSelectReservation(reservation)}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className="mt-0.5 w-1 self-stretch min-h-[40px] rounded-full"
                            style={{ backgroundColor: isVisit ? VISIT_BLOCK_COLOR : service?.color ?? 'hsl(var(--primary))' }}
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="flex items-center gap-1 text-sm font-medium truncate">
                                {isVisit && <Eye className="h-3 w-3 shrink-0" />}
                                {client?.name ?? t.calendar.unknownClient}
                              </p>
                              <StatusBadge status={reservation.status} labels={t.reservation} className="h-4 shrink-0 px-1.5 text-[9px]" />
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {service
                                ? `${isVisit ? `${t.calendar.interestedInShortLabel} ` : ''}${service.name}`
                                : isVisit
                                  ? t.reservation.noServiceVisit
                                  : t.calendar.unknownService}
                            </p>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(reservation.start_time).toLocaleTimeString(locale, {
                                timeZone: tz,
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {reservation.end_time && (
                                <>
                                  {' – '}
                                  {new Date(reservation.end_time).toLocaleTimeString(locale, {
                                    timeZone: tz,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReservationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        reservation={selectedReservation}
        selectedDate={createPrefill?.date || today}
        mode={modalMode}
        onSave={handleReservationSaved}
        initialType={modalInitialType}
        prefillClientId={followUpPrefill?.clientId}
        prefillServiceId={followUpPrefill?.serviceId}
        followUpOfReservationId={followUpPrefill?.reservationId}
        onCreateFollowUp={handleCreateFollowUp}
        prefillResourceId={createPrefill?.resourceId ?? undefined}
        prefillStartHint={createPrefill?.startHint}
        prefillEndHint={createPrefill?.endHint}
      />
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  )
}
