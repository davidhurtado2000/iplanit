'use client'

import React from "react"

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { Calendar, Clock, User, Briefcase, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'

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

interface ReservationModalProps {
  isOpen: boolean
  onClose: () => void
  reservation?: any | null
  selectedDate?: string
  mode: 'create' | 'edit' | 'view'
  onSave?: () => void
}

export function ReservationModal({
  isOpen,
  onClose,
  reservation,
  selectedDate,
  mode,
  onSave,
}: ReservationModalProps) {
  const supabase = createClient()
  const { profile } = useAuth()
  const { businesses } = useBusinesses()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  const [formData, setFormData] = useState({
    client_id: '',
    service_id: '',
    resource_id: '',
    start_time: '',
    notes: '',
  })
  const [isEditing, setIsEditing] = useState(mode === 'create')

  const currentBusiness = businesses?.[0]

  // Load clients and services when modal opens
  useEffect(() => {
    if (!isOpen || !currentBusiness) return

    const loadOptions = async () => {
      setLoadingOptions(true)
      try {
        const [{ data: clientsData }, { data: servicesData }] = await Promise.all([
          supabase
            .from('clients')
            .select('id, name, email, phone')
            .eq('business_id', currentBusiness.id)
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('services')
            .select('id, name, duration_minutes, price, color')
            .eq('business_id', currentBusiness.id)
            .eq('is_active', true)
            .order('name'),
        ])
        setClients(clientsData || [])
        setServices(servicesData || [])
      } finally {
        setLoadingOptions(false)
      }
    }

    loadOptions()
  }, [isOpen, currentBusiness?.id])

  useEffect(() => {
    if (reservation) {
      setFormData({
        client_id: reservation.client_id,
        service_id: reservation.service_id,
        resource_id: reservation.resource_id || '',
        start_time: reservation.start_time,
        notes: reservation.notes || '',
      })
      setIsEditing(mode === 'edit')
    } else {
      setFormData({
        client_id: '',
        service_id: '',
        resource_id: '',
        start_time: selectedDate ? `${selectedDate}T09:00` : new Date().toISOString().slice(0, 16),
        notes: '',
      })
      setIsEditing(true)
    }
  }, [reservation, selectedDate, mode])

  const selectedService = services.find((s) => s.id === formData.service_id)
  const selectedClient = clients.find((c) => c.id === formData.client_id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !currentBusiness) {
      console.error('[v0] Error: No hay datos de autenticación o negocio')
      return
    }

    try {
      setIsLoading(true)

      const durationMinutes = selectedService?.duration_minutes ?? 60
      const startDate = new Date(formData.start_time)
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

      const reservationData = {
        business_id: currentBusiness.id,
        client_id: formData.client_id,
        service_id: formData.service_id,
        resource_id: formData.resource_id || null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'pending',
        notes: formData.notes || null,
      }

      if (mode === 'create') {
        const { error } = await supabase
          .from('reservations')
          .insert([reservationData])

        if (error) throw error
        console.log('[v0] Reservation created successfully')
      } else if (mode === 'edit' && reservation?.id) {
        const { error } = await supabase
          .from('reservations')
          .update(reservationData)
          .eq('id', reservation.id)

        if (error) throw error
        console.log('[v0] Reservation updated successfully')
      }

      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error saving reservation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!reservation?.id) return

    try {
      setIsLoading(true)
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservation.id)

      if (error) throw error
      console.log('[v0] Reservation cancelled successfully')
      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error deleting reservation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getTitle = () => {
    if (mode === 'create') return 'Nueva Reserva'
    if (mode === 'view') return 'Detalles de Reserva'
    return 'Editar Reserva'
  }

  // Lookup names for view mode
  const viewClient = clients.find((c) => c.id === reservation?.client_id)
  const viewService = services.find((s) => s.id === reservation?.service_id)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Completa los datos para crear una nueva reserva'
              : mode === 'view'
                ? 'Información de la reserva seleccionada'
                : 'Modifica los datos de la reserva'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'view' && reservation && !isEditing ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Cliente:</span>
                <span>{viewClient?.name ?? reservation.client_id}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Servicio:</span>
                <span>
                  {viewService
                    ? `${viewService.name} (${viewService.duration_minutes} min)`
                    : reservation.service_id}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Fecha y hora:</span>
                <span>
                  {new Date(reservation.start_time).toLocaleDateString('es-ES', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Badge
                  variant={reservation.status === 'confirmed' ? 'default' : 'secondary'}
                >
                  {reservation.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                </Badge>
              </div>
              {reservation.notes && (
                <div className="mt-2 rounded-md bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notas:</p>
                  <p className="text-sm">{reservation.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Cancelar reserva
              </Button>
              <Button onClick={() => setIsEditing(true)} disabled={isLoading}>Editar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cliente */}
            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              <Select
                value={formData.client_id}
                onValueChange={(val) => setFormData({ ...formData, client_id: val })}
                disabled={loadingOptions}
              >
                <SelectTrigger id="client">
                  <SelectValue placeholder={loadingOptions ? 'Cargando...' : 'Selecciona un cliente'} />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 && !loadingOptions ? (
                    <SelectItem value="_empty" disabled>
                      No hay clientes registrados
                    </SelectItem>
                  ) : (
                    clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        <span className="font-medium">{client.name}</span>
                        {client.email && (
                          <span className="ml-2 text-xs text-muted-foreground">{client.email}</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Servicio */}
            <div className="space-y-2">
              <Label htmlFor="service">Servicio</Label>
              <Select
                value={formData.service_id}
                onValueChange={(val) => setFormData({ ...formData, service_id: val })}
                disabled={loadingOptions}
              >
                <SelectTrigger id="service">
                  <SelectValue placeholder={loadingOptions ? 'Cargando...' : 'Selecciona un servicio'} />
                </SelectTrigger>
                <SelectContent>
                  {services.length === 0 && !loadingOptions ? (
                    <SelectItem value="_empty" disabled>
                      No hay servicios registrados
                    </SelectItem>
                  ) : (
                    services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        <span className="font-medium">{service.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {service.duration_minutes} min · S/ {service.price}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedService && (
                <p className="text-xs text-muted-foreground">
                  Duración: {selectedService.duration_minutes} min — la reserva terminará a las{' '}
                  {formData.start_time
                    ? new Date(
                        new Date(formData.start_time).getTime() +
                          selectedService.duration_minutes * 60 * 1000
                      ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </p>
              )}
            </div>

            {/* Fecha y hora */}
            <div className="space-y-2">
              <Label htmlFor="datetime">Fecha y Hora</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Agrega notas adicionales..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !formData.client_id || !formData.service_id}
                className="gap-2"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'create' ? 'Crear reserva' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
