# Crear Usuario de Prueba en Supabase

Para evitar el rate limiting, crea directamente un usuario en Supabase:

## Paso 1: Ir a Supabase
1. Abre tu proyecto en https://supabase.com
2. Ve a **Authentication** → **Users**
3. Haz clic en **Add user**

## Paso 2: Crear el usuario
- Email: `prueba@example.com`
- Password: `Prueba123!`
- Haz clic en **Create user**

## Paso 3: Crear el negocio
1. Ve a **SQL Editor**
2. Haz clic en **New Query**
3. Pega esto (reemplaza el USER_ID con el ID que ves arriba):

```sql
INSERT INTO public.businesses (owner_id, name, timezone, slug)
VALUES (
  'USER_ID_AQUI',
  'Mi Negocio de Prueba',
  'America/Lima',
  'mi-negocio-prueba'
);
```

4. Haz clic en **Run**

## Paso 4: Probar en v0
1. Ve a v0 Preview
2. Haz clic en **Iniciar sesión**
3. Usa: prueba@example.com / Prueba123!
4. ¡Deberías entrar al dashboard!

---

Si no puedes copiar el USER_ID, aquí hay una forma más fácil:

1. Ve a **SQL Editor**
2. Pega esto para crear usuario Y negocio con un SQL trigger:

```sql
-- Ver último usuario creado
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;

-- Una vez que tengas el ID, copia lo anterior
```

Luego copia el ID del primer SELECT y pégalo en el INSERT.
