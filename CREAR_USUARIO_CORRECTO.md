## Crear Usuario de Prueba Correcto en Supabase

Necesitamos crear un usuario de forma correcta. Sigue estos pasos:

### PASO 1: Eliminar el usuario actual

En Supabase **SQL Editor**, ejecuta:

```sql
DELETE FROM auth.users 
WHERE email = 'david.huetado2000@gmail.com';
```

Verifica que sea "1 row deleted"

### PASO 2: Crear usuario nuevo vía Supabase Auth Admin

Ve a **Authentication** → **Users** → **Add user**

Rellena:
- **Email:** `test@test.com`
- **Password:** `Test123456`
- **Auto Confirm:** ON (debe estar activado)

Haz clic en **Create user**

### PASO 3: Crear el negocio

En **SQL Editor**, ejecuta (reemplaza el UUID con el ID del usuario que ves en la lista):

```sql
-- Primero, obtén el ID del usuario:
SELECT id, email FROM auth.users WHERE email = 'test@test.com';

-- Luego, copia el ID y ejecuta (reemplaza UUID_AQUI):
INSERT INTO public.businesses (owner_id, name, timezone, slug)
VALUES (
  'UUID_AQUI',
  'Negocio Prueba',
  'America/Lima',
  'negocio-prueba'
);
```

### PASO 4: Probar en v0

Ve a v0 Preview y haz login:
- Email: `test@test.com`
- Contraseña: `Test123456`

Debería funcionar perfectamente esta vez.

¿Ya lo hiciste? Cuéntame en qué paso estás.
