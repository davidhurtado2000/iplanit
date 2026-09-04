# Roadmap: WhatsApp + Asistente de IA para iPlanit

> Documento de planificación, no de implementación. Nada de esto está construido todavía — es la referencia para decidir qué construir primero y cómo, basada en la investigación de precios/arquitectura de septiembre 2026.

## Resumen ejecutivo

Dos líneas de trabajo separadas, con arquitectura y costo distintos:

1. **WhatsApp** — recordatorios/confirmaciones para negocios cuyos clientes no tienen correo (pedido real de un cliente de prueba). Costo real por mensaje + por número, se cobra como add-on.
2. **Asistente de IA** ("Luna" — nombre de trabajo, a confirmar) — resúmenes y consultas sobre el negocio. Costo casi nulo, se puede incluir en el plan sin medir uso al principio.

No están en el backlog confirmado actual (ToS/privacidad → feedback → logo → modo oscuro → buffer → CSV). Son adicionales, a priorizar aparte.

---

## Parte 1 — WhatsApp

### 1.1 Objetivo

Enviar recordatorios y confirmaciones de reservas por WhatsApp además de (o en vez de) email, para negocios con clientes que no tienen correo.

**Estado (2026-09-02): mecanismo de envío validado de punta a punta en local, sin gastar nada.** Se usó la cuenta trial de Twilio ("Try out WhatsApp", no el Tech Provider Program todavía) con una plantilla gratuita pre-armada de Twilio (no una propia) — confirma que el código (`lib/twilio.ts`, la rama nueva en `app/api/cron/send-reminders/route.ts`, `scripts/076-whatsapp-reminders.sql`) funciona correctamente. Lo que falta para producción real sigue siendo lo de abajo (Fase 0 y una plantilla propia con los datos reales de cada cita, que requiere cargar saldo en Twilio para desbloquear el Content Template Builder).

### 1.2 Arquitectura elegida

- **Proveedor**: Twilio, vía su **Tech Provider Program** (ISV) — sin costo fijo mensual, solo $0.005/mensaje (margen de Twilio) + tarifa de Meta según país + $1-3/mes por número.
- **Un número de WhatsApp por negocio**, no uno compartido para toda la plataforma (protege marca de cada negocio y aísla reputación — si un negocio genera quejas de spam, no afecta a los demás).
- **Onboarding**: Meta **Embedded Signup** — el dueño del negocio conecta su número desde dentro de iPlanit (ventana de Meta, self-service), sin trabajo manual nuestro por cada cliente.
- **Coexistence** (feature 2025-2026): el negocio puede conectar el número que **ya usa hoy** sin perderlo de la app normal de WhatsApp ni perder su historial de chats — reduce fricción de adopción.

### 1.3 Costos (lo confirmado y lo pendiente)

| Ítem | Costo | Estado |
|---|---|---|
| Twilio, plataforma | $0.005/mensaje, sin cuota fija | Confirmado |
| Twilio, número por negocio | $1-3/mes | Confirmado |
| Meta, mensaje "Utility" Perú | — | **Pendiente** — tarifa exacta no encontrada aún (calculadora interactiva, no scrapeable) |
| Meta, cambio de reglas | Desde **1 oct 2026**, mensajes "de servicio" y "utility" dentro de la ventana de 24h dejan de ser gratis | Confirmado — afecta cualquier cálculo hecho antes de esa fecha |

**Alternativa a Twilio para comparar**: 360dialog (~€49-50/mes fijo, cero margen sobre Meta) — mejor a volumen alto, peor para arrancar.

### 1.4 Modelo de cobro al cliente (propuesta)

Cuota incluida + excedente medido vía **Stripe Meters** (herramienta específica para esto, mejorada en 2026):
- Ej: Premium incluye N mensajes/mes, de ahí en más se cobra por mensaje o por paquete de créditos.
- Evita que un negocio con mucho volumen te cueste plata, sin sorprender al que usa poco.

### 1.5 Fases de implementación

**Fase 0 — Setup de plataforma (una sola vez, antes de cualquier código de producto)**
- [ ] Crear Meta App y pasar App Review
- [ ] Vincular la app a Twilio como "Partner Solution"
- [ ] Integrar el SDK de Embedded Signup + Twilio Senders API
- [ ] Confirmar tarifas exactas de Meta para Perú (y cualquier otro país con clientes activos)

**Fase 1 — Conexión por negocio**
- [ ] Nueva sección en Configuración: "Conectar WhatsApp" (mismo patrón visual que el resto de Configuración)
- [ ] Botón abre el flujo de Embedded Signup de Meta
- [ ] Guardar el sender/token resultante — nueva tabla o columnas en `businesses` (algo como `whatsapp_sender_id`, `whatsapp_connected_at`)
- [ ] Gate por plan (Premium, o add-on aparte — a decidir) usando el patrón existente de `components/premium-feature.tsx`

**Fase 2 — Envío de mensajes**
- Reutiliza la infraestructura de notificaciones que ya existe (`lib/email/templates.ts`, `app/api/cron/send-reminders/route.ts`, `app/api/notifications/reservation/route.ts`) — se agrega WhatsApp como canal adicional junto al que ya envía por Resend, no se reemplaza.
- [x] Elegir canal según si el cliente tiene email o no (`app/api/cron/send-reminders/route.ts`) — con email va por Resend igual que siempre, sin email pero con teléfono va por WhatsApp. De paso se corrigió `get_reservations_needing_reminders()` (`scripts/076-whatsapp-reminders.sql`), que hasta ahora excluía por completo a los clientes sin email (no recibían nada, ni por email ni por WhatsApp) - y se corrigió el formulario de "Nuevo cliente" del dashboard, que exigía email siempre aunque la base de datos y el link público de reservas ya permitían solo teléfono.
- [x] Envío real por WhatsApp (`lib/twilio.ts`, `sendWhatsappReminder()`) — confirmado entregando mensajes reales.
- [ ] Plantilla propia con los datos reales de cada cita (fecha, hora, servicio) — hoy usa una plantilla gratuita de muestra de Twilio con texto fijo, sin variables. Requiere cargar saldo en Twilio (Content Template Builder no disponible en trial).
- [ ] Registro de envío con su propia tabla de rate limiting (mismo patrón que `notification_send_log`) - todavía no se agregó, hoy solo depende de `reminder_sent_at` para no reenviar.

**Fase 3 — Medición y cobro**
- [ ] Loggear cada mensaje enviado (para métrica de uso Y para Stripe Meter)
- [ ] Configurar el Meter en Stripe
- [ ] UI de uso en Configuración → Plan (mismo lugar donde ya se muestra uso de servicios/recursos)

**Fase 4 — Comunicación al cliente**
- [ ] Página/sección explicando el add-on (qué incluye, qué pasa si se excede la cuota)
- [ ] Aviso claro antes de activarlo (nada de sorpresas en la factura)

### 1.6 Riesgos / pendientes a resolver antes de construir

- Tarifa exacta de Meta para Perú — sin esto no se puede fijar precio final del add-on con confianza.
- El cambio de reglas del 1 de octubre 2026 puede requerir ajustar el cálculo de costo ni bien salga.
- Tiempo de aprobación de Meta App Review (puede tardar días/semanas) — bloquea todo lo demás, conviene arrancarlo temprano si se decide seguir.

---

## Parte 2 — Asistente de IA ("Luna")

### 2.1 Objetivo y alcance por fases

| Fase | Feature | Complejidad | Costo por uso | Estado |
|---|---|---|---|---|
| 1 | Resúmenes automáticos (resumen del período en Analíticas) | Baja | ~$0.001-0.01 | ✅ Construido y probado (2026-09-02) — `app/api/dashboard/analytics-summary/route.ts`, `components/dashboard/analytics-ai-summary.tsx` |
| 2 | Chat de consultas sobre el negocio, con function-calling real sobre 8 herramientas (resumen, top clientes, retención, recursos, trabajadores, clientes en riesgo, buscar cliente, historial) | Media-alta — se construyó la versión completa, no la simplificada | ~$0.001-0.02 por mensaje | ✅ Construido y probado (2026-09-02) — `app/api/dashboard/ai-chat/route.ts`, `lib/ai-chat-tools.ts`, `components/dashboard/analytics-ai-chat.tsx`, pestaña "Preguntá a la IA" en Analíticas |
| 3 | Agendar automáticamente vía conversación (WhatsApp + IA combinados) | Alta — necesita que la IA pueda "llamar" al motor de disponibilidad real (`lib/availability.ts`), no solo conversar | Variable, más alto que 1 y 2 | Pendiente |

Fase 1 y 2 quedaron dentro de la pestaña "Resumen"/"Preguntá a la IA" de Analíticas, no como apartado propio del sidebar — decisión deliberada mientras sea la única función de IA; reconsiderar cuando se sume una segunda (ej. Fase 3).

### 2.2 Arquitectura

- **Modelo planeado: GPT-5.6 Luna** (OpenAI, lanzado jul. 2026) — la variante más económica/rápida de la familia GPT-5.6, pensada para volumen alto a bajo costo. $0.20/millón tokens entrada, $1.20/millón salida.
- **Modelo realmente usado en Fase 1-2: `gpt-5.4-mini`.** Luna requiere crédito cargado en la cuenta de OpenAI; mientras la cuenta esté en el plan Free sin crédito, `gpt-5.4-mini` funciona sin costo y da resultados igual de buenos para este uso. El código (`lib/openai.ts`, constantes `AI_SUMMARY_MODEL`/`AI_CHAT_MODEL`) está armado para cambiar a Luna en una sola línea el día que se cargue crédito real.
- **Comparado contra la alternativa más cercana de Anthropic (Claude Haiku 4.5: $1.00/$5.00 por millón tokens)**, Luna sale ~5x más barato por token. A la escala actual de iPlanit la diferencia es centavos, pero se vuelve real con volumen — por eso Luna sigue siendo la elección de destino para Fase 1-2, aunque hoy se esté usando `gpt-5.4-mini` por el tema de crédito. Calidad en español para este tipo de tarea no está benchmarkeada todavía; si en algún momento se nota diferencia de calidad, vale la pena probar ambos con datos reales antes de fijar uno definitivo.
- Para Fase 3 (agendar automático, más exigente en razonamiento) evaluar si Luna alcanza o conviene la variante intermedia/superior (Terra/Sol) — más cara pero no se necesita para Fase 1-2.
- El contexto que se le pasa al modelo sale de datos que iPlanit ya tiene (reservas, ingresos, clientes) — no requiere una fuente de datos nueva, sí requiere armar bien qué se le manda (privacidad: nunca mandar datos de otro negocio).
- Fase 3 requiere function-calling (el modelo pide "consultame disponibilidad" y el código responde con datos reales, no que el modelo invente horarios).

### 2.3 Costos

Con GPT-5.6 Luna, un resumen o consulta típica (~3,000 tokens de contexto + 500 de respuesta) cuesta **~$0.0012** — una décima de centavo. Insignificante comparado con WhatsApp. Esto es lo más barato de las dos líneas de trabajo, y la ganancia con cualquier precio que se cobre está prácticamente garantizada.

### 2.4 Modelo de cobro

Dado el costo tan bajo, no hace falta medir uso al principio — se puede incluir sin límite duro en Premium (o Pro+Premium) como diferenciador de valor, y recién pasar a medición si en el futuro se vuelve una feature muy pesada de usar (ej. fase 3).

### 2.5 Riesgos

- Fase 2/3 necesitan cuidado con qué datos ve el modelo (nunca cruzar negocios, aunque compartan organización/sede).
- Fase 3 (agendar automático) es la más riesgosa técnicamente — una reserva mal agendada por la IA es un error visible al cliente final, no algo que se pueda "deshacer" silenciosamente.

---

## Parte 3 — Decisiones pendientes (necesitan tu input, no son técnicas)

- [ ] ¿Cómo se llama el asistente de IA de cara al cliente? (no es "Luna" — ese es el modelo de OpenAI por debajo, no el nombre del producto)
- [ ] ¿WhatsApp va dentro de Premium, o es un add-on pago aparte disponible desde Pro también?
- [ ] ¿Cuánto se cobra el add-on de WhatsApp una vez que tengamos la tarifa real de Meta? (posible: cuota incluida + $X por mensaje extra)
- [ ] ¿Arrancamos Fase 0 de WhatsApp (setup con Meta) ya, dado que la aprobación puede tardar, aunque el resto se construya después?

## Parte 4 — Próximos pasos inmediatos

1. Conseguir la tarifa exacta de Meta para Perú (bloqueante para cerrar precio de WhatsApp).
2. Decidir si arrancamos por WhatsApp o por IA (IA tiene menos riesgo/costo, WhatsApp tiene la demanda real de un cliente).
3. Si se decide avanzar, abrir un plan de implementación técnico detallado (archivo de Plan Mode) para la fase elegida.
