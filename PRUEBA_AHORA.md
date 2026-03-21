## AHORA PRUEBA ESTO

Has ejecutado todos los scripts SQL y todo está en Supabase. Acabo de actualizar el código para que cargue datos reales. 

### Paso 1: Recarga la app
- En v0, abre el Preview
- Presiona F5 para recargar completamente (o Ctrl+Shift+R en Windows)

### Paso 2: Intenta crear una nueva cuenta
1. Haz clic en "Registrarse"
2. Completa los datos:
   - Nombre: "Tu Nombre"
   - Email: "prueba@example.com" 
   - Contraseña: "password123"
   - Nombre de negocio: "Mi Negocio Test"
   - Tipo: Selecciona uno
   - Zona: America/Lima
3. Haz clic en "Crear cuenta"

### Paso 3: Verifica en Supabase
Mientras se procesa, abre tu proyecto Supabase en otra pestaña:
- Ve a **Table Editor**
- Abre tabla **profiles** - deberías ver tu email
- Abre tabla **businesses** - deberías ver tu negocio
- Abre tabla **auth.users** - deberías ver tu usuario

### Paso 4: Inicia sesión
En v0, después de registrarte, deberías ver la página de login.
Inicia sesión con:
- Email: prueba@example.com
- Contraseña: password123

### Paso 5: Verifica el Dashboard
Si todo funciona, verás:
- Tu nombre en el saludo
- El nombre de tu negocio
- Tu email
- Plan Gratuito

---

## ¿Qué hacer si hay errores?

### Error: "Could not find the table 'public.businesses'"
**Solución:** En Supabase, ve a **SQL Editor** y ejecuta:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema='public';
```
Deberías ver todas tus tablas listadas. Si falta alguna, re-ejecuta el script correspondiente.

### Error: "Permission denied"
**Solución:** Las RLS policies están demasiado restrictivas. Intenta editar la policy en una tabla:
- Ve a **Table Editor**
- Haz clic en la tabla
- Ve a **Security** → **Policies**
- Asegúrate de que hay al menos una policy que permita lectura

### El login funciona pero el dashboard está vacío
**Solución:** Es normal en la primera prueba. Creo que las tablas no se devuelven datos. Intenta:
1. Recarga la página
2. Ve a Supabase y verifica que tus datos están ahí
3. Abre la consola del navegador (F12) y busca errores en rojo

---

## Si TODO FUNCIONA ✓

¡Excelente! Ya tienes:
- ✅ Autenticación real con email/contraseña
- ✅ Base de datos real
- ✅ Usuarios y negocios creándose automáticamente
- ✅ Dashboard que carga datos reales

**Próximos pasos después:**
1. Conectar Calendario con datos reales
2. Conectar Servicios, Clientes, Recursos
3. Implementar validación de conflictos de horarios
4. Agregar notificaciones
5. Implementar Stripe para pagos

---

## Cuéntame qué sucede

Por favor prueba estos pasos y cuéntame:
1. ¿El registro funciona?
2. ¿Se crea el usuario en Supabase?
3. ¿Se crea el negocio en Supabase?
4. ¿El login funciona?
5. ¿El dashboard muestra tus datos?

Cualquier error, cuéntame exactamente qué dice.
