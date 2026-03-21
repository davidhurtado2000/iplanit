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
import { services, clients, resources, getServiceById, getClientById, getResourceById } from '@/lib/mock-data'
import type { Reservation } from '@/lib/types'
import { Calendar, Clock, User, Briefcase, MapPin, Trash2 } from 'lucide-react'

interface ReservationModalProps {
  isOpen: boolean
  onClose: () => void
  reservation?: Reservation | null
  selectedDate?: string
  mode: 'create' | 'edit' | 'view'
}

export function ReservationModal({
  isOpen,
  onClose,
  reservation,
  selectedDate,
  mode,
}: ReservationModalProps) {
  const [formData, setFormData] = useState({
    clientId: '',
    serviceId: '',
    resourceId: '',
    date: '',
    startTime: '',
    endTime: '',
    notes: '',
  })
  const [isEditing, setIsEditing] = useState(mode === 'create')

  useEffect(() => {
    if (reservation) {
      setFormData({
        clientId: reservation.clientId,
        serviceId: reservation.serviceId,
        resourceId: reservation.resourceId || '',
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        notes: reservation.notes || '',
      })
      setIsEditing(mode === 'edit')
    } else {
      setFormData({
        clientId: '',
        serviceId: '',
        resourceId: '',
        date: selectedDate || new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '09:30',
        notes: '',
      })
      setIsEditing(true)
    }
  }, [reservation, selectedDate, mode])

  const handleServiceChange = (serviceId: string) => {
    const service = services.find((s) => s.id === serviceId)
    if (service && formData.startTime) {
      const [hours, minutes] = formData.startTime.split(':').map(Number)
      const endDate = new Date()
      endDate.setHours(hours, minutes + service.duration)
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
      setFormData({ ...formData, serviceId, endTime })
    } else {
      setFormData({ ...formData, serviceId })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // In production, this would call an API to create/update the reservation
    console.log('[v0] Reservation submitted:', formData)
    onClose()
  }

  const handleDelete = () => {
    // In production, this would call an API to delete the reservation
    console.log('[v0] Reservation deleted:', reservation?.id)
    onClose()
  }

  const selectedService = formData.serviceId ? getServiceById(formData.serviceId) : null
  const selectedClient = formData.clientId ? getClientById(formData.clientId) : null
  const selectedResource = formData.resourceId ? getResourceById(formData.resourceId) : null

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

        {mode === 'view' && reservation ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-1 rounded-full"
                  style={{ backgroundColor: selectedService?.color || '#3B82F6' }}
                />
                <div>
                  <p className="font-medium">{selectedService?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedService?.duration} minutos
                  </p>
                </div>
                <Badge
                  variant={reservation.status === 'confirmed' ? 'default' : 'secondary'}
                  className="ml-auto"
                >
                  {reservation.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Cliente:</span>
                <span>{selectedClient?.name}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Fecha:</span>
                <span>
                  {new Date(reservation.date).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Horario:</span>
                <span>
                  {reservation.startTime} - {reservation.endTime}
                </span>
              </div>
              {selectedResource && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Recurso:</span>
                  <span>{selectedResource.name}</span>
                </div>
              )}
              {reservation.notes && (
                <div className="mt-2 rounded-md bg-muted p-3">
                  <p className="text-sm text-muted-foreground">{reservation.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Cancelar reserva
              </Button>
              <Button onClick={() => setIsEditing(true)}>Editar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              <Select
                value={formData.clientId}
                onValueChange={(value) => setFormData({ ...formData, clientId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
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
                value={formData.serviceId}
                onValueChange={handleServiceChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un servicio" />
                </SelectTrigger>
                <SelectContent>
                  {services.filter((s) => s.isActive).map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: service.color }}
                        />
                        {service.name} ({service.duration} min)
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource">Recurso (opcional)</Label>
              <Select
                value={formData.resourceId}
                onValueChange={(value) => setFormData({ ...formData, resourceId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un recurso" />
                </SelectTrigger>
                <SelectContent>
                  {resources.filter((r) => r.isActive).map((resource) => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Hora inicio</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">Hora fin</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                />
              </div>
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
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">
                {mode === 'create' ? 'Crear reserva' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
