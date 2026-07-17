'use client'

import React from "react"

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useBusinesses } from '@/hooks/use-businesses'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/context/language-context'
import { useDashboardData, type Reservation } from '@/context/dashboard-data-context'
import { createClient } from '@/lib/supabase/client'
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/reservation-status'
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
} from 'lucide-react'

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

interface Client {
  id: string
  business_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  dni: string | null
  ruc: string | null
}

export default function ClientsPage() {
  const { currentBusiness } = useBusinesses()
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

  // US businesses don't collect a personal ID (DNI) from clients the way
  // Peru businesses commonly do - only an optional business tax ID (EIN).
  const isUSBusiness = currentBusiness?.country === 'US'
  const idColumnLabel = isUSBusiness ? 'EIN' : 'DNI / RUC'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    dni: '',
    ruc: '',
  })

  // Reservation counts per client (all-time) come from a small aggregate
  // query against the client_reservation_counts view, not by filtering the
  // shared reservations array - that array only holds a ±90 day window (see
  // dashboard-data-context.tsx), which would silently under-count a
  // long-time client's real history.
  const [reservationCounts, setReservationCounts] = useState<
    Map<string, { reservation_count: number; confirmed_count: number; last_reservation_at: string | null }>
  >(new Map())

  useEffect(() => {
    if (!currentBusiness) return
    const loadCounts = async () => {
      const { data } = await supabase
        .from('client_reservation_counts')
        .select('client_id, reservation_count, confirmed_count, last_reservation_at')
        .eq('business_id', currentBusiness.id)
      setReservationCounts(
        new Map(
          (data || []).map((row: any) => [
            row.client_id,
            {
              reservation_count: row.reservation_count,
              confirmed_count: row.confirmed_count,
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
        (c.dni && c.dni.toLowerCase().includes(q)) ||
        (c.ruc && c.ruc.toLowerCase().includes(q))
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
        dni: client.dni || '',
        ruc: client.ruc || '',
      })
    } else {
      setEditingClient(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        notes: '',
        dni: '',
        ruc: '',
      })
    }
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentBusiness) return

    setSaving(true)
    try {
      const clientData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        notes: formData.notes || null,
        dni: formData.dni || null,
        ruc: formData.ruc || null,
        business_id: currentBusiness.id,
      }

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('clients')
          .insert(clientData)

        if (error) throw error
      }
      await refetchClients()
      setIsModalOpen(false)
    } catch (err) {
      console.error('[v0] Error saving client:', err)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.clients.title}</h1>
          <p className="text-muted-foreground">{t.clients.subtitle}</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="gap-2">
          <Plus className="h-4 w-4" />
          {t.clients.newClient}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.clients.totalClients}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.clients.newThisMonth}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.filter((c) => {
                const created = new Date(c.created_at)
                const now = new Date()
                return (
                  created.getMonth() === now.getMonth() &&
                  created.getFullYear() === now.getFullYear()
                )
              }).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.clients.inactiveClients}
            </CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactiveClientsCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t.clients.inactiveClientsHint}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t.clients.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Clients Table */}
      <Card>
        <CardContent className="p-0">
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
                <TableHead>{idColumnLabel}</TableHead>
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
                  <TableRow key={client.id}>
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
                          <p className="font-medium">{client.name}</p>
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
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {client.email}
                        </div>
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
                    <TableCell className="text-sm">
                      {isUSBusiness ? (
                        client.ruc ? (
                          <div>EIN: {client.ruc}</div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : client.dni || client.ruc ? (
                        <div className="space-y-0.5">
                          {client.dni && <div>DNI: {client.dni}</div>}
                          {client.ruc && <div className="text-muted-foreground">RUC: {client.ruc}</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {clientReservationCount} {t.clients.reservationsWord}
                      </Badge>
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
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">{t.clients.notFound}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

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

            {isUSBusiness ? (
              <div className="space-y-2">
                <Label htmlFor="ruc">{t.clients.einLabel}</Label>
                <Input
                  id="ruc"
                  value={formData.ruc}
                  onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                  placeholder="12-3456789"
                  maxLength={20}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dni">DNI</Label>
                  <Input
                    id="dni"
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    placeholder="12345678"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ruc">RUC</Label>
                  <Input
                    id="ruc"
                    value={formData.ruc}
                    onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                    placeholder="20123456789"
                    maxLength={20}
                  />
                </div>
              </div>
            )}

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
                              <Badge variant={getStatusBadgeVariant(reservation.status)}>
                                {getStatusLabel(reservation.status, {
                                  confirmed: t.clients.confirmed,
                                  cancelled: t.clients.cancelled,
                                  pending: t.clients.pending,
                                  completed: t.clients.completed,
                                })}
                              </Badge>
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
    </div>
  )
}
