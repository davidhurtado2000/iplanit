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
import { Calendar, Clock, User, Briefcase, MapPin, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'

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
  const { authProfile } = useAuth()
  const { businesses } = useBusinesses()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  
  const [formData, setFormData] = useState({
    client_id: '',
    service_id: '',
    resource_id: '',
    start_time: '',
    notes: '',
  })
  const [isEditing, setIsEditing] = useState(mode === 'create')

  // Cargar clientes y servicios de Supabase
  useEffect(() => {
    const loadData = async () => {
      if (!businesses?.[0]) return
      
      try {
        setLoadingData(true)
        const currentBusiness = businesses[0]
        
        const [clientsResponse, servicesResponse] = await Promise.all([
          supabase
            .from('clients')
            .select('id, name')
            .eq('business_id', currentBusiness.id)
            .order('name'),
          supabase
            .from('services')
            .select('id, name, duration_minutes')
            .eq('business_id', currentBusiness.id)
            .eq('is_active', true)
            .order('name'),
        ])

        if (clientsResponse.data) setClients(clientsResponse.data)
        if (servicesResponse.data) setServices(servicesResponse.data)
      } catch (error) {
        console.error('[v0] Error loading clients and services:', error)
      } finally {
        setLoadingData(false)
      }
    }

    if (isOpen) {
      loadData()
    }
  }, [isOpen, businesses])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!authProfile || !businesses?.[0]) {
      alert('Error: No hay datos de autenticación o negocio')
      return
    }
    
    if (!formData.client_id || !formData.service_id || !formData.start_time) {
      alert('Por favor completa los campos requeridos (Cliente, Servicio, Fecha y Hora)')
      return
    }
    
    try {
      setIsLoading(true)
      const currentBusiness = businesses[0]
      
      const reservationData = {
        business_id: currentBusiness.id,
        client_id: formData.client_id,
        service_id: formData.service_id,
        resource_id: formData.resource_id || null,
        start_time: formData.start_time,
        status: 'pending',
        notes: formData.notes || null,
      }

      if (mode === 'create') {
        const { error } = await supabase
          .from('reservations')
          .insert([reservationData])
        
        if (error) {
          console.error('[v0] Error creating reservation:', error)
          alert(`Error al crear reserva: ${error.message}`)
          return
        }
      } else if (mode === 'edit' && reservation?.id) {
        const { error } = await supabase
          .from('reservations')
          .update(reservationData)
          .eq('id', reservation.id)
        
        if (error) {
          console.error('[v0] Error updating reservation:', error)
          alert(`Error al actualizar reserva: ${error.message}`)
          return
        }
      }
      
      onSave?.()
      onClose()
    } catch (error) {
      console.error('[v0] Error saving reservation:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`)
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Completa los datos para crear una nueva reserva'
              : mode === 'view'
                ? 'Informacion de la reserva seleccionada'
                : 'Modifica los datos de la reserva'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'view' && reservation && !isEditing ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Reserva ID:</span>
                <span>{reservation.id}</span>
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
        ) : isEditing || mode === 'create' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              <Select
                value={formData.client_id}
                onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                disabled={loadingData}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingData ? "Cargando..." : "Selecciona un cliente"} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="service">Servicio</Label>
              <Select
                value={formData.service_id}
                onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                disabled={loadingData}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingData ? "Cargando..." : "Selecciona un servicio"} />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ({service.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="datetime">Fecha y Hora</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource">Recurso (opcional)</Label>
              <Input
                id="resource"
                value={formData.resource_id}
                onChange={(e) => setFormData({ ...formData, resource_id: e.target.value })}
                placeholder="ID del recurso (opcional)"
              />
            </div>

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
              <Button type="submit" disabled={isLoading} className="gap-2">
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === 'create' ? 'Crear reserva' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
