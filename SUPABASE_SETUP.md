## Instrucciones Completas para Configurar Supabase en iReserve

Esta guía te llevará paso a paso para completar la configuración de Supabase y habilitar la autenticación y base de datos real.

---

## PASO 1: Ejecutar SQL Scripts en Supabase

### Accede al SQL Editor

1. Abre tu proyecto de Supabase en https://supabase.com
2. Haz clic en **SQL Editor** en el menú izquierdo
3. Haz clic en **New Query**

### Ejecuta los scripts en este orden

**IMPORTANTE:** Ejecuta cada script en el orden exacto listado. Si algo falla, contáctame.

**Script 1 - Profiles Table:**
- Abre el archivo `/scripts/001-create-profiles.sql`
- Copia TODO el contenido
- Pégalo en el SQL Editor de Supabase
- Haz clic en **Run** (esquina superior derecha)
- Espera hasta que veas "Success" en verde

**Script 2 - Businesses Table:**
- Repite el mismo proceso con `/scripts/002-create-businesses.sql`

**Script 3 - Services Table:**
- Repite con `/scripts/003-create-services.sql`

**Script 4 - Resources Table:**
- Repite con `/scripts/004-create-resources.sql`

**Script 5 - Clients Table:**
- Repite con `/scripts/005-create-clients.sql`

**Script 6 - Reservations Table:**
- Repite con `/scripts/006-create-reservations.sql`

**Script 7 - Business Hours Table:**
- Repite con `/scripts/007-create-business-hours.sql`

---

## PASO 2: Verificar que las Tablas se Crearon

1. En Supabase, ve a **Table Editor** (menú izquierdo)
2. Deberías ver estas tablas:
   - profiles ✓
   - businesses ✓
   - services ✓
   - resources ✓
   - clients ✓
   - reservations ✓
   - business_hours ✓

Si falta alguna, re-ejecuta el script correspondiente.

---

## PASO 3: Configurar Autenticación por Email

1. En Supabase, ve a **Authentication** → **Providers**
2. Busca "Email"
3. Asegúrate de que esté **Enabled**
4. En la sección "Email Templates":
   - Pon **Autoconfirm** en **ON** (para desarrollo rápido)
   - Esto permitirá crear cuentas sin confirmar email

---

## PASO 4: Verificar Variables de Entorno

Las siguientes variables deben estar en v0 (ve a Settings → Vars):
- `NEXT_PUBLIC_SUPABASE_URL` - Tu URL de Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Tu clave pública de Supabase

Deberían estar ya configuradas. Si no, cópialas de tu proyecto Supabase:
- Ve a **Project Settings** → **API**
- Copia "Project URL" → `NEXT_PUBLIC_SUPABASE_URL`
- Copia "anon public" → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## PASO 5: Prueba la Autenticación

1. En v0, abre la vista previa (Preview)
2. Haz clic en "Registrarse"
3. Completa el formulario:
   - Nombre: "Tu Nombre"
   - Email: "prueba@example.com"
   - Contraseña: "password123"
   - Nombre de negocio: "Mi Negocio"
   - Tipo: Selecciona uno
   - Zona horaria: America/Lima (o tu zona)
4. Haz clic en "Crear cuenta"

Deberías ser redirigido a la página de login.

5. Ahora inicia sesión con: prueba@example.com / password123
6. Deberías entrar al dashboard

---

## PASO 6: Verifica los Datos en Supabase

1. En Supabase, ve a **Table Editor**
2. Abre tabla **profiles**:
   - Deberías ver tu usuario creado
3. Abre tabla **businesses**:
   - Deberías ver tu negocio
4. Abre tabla **auth.users**:
   - Deberías ver tu usuario con email confirmado

---

## Solución de Problemas

### Error: "relation 'public.profiles' does not exist"
**Solución:** El script 001 no se ejecutó correctamente. Vuelve a ejecutarlo en el SQL Editor.

### Error: "permission denied for schema public"
**Solución:** Las RLS policies no están configuradas correctamente. Verifica que todos los scripts hayan ejecutado sin errores.

### No puedo crear una cuenta
**Solución:**
1. Verifica que Email authentication esté habilitado
2. Verifica que Autoconfirm esté ON
3. Abre la consola del navegador (F12) y ve si hay errores
4. Intenta en modo incógnito

### Creo la cuenta pero no puedo iniciar sesión
**Solución:**
1. Ve a Supabase → **Auth** → **Users**
2. Verifica que tu usuario esté ahí
3. Si está "Unconfirmed" y no puedes confirmar, habilita Autoconfirm

### Los datos que creo no aparecen
**Solución:**
1. Verifica en Supabase que el negocio se creó
2. Recarga la página (F5)
3. Abre la consola (F12) y busca errores
4. Verifica que hayas iniciado sesión como el usuario correcto

---

## ¿Qué sigue después?

Una vez completados estos pasos, la aplicación tendrá:
- ✅ Autenticación real con email y contraseña
- ✅ Base de datos real con todos tus datos
- ✅ Seguridad con Row Level Security (RLS)
- ✅ API routes para operaciones backend
- ✅ Validación de conflictos de horarios

La aplicación reemplazará automáticamente los datos mockeados con datos reales de Supabase.

---

## Necesitas ayuda?

Si algo no funciona:
1. Verifica que hayas ejecutado TODOS los scripts
2. Revisa la consola del navegador (F12) para errores
3. Cuéntame exactamente qué error ves
