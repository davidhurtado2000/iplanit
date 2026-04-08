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
import { createClient } from '@/lib/supabase/client'
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
  FileText,
  History,
  Loader2,
  Building2,
} from 'lucide-react'

interface Client {
  id: string
  business_id: string
  name: string
  email: string
  phone: string | null
  notes: string | null
  created_at: string
}

export default function ClientsPage() {
  const { businesses, loading: businessLoading } = useBusinesses()
  const { profile } = useAuth()
  const { t, locale } = useLanguage()
  const [clients, setClients] = useState<Client[]>([])
  const [reservations, setReservations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()

  const currentBusiness = businesses?.[0]

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  })

  // Fetch clients from Supabase
  useEffect(() => {
    if (businessLoading) return

    if (!currentBusiness) {
      setLoading(false)
      return
    }

    setLoading(true)
    const fetchData = async () => {
      try {
        const [clientsRes, reservationsRes] = await Promise.all([
          supabase
            .from('clients')
            .select('*')
            .eq('business_id', currentBusiness.id)
            .order('name'),
          supabase
            .from('reservations')
            .select('*')
            .eq('business_id', currentBusiness.id)
        ])

        if (clientsRes.data) setClients(clientsRes.data)
        if (reservationsRes.data) setReservations(reservationsRes.data)
      } catch (err) {
        console.error('[v0] Error fetching clients:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentBusiness?.id, businessLoading])

  const filteredClients = useMemo(() => {
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [clients, searchQuery])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getClientReservations = (clientId: string) => {
    return reservations
      .filter((r) => r.client_id === clientId)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
  }

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client)
      setFormData({
        name: client.name,
        email: client.email,
        phone: client.phone || '',
        notes: client.notes || '',
      })
    } else {
      setEditingClient(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        notes: '',
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
        business_id: currentBusiness.id,
      }

      if (editingClient) {
        const { data, error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id)
          .select()
          .single()

        if (error) throw error
        setClients(clients.map((c) => c.id === editingClient.id ? data : c))
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert(clientData)
          .select()
          .single()

        if (error) throw error
        setClients([...clients, data])
      }
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
      setClients(clients.filter((c) => c.id !== id))
    } catch (err) {
      console.error('[v0] Error deleting client:', err)
    }
  }

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client)
    setIsDetailOpen(true)
  }

  const isPremium = profile?.plan === 'premium'

  if (businessLoading || loading) {
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
              {t.clients.withActiveReservations}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(
                reservations
                  .filter((r) => r.status === 'confirmed')
                  .map((r) => r.client_id)
              ).size}
            </div>
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
                <TableHead>{t.clients.clientCol}</TableHead>
                <TableHead>{t.clients.contactCol}</TableHead>
                <TableHead>{t.clients.reservationsCol}</TableHead>
                <TableHead>{t.clients.sinceCol}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => {
                const clientReservations = getClientReservations(client.id)
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(client.name)}</AvatarFallback>
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
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {clientReservations.length} {t.clients.reservationsWord}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(client.created_at).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
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
                  <TableCell colSpan={5} className="py-8 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-muted-foreground">{t.clients.notFound}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
                  <AvatarFallback className="text-lg">
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
                    {getClientReservations(selectedClient.id).slice(0, 5).map((reservation) => {
                      const service = getServiceById(reservation.serviceId)
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
                            <p className="text-sm font-medium">{service?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(reservation.date).toLocaleDateString(locale, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })} - {reservation.startTime}
                            </p>
                          </div>
                          <Badge
                            variant={
                              reservation.status === 'confirmed'
                                ? 'default'
                                : reservation.status === 'cancelled'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {reservation.status === 'confirmed' && t.clients.confirmed}
                            {reservation.status === 'cancelled' && t.clients.cancelled}
                            {reservation.status === 'rescheduled' && t.clients.rescheduled}
                          </Badge>
                        </div>
                      )
                    })}
                    {getClientReservations(selectedClient.id).length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        {t.clients.noReservations}
                      </p>
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
