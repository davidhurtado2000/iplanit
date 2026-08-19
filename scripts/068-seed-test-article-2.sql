-- Second article, purely to test the "Todos los artículos" grid and the
-- "Peluquerías y barberías" vertical showcase row with one real card
-- instead of all placeholders. Draft, placeholder content - not meant to
-- ship as-is, replace via /admin/blog before ever publishing it. Title
-- matches the example already used in wireframe_blog_iplanit.html's own
-- mockup of that vertical's showcase row, so it doubles as a preview of
-- what that slot will eventually look like.

insert into public.blog_articles (
  title, slug, category_id, meta_title, meta_description,
  content, author, reading_time_minutes, functional_tags, status
)
select
  'Software de citas para peluquerías: guía completa 2026',
  'software-citas-peluquerias-guia-2026',
  (select id from public.blog_categories where slug = 'peluquerias-barberias'),
  '[BORRADOR DE PRUEBA] Software de citas para peluquerías | iPlanit',
  'Contenido de prueba para verificar el layout del blog - reemplazar antes de publicar.',
  $md$_Este es un artículo de prueba, solo para revisar cómo se ve la grilla "Todos los artículos" y la fila de la vertical Peluquerías y barberías con una tarjeta real. Reemplazar este contenido antes de publicar._

## Sección de ejemplo

Texto de relleno para probar el renderizado de Markdown: **negrita**, listas, y demás.

- Punto uno
- Punto dos
$md$,
  'Equipo iPlanit',
  9,
  array['Recordatorios automáticos'],
  'draft'
where not exists (select 1 from public.blog_articles where slug = 'software-citas-peluquerias-guia-2026');
