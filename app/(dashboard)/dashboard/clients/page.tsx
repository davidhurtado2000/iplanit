'use client'

import React from "react"

import { useState, useMemo, useEffect, useRef, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBusinesses } from '@/hooks/use-businesses'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type Reservation } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { cn } from '@/lib/utils'
import { sedeAbbr, sedeTint, buildBusinessColorIndex } from '@/lib/sede-colors'
import { countryDateLocale } from '@/lib/date-format'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  Mail,
  Phone,
  Calendar,
  Users,
  UserX,
  FileText,
  History,
  Loader2,
  Building2,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Download,
  Upload,
  Check,
  HelpCircle,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PremiumButton } from '@/components/premium-feature'
import { HeroKpiCard } from '@/components/dashboard/hero-kpi-card'
import { UpgradeModal } from '@/components/upgrade-modal'
import { isPlanLimitReached } from '@/lib/plan-limits'
import { toCsv, downloadCsv, parseCsv } from '@/lib/csv'

const AVATAR_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EF4444',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
]

function getAvatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function getWhatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length <= 9 ? `51${digits}` : digits
  return `https://wa.me/${withCountry}`
}

const INACTIVE_DAYS_THRESHOLD = 60

type SortKey = 'name' | 'reservations' | 'last_visit'
type SortDir = 'asc' | 'desc'

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />
  return dir === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
}

type ClientDocumentType = 'dni' | 'ruc' | 'ein' | 'passport' | 'other'

interface Client {
  id: string
  business_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  document_type: ClientDocumentType | null
  document_number: string | null
}

const DOCUMENT_TYPES: ClientDocumentType[] = ['dni', 'ruc', 'ein', 'passport', 'other']

interface ImportedClientRow {
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  document_type: ClientDocumentType | null
  document_number: string | null
}

type ImportField = 'name' | 'email' | 'phone' | 'documentType' | 'documentNumber' | 'notes'

// Lowercased, accent-stripped header names a client is likely to use when
// exporting their existing list from Excel/Sheets/another CRM - matched
// against normalizeHeader() output, not the raw file text.
const IMPORT_HEADER_ALIASES: Record<ImportField, string[]> = {
  name: ['nombre', 'nombre completo', 'name', 'full name', 'cliente'],
  email: ['email', 'correo', 'correo electronico', 'e-mail'],
  phone: ['telefono', 'phone', 'celular', 'whatsapp'],
  documentType: ['tipo de documento', 'tipo documento', 'document type'],
  documentNumber: ['documento', 'numero de documento', 'nro documento', 'document number', 'dni', 'ruc'],
  notes: ['notas', 'notes', 'observaciones', 'comentarios'],
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function mapCsvHeaders(header: string[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {}
  header.forEach((raw, idx) => {
    const h = normalizeHeader(raw)
    ;(Object.keys(IMPORT_HEADER_ALIASES) as ImportField[]).forEach((key) => {
      if (map[key] === undefined && IMPORT_HEADER_ALIASES[key].includes(h)) {
        map[key] = idx
      }
    })
  })
  return map
}

export default function ClientsPage() {
  const { currentBusiness, businesses } = useBusinesses()
  const { profile } = useAuth()
  const { t, locale } = useLanguage()
  const { clients, services, loading, refetchClients } = useDashboardData()
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const supabase = createClient()
  const PAGE_SIZE = 10

  const [isImportOpen, setIsImportOpen] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [importPreview, setImportPreview] = useState<{
    rows: ImportedClientRow[]
    duplicates: number
    invalid: number
    fileName: string
  } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null)
  const [importError, setImportError] = useState('')
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const documentTypeLabels: Record<ClientDocumentType, string> = {
    dni: t.clients.documentTypeDni,
    ruc: t.clients.documentTypeRuc,
    ein: t.clients.documentTypeEin,
    passport: t.clients.documentTypePassport,
    other: t.clients.documentTypeOther,
  }
  // Just the default selection for a new client - the dropdown still lets
  // the user pick any type regardless of the business's own country (a
  // Peru business can have a foreign client with a passport, and vice versa).
  const defaultDocumentType: ClientDocumentType = currentBusiness?.country === 'US' ? 'ein' : 'dni'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    documentType: defaultDocumentType as ClientDocumentType,
    documentNumber: '',
  })

  // Clients are now shared org-wide (organization_id, scripts/053) - when
  // the account has more than one sede, tag each row with its sede of
  // origin (client.business_id, provenance only) so it's clear where a
  // shared client first came from without implying it "belongs" only there.
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

  // Reservation counts per client (all-time) come from a small aggregate
  // query against the client_reservation_counts view, not by filtering the
  // shared reservations array - that array only holds a ±90 day window (see
  // dashboard-data-context.tsx), which would silently under-count a
  // long-time client's real history.
  const [reservationCounts, setReservationCounts] = useState<
    Map<
      string,
      {
        reservation_count: number
        confirmed_count: number
        no_show_count: number
        late_cancellation_count: number
        last_reservation_at: string | null
      }
    >
  >(new Map())

  useEffect(() => {
    if (!currentBusiness) return
    const loadCounts = async () => {
      const { data } = await supabase
        .from('client_reservation_counts')
        .select('client_id, reservation_count, confirmed_count, no_show_count, late_cancellation_count, last_reservation_at')
        .eq('business_id', currentBusiness.id)
      setReservationCounts(
        new Map(
          (data || []).map((row: any) => [
            row.client_id,
            {
              reservation_count: row.reservation_count,
              confirmed_count: row.confirmed_count,
              no_show_count: row.no_show_count,
              late_cancellation_count: row.late_cancellation_count,
              last_reservation_at: row.last_reservation_at,
            },
          ])
        )
      )
    }
    loadCounts()
  }, [currentBusiness?.id])

  const [sortKey, setSortKey] = useState<SortKey>('last_visit')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  // Selected client's recent reservations, fetched on demand when the
  // detail modal opens rather than derived from the shared (bounded) array.
  const [clientHistory, setClientHistory] = useState<Reservation[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (!selectedClient || !isDetailOpen) {
      setClientHistory([])
      return
    }
    const loadHistory = async () => {
      setLoadingHistory(true)
      try {
        const { data } = await supabase
          .from('reservations')
          .select('*')
          .eq('client_id', selectedClient.id)
          .order('start_time', { ascending: false })
          .limit(5)
        setClientHistory(data || [])
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [selectedClient?.id, isDetailOpen])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.document_number && c.document_number.toLowerCase().includes(q))
    )
  }, [clients, searchQuery])

  const sortedClients = useMemo(() => {
    const arr = [...filteredClients]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortKey === 'reservations') {
        const ac = reservationCounts.get(a.id)?.reservation_count ?? 0
        const bc = reservationCounts.get(b.id)?.reservation_count ?? 0
        cmp = ac - bc
      } else {
        const at = reservationCounts.get(a.id)?.last_reservation_at
        const bt = reservationCounts.get(b.id)?.last_reservation_at
        const an = at ? new Date(at).getTime() : -Infinity
        const bn = bt ? new Date(bt).getTime() : -Infinity
        cmp = an - bn
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filteredClients, reservationCounts, sortKey, sortDir])

  // Exports whatever the current search filter shows (sortedClients), not
  // the full unfiltered list - matches what the owner is actually looking
  // at on screen.
  const handleExportCsv = () => {
    const csv = toCsv(sortedClients, [
      { label: t.clients.fullName, value: (c) => c.name },
      { label: t.clients.emailLabel, value: (c) => c.email },
      { label: t.clients.phoneLabel, value: (c) => c.phone },
      { label: t.clients.documentTypeLabel, value: (c) => (c.document_type ? documentTypeLabels[c.document_type] : '') },
      { label: t.clients.documentNumberLabel, value: (c) => c.document_number },
      { label: t.clients.reservationsCol, value: (c) => reservationCounts.get(c.id)?.reservation_count ?? 0 },
      {
        label: t.clients.lastVisitCol,
        value: (c) => {
          const lastVisit = reservationCounts.get(c.id)?.last_reservation_at
          return lastVisit ? new Date(lastVisit).toLocaleDateString(countryDateLocale(currentBusiness?.country)) : ''
        },
      },
    ])
    downloadCsv(`clientes-${currentBusiness?.slug || 'negocio'}.csv`, csv)
  }

  const closeImportModal = () => {
    setIsImportOpen(false)
    setImportPreview(null)
    setImportError('')
    setImportSuccessCount(null)
  }

  // Parses the file client-side, matches recognized headers by alias, and
  // dedupes against both the already-loaded client list (by email/phone,
  // same match order as create_public_reservation's own dedup) and other
  // rows within the same file - nothing is written to the DB until the user
  // reviews the preview and confirms.
  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    setImportSuccessCount(null)
    try {
      const allRows = parseCsv(await file.text())
      if (allRows.length < 2) {
        setImportError(t.clients.importEmptyFile)
        return
      }
      const [header, ...dataRows] = allRows
      const colMap = mapCsvHeaders(header)
      if (colMap.name === undefined) {
        setImportError(t.clients.importNoNameColumn)
        return
      }

      const existingEmails = new Set(clients.filter((c) => c.email).map((c) => c.email!.trim().toLowerCase()))
      const existingPhones = new Set(clients.filter((c) => c.phone).map((c) => c.phone!.trim()))
      const seenInFile = new Set<string>()

      const rows: ImportedClientRow[] = []
      let duplicates = 0
      let invalid = 0

      for (const row of dataRows) {
        const get = (key: ImportField) => {
          const idx = colMap[key]
          return idx !== undefined ? (row[idx] || '').trim() : ''
        }
        const name = get('name')
        const email = get('email')
        const phone = get('phone')
        if (!name || (!email && !phone)) {
          invalid++
          continue
        }

        const dedupeKey = email.toLowerCase() || phone
        if ((email && existingEmails.has(email.toLowerCase())) || (phone && existingPhones.has(phone)) || seenInFile.has(dedupeKey)) {
          duplicates++
          continue
        }
        seenInFile.add(dedupeKey)

        const documentNumber = get('documentNumber') || null
        const rawType = normalizeHeader(get('documentType')) as ClientDocumentType
        const documentType = DOCUMENT_TYPES.includes(rawType) ? rawType : defaultDocumentType

        rows.push({
          name,
          email: email || null,
          phone: phone || null,
          notes: get('notes') || null,
          document_type: documentNumber ? documentType : null,
          document_number: documentNumber,
        })
      }

      setImportPreview({ rows, duplicates, invalid, fileName: file.name })
    } catch (err) {
      console.error('[iplanit] Error parsing CSV:', err)
      setImportError(t.clients.importParseError)
    }
  }

  const handleConfirmImport = async () => {
    if (!currentBusiness || !importPreview || importPreview.rows.length === 0) return
    setIsImporting(true)
    try {
      const { error } = await supabase
        .from('clients')
        .insert(importPreview.rows.map((r) => ({ ...r, business_id: currentBusiness.id })))
      if (error) throw error
      await refetchClients()
      setImportSuccessCount(importPreview.rows.length)
      setImportPreview(null)
    } catch (err) {
      console.error('[iplanit] Error importing clients:', err)
      setImportError(t.clients.importSaveError)
    } finally {
      setIsImporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(sortedClients.length / PAGE_SIZE))
  const paginatedClients = sortedClients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const inactiveClientsCount = useMemo(() => {
    const now = Date.now()
    return clients.filter((c) => {
      const info = reservationCounts.get(c.id)
      if (!info || !info.last_reservation_at) return true
      const daysSince = (now - new Date(info.last_reservation_at).getTime()) / 86400000
      return daysSince > INACTIVE_DAYS_THRESHOLD
    }).length
  }, [clients, reservationCounts])


  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client)
      setFormData({
        name: client.name,
        email: client.email || '',
        phone: client.phone || '',
        notes: client.notes || '',
        documentType: client.document_type || defaultDocumentType,
        documentNumber: client.document_number || '',
      })
    } else {
      setEditingClient(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        notes: '',
        documentType: defaultDocumentType,
        documentNumber: '',
      })
    }
    setSaveError('')
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaveError('')
    setSaving(true)
    try {
      const clientData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        notes: formData.notes || null,
        document_type: formData.documentNumber ? formData.documentType : null,
        document_number: formData.documentNumber || null,
      }

      if (editingClient) {
        // business_id is provenance only (which sede first created this
        // client, scripts/053) - must never be rewritten just because the
        // client is now being edited from a different sede in the org.
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('clients')
          .insert({ ...clientData, business_id: currentBusiness.id })

        if (error) throw error
      }
      await refetchClients()
      setIsModalOpen(false)
      toast.success(editingClient ? t.clients.updateSuccess : t.clients.createSuccess)
    } catch (err: any) {
      console.error('[v0] Error saving client:', err)
      // PLN02 = free-plan client limit trigger (scripts/048) - only reachable
      // here as a race-condition backstop, since handleNewClientClick already
      // checks this before the form ever opens.
      if (err?.code === 'PLN02') {
        setIsModalOpen(false)
        setShowUpgradeModal(true)
      } else {
        setSaveError(t.saveError)
        toast.error(t.saveError)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)

      if (error) throw error
      await refetchClients()
    } catch (err) {
      console.error('[v0] Error deleting client:', err)
    }
  }

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client)
    setIsDetailOpen(true)
  }

  const isPremium = profile?.plan === 'premium'

  const handleNewClientClick = async () => {
    if (currentBusiness && (await isPlanLimitReached(currentBusiness.id, 'clients'))) {
      setShowUpgradeModal(true)
      return
    }
    handleOpenModal()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!currentBusiness) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">{t.clients.setupRequired}</h2>
        <p className="mt-2 text-muted-foreground">{t.clients.setupRequiredDesc}</p>
      </div>
    )
  }

  // Shared between the table's empty row and the mobile card list below -
  // same "no clients at all" vs. "no results for this search" distinction
  // either way.
  const emptyState =
    clients.length === 0 ? (
      <>
        <p className="font-medium text-foreground">{t.clients.emptyStateTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.clients.emptyStateDesc}</p>
        <Button onClick={handleNewClientClick} className="mt-4 gap-2">
          <Plus className="h-4 w-4" />
          {t.clients.newClient}
        </Button>
      </>
    ) : (
      <p className="text-muted-foreground">{t.clients.notFound}</p>
    )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.clients.title}</h1>
          <p className="text-muted-foreground">{t.clients.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <PremiumButton
            variant="outline"
            className="gap-2"
            featureName={t.clients.importCsv}
            onClick={() => setIsImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            {t.clients.importCsv}
          </PremiumButton>
          <PremiumButton
            variant="outline"
            className="gap-2"
            featureName={t.clients.exportCsv}
            onClick={handleExportCsv}
          >
            <Download className="h-4 w-4" />
            {t.clients.exportCsv}
          </PremiumButton>
          <Button onClick={handleNewClientClick} className="gap-2">
            <Plus className="h-4 w-4" />
            {t.clients.newClient}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <HeroKpiCard
          label={t.clients.totalClients}
          icon={Users}
          iconClassName="bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
          value={clients.length}
        />
        <HeroKpiCard
          label={t.clients.newThisMonth}
          icon={Calendar}
          iconClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          value={
            clients.filter((c) => {
              const created = new Date(c.created_at)
              const now = new Date()
              return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
            }).length
          }
        />
        <HeroKpiCard
          label={t.clients.inactiveClients}
          icon={UserX}
          iconClassName="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          value={inactiveClientsCount}
          caption={t.clients.inactiveClientsHint}
        />
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.clients.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {hasMultipleSedes && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                {t.clients.sedeLegendButton}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <p className="mb-1 text-sm font-semibold text-foreground">{t.clients.sedeLegendTitle}</p>
              <p className="mb-2.5 text-xs text-muted-foreground">{t.clients.sedeLegendDesc}</p>
              <div className="space-y-1.5">
                {orgBusinessIds.map((id) => (
                  <div key={id} className="flex items-center gap-2 text-xs text-foreground">
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        sedeTint(businessColorIndexById[id])?.bg,
                        sedeTint(businessColorIndexById[id])?.text
                      )}
                    >
                      {sedeAbbr(businessNameById[id] || '')}
                    </span>
                    <span>{businessNameById[id]}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Clients Table - full table from sm up; a stacked card list below
          that instead of letting 6 columns force horizontal scroll on a
          phone (unlike Services, this list benefits from staying tabular
          on larger screens - sortable columns + pagination are a table
          affordance, so this is a responsive table, not a full switch to
          cards). */}
      <Card>
        <CardContent className="p-0">
          <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('name')}
                  >
                    {t.clients.clientCol}
                    <SortIndicator active={sortKey === 'name'} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead>{t.clients.contactCol}</TableHead>
                <TableHead className="hidden lg:table-cell">{t.clients.documentCol}</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('reservations')}
                  >
                    {t.clients.reservationsCol}
                    <SortIndicator active={sortKey === 'reservations'} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('last_visit')}
                  >
                    {t.clients.lastVisitCol}
                    <SortIndicator active={sortKey === 'last_visit'} dir={sortDir} />
                  </button>
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedClients.map((client) => {
                const info = reservationCounts.get(client.id)
                const clientReservationCount = info?.reservation_count ?? 0
                const isInactive =
                  !info?.last_reservation_at ||
                  (Date.now() - new Date(info.last_reservation_at).getTime()) / 86400000 >
                    INACTIVE_DAYS_THRESHOLD
                return (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => handleViewDetails(client)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback
                            style={{ backgroundColor: getAvatarColor(client.id), color: '#fff' }}
                          >
                            {getInitials(client.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="flex items-center gap-1.5 font-medium">
                            {client.name}
                            {hasMultipleSedes && (
                              <span
                                title={businessNameById[client.business_id]}
                                className={cn(
                                  'rounded px-1 py-0.5 text-[10px] font-semibold',
                                  sedeTint(businessColorIndexById[client.business_id])?.bg,
                                  sedeTint(businessColorIndexById[client.business_id])?.text
                                )}
                              >
                                {sedeAbbr(businessNameById[client.business_id] || '')}
                              </span>
                            )}
                          </p>
                          {client.notes && (
                            <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                              {client.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {client.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {client.email}
                          </div>
                        )}
                        {!client.email && !client.phone && (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {client.phone}
                            <a
                              href={getWhatsappLink(client.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t.clients.sendWhatsapp}
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground transition-colors hover:text-[#25D366]"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {client.document_number ? (
                        <div>
                          {client.document_type && (
                            <span className="text-muted-foreground">
                              {documentTypeLabels[client.document_type]}:{' '}
                            </span>
                          )}
                          {client.document_number}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="secondary">
                          {clientReservationCount}{' '}
                          {clientReservationCount === 1 ? t.clients.reservationWordSingular : t.clients.reservationsWord}
                        </Badge>
                        {!!info?.no_show_count && (
                          <Badge variant="destructive" title={`${info.no_show_count} ${t.clients.noShowCount}`}>
                            {info.no_show_count} {t.clients.noShow}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {info?.last_reservation_at ? (
                        <span className={isInactive ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}>
                          {new Date(info.last_reservation_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-500">{t.clients.neverVisited}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => handleViewDetails(client)}>
                            <FileText className="mr-2 h-4 w-4" />
                            {t.clients.viewDetailsBtn}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenModal(client)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t.clients.editBtn}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(client.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t.clients.deleteBtn}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredClients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    {emptyState}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>

          {/* Mobile card list - same data/pagination/handlers as the table
              above, just laid out as stacked rows instead of columns so
              nothing needs horizontal scroll on a phone. Document number is
              left out here (same as the table hides it below lg) - it's in
              the detail view for whoever needs it. */}
          <div className="divide-y sm:hidden">
            {paginatedClients.map((client) => {
              const info = reservationCounts.get(client.id)
              const clientReservationCount = info?.reservation_count ?? 0
              const isInactive =
                !info?.last_reservation_at ||
                (Date.now() - new Date(info.last_reservation_at).getTime()) / 86400000 > INACTIVE_DAYS_THRESHOLD
              return (
                <div
                  key={client.id}
                  className="flex cursor-pointer items-start gap-3 p-4"
                  onClick={() => handleViewDetails(client)}
                >
                  <Avatar>
                    <AvatarFallback style={{ backgroundColor: getAvatarColor(client.id), color: '#fff' }}>
                      {getInitials(client.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      <span className="truncate">{client.name}</span>
                      {hasMultipleSedes && (
                        <span
                          className={cn(
                            'shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold',
                            sedeTint(businessColorIndexById[client.business_id])?.bg,
                            sedeTint(businessColorIndexById[client.business_id])?.text
                          )}
                        >
                          {sedeAbbr(businessNameById[client.business_id] || '')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {client.email || client.phone || '-'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {clientReservationCount} {t.clients.reservationsWord}
                      </Badge>
                      {!!info?.no_show_count && (
                        <Badge variant="destructive" className="text-xs">
                          {info.no_show_count} {t.clients.noShow}
                        </Badge>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        isInactive ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'
                      )}
                    >
                      {info?.last_reservation_at
                        ? new Date(info.last_reservation_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : t.clients.neverVisited}
                    </p>
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
                      <DropdownMenuItem onClick={() => handleViewDetails(client)}>
                        <FileText className="mr-2 h-4 w-4" />
                        {t.clients.viewDetailsBtn}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenModal(client)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t.clients.editBtn}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(client.id)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.clients.deleteBtn}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
            {filteredClients.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                {emptyState}
              </div>
            )}
          </div>

          {/* Pagination */}
          {filteredClients.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredClients.length)} de {filteredClients.length} clientes
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Form Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingClient ? t.clients.editTitle : t.clients.newTitle}
            </DialogTitle>
            <DialogDescription>
              {editingClient ? t.clients.editDesc : t.clients.newDesc}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t.clients.fullName}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t.clients.namePlaceholder}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t.clients.emailLabel}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={t.clients.emailPlaceholder}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t.clients.phoneLabel}</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder={t.clients.phonePlaceholder}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="documentType">{t.clients.documentTypeLabel}</Label>
                <Select
                  value={formData.documentType}
                  onValueChange={(value: ClientDocumentType) =>
                    setFormData({ ...formData, documentType: value })
                  }
                >
                  <SelectTrigger id="documentType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {documentTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="documentNumber">{t.clients.documentNumberLabel}</Label>
                <Input
                  id="documentNumber"
                  value={formData.documentNumber}
                  onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                  maxLength={30}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t.clients.notesLabel}</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t.clients.notesPlaceholder}
                rows={3}
              />
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                {t.clients.cancelBtn}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingClient ? t.clients.saveBtn : t.clients.createBtn}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import CSV Modal */}
      <Dialog open={isImportOpen} onOpenChange={(open) => (open ? setIsImportOpen(true) : closeImportModal())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.clients.importCsv}</DialogTitle>
            <DialogDescription>{t.clients.importDesc}</DialogDescription>
          </DialogHeader>

          {importSuccessCount !== null ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="h-6 w-6 text-green-600 dark:text-green-500" />
              </div>
              <p className="font-medium">{t.clients.importSuccess.replace('{count}', String(importSuccessCount))}</p>
            </div>
          ) : importPreview ? (
            <div className="space-y-4">
              <p className="truncate text-sm text-muted-foreground">{importPreview.fileName}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2">
                  <p className="text-lg font-semibold">{importPreview.rows.length}</p>
                  <p className="text-xs text-muted-foreground">{t.clients.importNew}</p>
                </div>
                <div className="rounded-lg border p-2" title={t.clients.importDuplicatesHint}>
                  <p className="text-lg font-semibold">{importPreview.duplicates}</p>
                  <p className="text-xs text-muted-foreground">{t.clients.importDuplicates}</p>
                </div>
                <div className="rounded-lg border p-2" title={t.clients.importInvalidHint}>
                  <p className="text-lg font-semibold">{importPreview.invalid}</p>
                  <p className="text-xs text-muted-foreground">{t.clients.importInvalid}</p>
                </div>
              </div>
              {importPreview.rows.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border">
                  {importPreview.rows.slice(0, 5).map((r, i) => (
                    <div key={i} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0">
                      <span className="font-medium">{r.name}</span>
                      <span className="truncate text-muted-foreground">{r.email || r.phone}</span>
                    </div>
                  ))}
                  {importPreview.rows.length > 5 && (
                    <p className="p-2 text-center text-xs text-muted-foreground">
                      {t.clients.importMoreRows.replace('{count}', String(importPreview.rows.length - 5))}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t.clients.importHint}</p>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => importFileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {t.clients.importSelectFile}
              </Button>
            </div>
          )}

          {importError && <p className="text-sm text-destructive">{importError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeImportModal}>
              {importSuccessCount !== null ? t.clients.closeBtn : t.clients.cancelBtn}
            </Button>
            {importPreview && importSuccessCount === null && (
              <Button type="button" disabled={importPreview.rows.length === 0 || isImporting} onClick={handleConfirmImport}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.clients.importConfirm.replace('{count}', String(importPreview.rows.length))}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.clients.detailTitle}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-6">
              {/* Client Info */}
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback
                    className="text-lg"
                    style={{ backgroundColor: getAvatarColor(selectedClient.id), color: '#fff' }}
                  >
                    {getInitials(selectedClient.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">{selectedClient.name}</h3>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {selectedClient.email}
                    </div>
                    {selectedClient.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        {selectedClient.phone}
                        <a
                          href={getWhatsappLink(selectedClient.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t.clients.sendWhatsapp}
                          className="text-muted-foreground transition-colors hover:text-[#25D366]"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  setIsDetailOpen(false)
                  handleOpenModal(selectedClient)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t.clients.editBtn}
                </Button>
              </div>

              {selectedClient.notes && (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm">{selectedClient.notes}</p>
                </div>
              )}

              {(() => {
                const info = reservationCounts.get(selectedClient.id)
                if (!info || (!info.no_show_count && !info.late_cancellation_count)) return null
                return (
                  <div className="flex flex-wrap gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    {!!info.no_show_count && (
                      <Badge variant="destructive">
                        {info.no_show_count} {t.clients.noShowCount}
                      </Badge>
                    )}
                    {!!info.late_cancellation_count && (
                      <Badge variant="outline">
                        {info.late_cancellation_count} {t.clients.lateCancellationCount}
                      </Badge>
                    )}
                  </div>
                )
              })()}

              {/* Reservation History (Premium) */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <h4 className="font-medium">{t.clients.reservationHistory}</h4>
                  {!isPremium && (
                    <Badge variant="secondary" className="ml-auto">Premium</Badge>
                  )}
                </div>

                {isPremium ? (
                  <div className="space-y-2">
                    {loadingHistory ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {clientHistory.map((reservation) => {
                          const service = services.find((s) => s.id === reservation.service_id)
                          return (
                            <div
                              key={reservation.id}
                              className="flex items-center gap-3 rounded-lg border p-3"
                            >
                              <div
                                className="h-8 w-1 rounded-full"
                                style={{ backgroundColor: service?.color || '#3B82F6' }}
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">{service?.name ?? t.calendar.unknownService}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(reservation.start_time).toLocaleDateString(locale, {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })} - {new Date(reservation.start_time).toLocaleTimeString(locale, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                              <StatusBadge
                                status={reservation.status}
                                labels={{
                                  confirmed: t.clients.confirmed,
                                  cancelled: t.clients.cancelled,
                                  pending: t.clients.pending,
                                  completed: t.clients.completed,
                                  noShow: t.clients.noShow,
                                }}
                              />
                            </div>
                          )
                        })}
                        {clientHistory.length === 0 && (
                          <p className="py-4 text-center text-sm text-muted-foreground">
                            {t.clients.noReservations}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <History className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {t.clients.premiumRequired}
                    </p>
                    <Button className="mt-3" size="sm">
                      {t.clients.upgradePremium}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature={t.upgradeModal.featureUnlimitedRecordsTitle}
      />
    </div>
  )
}
