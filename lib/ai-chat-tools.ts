import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Reservation, Client, Service, Resource, Worker, BusinessHour } from '@/context/dashboard-data-context'
import {
  getRangeBounds,
  getServiceBreakdown,
  getTotalRevenue,
  getAverageTicket,
  getCancellationRate,
  getNoShowRate,
  getOccupancy,
  getTopClients,
  getClientRetention,
  getRevenueBySegment,
  getResourceBreakdown,
  getWorkerBreakdown,
  getAtRiskClients,
  type DateRangeOption,
} from '@/lib/analytics'

// Everything a tool needs to run, injected by the route handler after auth -
// the model only ever chooses WHICH tool to call and with what business-
// relevant arguments (range, limit, a client name it typed); it never sees
// or supplies businessId/organizationId. That boundary is enforced simply
// by these never appearing in any tool's parameter schema below.
export interface ToolContext {
  businessId: string
  organizationId: string
  timezone: string
  supabase: SupabaseClient<Database>
}

const RANGE_PARAM = {
  type: 'string',
  enum: ['7d', '30d', '90d', 'ytd', 'all'],
  description: 'Periodo a consultar: 7d = últimos 7 días, 30d = últimos 30 días, 90d = últimos 90 días, ytd = este año, all = todo el historial.',
} as const

async function fetchReservations(supabase: SupabaseClient<Database>, businessId: string, from: Date, to: Date) {
  const { data } = await supabase
    .from('reservations')
    .select('*')
    .eq('business_id', businessId)
    .gte('start_time', from.toISOString())
    .lte('start_time', to.toISOString())
  return (data ?? []) as Reservation[]
}

async function fetchClients(supabase: SupabaseClient<Database>, organizationId: string) {
  const { data } = await supabase.from('clients').select('*').eq('organization_id', organizationId)
  return (data ?? []) as Client[]
}

async function fetchServices(supabase: SupabaseClient<Database>, businessId: string) {
  const { data } = await supabase.from('services').select('*').eq('business_id', businessId)
  return (data ?? []) as Service[]
}

async function fetchResources(supabase: SupabaseClient<Database>, businessId: string) {
  const { data } = await supabase.from('resources').select('id, name').eq('business_id', businessId)
  return (data ?? []) as Pick<Resource, 'id' | 'name'>[]
}

async function fetchWorkers(supabase: SupabaseClient<Database>, businessId: string) {
  const { data } = await supabase.from('workers').select('id, name').eq('business_id', businessId)
  return (data ?? []) as Pick<Worker, 'id' | 'name'>[]
}

async function fetchBusinessHours(supabase: SupabaseClient<Database>, businessId: string) {
  const { data } = await supabase
    .from('business_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('business_id', businessId)
  return (data ?? []) as BusinessHour[]
}

function resolveRange(args: Record<string, unknown>): { from: Date; to: Date } {
  const range = (args.range as DateRangeOption) ?? '30d'
  return getRangeBounds(range)
}

export const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_business_summary',
      description: 'Resumen general del negocio en un período: ingresos, ticket promedio, ocupación, tasa de cancelación y de no-show, y desglose por servicio.',
      parameters: {
        type: 'object',
        properties: { range: RANGE_PARAM },
        required: ['range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_top_clients',
      description: 'Los clientes que más ingresos generaron en un período (los "VIP" del negocio).',
      parameters: {
        type: 'object',
        properties: {
          range: RANGE_PARAM,
          limit: { type: 'number', description: 'Cuántos clientes devolver (por defecto 5).' },
        },
        required: ['range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_client_retention',
      description: 'Cuántos clientes de un período son nuevos vs. recurrentes, y qué porcentaje de los ingresos vino de cada grupo.',
      parameters: {
        type: 'object',
        properties: { range: RANGE_PARAM },
        required: ['range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_resource_performance',
      description: 'Reservas, horas reservadas e ingresos por cada recurso (sala, equipo, etc.) en un período.',
      parameters: {
        type: 'object',
        properties: { range: RANGE_PARAM },
        required: ['range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_worker_performance',
      description: 'Reservas, horas, ingresos y tasa de finalización por cada trabajador en un período.',
      parameters: {
        type: 'object',
        properties: { range: RANGE_PARAM },
        required: ['range'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_at_risk_clients',
      description: 'Clientes que solían reservar seguido y parecen haber dejado de venir (entre 45 y 180 días sin su última visita). Siempre mide contra hoy, no contra un período elegido.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Cuántos clientes devolver (por defecto 10).' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_client',
      description: 'Busca un cliente por nombre (coincidencia parcial). Devuelve el/los clientes que matchean con su id, para después poder pedir su historial con get_client_history.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre o parte del nombre del cliente a buscar.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_client_history',
      description: 'Historial de reservas de un cliente específico (por su id, obtenido con find_client): fechas, servicios, precios y estado.',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: 'Id del cliente, obtenido de find_client.' },
        },
        required: ['clientId'],
      },
    },
  },
]

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const { businessId, organizationId, timezone, supabase } = ctx

  switch (name) {
    case 'get_business_summary': {
      const { from, to } = resolveRange(args)
      const [reservations, services, businessHours] = await Promise.all([
        fetchReservations(supabase, businessId, from, to),
        fetchServices(supabase, businessId),
        fetchBusinessHours(supabase, businessId),
      ])
      const breakdown = getServiceBreakdown(reservations, services, from, to)
      return {
        totalRevenue: getTotalRevenue(breakdown),
        averageTicket: Math.round(getAverageTicket(reservations, from, to)),
        cancellationRate: getCancellationRate(reservations, from, to),
        noShowRate: getNoShowRate(reservations, from, to),
        occupancy: getOccupancy(reservations, businessHours, from, to, timezone),
        serviceBreakdown: breakdown.slice(0, 10),
      }
    }

    case 'get_top_clients': {
      const { from, to } = resolveRange(args)
      const limit = typeof args.limit === 'number' ? args.limit : 5
      const [reservations, clients] = await Promise.all([
        fetchReservations(supabase, businessId, from, to),
        fetchClients(supabase, organizationId),
      ])
      return getTopClients(reservations, clients, from, to, limit)
    }

    case 'get_client_retention': {
      const { from, to } = resolveRange(args)
      const [reservations, clients] = await Promise.all([
        fetchReservations(supabase, businessId, from, to),
        fetchClients(supabase, organizationId),
      ])
      return {
        retention: getClientRetention(reservations, clients, from, to),
        revenueBySegment: getRevenueBySegment(reservations, clients, from, to),
      }
    }

    case 'get_resource_performance': {
      const { from, to } = resolveRange(args)
      const [reservations, resources] = await Promise.all([
        fetchReservations(supabase, businessId, from, to),
        fetchResources(supabase, businessId),
      ])
      return getResourceBreakdown(reservations, resources, from, to)
    }

    case 'get_worker_performance': {
      const { from, to } = resolveRange(args)
      const [reservations, workers] = await Promise.all([
        fetchReservations(supabase, businessId, from, to),
        fetchWorkers(supabase, businessId),
      ])
      return getWorkerBreakdown(reservations, workers, from, to)
    }

    case 'get_at_risk_clients': {
      // Ignores the date-range concept entirely, same as getAtRiskClients
      // itself - "who am I about to lose" is measured against today, not a
      // report window. Needs lifetime-ish history to find each client's true
      // last visit, so this pulls the 'all' bound rather than a recent slice.
      const { from, to } = getRangeBounds('all')
      const limit = typeof args.limit === 'number' ? args.limit : 10
      const [reservations, clients] = await Promise.all([
        fetchReservations(supabase, businessId, from, to),
        fetchClients(supabase, organizationId),
      ])
      return getAtRiskClients(reservations, clients, limit)
    }

    case 'find_client': {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      if (!name) return { error: 'missing_name' }
      const { data } = await supabase
        .from('clients')
        .select('id, name, email, phone, is_active, created_at')
        .eq('organization_id', organizationId)
        .ilike('name', `%${name}%`)
        .limit(10)
      return data ?? []
    }

    case 'get_client_history': {
      const clientId = typeof args.clientId === 'string' ? args.clientId : ''
      if (!clientId) return { error: 'missing_client_id' }

      // Defense in depth - a clientId the model got from find_client is
      // already org-scoped, but this tool doesn't have to trust that; verify
      // again before returning anything tied to that id.
      const { data: client } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', clientId)
        .eq('organization_id', organizationId)
        .single()
      if (!client) return { error: 'client_not_found' }

      const { from, to } = getRangeBounds('all')
      const { data: reservations } = await supabase
        .from('reservations')
        .select('start_time, status, type, price, price_usd, notes, service_id')
        .eq('business_id', businessId)
        .eq('client_id', clientId)
        .gte('start_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .order('start_time', { ascending: false })
        .limit(50)

      const services = await fetchServices(supabase, businessId)
      const serviceName = (id: string | null) => (id ? services.find((s) => s.id === id)?.name ?? null : null)

      return {
        clientName: client.name,
        reservations: (reservations ?? []).map((r) => ({
          date: r.start_time,
          status: r.status,
          type: r.type,
          price: r.price ?? r.price_usd ?? null,
          service: serviceName(r.service_id),
          notes: r.notes,
        })),
      }
    }

    default:
      return { error: 'unknown_tool' }
  }
}
