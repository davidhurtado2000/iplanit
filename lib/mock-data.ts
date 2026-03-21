import type {
  User,
  Business,
  Service,
  Resource,
  Client,
  Reservation,
  DashboardStats,
} from './types'

// Current logged in user (mock) - Cambia a 'premium' para probar funciones premium
export const currentUser: User = {
  id: 'user-1',
  email: 'maria@clinicasalud.com',
  name: 'Maria Garcia',
  role: 'owner',
  timezone: 'America/Lima',
  language: 'es',
  plan: 'premium', // Cambia a 'premium' para ver todas las funciones
  createdAt: '2024-01-15T10:00:00Z',
  avatarUrl: undefined,
}

// Business data
export const currentBusiness: Business = {
  id: 'business-1',
  name: 'Clinica Salud Plus',
  type: 'clinic',
  timezone: 'America/Lima',
  ownerId: 'user-1',
  address: 'Av. Javier Prado 1234, Lima',
  phone: '+51 1 234 5678',
  email: 'contacto@clinicasalud.com',
  createdAt: '2024-01-15T10:00:00Z',
  businessHours: [
    { dayOfWeek: 'monday', startTime: '08:00', endTime: '18:00', isOpen: true },
    { dayOfWeek: 'tuesday', startTime: '08:00', endTime: '18:00', isOpen: true },
    { dayOfWeek: 'wednesday', startTime: '08:00', endTime: '18:00', isOpen: true },
    { dayOfWeek: 'thursday', startTime: '08:00', endTime: '18:00', isOpen: true },
    { dayOfWeek: 'friday', startTime: '08:00', endTime: '18:00', isOpen: true },
    { dayOfWeek: 'saturday', startTime: '09:00', endTime: '13:00', isOpen: true },
    { dayOfWeek: 'sunday', startTime: '00:00', endTime: '00:00', isOpen: false },
  ],
}

// Services
export const services: Service[] = [
  {
    id: 'service-1',
    businessId: 'business-1',
    name: 'Consulta General',
    description: 'Consulta medica general con evaluacion completa',
    duration: 30,
    price: 80,
    currency: 'PEN',
    isActive: true,
    color: '#3B82F6',
  },
  {
    id: 'service-2',
    businessId: 'business-1',
    name: 'Consulta Especializada',
    description: 'Consulta con especialista',
    duration: 45,
    price: 150,
    currency: 'PEN',
    isActive: true,
    color: '#10B981',
  },
  {
    id: 'service-3',
    businessId: 'business-1',
    name: 'Control de Seguimiento',
    description: 'Cita de seguimiento post-tratamiento',
    duration: 20,
    price: 50,
    currency: 'PEN',
    isActive: true,
    color: '#F59E0B',
  },
  {
    id: 'service-4',
    businessId: 'business-1',
    name: 'Examen de Laboratorio',
    description: 'Toma de muestras y examenes de laboratorio',
    duration: 15,
    price: 40,
    currency: 'PEN',
    isActive: true,
    color: '#8B5CF6',
  },
]

// Resources
export const resources: Resource[] = [
  {
    id: 'resource-1',
    businessId: 'business-1',
    name: 'Consultorio 1',
    type: 'room',
    description: 'Consultorio principal',
    isActive: true,
  },
  {
    id: 'resource-2',
    businessId: 'business-1',
    name: 'Consultorio 2',
    type: 'room',
    description: 'Consultorio secundario',
    isActive: true,
  },
  {
    id: 'resource-3',
    businessId: 'business-1',
    name: 'Dr. Carlos Rodriguez',
    type: 'person',
    description: 'Medico general',
    isActive: true,
  },
  {
    id: 'resource-4',
    businessId: 'business-1',
    name: 'Dra. Ana Martinez',
    type: 'person',
    description: 'Especialista en cardiologia',
    isActive: true,
  },
]

// Clients
export const clients: Client[] = [
  {
    id: 'client-1',
    businessId: 'business-1',
    name: 'Juan Perez',
    email: 'juan.perez@email.com',
    phone: '+51 999 111 222',
    notes: 'Alergia a penicilina',
    createdAt: '2024-02-01T10:00:00Z',
  },
  {
    id: 'client-2',
    businessId: 'business-1',
    name: 'Carmen Lopez',
    email: 'carmen.lopez@email.com',
    phone: '+51 999 333 444',
    createdAt: '2024-02-05T14:00:00Z',
  },
  {
    id: 'client-3',
    businessId: 'business-1',
    name: 'Roberto Diaz',
    email: 'roberto.diaz@email.com',
    phone: '+51 999 555 666',
    notes: 'Paciente diabetico',
    createdAt: '2024-02-10T09:00:00Z',
  },
  {
    id: 'client-4',
    businessId: 'business-1',
    name: 'Sofia Torres',
    email: 'sofia.torres@email.com',
    phone: '+51 999 777 888',
    createdAt: '2024-02-15T11:00:00Z',
  },
  {
    id: 'client-5',
    businessId: 'business-1',
    name: 'Miguel Sanchez',
    email: 'miguel.sanchez@email.com',
    phone: '+51 999 999 000',
    createdAt: '2024-02-20T16:00:00Z',
  },
]

// Helper to get today and nearby dates
const getDateString = (daysFromNow: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return date.toISOString().split('T')[0]
}

// Reservations
export const reservations: Reservation[] = [
  // Today's reservations
  {
    id: 'res-1',
    businessId: 'business-1',
    serviceId: 'service-1',
    clientId: 'client-1',
    resourceId: 'resource-1',
    date: getDateString(0),
    startTime: '09:00',
    endTime: '09:30',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'res-2',
    businessId: 'business-1',
    serviceId: 'service-2',
    clientId: 'client-2',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '10:00',
    endTime: '10:45',
    status: 'confirmed',
    createdAt: '2024-01-21T11:00:00Z',
    updatedAt: '2024-01-21T11:00:00Z',
  },
  {
    id: 'res-3',
    businessId: 'business-1',
    serviceId: 'service-3',
    clientId: 'client-3',
    resourceId: 'resource-1',
    date: getDateString(0),
    startTime: '11:30',
    endTime: '11:50',
    status: 'confirmed',
    createdAt: '2024-01-22T09:00:00Z',
    updatedAt: '2024-01-22T09:00:00Z',
  },
  {
    id: 'res-4',
    businessId: 'business-1',
    serviceId: 'service-1',
    clientId: 'client-4',
    resourceId: 'resource-1',
    date: getDateString(0),
    startTime: '14:00',
    endTime: '14:30',
    status: 'confirmed',
    createdAt: '2024-01-23T14:00:00Z',
    updatedAt: '2024-01-23T14:00:00Z',
  },
  {
    id: 'res-5',
    businessId: 'business-1',
    serviceId: 'service-4',
    clientId: 'client-5',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '15:30',
    endTime: '15:45',
    status: 'confirmed',
    createdAt: '2024-01-24T16:00:00Z',
    updatedAt: '2024-01-24T16:00:00Z',
  },
  // Tomorrow's reservations
  {
    id: 'res-6',
    businessId: 'business-1',
    serviceId: 'service-2',
    clientId: 'client-1',
    resourceId: 'resource-2',
    date: getDateString(1),
    startTime: '09:30',
    endTime: '10:15',
    status: 'confirmed',
    createdAt: '2024-01-25T10:00:00Z',
    updatedAt: '2024-01-25T10:00:00Z',
  },
  {
    id: 'res-7',
    businessId: 'business-1',
    serviceId: 'service-1',
    clientId: 'client-3',
    resourceId: 'resource-1',
    date: getDateString(1),
    startTime: '11:00',
    endTime: '11:30',
    status: 'confirmed',
    createdAt: '2024-01-26T11:00:00Z',
    updatedAt: '2024-01-26T11:00:00Z',
  },
  // Day after tomorrow
  {
    id: 'res-8',
    businessId: 'business-1',
    serviceId: 'service-3',
    clientId: 'client-2',
    resourceId: 'resource-1',
    date: getDateString(2),
    startTime: '10:00',
    endTime: '10:20',
    status: 'confirmed',
    createdAt: '2024-01-27T09:00:00Z',
    updatedAt: '2024-01-27T09:00:00Z',
  },
  // Cancelled reservation
  {
    id: 'res-9',
    businessId: 'business-1',
    serviceId: 'service-1',
    clientId: 'client-4',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '16:00',
    endTime: '16:30',
    status: 'cancelled',
    notes: 'Paciente cancelo por motivos personales',
    createdAt: '2024-01-28T14:00:00Z',
    updatedAt: '2024-01-29T10:00:00Z',
  },
  {
    id: 'res-10',
    businessId: 'business-1',
    serviceId: 'service-2',
    clientId: 'client-1',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '09:00',
    endTime: '09:45',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  // More reservations for today to show multiple resources simultaneously
  {
    id: 'res-11',
    businessId: 'business-1',
    serviceId: 'service-3',
    clientId: 'client-2',
    resourceId: 'resource-1',
    date: getDateString(0),
    startTime: '10:00',
    endTime: '10:20',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'res-12',
    businessId: 'business-1',
    serviceId: 'service-4',
    clientId: 'client-3',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '11:00',
    endTime: '11:15',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'res-13',
    businessId: 'business-1',
    serviceId: 'service-1',
    clientId: 'client-5',
    resourceId: 'resource-1',
    date: getDateString(0),
    startTime: '12:00',
    endTime: '12:30',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'res-14',
    businessId: 'business-1',
    serviceId: 'service-2',
    clientId: 'client-4',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '12:00',
    endTime: '12:45',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'res-15',
    businessId: 'business-1',
    serviceId: 'service-3',
    clientId: 'client-1',
    resourceId: 'resource-1',
    date: getDateString(0),
    startTime: '14:30',
    endTime: '14:50',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
  {
    id: 'res-16',
    businessId: 'business-1',
    serviceId: 'service-1',
    clientId: 'client-2',
    resourceId: 'resource-2',
    date: getDateString(0),
    startTime: '14:00',
    endTime: '14:30',
    status: 'confirmed',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
]

// Dashboard Stats (Premium feature)
export const dashboardStats: DashboardStats = {
  totalReservations: 156,
  reservationsToday: 12,
  reservationsThisWeek: 42,
  reservationsThisMonth: 89,
  topServices: [
    { serviceId: 'service-1', serviceName: 'Consulta General', count: 45 },
    { serviceId: 'service-2', serviceName: 'Consulta Especializada', count: 32 },
    { serviceId: 'service-3', serviceName: 'Control de Seguimiento', count: 28 },
    { serviceId: 'service-4', serviceName: 'Examen de Laboratorio', count: 21 },
  ],
  peakHours: [
    { hour: 9, count: 18 },
    { hour: 10, count: 22 },
    { hour: 11, count: 20 },
    { hour: 14, count: 15 },
    { hour: 15, count: 17 },
    { hour: 16, count: 12 },
  ],
  revenue: {
    today: 360,
    thisWeek: 2840,
    thisMonth: 8920,
    currency: 'PEN',
  },
}

// Helper functions
export function getServiceById(id: string): Service | undefined {
  return services.find((s) => s.id === id)
}

export function getClientById(id: string): Client | undefined {
  return clients.find((c) => c.id === id)
}

export function getResourceById(id: string): Resource | undefined {
  return resources.find((r) => r.id === id)
}

export function getReservationsByDate(date: string): Reservation[] {
  return reservations.filter((r) => r.date === date && r.status !== 'cancelled')
}

export function getReservationsForWeek(startDate: Date): Reservation[] {
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 7)

  return reservations.filter((r) => {
    const resDate = new Date(r.date)
    return resDate >= startDate && resDate < endDate && r.status !== 'cancelled'
  })
}
