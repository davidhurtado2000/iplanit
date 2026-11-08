# Plan de implementación: Facturación Electrónica SUNAT (add-on)

> Instrucciones para Claude Code. Leer completo antes de empezar. Implementar por fases, en orden,
> y verificar cada fase antes de pasar a la siguiente. Seguir los patrones existentes del repo
> (add-on de IA, integración Kommo, scripts SQL numerados, i18n en `context/language-context.tsx`).
>
> **v2 (2026-11-04):** revisado contra el código. Cambios principales: contador de correlativos
> por RUC (no por sede), series propias de iPlanit, consultar estado antes de reintentar,
> emisión manual por defecto, hora de Lima, IGV configurable, migración desde Viutify.

## 0. Contexto y decisiones ya tomadas

- **Origen:** un negocio que hoy usa **Viutify** (que incluye facturación) quiere pasarse a
  iPlanit. Condición para cambiarse: emitir boletas y facturas válidas ante SUNAT desde
  iPlanit, sin usar otro sistema.
- **Qué es (actualizado 2026-11-06, ver `scripts/112`):** beneficio **exclusivo del plan
  Premium ($45/mes)**, sin add-on: 1,000 comprobantes/mes incluidos y $10 por cada 500 extra.
  Basic y Pro **no** tienen facturación. **Solo para negocios de Perú**
  (`businesses.country = 'PE'`). Un plan Enterprise (2,000 comprobantes) queda como idea a futuro.
  Lo de abajo sobre el add-on de +$10 y su cobro en Stripe ya no aplica.
- **Quién emite:** el **negocio** (con su propio RUC) es el emisor ante SUNAT. iPlanit no emite
  nada a su nombre; solo arma los datos y los envía al proveedor (PSE) del negocio.
- **Proveedor inicial:** **Nubefact** (PSE + OSE autorizado, API REST JSON, certificado digital
  incluido). Cada negocio contrata su propia cuenta de Nubefact (asociada a **su** RUC) y pega
  su **RUTA** y **TOKEN** en iPlanit. El costo del PSE lo paga el negocio directamente.
  - **Pendiente de confirmar con Nubefact:** si existe un plan de socio/revendedor multi-RUC.
    Si existe, se evaluará que iPlanit lo incluya (cambia precio y modelo). No bloquea el MVP:
    la interfaz `InvoiceProvider` y el guardado de credenciales por negocio sirven en ambos casos.
- **Arquitectura con proveedor intercambiable:** todo el código de Nubefact vive detrás de una
  interfaz `InvoiceProvider`, para poder sumar otro PSE después sin tocar el resto.
- **Momento de emisión:** al marcar la reserva como `completed` con pago registrado
  (`payment_method` + `paid_at`, ver `scripts/106-reservation-payment-method.sql` y
  `components/dashboard/reservation-modal.tsx`). **Nunca al crear la reserva.**
  - **Por defecto, emisión manual con vista previa** (`auto_emit = false`). Un comprobante mal
    emitido no se edita: se anula con nota de crédito. La emisión automática es opcional.
- **Cobro del add-on:** mismo patrón que el add-on de IA: un **ítem extra en la suscripción
  existente de Stripe**, nunca una suscripción nueva.

## 1. Pre-requisitos (los hace David, no Claude Code)

1. Crear en Stripe el Price recurrente "Facturación electrónica" ($10/mes) y guardar su ID en
   `STRIPE_PRICE_ID_INVOICING_ADDON` (Vercel + `.env.local`).
2. ~~Crear una cuenta demo de Nubefact~~ ✅ hecho. Guardar RUTA y TOKEN de demo **solo** en
   `.env.local` como `NUBEFACT_DEMO_API_URL` y `NUBEFACT_DEMO_API_TOKEN` (para pruebas de
   desarrollo; nunca en el repo ni en el chat).
3. Generar `INVOICING_ENCRYPTION_KEY` (32 bytes, **hex**, 64 caracteres, mismo formato que
   `KOMMO_TOKEN_ENCRYPTION_KEY`):
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Validar con un contador peruano: series, afectación de IGV de los servicios
   (gravado/exonerado/inafecto), tasa de IGV, régimen del negocio piloto (NRUS solo emite
   boletas) y el tratamiento tributario del cobro de la LLC.
5. Actualizar Términos de Servicio: el negocio es el emisor y responsable del contenido
   tributario de sus comprobantes; iPlanit es solo el software de integración.
6. Pedir al cliente piloto (viene de Viutify):
   - Qué comprobantes emite hoy (boletas, facturas, notas de crédito).
   - Series actuales y último número de cada una.
   - Sedes y si todas usan el mismo RUC.
   - Si los precios incluyen IGV.
   - Exportación de clientes de Viutify (Excel/CSV) con DNI/RUC, razón social y dirección.
7. Onboarding del piloto: el negocio debe registrar a Nubefact como su PSE en SUNAT
   (Operaciones en Línea, Clave SOL). Confirmar el procedimiento exacto con Nubefact.

## 2. Fase 1: Base de datos (`scripts/110-electronic-invoicing.sql`)

Usar el siguiente número libre de `scripts/` (hoy el último es `109`).

### 2.1 Add-on en `profiles`
- `invoicing_addon_active boolean not null default false`
- `invoicing_addon_access_until timestamptz` (periodo de gracia al cancelar, igual que
  `ai_addon_access_until` de `scripts/078`).

### 2.2 Tabla `business_invoicing_settings` (1 fila por sede = `businesses.id`)
- `business_id uuid pk references businesses on delete cascade`
- `provider text not null default 'nubefact'` (check in ('nubefact'))
- `environment text not null default 'demo'` (check in ('demo','production'))
- `api_url text not null` (la RUTA de Nubefact)
- `api_token_encrypted text not null`
- `ruc text not null` (11 dígitos, check `ruc ~ '^\d{11}$'`)
- `razon_social text not null`, `direccion_fiscal text`
- `serie_factura text not null default 'F002'` (check `^F[A-Z0-9]{3}$`)
- `serie_boleta text not null default 'B002'` (check `^B[A-Z0-9]{3}$`)
- `serie_nc_factura text not null default 'FC02'`, `serie_nc_boleta text not null default 'BC02'`
  - Defaults en `002` a propósito: **iPlanit usa series propias**, distintas a las que el
    negocio usa en otros sistemas (Viutify, panel de Nubefact), para que dos sistemas nunca
    generen el mismo número.
- `prices_include_igv boolean not null default true`
- `igv_affectation text not null default 'gravado'` (check in ('gravado','exonerado','inafecto'))
- `igv_rate numeric(5,2) not null default 18` (configurable; algunos rubros tienen tasa reducida)
- `auto_emit boolean not null default false`
- `enabled boolean not null default false`
- `created_at`, `updated_at`

**Regla de sedes:** varias sedes pueden compartir RUC, pero **una serie no puede repetirse
entre sedes del mismo RUC** (validar en la API de settings: si otra sede con el mismo RUC ya
usa `B002`, rechazar y sugerir `B003`).

### 2.3 Tabla `invoice_series_counters` (correlativo atómico)
- `ruc text`, `serie text`, `last_number int not null default 0`, pk (`ruc`, `serie`).
  - **Por RUC, no por `business_id`**: el correlativo pertenece al emisor ante SUNAT. Con
    contador por sede, dos sedes con el mismo RUC y serie emitirían números duplicados.
- Función `next_invoice_number(p_ruc text, p_serie text) returns int` con
  `insert ... on conflict do update set last_number = invoice_series_counters.last_number + 1
  returning last_number` (atómica). `security definer`, ejecutable solo por `service_role`.
- Permitir que el dueño fije el número inicial (si continúa una serie que ya usaba antes).
  Solo permitido si la serie aún no tiene comprobantes emitidos desde iPlanit.

### 2.4 Tabla `invoices`
- `id uuid pk`, `business_id`, `ruc text not null`,
  `reservation_id uuid references reservations on delete set null`
- `doc_type text not null` check in ('01','03','07') (factura, boleta, nota de crédito)
- `serie text not null`, `numero int not null`, unique (`ruc`, `serie`, `numero`)
- `related_invoice_id uuid references invoices` (para notas de crédito)
- `credit_note_reason text` (código SUNAT de motivo, ej. '01' anulación de la operación)
- Cliente: `customer_doc_type text` ('6' RUC, '1' DNI, '4' CE, '7' pasaporte, '-' varios),
  `customer_doc_number`, `customer_name`, `customer_address`, `customer_email`
- Ítems: `items jsonb not null` (descripción, cantidad, valor unitario, IGV, total), para
  reconstruir el comprobante tal como se envió.
- Montos: `currency text` ('PEN'|'USD'), `subtotal numeric(12,2)`, `igv numeric(12,2)`,
  `total numeric(12,2)`
- Estado: `status text not null default 'pending'` check in
  ('pending','sent','accepted','rejected','error','voided')
- `attempts int not null default 0`, `last_error text`, `next_retry_at timestamptz`
- Respuesta: `provider_response jsonb`, `pdf_url`, `xml_url`, `cdr_url`, `sunat_description`,
  `sunat_hash`, `qr_string`
- `issue_date date not null` (fecha en **America/Lima**), `issued_at timestamptz`,
  `created_by uuid references profiles`, `created_at`, `updated_at`
- Índice único parcial: una sola factura/boleta vigente por reserva
  (`unique (reservation_id) where doc_type in ('01','03') and status not in ('rejected','voided')`).

### 2.5 Datos fiscales del cliente en `clients`
- **Reutiliza** `document_type` / `document_number` (ya existen, `scripts/029`) y agrega
  `'ce'` (carné de extranjería) al check. El mapeo a códigos SUNAT ('1', '4', '6', '7') se
  hace en `build-draft.ts`.
- Nuevas: `fiscal_name text` (razón social), `fiscal_address text`.
- Ojo: la reserva pública guarda cualquier documento como `'dni'` (`scripts/064`);
  `build-draft.ts` debe detectar un RUC por su forma (11 dígitos, empieza con 10/15/17/20).
- La UI (`clients/page.tsx`, `reservation-modal.tsx`, `ClientDocumentType`) aún no muestra
  `'ce'` ni los campos fiscales: se agrega en la Fase 6.
- Recordar: `clients` es a nivel organización (`scripts/053`), así que los datos fiscales se
  comparten entre sedes. Es lo deseado.

### 2.6 Preferencia de comprobante en `reservations`
- `invoice_type_requested text` check in ('boleta','factura') (null = boleta por defecto).

### 2.7 RLS
- Todas las tablas nuevas: lectura solo para el dueño del negocio (mismo patrón de RLS que
  `businesses`). Workers: solo lectura de `invoices` de su negocio si ya pueden ver reservas.
- `invoice_series_counters`: sin acceso desde el cliente; solo `service_role`.
- `business_invoicing_settings.api_token_encrypted` **nunca** se devuelve al cliente: exponer
  una vista o RPC sin esa columna (con un booleano `token_configured`); las escrituras pasan
  solo por API routes con service role.

Actualizar `lib/supabase/types.ts` con las nuevas tablas/columnas.

## 3. Fase 2: Cobro del add-on con Stripe

Copiar el patrón exacto de `app/api/stripe/ai-addon/*` y `lib/stripe.ts`:

- `lib/stripe.ts`: `getInvoicingAddonPriceId()` y `getInvoicingAddonItem(subscription)`.
  Asegurar que `getPlanItem`, `getAddonItem` y `getSeatItem` **no** confundan el nuevo ítem.
- `app/api/stripe/invoicing-addon/activate/route.ts`: requiere `meetsPlan(plan, 'basic')`,
  `stripe_subscription_id` y negocio con `country = 'PE'`; agrega el ítem con
  `proration_behavior: 'create_prorations'`; marca `invoicing_addon_active = true`.
- `app/api/stripe/invoicing-addon/deactivate/route.ts`: quita el ítem, deja acceso hasta fin de
  periodo (`invoicing_addon_access_until`) y desactiva la emisión al vencer.
- `app/api/webhooks/stripe/route.ts`: en `customer.subscription.updated/deleted` sincronizar
  `invoicing_addon_active` igual que `ai_addon_active`.
- Respetar `billing_exempt` (`scripts/093`) igual que el add-on de IA (útil para el piloto).
- Helper único `hasInvoicingAccess(profile)` (activo, exento o dentro del periodo de gracia),
  usado por todas las routes de facturación.

## 4. Fase 3: Capa de proveedor (`lib/invoicing/`)

```
lib/invoicing/
  types.ts            // InvoiceProvider, InvoiceDraft, ProviderResult
  calculate.ts        // montos: subtotal / IGV / total, redondeo a 2 decimales
  build-draft.ts      // reserva + cliente + servicio + settings -> InvoiceDraft
  providers/nubefact.ts
  emit.ts             // orquestador idempotente
lib/crypto.ts         // AES-256-GCM compartido (extraído de lib/kommo/encryption.ts)
```

- **Cifrado:** extraer la lógica de `lib/kommo/encryption.ts` a `lib/crypto.ts` parametrizada
  por nombre de variable de entorno. Kommo sigue usando `KOMMO_TOKEN_ENCRYPTION_KEY` sin cambios
  (cambiarla rompería los tokens ya guardados); facturación usa `INVOICING_ENCRYPTION_KEY`.
- `InvoiceProvider`: `emit(draft)`, `getStatus(docType, serie, numero)`, `creditNote(draft)`,
  `testConnection()`.
- **Nubefact** (revisar su documentación vigente antes de codificar): POST JSON a la RUTA con
  header `Authorization: Token <TOKEN>`; `operacion: 'generar_comprobante'`;
  `tipo_de_comprobante` 1 factura / 2 boleta / 3 nota de crédito; `serie`, `numero`,
  `sunat_transaction: 1`, `cliente_tipo_de_documento`, `cliente_numero_de_documento`,
  `cliente_denominacion`, `cliente_direccion`, `cliente_email`, `fecha_de_emision`,
  `moneda` (1 PEN, 2 USD), `porcentaje_de_igv` (desde settings), totales e `items[]` con
  `unidad_de_medida: 'ZZ'` (servicio). Guardar `enlace_del_pdf`, `enlace_del_xml`,
  `enlace_del_cdr`, `aceptada_por_sunat`, `sunat_description`, `codigo_hash`.
  - `enviar_automaticamente_al_cliente: true` cuando hay email: **Nubefact envía el PDF/XML al
    cliente final**, así no se arma ese correo en iPlanit.
  - Consulta: `operacion: 'consultar_comprobante'` para `getStatus`.
  - Anular: nota de crédito (`tipo_de_comprobante: 3`, `tipo_de_nota_de_credito: 1`,
    documento que modifica). Timeout de 20 s.
- **Reglas de negocio en `build-draft.ts`:**
  - Factura (01) solo si el cliente tiene RUC válido (11 dígitos, empieza con 10 o 20) y razón
    social.
  - Boleta (03): con DNI si se tiene; si el total ≥ S/ 700 y no hay documento → no emitir,
    marcar `error` con mensaje claro ("DNI requerido para boletas desde S/ 700").
    Sin documento y menor a S/ 700 → tipo '-' "CLIENTES VARIOS".
  - Monto: **propuesto** desde `reservations.price` (snapshot), pero **editable en la vista
    previa** antes de emitir (descuentos de cumpleaños, ajustes del día, etc.).
  - Moneda: confirmar de qué campo sale la moneda real de la reserva (los servicios tienen
    `price` y `price_usd`, ver `scripts/034`); no asumir `businesses.currency`.
  - Si `prices_include_igv`, `subtotal = total / (1 + igv_rate/100)`.
    Si `exonerado`/`inafecto`, IGV = 0 con el código de afectación correcto.
  - `fecha_de_emision` = fecha actual en **America/Lima** (no UTC).
  - Ítem: nombre del servicio + fecha de la cita.
- **`emit.ts` idempotente:**
  - Si ya existe un comprobante vigente para la reserva, devolverlo y no emitir otro.
  - Reservar el correlativo con `next_invoice_number` y guardarlo en la fila `pending` **antes**
    de llamar al proveedor. El número queda fijo para esa fila en todos los reintentos.
  - **Antes de cada reintento, llamar a `getStatus`**: si el proveedor ya tiene el comprobante
    (timeout en el intento anterior pero sí se emitió), sincronizar la fila y no reenviar.
  - Error de red/timeout → `pending` con `next_retry_at`. Rechazo de SUNAT → `rejected` +
    `sunat_description`. Error de validación propio (ej. falta DNI) → `error` sin consumir
    correlativo (validar **antes** de reservar el número).

## 5. Fase 4: API routes

- `POST /api/invoicing/settings`: guardar/actualizar settings (cifrar token, validar series
  únicas por RUC). Solo el dueño.
- `POST /api/invoicing/test-connection`: llamada de prueba al proveedor.
- `POST /api/invoicing/preview` `{ reservationId, type? }`: arma el borrador sin emitir.
- `POST /api/invoicing/emit` `{ reservationId, type?, overrides? }`: emisión.
  Verifica `hasInvoicingAccess`, settings `enabled`, reserva `completed` y del negocio del
  usuario.
- `POST /api/invoicing/credit-note` `{ invoiceId, reason }`.
- `GET /api/invoicing/invoices`: listado paginado con filtros (estado, fecha, tipo).
- `POST /api/invoicing/import-clients`: importación CSV de clientes con datos fiscales
  (para migrar desde Viutify). Validar DNI/RUC, emparejar por documento o teléfono.
- `app/api/cron/retry-invoices/route.ts`: cada 15 min reintenta `pending` con `attempts < 5`
  y `next_retry_at <= now()` (backoff exponencial, siempre `getStatus` primero). Proteger con
  el mismo secreto de cron que `app/api/cron/send-reminders`. Registrar en el scheduler que
  usen los otros crons. Si un comprobante sigue fallando después de 12 h, avisar al dueño por
  correo (Resend).

## 6. Fase 5: Disparadores en el flujo de reservas

- Al marcar `completed` con pago en `reservation-modal.tsx`:
  - `auto_emit = false` (defecto): mostrar botón "Emitir comprobante" → vista previa → emitir.
  - `auto_emit = true`: llamar a `/api/invoicing/emit` en segundo plano y mostrar el estado
    (emitiendo / aceptado / error) sin bloquear el cierre de la cita.
- Al cancelar una reserva que ya tiene comprobante `accepted`: no borrar nada; ofrecer
  "Emitir nota de crédito" (no automático; confirmación explícita).
- Envío al cliente final: lo hace Nubefact (`enviar_automaticamente_al_cliente`). Botón
  "Reenviar" en el modal.

## 7. Fase 6: UI

- **Configuración** (`settings`): nueva sección "Facturación electrónica"
  - Si no tiene el add-on: tarjeta de venta con el precio y botón activar (mismo estilo que
    `components/dashboard/ai-addon-required.tsx`).
  - Si lo tiene: formulario RUC, razón social, dirección fiscal, RUTA, TOKEN (campo tipo
    password, nunca se muestra de vuelta, solo "•••• configurado"), series (con explicación de
    por qué usar series propias), número inicial, IGV incluido, afectación, tasa, entorno
    demo/producción, emisión automática, botón "Probar conexión".
  - Guía de onboarding: crear cuenta Nubefact, registrar PSE en SUNAT, copiar RUTA/TOKEN.
- **Clientes:** campos fiscales en el formulario de cliente + importación CSV.
- **Página pública de reserva** (`/reservar/[slug]`): si el negocio tiene facturación activa,
  paso opcional "¿Necesitas comprobante?" Boleta (DNI) / Factura (RUC + razón social +
  dirección). Validar formato de DNI (8 dígitos) y RUC (11 dígitos, empieza con 10 o 20).
  Guardar en `clients` y `reservations.invoice_type_requested`.
- **Modal de reserva:** bloque "Comprobante" con estado, serie-número, links a PDF/XML,
  botones "Emitir", "Reintentar", "Reenviar", "Nota de crédito".
- **Nueva página `dashboard/comprobantes`:** tabla con filtros, badges de estado, descarga
  y exportación CSV del mes (para el contador). Agregar al sidebar y al mobile-nav.
- **Landing** (`components/landing/pricing.tsx`): debajo del bloque del add-on de IA, un
  segundo bloque "Facturación electrónica SUNAT (opcional) · +$10/mes · solo Perú" en los 3
  planes.
- Todos los textos en español e inglés en `context/language-context.tsx`.

## 8. Seguridad (obligatorio)

- Tokens del PSE cifrados en reposo (AES-256-GCM, clave en `INVOICING_ENCRYPTION_KEY`),
  descifrados solo en el servidor. Nunca en logs, nunca en respuestas al cliente.
- Toda llamada al proveedor ocurre en API routes del servidor, nunca desde el navegador.
- Verificar en cada route que el usuario es dueño del `business_id` (no confiar en el body).
- Logs sin datos personales completos (enmascarar DNI/RUC: `****5678`).
- Rate limit básico en `/api/invoicing/emit` y en el formulario público.

## 9. Pruebas (en entorno demo de Nubefact antes de producción)

1. Boleta con DNI, monto < S/ 700.
2. Boleta sin documento, monto < S/ 700 (clientes varios).
3. Boleta ≥ S/ 700 sin DNI → debe bloquearse con mensaje claro, sin consumir correlativo.
4. Factura con RUC válido.
5. RUC inválido → validación en formulario.
6. Servicio en USD.
7. Servicio exonerado de IGV.
8. Doble clic en "Emitir" → un solo comprobante (idempotencia).
9. Dos reservas completadas al mismo tiempo → correlativos distintos y consecutivos.
10. Proveedor caído → queda `pending` y el cron lo reintenta.
11. Timeout con comprobante sí emitido en Nubefact → el reintento lo detecta con
    `consultar_comprobante` y no duplica.
12. Dos sedes con el mismo RUC → no pueden usar la misma serie; correlativos sin choque.
13. Cita cerrada a las 9 pm hora Lima → fecha de emisión del mismo día.
14. Cancelación de reserva facturada → nota de crédito vinculada.
15. Desactivar el add-on → se mantiene acceso hasta fin de periodo y luego se detiene la
    emisión (los comprobantes históricos siguen visibles).
16. Negocio de EE. UU. → la opción no aparece.
17. Importación CSV de clientes de Viutify → datos fiscales correctos, sin duplicados.

## 10. Fuera de alcance (por ahora)

- Revender el PSE (iPlanit contratando Nubefact por los negocios). Re-evaluar según respuesta
  de Nubefact sobre plan de socio multi-RUC.
- Otros proveedores además de Nubefact (la interfaz queda lista para sumarlos).
- Guías de remisión, notas de débito, retenciones/percepciones, detracciones.
- Facturación para EE. UU. (no aplica; Stripe ya genera recibos).

## 11. Orden de entrega

1. Fase 1 + Fase 2 (DB y cobro) → revisar.
2. Fase 3 + Fase 4 (proveedor y API) → probar con cuenta demo. **Hito: el piloto ya puede
   emitir manualmente en demo.**
3. Fase 5 + Fase 6 (flujo y UI) → probar los 17 casos.
4. Importar clientes del piloto y pasarlo a `production`.
