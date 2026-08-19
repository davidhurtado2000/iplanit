-- Seeds the real Article #1 (Articulo-01-Que-es-iPlanit.md) as a DRAFT, so
-- it can be reviewed at its real public URL (visible to platform admins
-- even as a draft, per blog_articles' RLS in scripts/065-blog.sql) before
-- publishing - the only thing missing is the actual featured image file,
-- which has to be uploaded through /admin/blog/[id] (the CMS form), not
-- something this script can attach.
--
-- Two changes from the source file, both flagged to David:
-- 1. The FAQ section ("Preguntas frecuentes sobre iPlanit") was pulled out
--    of the markdown body into the structured `faq` column instead - the
--    article template already renders a dedicated FAQ section from that
--    column (and drives the FAQPage schema from it), so leaving the FAQ
--    text ALSO inline in the body would have shown it twice.
-- 2. Two links in the body pointed at pages that don't exist on this site
--    (/precios, /registro) - fixed to the real ones (/#planes, /register).
--    The trailing "Sigue leyendo" hand link to a not-yet-written article
--    was dropped entirely, since the article page already generates its
--    own "Sigue leyendo" section automatically.

insert into public.blog_articles (
  title, slug, category_id, meta_title, meta_description,
  keyword_principal, keywords_secundarias, content, faq,
  featured_image_alt, author, reading_time_minutes, functional_tags, status
)
select
  '¿Qué es iPlanit? La agenda y reservas online para negocios de servicios',
  'que-es-iplanit',
  (select id from public.blog_categories where slug = 'general'),
  'Qué es iPlanit: software de agenda y reservas para tu negocio | iPlanit',
  'iPlanit es el software de agenda y reservas online para peluquerías, spas, clínicas y academias. Descubre cómo funciona, para quién es y cuánto cuesta.',
  'qué es iplanit',
  array['iplanit app', 'iplanit reservas', 'iplanit software de citas', 'iplanit opiniones'],
  $md$iPlanit es un software de agenda y reservas online pensado para negocios de servicios —peluquerías, spas, clínicas, academias, estudios y consultorios— de cualquier tamaño y ubicación. Permite a los clientes reservar su cita ellos mismos, sin llamadas ni mensajes de ida y vuelta, mientras el negocio organiza su calendario, su equipo y su historial de clientes en un solo lugar.

Si administras un negocio donde los clientes necesitan una cita —un corte de pelo, una consulta, una clase— probablemente ya conoces el problema: llamadas que interrumpen tu trabajo, mensajes de WhatsApp que se pierden entre cien conversaciones, y citas que se cruzan porque nadie llevó un registro claro. iPlanit existe para resolver exactamente eso.

## ¿Para qué sirve iPlanit?

- **Calendario inteligente**: organiza tu día, tu semana o tu mes con tu equipo, tus salas o tus recursos ya ordenados, sin depender de cuadernos ni hojas de cálculo.
- **Reserva 24/7 para tus clientes**: comparte un enlace y tus clientes eligen servicio, fecha y hora disponibles en cualquier momento, desde el celular, sin necesidad de llamarte.
- **Historial de cada cliente**: citas pasadas, cancelaciones y datos de contacto, todo accesible en un solo lugar.
- **Recordatorios automáticos**: confirmaciones y avisos antes de cada cita, para reducir las inasistencias sin que tengas que escribir un solo mensaje a mano.

## ¿Para qué tipo de negocios es iPlanit?

iPlanit está diseñado para cualquier negocio que trabaje con citas o reservas, entre ellos:

- Peluquerías y barberías
- Spas y centros de belleza
- Clínicas dentales y consultorios médicos
- Consultorios de psicología y terapia
- Academias y clases particulares
- Estudios de fotografía
- Gimnasios y centros de entrenamiento
- Coworkings y espacios de trabajo compartido

No importa si eres un solo profesional atendiendo por tu cuenta o un equipo de varias personas: iPlanit se adapta al tamaño de tu operación, y ya hay negocios usándolo en distintos países.

## ¿Cómo funciona iPlanit? (en 3 pasos)

1. **Configura tu negocio.** Agrega tus servicios, tu equipo y tus horarios de atención en pocos minutos, sin instalar nada.
2. **Comparte tu enlace de reservas.** Tus clientes reservan por su cuenta, sin necesidad de llamarte ni escribirte para cuadrar un horario.
3. **Recibe las reservas automáticamente.** Cada cita queda registrada en tu calendario, con notificaciones y recordatorios automáticos para ti y para tu cliente.

## ¿Cuánto cuesta iPlanit?

iPlanit tiene un **plan gratuito real, sin necesidad de tarjeta de crédito**, pensado para que puedas probarlo sin compromiso:

| Plan | Precio | Incluye |
|---|---|---|
| Free | $0/mes | 50 reservas/mes, 20 clientes, 3 servicios, 2 recursos |
| Pro | $25/mes | Reservas y clientes ilimitados, hasta 5 servicios y 5 recursos, reservas recurrentes |
| Premium | $40/mes | Reportes y analíticas, historial completo de clientes, servicios y equipo ilimitados |

Puedes ver el detalle completo en la [página de precios](/#planes).

## ¿En qué se diferencia iPlanit de otras herramientas de agenda?

iPlanit está pensado específicamente para negocios pequeños y medianos: precios simples y transparentes, sin letra chica, con un plan gratuito que realmente sirve para operar (no solo una prueba de días limitados), y una configuración que toma minutos, no semanas. No necesitas conocimientos técnicos ni un equipo de soporte para ponerlo en marcha.

---

¿Listo para dejar de perder tiempo organizando citas a mano? [Empieza gratis](/register) — no necesitas tarjeta de crédito.
$md$,
  '[
    {"question": "¿Qué es iPlanit exactamente?", "answer": "iPlanit es un software de agenda y reservas online para negocios de servicios. Permite que tus clientes reserven citas por su cuenta, mientras tú gestionas tu calendario, tu equipo y tu historial de clientes desde un solo lugar."},
    {"question": "¿iPlanit tiene una versión gratuita?", "answer": "Sí. El plan Free incluye 50 reservas al mes, 20 clientes, 3 servicios y 2 recursos, sin necesidad de ingresar una tarjeta de crédito."},
    {"question": "¿Necesito instalar algo para usar iPlanit?", "answer": "No. iPlanit funciona directamente desde el navegador, tanto para ti como administrador como para tus clientes al momento de reservar. No requiere descargar ninguna aplicación."},
    {"question": "¿iPlanit funciona en mi país?", "answer": "iPlanit funciona desde cualquier navegador, sin restricción geográfica. El equipo está expandiendo activamente su soporte y presencia en distintos mercados."},
    {"question": "¿iPlanit es lo mismo que otras herramientas llamadas \"iPlanit\" que aparecen en internet?", "answer": "No. Existen otras empresas con nombres similares dedicadas a sectores distintos, como agencias digitales o software de gestión de cuidados sociales. Este sitio, el que estás leyendo, es exclusivamente un software de agenda y reservas para negocios de servicios como peluquerías, spas, clínicas y academias."}
  ]'::jsonb,
  'Panel de calendario de iPlanit, software de agenda y reservas para negocios de servicios',
  'Equipo iPlanit',
  5,
  array['Calendario inteligente', 'Reserva 24/7', 'Recordatorios automáticos', 'Historial de clientes'],
  'draft'
where not exists (select 1 from public.blog_articles where slug = 'que-es-iplanit');
