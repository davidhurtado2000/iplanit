// Help center content (/dashboard/ayuda, and /mi-agenda/ayuda for workers).
//
// Spanish only for now (David, 2026-11-13). Button and tab names must match
// what the screens actually say (context/language-context.tsx) - when you
// rename something in the UI, search this file for the old name.
//
// Text supports **bold** only. Keep steps short: one action per step.

export type HelpCategoryKey =
  | 'primeros-pasos'
  | 'reservas'
  | 'clientes'
  | 'equipo'
  | 'link'
  | 'avisos'
  | 'facturacion'
  | 'reportes'
  | 'cuenta'
  | 'mi-agenda'

export interface HelpCategory {
  key: HelpCategoryKey
  title: string
  description: string
}

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'warning'; text: string }

export interface HelpArticle {
  slug: string
  category: HelpCategoryKey
  title: string
  summary: string
  /** Who it is for: 'business' = owner and team in the dashboard;
   * 'worker' = a worker with a read-only agenda (/mi-agenda). */
  audience: 'business' | 'worker'
  ownerOnly?: boolean
  plan?: 'pro' | 'premium'
  /** "Ir a esta pantalla" button. */
  link?: { href: string; label: string }
  blocks: HelpBlock[]
  keywords?: string[]
  related?: string[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { key: 'primeros-pasos', title: 'Primeros pasos', description: 'Deja tu negocio listo para recibir reservas.' },
  { key: 'reservas', title: 'Reservas y calendario', description: 'Crear, completar, mover y cancelar citas.' },
  { key: 'clientes', title: 'Clientes', description: 'Tu lista de clientes, su historial e importaciones.' },
  { key: 'equipo', title: 'Tu equipo', description: 'Trabajadores, horarios, comisiones y accesos.' },
  { key: 'link', title: 'Link de reservas', description: 'Cómo reservan tus clientes por su cuenta.' },
  { key: 'avisos', title: 'Correos, recordatorios y sonidos', description: 'Qué se envía a tus clientes y a ti.' },
  { key: 'facturacion', title: 'Facturación SUNAT', description: 'Boletas, facturas, tickets y notas de crédito.' },
  { key: 'reportes', title: 'Reportes', description: 'Ingresos, demanda, pagos al equipo y asistente IA.' },
  { key: 'cuenta', title: 'Plan y cuenta', description: 'Tu plan, sedes y usuarios del equipo.' },
  { key: 'mi-agenda', title: 'Para trabajadores', description: 'Cómo usa su agenda cada persona de tu equipo.' },
]

export const HELP_ARTICLES: HelpArticle[] = [
  // ─── Primeros pasos ──────────────────────────────────────────────────
  {
    slug: 'configurar-negocio',
    category: 'primeros-pasos',
    title: 'Configurar tu negocio',
    summary: 'Nombre, país, moneda, horario de atención y logo.',
    audience: 'business',
    ownerOnly: true,
    link: { href: '/dashboard/settings?tab=business', label: 'Ir a Configuración → Negocio' },
    keywords: ['horario', 'logo', 'moneda', 'zona horaria', 'direccion', 'pais', 'nombre'],
    blocks: [
      { type: 'p', text: 'Es lo primero que conviene completar: el horario de atención define qué horas se pueden reservar.' },
      {
        type: 'steps',
        items: [
          'En el menú, entra a **Configuracion** y abre la pestaña **Negocio**.',
          'En **Informacion basica**, completa el nombre del negocio, el país, la moneda y la zona horaria.',
          'En **Contacto**, agrega la dirección, el teléfono y el email de contacto.',
          'Sube tu logo con **Cambiar logo**. Aparece en tu link de reservas.',
          'Toca **Guardar cambios** al final de esa tarjeta.',
          'Baja hasta **Horario de Atencion**. Activa los días que abres y elige la hora de apertura y cierre de cada uno.',
          'Si todos los días tienen el mismo horario, usa **Aplicar a todos los dias** y luego ajusta solo los distintos.',
          'Toca **Guardar cambios** debajo del horario.',
        ],
      },
      { type: 'tip', text: 'En **Terminologia** puedes cambiar la palabra "Trabajador" por "Barbero", "Estilista" o la que uses. Se cambia en el menú, en las reservas y en los reportes.' },
      { type: 'p', text: 'Cada tarjeta de esta pestaña tiene su propio botón **Guardar cambios**: guarda antes de pasar a la siguiente.' },
    ],
    related: ['crear-servicios', 'agregar-trabajadores', 'compartir-link'],
  },
  {
    slug: 'crear-servicios',
    category: 'primeros-pasos',
    title: 'Crear tus servicios',
    summary: 'Lo que ofreces, con su precio y duración.',
    audience: 'business',
    link: { href: '/dashboard/services', label: 'Ir a Servicios' },
    keywords: ['servicio', 'precio', 'duracion', 'corte', 'catalogo', 'tiempo entre citas', 'foto'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Servicios** y toca **Nuevo Servicio**.',
          'En **Información básica**, escribe el nombre (por ejemplo "Corte + barba") y una descripción si quieres.',
          'En **Precio y duración**, elige cómo se cobra. Lo normal es **Duracion fija**: pon la duración y el precio.',
          'Si quieres, en **Configuración avanzada** agrega **Tiempo entre citas** (minutos antes o después) para limpiar o preparar.',
          'En **Apariencia y estado**, elige un color y, si quieres, sube una **Foto de referencia** que verán tus clientes.',
          'Toca **Crear servicio**.',
        ],
      },
      { type: 'h', text: 'Otras formas de cobrar' },
      {
        type: 'list',
        items: [
          '**Opciones predefinidas**: el cliente elige entre varias duraciones, cada una con su precio.',
          '**Por hora**: el cliente elige cuántas horas; el precio se calcula solo.',
        ],
      },
      { type: 'tip', text: 'Si un servicio solo lo agendas tú (por ejemplo, uno que hay que conversar antes), desactiva **Visible en el link publico de reservas**. Tú y tu equipo pueden seguir creándolo desde el calendario.' },
      { type: 'p', text: 'Para crear uno parecido, abre el menú **⋯** de un servicio y toca **Duplicar**.' },
      { type: 'warning', text: 'Eliminar un servicio también elimina las reservas que lo usaron. Si ya no lo ofreces, mejor desactívalo con **Servicio activo**.' },
    ],
    related: ['agregar-trabajadores', 'personalizar-link'],
  },
  {
    slug: 'agregar-trabajadores',
    category: 'primeros-pasos',
    title: 'Agregar a tu equipo',
    summary: 'Cada persona que atiende, con su foto, servicios y horario.',
    audience: 'business',
    link: { href: '/dashboard/workers', label: 'Ir a Trabajadores' },
    keywords: ['barbero', 'trabajador', 'estilista', 'horario', 'personal', 'equipo', 'foto', 'semanas alternas', 'domingos'],
    blocks: [
      { type: 'p', text: 'En el menú esta sección se llama **Trabajadores**, o el nombre que le pusiste en Configuración (por ejemplo **Barberos**).' },
      {
        type: 'steps',
        items: [
          'Entra a **Trabajadores** y toca **Nuevo trabajador**.',
          'Escribe el nombre, elige un color y sube su **Foto**. La foto la ven tus clientes al elegir con quién atenderse.',
          'En **Servicios que realiza**, marca los servicios que hace. Si no marcas ninguno, se le puede asignar cualquiera.',
          'Si su horario es distinto al del negocio, activa **Horario de trabajo** y marca los días y horas en que trabaja.',
          'Toca **Crear trabajador**.',
        ],
      },
      { type: 'h', text: 'Domingos alternos (Semanas A y B)' },
      { type: 'p', text: 'Si la mitad del equipo trabaja un domingo y la otra mitad el siguiente, en el día que corresponda cambia **Frecuencia** a **Semanas A (alternas)** o **Semanas B (alternas)**. Debajo aparecen las próximas fechas para que confirmes que quedó bien.' },
      { type: 'tip', text: 'Si alguien puede atender a dos clientes al mismo tiempo, activa **Puede atender varios servicios a la vez**.' },
      { type: 'p', text: 'Para que cada persona vea sus citas en su celular, dale acceso a su agenda (ver artículo relacionado).' },
    ],
    related: ['acceso-agenda-trabajador', 'comisiones-propinas', 'bloquear-horario'],
  },
  {
    slug: 'compartir-link',
    category: 'primeros-pasos',
    title: 'Compartir tu link de reservas',
    summary: 'Para que tus clientes reserven solos, a cualquier hora.',
    audience: 'business',
    ownerOnly: true,
    link: { href: '/dashboard/settings?tab=business', label: 'Ir a Configuración → Negocio' },
    keywords: ['link', 'enlace', 'instagram', 'whatsapp', 'web', 'insertar', 'widget', 'url'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Configuracion** → pestaña **Negocio**.',
          'Busca la tarjeta **Link para reservas** y toca **Copiar**.',
          'Pégalo en la bio de tu Instagram, en tu WhatsApp Business y en tu perfil de Google.',
        ],
      },
      { type: 'p', text: 'En **Link personalizado** puedes cambiar la parte final del link (por ejemplo, el nombre de tu barbería).' },
      { type: 'h', text: 'Ponerlo dentro de tu página web' },
      { type: 'p', text: 'En **Insertar en tu web** copia el código y pégalo en tu página. Tus clientes reservan sin salir de tu sitio.' },
    ],
    related: ['personalizar-link', 'como-reserva-cliente'],
  },

  // ─── Reservas ────────────────────────────────────────────────────────
  {
    slug: 'crear-reserva',
    category: 'reservas',
    title: 'Crear una reserva',
    summary: 'Agendar una cita desde el calendario.',
    audience: 'business',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['reserva', 'cita', 'agendar', 'nueva', 'turno', 'visita', 'cita pasada'],
    blocks: [
      {
        type: 'steps',
        items: [
          'En **Calendario**, toca **Nueva Reserva**. También puedes tocar un espacio libre del calendario y elegir **Nueva reserva**.',
          'En **Cliente**, busca por nombre, teléfono, correo o DNI. Si es nuevo, toca **+ Crear cliente nuevo**.',
          'Elige el **Servicio**.',
          'Elige la **Fecha**.',
          'Elige quién lo atiende. Los que no trabajan ese día aparecen en gris con **No trabaja este dia**.',
          'Elige la **Hora**. Solo aparecen los horarios libres.',
          'Revisa el precio (se llena solo, pero puedes cambiarlo) y agrega notas si hace falta.',
          'Toca **Crear reserva**.',
        ],
      },
      { type: 'h', text: 'Otros botones del calendario' },
      {
        type: 'list',
        items: [
          '**Nueva Visita**: alguien que viene a conocer el local o a preguntar. No cuenta como venta.',
          '**Registrar cita pasada**: para anotar una cita que ya ocurrió. Se guarda como completada.',
          '**Bloquear horario**: para almuerzos, cierres o días libres.',
        ],
      },
    ],
    related: ['completar-cita', 'reservas-recurrentes', 'estados-reserva'],
  },
  {
    slug: 'estados-reserva',
    category: 'reservas',
    title: 'Estados de una reserva',
    summary: 'Pendiente, confirmada, completada, no-show y cancelada.',
    audience: 'business',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['pendiente', 'confirmar', 'confirmada', 'no-show', 'no vino', 'estado', 'aprobar'],
    blocks: [
      {
        type: 'list',
        items: [
          '**Pendiente**: llegó por tu link de reservas y falta que la confirmes.',
          '**Confirmada**: la cita está en pie.',
          '**Completada**: el cliente fue atendido.',
          '**No-show**: el cliente no vino.',
          '**Cancelada**: ya no va.',
        ],
      },
      { type: 'h', text: 'Cambiar el estado' },
      {
        type: 'steps',
        items: [
          'Abre la reserva en el calendario.',
          'Toca **Acciones**.',
          'Elige la opción: **Confirmar reserva**, **Marcar como completada**, **Marcar como no-show**, **Volver a pendiente** o **Cancelar reserva**.',
        ],
      },
      { type: 'p', text: 'Cuando confirmas una reserva que llegó por tu link, el cliente recibe un correo avisándole que su cita fue aprobada.' },
      { type: 'tip', text: 'Si te equivocas, aparece un aviso con el botón **Deshacer** durante unos segundos.' },
    ],
    related: ['completar-cita', 'cancelar-reprogramar'],
  },
  {
    slug: 'completar-cita',
    category: 'reservas',
    title: 'Completar una cita y registrar el pago',
    summary: 'Cómo pagó el cliente y cuánto dejó de propina.',
    audience: 'business',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['completar', 'pago', 'cobrar', 'efectivo', 'yape', 'plin', 'tarjeta', 'propina', 'metodo de pago'],
    blocks: [
      { type: 'p', text: 'iPlanit no cobra nada al cliente: solo anota cómo te pagó, para tu control y tus reportes.' },
      {
        type: 'steps',
        items: [
          'Abre la reserva en el calendario.',
          'Toca **Acciones** → **Marcar como completada**.',
          'En **¿Cómo pagó?**, elige el método: efectivo, Yape, Plin, tarjeta, etc.',
          'Si dejó propina, escribe el monto en **Propina (opcional)**.',
          'Toca **Completar y registrar pago**.',
        ],
      },
      { type: 'p', text: 'Si no sabes cómo pagó, toca **Completar sin registrar pago**. Más tarde puedes agregarlo desde **Acciones** → **Registrar método de pago**.' },
      { type: 'tip', text: 'En Perú, si tienes facturación activa, la reserva queda abierta después de completar para que emitas la boleta o factura de inmediato.' },
      { type: 'p', text: 'La propina se reparte entre el trabajador y el negocio según lo que configures en **Comisiones y propinas**.' },
    ],
    related: ['emitir-comprobante', 'comisiones-propinas'],
  },
  {
    slug: 'cancelar-reprogramar',
    category: 'reservas',
    title: 'Mover o cancelar una reserva',
    summary: 'Cambiar fecha, hora o trabajador, o cancelarla.',
    audience: 'business',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['cancelar', 'mover', 'reprogramar', 'cambiar hora', 'cambiar fecha', 'editar', 'cancelacion tardia'],
    blocks: [
      { type: 'h', text: 'Mover a otra fecha u hora' },
      {
        type: 'steps',
        items: [
          'Abre la reserva y toca **Editar**.',
          'Cambia la fecha, el trabajador o la hora.',
          'Toca **Guardar cambios**.',
        ],
      },
      { type: 'h', text: 'Cancelar' },
      {
        type: 'steps',
        items: [
          'Abre la reserva y toca **Acciones** → **Cancelar reserva**.',
          'Confirma con **Si, cancelar**.',
        ],
      },
      { type: 'p', text: 'Si la reserva es parte de una serie, en **Acciones** también aparece **Cancelar sesiones restantes** para cancelar todas las futuras.' },
      { type: 'h', text: 'Cuando cancela el cliente' },
      { type: 'p', text: 'El cliente puede cancelar desde el enlace de su correo de confirmación. Si cancela con menos anticipación que tu **Politica de cancelacion** (Configuracion → Negocio), queda anotado como cancelación tardía en su historial. No se cobra nada automáticamente.' },
      { type: 'warning', text: 'Si la reserva ya tiene una boleta o factura, cancelarla no anula el comprobante en SUNAT. Si devolviste el dinero, anúlalo con una nota de crédito.' },
    ],
    related: ['estados-reserva', 'anular-comprobante'],
  },
  {
    slug: 'reservas-recurrentes',
    category: 'reservas',
    title: 'Reservas que se repiten',
    summary: 'Clientes que vienen cada semana o cada dos semanas.',
    audience: 'business',
    plan: 'pro',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['repetir', 'recurrente', 'serie', 'paquete', 'sesiones', 'cada semana', 'quincenal'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Crea la reserva como siempre, con la fecha de la primera sesión.',
          'Activa **Repetir**.',
          'Marca los **Días de la semana**.',
          'En **Repetir cada (semanas)** pon 1 para cada semana o 2 para cada dos semanas.',
          'En **Cantidad de sesiones**, pon cuántas citas crear.',
          'Toca **Crear reserva**.',
        ],
      },
      { type: 'p', text: 'Si vendes un paquete, activa **El precio de arriba es el total del paquete**: el precio se reparte entre las sesiones.' },
      { type: 'p', text: 'Si algún horario ya estaba ocupado, esa sesión no se crea y te muestra cuáles fueron.' },
    ],
    related: ['crear-reserva', 'cancelar-reprogramar'],
  },
  {
    slug: 'bloquear-horario',
    category: 'reservas',
    title: 'Bloquear un horario',
    summary: 'Almuerzos, cierres o días libres de alguien.',
    audience: 'business',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['bloquear', 'almuerzo', 'feriado', 'cierre', 'dia libre', 'vacaciones', 'descanso'],
    blocks: [
      {
        type: 'steps',
        items: [
          'En **Calendario**, toca **Bloquear horario**.',
          'En **¿A quién aplica?**, elige **Todo el negocio** o una persona.',
          'Elige **Una vez** (por ejemplo, un feriado) o **Cada semana** (por ejemplo, el almuerzo diario).',
          'Elige la fecha o los días, y el horario. Marca **Todo el día** si no se atiende nada.',
          'Escribe un motivo si quieres y toca **Bloquear**.',
        ],
      },
      { type: 'p', text: 'En ese tiempo nadie puede reservar desde tu link. Para quitarlo, abre **Bloquear horario** y en **Bloqueos activos** toca **Quitar**.' },
      { type: 'tip', text: 'También puedes tocar un espacio del calendario y elegir **Bloquear este horario**.' },
    ],
    related: ['agregar-trabajadores'],
  },

  // ─── Clientes ────────────────────────────────────────────────────────
  {
    slug: 'clientes',
    category: 'clientes',
    title: 'Tu lista de clientes',
    summary: 'Agregar, buscar, editar y escribir por WhatsApp.',
    audience: 'business',
    link: { href: '/dashboard/clients', label: 'Ir a Clientes' },
    keywords: ['cliente', 'buscar', 'telefono', 'dni', 'whatsapp', 'historial', 'notas', 'cumpleaños'],
    blocks: [
      { type: 'p', text: 'Los clientes que reservan por tu link se agregan solos. También puedes agregarlos a mano.' },
      {
        type: 'steps',
        items: [
          'Entra a **Clientes** y toca **Nuevo Cliente**.',
          'Escribe el nombre y al menos un correo o un teléfono.',
          'Si quieres, agrega su documento, su cumpleaños y notas (por ejemplo, cómo le gusta el corte).',
          'Toca **Crear cliente**.',
        ],
      },
      { type: 'p', text: 'Para encontrar a alguien, usa el buscador: funciona con nombre, teléfono, correo o DNI.' },
      { type: 'p', text: 'Desde la lista puedes tocar **Escribir por WhatsApp** para abrir una conversación con el cliente.' },
      { type: 'p', text: 'El **Historial de Reservas** de cada cliente está disponible en el plan Premium.' },
      { type: 'warning', text: 'Eliminar un cliente también elimina todas sus reservas, pasadas y futuras.' },
    ],
    related: ['importar-clientes', 'cumpleanos'],
  },
  {
    slug: 'importar-clientes',
    category: 'clientes',
    title: 'Importar o exportar clientes',
    summary: 'Traer tus clientes desde Excel o descargarlos.',
    audience: 'business',
    plan: 'pro',
    link: { href: '/dashboard/clients', label: 'Ir a Clientes' },
    keywords: ['importar', 'exportar', 'csv', 'excel', 'migrar', 'sistema anterior', 'descargar'],
    blocks: [
      {
        type: 'steps',
        items: [
          'En Excel, deja una fila de títulos con columnas como nombre, correo, telefono, documento y notas.',
          'Guarda el archivo como **CSV**.',
          'En **Clientes**, toca **Importar CSV** y elige el archivo.',
          'Revisa el resumen: **Nuevos**, **Duplicados** (ya existen con el mismo correo o teléfono) e **Invalidos** (sin nombre, o sin correo ni teléfono).',
          'Toca **Importar** para agregar los nuevos.',
        ],
      },
      { type: 'p', text: 'Importar está disponible desde el plan Pro. **Exportar CSV** (descargar tu lista) es del plan Premium.' },
      { type: 'tip', text: '¿Tienes muchos clientes de otro sistema? Escríbenos y te ayudamos a migrarlos.' },
    ],
    related: ['clientes'],
  },

  // ─── Equipo ──────────────────────────────────────────────────────────
  {
    slug: 'acceso-agenda-trabajador',
    category: 'equipo',
    title: 'Dar acceso a su agenda a un trabajador',
    summary: 'Cada persona ve sus citas en su celular. Gratis y de solo lectura.',
    audience: 'business',
    link: { href: '/dashboard/workers', label: 'Ir a Trabajadores' },
    keywords: ['acceso', 'agenda', 'barbero', 'celular', 'invitar', 'mi agenda', 'cuenta'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Trabajadores**.',
          'En la tarjeta de la persona, toca el menú **⋯** → **Acceso a su agenda**.',
          'Escribe su email y toca **Dar acceso**.',
          'Le llega un correo. Si no lo ve, toca **Copiar mensaje para WhatsApp** y envíaselo.',
          'La persona crea su cuenta con ese mismo email y ya ve su agenda.',
        ],
      },
      { type: 'h', text: 'Qué ve y qué no' },
      {
        type: 'list',
        items: [
          'Ve sus propias citas del día, la semana y el mes, y sus números.',
          'No ve las citas de otros, ni los datos de contacto de los clientes, ni la configuración del negocio.',
          'No puede editar nada.',
        ],
      },
      { type: 'p', text: 'Para quitarle el acceso, abre la misma ventana y toca **Quitar acceso**. No usa cupos de tu plan.' },
    ],
    related: ['usar-mi-agenda', 'calendario-trabajador', 'comisiones-propinas'],
  },
  {
    slug: 'comisiones-propinas',
    category: 'equipo',
    title: 'Comisiones y propinas',
    summary: 'Cuánto le toca a cada trabajador de cada servicio y de las propinas.',
    audience: 'business',
    plan: 'pro',
    link: { href: '/dashboard/workers', label: 'Ir a Trabajadores' },
    keywords: ['comision', 'propina', 'porcentaje', 'sueldo', 'pago', 'barbero', 'igv', 'alquiler de silla', 'liquidacion'],
    blocks: [
      { type: 'p', text: 'iPlanit no mueve dinero: calcula cuánto le corresponde a cada persona para que sepas cuánto pagarle, y cada uno vea lo que ganó.' },
      { type: 'h', text: '1. Reglas del negocio (una sola vez)' },
      {
        type: 'steps',
        items: [
          'Entra a **Trabajadores** y toca **Comisiones y propinas**.',
          'En **% de cada propina para el trabajador**, pon 100 si toda la propina es suya, u 80 si se reparte 80/20.',
          'En Perú, activa **Calcular la comisión sin IGV** si la comisión se calcula sobre el precio sin IGV.',
          'Activa **Mostrar a los trabajadores el total cobrado** solo si quieres que vean el total y no solo su parte.',
          'Toca **Guardar cambios**. Solo el dueño puede cambiar estas reglas.',
        ],
      },
      { type: 'h', text: '2. Forma de pago de cada persona' },
      {
        type: 'steps',
        items: [
          'En **Trabajadores**, abre el menú **⋯** de la persona → **Editar**.',
          'En la sección **Pago**, elige **Comisión por servicio** y escribe su %. Por ejemplo, 40 = 40% para él y 60% para el negocio.',
          'Si tiene sueldo fijo, elige **Sueldo fijo**: no recibe parte de los servicios, pero sí de sus propinas.',
          'Toca **Guardar cambios**.',
        ],
      },
      { type: 'tip', text: 'Si alquila la silla y todo lo que cobra es suyo, ponle comisión de 100%.' },
      { type: 'h', text: '3. Registrar la propina' },
      { type: 'p', text: 'Al completar cada cita, escribe la propina en **¿Cómo pagó?** → **Propina (opcional)**.' },
      { type: 'h', text: '4. Ver cuánto pagar' },
      { type: 'p', text: 'En **Reportes** → pestaña **Pagos**, elige el periodo (por ejemplo, la quincena) y verás lo que le toca a cada uno. Puedes descargarlo con **Exportar (CSV)**.' },
      { type: 'h', text: 'Bueno saber' },
      {
        type: 'list',
        items: [
          'Cuentan las citas completadas y las confirmadas que ya pasaron. Marca las inasistencias como **No-show** para que no se paguen.',
          'Si cambias el % de alguien, el cambio vale desde ese momento: las citas ya completadas mantienen el % que tenían.',
          'El trabajador ve su ganancia en su agenda, con el mismo cálculo que ves tú.',
        ],
      },
    ],
    related: ['completar-cita', 'reporte-pagos', 'acceso-agenda-trabajador'],
  },
  {
    slug: 'calendario-trabajador',
    category: 'equipo',
    title: 'Ver las citas en Google Calendar o iPhone',
    summary: 'Las reservas de cada persona en su calendario personal.',
    audience: 'business',
    link: { href: '/dashboard/workers', label: 'Ir a Trabajadores' },
    keywords: ['google calendar', 'apple', 'iphone', 'outlook', 'sincronizar', 'calendario'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Trabajadores**.',
          'En la tarjeta de la persona, toca **⋯** → **Enlace de calendario**.',
          'Toca **Agregar a Google Calendar** o **Agregar a Apple Calendar / Outlook**, desde el celular de esa persona.',
        ],
      },
      { type: 'p', text: 'Las citas se actualizan solas cada cierto tiempo, no al instante. Las cancelaciones no aparecen.' },
    ],
    related: ['acceso-agenda-trabajador'],
  },
  {
    slug: 'usuarios-equipo',
    category: 'cuenta',
    title: 'Usuarios que manejan el sistema contigo',
    summary: 'Recepcionistas o administradores con su propia cuenta.',
    audience: 'business',
    ownerOnly: true,
    plan: 'pro',
    link: { href: '/dashboard/settings?tab=team', label: 'Ir a Configuración → Equipo' },
    keywords: ['usuario', 'recepcion', 'administrador', 'ventas', 'rol', 'permisos', 'cupos', 'cuenta'],
    blocks: [
      { type: 'p', text: 'Esto es distinto del acceso a la agenda de un trabajador: aquí la persona trabaja dentro del sistema, crea reservas y atiende clientes.' },
      {
        type: 'steps',
        items: [
          'Pídele a la persona que primero cree su cuenta en iPlanit.',
          'Entra a **Configuracion** → pestaña **Equipo**.',
          'Escribe su correo, elige el rol y toca **Agregar**.',
        ],
      },
      {
        type: 'list',
        items: [
          '**Administrador**: maneja reservas, clientes, servicios, trabajadores y reportes. No cambia la configuración del negocio.',
          '**Ventas**: solo reservas y clientes.',
        ],
      },
      { type: 'p', text: 'El plan Pro incluye 2 cuentas y el Premium 5. En Premium puedes comprar cupos extra.' },
    ],
    related: ['acceso-agenda-trabajador'],
  },

  // ─── Link de reservas ────────────────────────────────────────────────
  {
    slug: 'como-reserva-cliente',
    category: 'link',
    title: 'Cómo reserva tu cliente',
    summary: 'Lo que ve tu cliente al usar tu link.',
    audience: 'business',
    keywords: ['cliente reserva', 'link', 'online', 'pendiente', 'confirmar'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Abre tu link y elige el servicio.',
          'Si lo activaste, elige con quién atenderse (o **Sin preferencia**).',
          'Elige el día y la hora. Solo ve horarios libres.',
          'Escribe sus datos y confirma.',
        ],
      },
      { type: 'p', text: 'La reserva te llega como **Pendiente**, con un sonido y un aviso en el sistema. Cuando la confirmas, el cliente recibe un correo.' },
      { type: 'p', text: 'El cliente puede cancelar su cita desde el enlace que le llega por correo.' },
    ],
    related: ['compartir-link', 'personalizar-link', 'estados-reserva'],
  },
  {
    slug: 'personalizar-link',
    category: 'link',
    title: 'Personalizar tu link de reservas',
    summary: 'Tipografía, colores y que el cliente elija con quién atenderse.',
    audience: 'business',
    ownerOnly: true,
    link: { href: '/dashboard/settings?tab=business', label: 'Ir a Configuración → Negocio' },
    keywords: ['estilo', 'color', 'tipografia', 'fondo', 'elegir barbero', 'con quien', 'marca'],
    blocks: [
      { type: 'h', text: 'Que el cliente elija con quién atenderse' },
      { type: 'p', text: 'En **Configuracion** → **Negocio**, activa **Tus clientes eligen quién los atiende**. Aparece un paso **¿Con quién?** con la foto de cada trabajador.' },
      { type: 'h', text: 'Colores y tipografía' },
      {
        type: 'steps',
        items: [
          'En la misma pestaña, busca **Estilo de tu link de reservas**.',
          'Elige la **Tipografía** y el **Color principal**. Si lo insertas en tu web, elige también el **Color de fondo**.',
          'Mira la **Vista previa** y toca **Guardar cambios**.',
        ],
      },
      { type: 'tip', text: 'Sube fotos a tus servicios y a tus trabajadores: el link se ve mucho más profesional.' },
    ],
    related: ['compartir-link', 'agregar-trabajadores'],
  },

  // ─── Avisos ──────────────────────────────────────────────────────────
  {
    slug: 'correos-recordatorios',
    category: 'avisos',
    title: 'Correos y recordatorios a tus clientes',
    summary: 'Qué correos se envían y cómo mandar un recordatorio por WhatsApp.',
    audience: 'business',
    link: { href: '/dashboard/settings?tab=notifications', label: 'Ir a Configuración → Alertas' },
    keywords: ['correo', 'email', 'recordatorio', 'whatsapp', 'confirmacion', 'mensaje', 'notificacion'],
    blocks: [
      { type: 'h', text: 'Recordatorio automático por correo' },
      {
        type: 'steps',
        items: [
          'Entra a **Configuracion** → pestaña **Alertas**.',
          'Activa **Recordatorios** y elige la **Anticipacion del recordatorio** (por ejemplo, 24 horas antes).',
          'Si quieres, cambia el texto en **Mensaje del recordatorio**.',
          'Toca **Guardar cambios**.',
        ],
      },
      { type: 'p', text: 'Si alguien reserva con muy poca anticipación, no se le manda recordatorio: no hace falta.' },
      { type: 'h', text: 'Recordatorio por WhatsApp' },
      { type: 'p', text: 'Abre la reserva y toca **Recordatorio por WhatsApp**. Se abre WhatsApp con el mensaje listo; solo tienes que enviarlo.' },
      { type: 'h', text: 'Avisos para ti' },
      { type: 'p', text: 'En la misma pestaña eliges si quieres recibir un correo cuando llega una reserva nueva (**Confirmaciones de reserva**) o cuando se cancela una (**Cancelaciones**).' },
    ],
    related: ['resenas-google', 'cumpleanos', 'sonidos'],
  },
  {
    slug: 'resenas-google',
    category: 'avisos',
    title: 'Pedir reseñas de Google',
    summary: 'Un correo automático después de la cita, pidiendo una reseña.',
    audience: 'business',
    ownerOnly: true,
    link: { href: '/dashboard/settings?tab=business', label: 'Ir a Configuración → Negocio' },
    keywords: ['google', 'reseña', 'opinion', 'estrellas', 'review'],
    blocks: [
      {
        type: 'steps',
        items: [
          'En tu perfil de Google Business Profile, toca **Obtener más reseñas** y copia el enlace.',
          'En iPlanit, entra a **Configuracion** → **Negocio** → **Reseñas de Google**.',
          'Pega el enlace y toca **Guardar cambios**.',
        ],
      },
      { type: 'p', text: 'Unas horas después de cada cita, el cliente recibe un correo de agradecimiento con el enlace. Para no cansarlo, a cada cliente se le pide como máximo una vez cada 6 meses.' },
      { type: 'p', text: 'Si borras el enlace, se deja de enviar.' },
    ],
    related: ['correos-recordatorios'],
  },
  {
    slug: 'cumpleanos',
    category: 'avisos',
    title: 'Saludos de cumpleaños',
    summary: 'Un correo automático en el cumpleaños de tus clientes.',
    audience: 'business',
    link: { href: '/dashboard/settings?tab=notifications', label: 'Ir a Configuración → Alertas' },
    keywords: ['cumpleaños', 'descuento', 'saludo'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Configuracion** → **Alertas** → **Cumpleaños de clientes**.',
          'Activa **Enviar correo de cumpleaños**.',
          'Si quieres, escribe un descuento a mencionar (lo aplicas tú al cobrar).',
          'Elige cuándo enviarlo: **El mismo día**, **Esa semana** o **Ese mes**.',
          'Toca **Guardar cambios**.',
        ],
      },
      { type: 'p', text: 'Solo les llega a los clientes que tienen su cumpleaños y su correo guardados.' },
    ],
    related: ['clientes'],
  },
  {
    slug: 'sonidos',
    category: 'avisos',
    title: 'Sonidos de aviso',
    summary: 'Un sonido cuando alguien reserva o cancela.',
    audience: 'business',
    link: { href: '/dashboard/settings?tab=notifications', label: 'Ir a Configuración → Alertas' },
    keywords: ['sonido', 'silenciar', 'campana', 'notificacion', 'ruido'],
    blocks: [
      { type: 'p', text: 'Suena cuando pasa algo que no hiciste tú: un cliente reserva desde tu link, alguien del equipo cambia una reserva o se cancela una cita. Tus propias acciones no suenan.' },
      { type: 'p', text: 'Para silenciarlo en un equipo, entra a **Configuracion** → **Alertas** → **Sonidos** y desactiva **Sonidos de notificacion en este dispositivo**. Con **Probar** escuchas cómo suena.' },
      { type: 'tip', text: 'Se guarda por dispositivo: puedes silenciar la computadora de recepción y dejarlo activo en tu celular.' },
    ],
  },

  // ─── Facturación ─────────────────────────────────────────────────────
  {
    slug: 'activar-facturacion',
    category: 'facturacion',
    title: 'Activar la facturación SUNAT',
    summary: 'Lo que necesitas para emitir boletas y facturas.',
    audience: 'business',
    ownerOnly: true,
    plan: 'premium',
    link: { href: '/dashboard/settings?tab=invoicing', label: 'Ir a Configuración → Facturación' },
    keywords: ['sunat', 'factura', 'boleta', 'ruc', 'facturacion electronica', 'series', 'igv', 'pse'],
    blocks: [
      { type: 'p', text: 'Está incluida en el plan Premium, con 1,000 comprobantes al mes.' },
      {
        type: 'steps',
        items: [
          'Escríbenos para conectar tu RUC. Te guiamos con el trámite en SUNAT (alta del proveedor de facturación); se hace una sola vez.',
          'Mientras tanto, entra a **Configuracion** → pestaña **Facturacion**.',
          'En **Datos de tu empresa**, completa RUC, razón social y dirección fiscal.',
          'En **Impuestos**, deja marcado **Mis precios ya incluyen IGV** si tus precios ya lo incluyen (lo normal).',
          'En **Series**, revisa las series. Si antes facturabas con otro sistema, usa series distintas para no repetir números.',
          'Toca **Guardar**.',
          'Cuando tu cuenta diga **Conectado**, activa **Activar emision de comprobantes** y guarda.',
        ],
      },
      { type: 'p', text: 'Al principio puede estar en **modo pruebas**: los comprobantes de prueba no se envían a SUNAT.' },
    ],
    related: ['emitir-comprobante'],
  },
  {
    slug: 'emitir-comprobante',
    category: 'facturacion',
    title: 'Emitir una boleta o factura',
    summary: 'Al terminar la cita, en un par de toques.',
    audience: 'business',
    plan: 'premium',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['emitir', 'boleta', 'factura', 'comprobante', 'imprimir', 'ticket', 'pdf', 'whatsapp', 'enviar'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Completa la cita y registra cómo pagó (ver artículo relacionado).',
          'En la misma reserva, en **Comprobante electronico**, toca **Emitir comprobante**.',
          'Elige **Boleta** o **Factura**. Para factura, el cliente necesita RUC.',
          'Revisa el monto y toca **Emitir**.',
          'Cuando diga **Aceptado**, el comprobante es válido ante SUNAT.',
        ],
      },
      { type: 'h', text: 'Entregárselo al cliente' },
      {
        type: 'list',
        items: [
          '**Imprimir ticket**: lo imprime en tu impresora de tickets.',
          '**WhatsApp**: abre WhatsApp con el enlace al comprobante.',
          '**Correo**: se lo envía por email.',
          '**PDF**: abre el comprobante en tamaño A4.',
        ],
      },
      { type: 'p', text: 'Si dice **Esperando a SUNAT** o **Error**, el sistema reintenta solo cada hora. También puedes tocar **Reintentar**.' },
      { type: 'warning', text: 'Si después cambias el precio de la reserva, el comprobante no cambia. Si el monto estaba mal, anúlalo y emite uno nuevo.' },
    ],
    related: ['completar-cita', 'anular-comprobante'],
  },
  {
    slug: 'anular-comprobante',
    category: 'facturacion',
    title: 'Anular un comprobante',
    summary: 'Con una nota de crédito, por ejemplo si devolviste el dinero.',
    audience: 'business',
    plan: 'premium',
    link: { href: '/dashboard/calendar', label: 'Ir al Calendario' },
    keywords: ['anular', 'nota de credito', 'devolucion', 'error', 'corregir'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Abre la reserva que tiene el comprobante.',
          'En **Comprobante electronico**, toca **Anular**.',
          'Escribe el **Motivo** (por ejemplo, "Error en el monto").',
          'Toca **Emitir nota de credito**.',
        ],
      },
      { type: 'p', text: 'El comprobante queda como **Anulado**. Si correspondía cobrar otro monto, emite uno nuevo.' },
      { type: 'warning', text: 'Cancelar la reserva o cambiarle el estado NO anula el comprobante. Siempre hay que anularlo desde aquí.' },
    ],
    related: ['emitir-comprobante'],
  },

  // ─── Reportes ────────────────────────────────────────────────────────
  {
    slug: 'reportes',
    category: 'reportes',
    title: 'Tus reportes',
    summary: 'Ingresos, ocupación, servicios más pedidos y clientes.',
    audience: 'business',
    link: { href: '/dashboard/analytics', label: 'Ir a Reportes' },
    keywords: ['reportes', 'ingresos', 'ventas', 'ocupacion', 'estadisticas', 'exportar', 'demanda', 'clientes en riesgo'],
    blocks: [
      { type: 'p', text: 'Entra a **Reportes** y elige el periodo arriba: 7 días, 30 días, 90 días, este año o todo.' },
      {
        type: 'list',
        items: [
          '**Resumen**: ingresos, reservas, ocupación y retención de clientes, comparados con el periodo anterior.',
          '**Demanda**: los días y horas con más reservas.',
          '**Servicios**: cuáles se piden más y cuánto generan.',
          '**Clientes**: frecuentes, nuevos y los que dejaron de venir.',
          '**Equipo** (Premium): reservas e ingresos por trabajador.',
          '**Pagos** (Pro): cuánto pagarle a cada trabajador.',
        ],
      },
      { type: 'p', text: 'Algunas pestañas dependen de tu plan. Para descargar las reservas, usa **Exportar reservas (CSV)** en el Resumen.' },
    ],
    related: ['reporte-pagos', 'asistente-ia'],
  },
  {
    slug: 'reporte-pagos',
    category: 'reportes',
    title: 'Cuánto pagarle a cada trabajador',
    summary: 'La liquidación de comisiones y propinas del periodo.',
    audience: 'business',
    plan: 'pro',
    link: { href: '/dashboard/analytics?tab=pay', label: 'Ir a Reportes → Pagos' },
    keywords: ['pagos', 'liquidacion', 'quincena', 'comision', 'propinas', 'cuanto pagar'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Reportes** → pestaña **Pagos**.',
          'Arriba, elige el periodo. Para una quincena, usa **Personalizado** y marca las fechas.',
          'En **A pagar** ves lo que le toca a cada persona: su parte de los servicios más su parte de las propinas.',
          'Toca **Exportar (CSV)** si quieres guardarlo o enviarlo.',
        ],
      },
      { type: 'p', text: 'Si alguien aparece **Sin configurar**, primero ponle su forma de pago en Trabajadores (ver artículo relacionado).' },
    ],
    related: ['comisiones-propinas'],
  },
  {
    slug: 'asistente-ia',
    category: 'reportes',
    title: 'Preguntarle al asistente de IA',
    summary: 'Respuestas sobre tu negocio en lenguaje normal.',
    audience: 'business',
    plan: 'pro',
    link: { href: '/dashboard/analytics?tab=ai-chat', label: 'Ir al asistente' },
    keywords: ['ia', 'inteligencia artificial', 'asistente', 'chat', 'preguntar'],
    blocks: [
      { type: 'p', text: 'En **Reportes** → **Preguntá a la IA** puedes escribir preguntas como "¿Cuál fue mi mejor día este mes?" o "¿Qué clientes no vienen hace tiempo?".' },
      { type: 'p', text: 'Es un complemento de $7 al mes para los planes Pro y Premium. Se activa en **Configuracion** → **Plan** → **Asistente de IA**.' },
    ],
    related: ['reportes'],
  },

  // ─── Cuenta ──────────────────────────────────────────────────────────
  {
    slug: 'plan',
    category: 'cuenta',
    title: 'Tu plan y tu suscripción',
    summary: 'Ver tu plan, cambiarlo o actualizar tu tarjeta.',
    audience: 'business',
    ownerOnly: true,
    link: { href: '/dashboard/settings?tab=plan', label: 'Ir a Configuración → Plan' },
    keywords: ['plan', 'precio', 'tarjeta', 'suscripcion', 'cancelar', 'basic', 'pro', 'premium', 'factura iplanit'],
    blocks: [
      {
        type: 'list',
        items: [
          '**Basic** ($15/mes): 100 reservas al mes y hasta 5 recursos.',
          '**Pro** ($25/mes): 500 reservas al mes, reportes, reservas recurrentes, comisiones y 2 usuarios del equipo.',
          '**Premium** ($45/mes): todo ilimitado, facturación SUNAT, varias sedes y 5 usuarios del equipo.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Entra a **Configuracion** → pestaña **Plan**.',
          'Para subir de plan, toca **Ver planes** y elige uno. Antes de cobrar te muestra el monto.',
          'Para cambiar la tarjeta, descargar tus recibos o cancelar, toca **Gestionar suscripcion**.',
        ],
      },
    ],
    related: ['usuarios-equipo', 'sedes'],
  },
  {
    slug: 'sedes',
    category: 'cuenta',
    title: 'Varias sedes',
    summary: 'Manejar más de un local desde la misma cuenta.',
    audience: 'business',
    ownerOnly: true,
    plan: 'premium',
    link: { href: '/dashboard/settings?tab=business', label: 'Ir a Configuración → Negocio' },
    keywords: ['sede', 'local', 'sucursal', 'otra tienda'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Entra a **Configuracion** → **Negocio** → **Sedes**.',
          'Toca **Agregar otra sede**, escribe el nombre y toca **Crear sede**.',
          'Cambia de sede desde el selector del menú y configura sus servicios, trabajadores y horario.',
        ],
      },
      { type: 'p', text: 'Cada sede tiene sus propios servicios, horarios y reservas. Los clientes son los mismos en todas.' },
    ],
    related: ['plan'],
  },

  // ─── Para trabajadores (/mi-agenda) ──────────────────────────────────
  {
    slug: 'usar-mi-agenda',
    category: 'mi-agenda',
    title: 'Tu agenda en el celular',
    summary: 'Cómo entrar y qué puedes ver.',
    audience: 'worker',
    link: { href: '/mi-agenda', label: 'Ir a mi agenda' },
    keywords: ['mi agenda', 'entrar', 'citas', 'celular', 'barbero', 'cuenta'],
    blocks: [
      { type: 'h', text: 'Entrar por primera vez' },
      {
        type: 'steps',
        items: [
          'Abre el enlace que te mandó el negocio por correo o WhatsApp.',
          'Crea tu cuenta con el **mismo email** al que te invitaron.',
          'Listo: verás tu agenda. Guárdala en la pantalla de inicio de tu celular para abrirla rápido.',
        ],
      },
      { type: 'h', text: 'Qué ves' },
      {
        type: 'list',
        items: [
          'Tus citas por **Día**, **Semana** o **Mes**, con el cliente, el servicio y las notas.',
          '**Citas**, **Atendidas** y **No vinieron** del periodo.',
          'Lo que generaste, o **Tu ganancia** si el negocio configuró tu comisión.',
        ],
      },
      { type: 'p', text: 'Es solo de lectura. Para mover o cancelar una cita, avísale al negocio.' },
      { type: 'tip', text: '¿Dice "No tienes una agenda vinculada"? Revisa que hayas entrado con el mismo email al que te invitaron.' },
    ],
    related: ['tu-ganancia'],
  },
  {
    slug: 'tu-ganancia',
    category: 'mi-agenda',
    title: 'Tu ganancia',
    summary: 'Cómo se calcula lo que te toca.',
    audience: 'worker',
    link: { href: '/mi-agenda', label: 'Ir a mi agenda' },
    keywords: ['ganancia', 'comision', 'propina', 'cuanto gane', 'pago'],
    blocks: [
      { type: 'p', text: 'Cuando el negocio configura tu forma de pago, en tu agenda ves **Tu ganancia**:' },
      {
        type: 'list',
        items: [
          '**Servicios**: tu % de cada servicio que atendiste.',
          '**Propinas**: tu parte de las propinas que te dejaron.',
          'En cada cita atendida verás cuánto te tocó, por ejemplo "Tú: S/ 20".',
        ],
      },
      { type: 'p', text: 'Cuentan las citas atendidas. Si un cliente no vino, no suma. Si ves algo raro, habla con el negocio: ellos ven el mismo cálculo.' },
    ],
    related: ['usar-mi-agenda'],
  },
]

export function helpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug)
}

/** Accent- and case-insensitive. */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function articleText(a: HelpArticle): string {
  const blocks = a.blocks
    .map((b) => ('text' in b ? b.text : b.items.join(' ')))
    .join(' ')
  return normalizeForSearch([a.title, a.summary, ...(a.keywords ?? []), blocks].join(' ').replace(/\*\*/g, ''))
}

/** Every word of the query must appear somewhere; title/keyword hits rank first. */
export function searchHelp(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return articles
  return articles
    .map((a) => {
      const text = articleText(a)
      if (!words.every((w) => text.includes(w))) return null
      const head = normalizeForSearch([a.title, ...(a.keywords ?? [])].join(' '))
      const score = words.filter((w) => head.includes(w)).length
      return { a, score }
    })
    .filter((x): x is { a: HelpArticle; score: number } => x !== null)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a)
}
