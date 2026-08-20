'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Trash2, Loader2, Upload, Check, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormSection } from '@/components/dashboard/form-section'
import { createClient } from '@/lib/supabase/client'
import { calculateReadingTime, type BlogArticleRow, type BlogCategoryRow, type FaqEntry } from '@/lib/blog'
import type { Json } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

const FUNCTIONAL_TAGS = [
  'Calendario inteligente',
  'Reserva 24/7',
  'Recordatorios automáticos',
  'Historial de clientes',
  'Reportes y analítica',
] as const

// Small red asterisk next to a Label, for every field that actually blocks
// saving or publishing - the co-founder's own feedback after using the CMS
// was that nothing marked which fields were mandatory, so she had no way
// to know what was blocking "Publicar" short of filling in everything and
// hoping.
function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {' '}
      *
    </span>
  )
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface BlogArticleFormProps {
  articleId: string
  existingArticle: BlogArticleRow | null
  categories: BlogCategoryRow[]
  otherArticles: { id: string; title: string }[]
}

export function BlogArticleForm({ articleId, existingArticle, categories, otherArticles }: BlogArticleFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const isEditing = !!existingArticle

  const [title, setTitle] = useState(existingArticle?.title ?? '')
  const [slug, setSlug] = useState(existingArticle?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(isEditing)
  const [categoryId, setCategoryId] = useState(existingArticle?.category_id ?? categories[0]?.id ?? '')
  const [metaTitle, setMetaTitle] = useState(existingArticle?.meta_title ?? '')
  const [metaDescription, setMetaDescription] = useState(existingArticle?.meta_description ?? '')
  const [keywordPrincipal, setKeywordPrincipal] = useState(existingArticle?.keyword_principal ?? '')
  const [keywordsSecundarias, setKeywordsSecundarias] = useState(
    (existingArticle?.keywords_secundarias ?? []).join(', ')
  )
  const [content, setContent] = useState(existingArticle?.content ?? '')
  const [faq, setFaq] = useState<FaqEntry[]>(
    existingArticle ? (existingArticle.faq as unknown as FaqEntry[]) || [] : []
  )
  const [featuredImageUrl, setFeaturedImageUrl] = useState(existingArticle?.featured_image_url ?? null)
  const [featuredImageAlt, setFeaturedImageAlt] = useState(existingArticle?.featured_image_alt ?? '')
  const [ogImageUrl, setOgImageUrl] = useState(existingArticle?.og_image_url ?? null)
  const [author, setAuthor] = useState(existingArticle?.author ?? 'Equipo iPlanit')
  const [functionalTags, setFunctionalTags] = useState<string[]>(existingArticle?.functional_tags ?? [])
  const [relatedOverride, setRelatedOverride] = useState<string[]>(existingArticle?.related_articles_override ?? [])

  const [uploadingFeatured, setUploadingFeatured] = useState(false)
  const [uploadingOg, setUploadingOg] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // True after a blocked Publish attempt - only then do individual empty
  // fields turn red, so the form doesn't look "broken" on first open.
  const [attemptedPublish, setAttemptedPublish] = useState(false)
  const featuredInputRef = useRef<HTMLInputElement>(null)
  const ogInputRef = useRef<HTMLInputElement>(null)

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  const uploadImage = async (file: File, kind: 'featured' | 'og') => {
    if (!file.type.startsWith('image/')) {
      setError('La imagen debe ser un archivo de tipo imagen.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 2MB.')
      return
    }
    setError('')
    const setUploading = kind === 'featured' ? setUploadingFeatured : setUploadingOg
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${articleId}/${kind}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('blog-images')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('blog-images').getPublicUrl(path)
      const url = `${urlData.publicUrl}?t=${Date.now()}`
      if (kind === 'featured') setFeaturedImageUrl(url)
      else setOgImageUrl(url)
    } catch (err) {
      console.error('[iplanit] Error uploading blog image:', err)
      setError('No se pudo subir la imagen. Intenta de nuevo.')
    } finally {
      setUploading(false)
    }
  }

  const handleFeaturedFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) uploadImage(file, 'featured')
  }

  const handleOgFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) uploadImage(file, 'og')
  }

  const toggleFunctionalTag = (tag: string, checked: boolean) => {
    setFunctionalTags((prev) => (checked ? [...prev, tag] : prev.filter((t) => t !== tag)))
  }

  const toggleRelated = (id: string, checked: boolean) => {
    setRelatedOverride((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const updateFaqEntry = (index: number, field: 'question' | 'answer', value: string) => {
    setFaq((prev) => prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)))
  }

  const addFaqEntry = () => setFaq((prev) => [...prev, { question: '', answer: '' }])
  const removeFaqEntry = (index: number) => setFaq((prev) => prev.filter((_, i) => i !== index))

  // Single source of truth for what's required - drives the always-visible
  // checklist below AND the per-field red borders, so both can never say
  // different things about what's actually missing.
  const requiredFields = [
    { key: 'title', label: 'Título', done: !!title.trim() },
    { key: 'slug', label: 'Slug', done: !!slug.trim() },
    { key: 'category', label: 'Categoría', done: !!categoryId },
    { key: 'metaTitle', label: 'Meta title', done: !!metaTitle.trim() },
    { key: 'metaDescription', label: 'Meta description', done: !!metaDescription.trim() },
    { key: 'featuredImage', label: 'Imagen destacada', done: !!featuredImageUrl },
    { key: 'featuredAlt', label: 'Texto alternativo de la imagen', done: !!featuredImageAlt.trim() },
  ]
  const missingFields = requiredFields.filter((f) => !f.done)
  const canPublish = missingFields.length === 0
  const fieldMissing = (key: string) => attemptedPublish && missingFields.some((f) => f.key === key)

  const handleSave = async (status: 'draft' | 'published') => {
    setError('')
    if (!title.trim() || !slug.trim() || !categoryId || !metaTitle.trim() || !metaDescription.trim()) {
      setAttemptedPublish(true)
      setError('Completa los campos marcados con * antes de guardar.')
      return
    }
    if (status === 'published' && !canPublish) {
      setAttemptedPublish(true)
      setError(`Para publicar todavía falta: ${missingFields.map((f) => f.label).join(', ')}.`)
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        category_id: categoryId,
        meta_title: metaTitle.trim(),
        meta_description: metaDescription.trim(),
        keyword_principal: keywordPrincipal.trim() || null,
        keywords_secundarias: keywordsSecundarias
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        content,
        faq: faq.filter((f) => f.question.trim() && f.answer.trim()) as unknown as Json,
        featured_image_url: featuredImageUrl,
        featured_image_alt: featuredImageAlt.trim() || null,
        og_image_url: ogImageUrl,
        author: author.trim() || 'Equipo iPlanit',
        reading_time_minutes: calculateReadingTime(content),
        related_articles_override: relatedOverride,
        functional_tags: functionalTags,
        status,
        updated_at: new Date().toISOString(),
        published_at: status === 'published' ? existingArticle?.published_at || new Date().toISOString() : existingArticle?.published_at ?? null,
      }

      if (isEditing) {
        const { error: updateError } = await supabase.from('blog_articles').update(payload).eq('id', articleId)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('blog_articles').insert({ id: articleId, ...payload })
        if (insertError) throw insertError
      }

      router.push('/admin/blog')
    } catch (err) {
      console.error('[iplanit] Error saving article:', err)
      setError('No se pudo guardar el artículo. Revisa que el slug no esté repetido e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardContent className="space-y-4 p-5">
          <FormSection title="Datos básicos">
            <div className="space-y-2">
              <Label htmlFor="title">
                Título (H1)
                <RequiredMark />
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className={cn(fieldMissing('title') && 'border-destructive')}
              />
              {fieldMissing('title') && <p className="text-xs text-destructive">Falta el título.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="slug">
                  Slug
                  <RequiredMark />
                </Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(slugify(e.target.value))
                  }}
                  className={cn(fieldMissing('slug') && 'border-destructive')}
                />
                {fieldMissing('slug') && <p className="text-xs text-destructive">Falta el slug.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">
                  Categoría
                  <RequiredMark />
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">Autor</Label>
              <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
          </FormSection>

          <FormSection title="SEO" bordered>
            <div className="space-y-2">
              <Label htmlFor="meta-title">
                Meta title ({metaTitle.length}/60)
                <RequiredMark />
              </Label>
              <Input
                id="meta-title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                maxLength={60}
                className={cn(fieldMissing('metaTitle') && 'border-destructive')}
              />
              {fieldMissing('metaTitle') && <p className="text-xs text-destructive">Falta el meta title.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-description">
                Meta description ({metaDescription.length}/155)
                <RequiredMark />
              </Label>
              <Textarea
                id="meta-description"
                rows={2}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                maxLength={155}
                className={cn(fieldMissing('metaDescription') && 'border-destructive')}
              />
              {fieldMissing('metaDescription') && <p className="text-xs text-destructive">Falta la meta description.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="keyword-principal">Keyword principal (interno)</Label>
                <Input id="keyword-principal" value={keywordPrincipal} onChange={(e) => setKeywordPrincipal(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="keywords-secundarias">Keywords secundarias (separadas por coma, interno)</Label>
                <Input id="keywords-secundarias" value={keywordsSecundarias} onChange={(e) => setKeywordsSecundarias(e.target.value)} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Imagen destacada (obligatoria para publicar)" bordered>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-2">
                <Label>
                  Imagen (máx. 2MB, ideal 1200x630px)
                  <RequiredMark />
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    ref={featuredInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFeaturedFile}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('gap-2', fieldMissing('featuredImage') && 'border-destructive text-destructive')}
                    disabled={uploadingFeatured}
                    onClick={() => featuredInputRef.current?.click()}
                  >
                    {uploadingFeatured ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Subir imagen
                  </Button>
                  {featuredImageUrl && <span className="text-xs text-muted-foreground">Imagen cargada</span>}
                </div>
                {fieldMissing('featuredImage') && <p className="text-xs text-destructive">Falta subir la imagen destacada.</p>}
              </div>
              {featuredImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featuredImageUrl} alt="" className="h-20 w-32 rounded-md border object-cover" />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="featured-alt">
                Texto alternativo (alt)
                <RequiredMark />
              </Label>
              <Input
                id="featured-alt"
                value={featuredImageAlt}
                onChange={(e) => setFeaturedImageAlt(e.target.value)}
                className={cn(fieldMissing('featuredAlt') && 'border-destructive')}
              />
              {fieldMissing('featuredAlt') && <p className="text-xs text-destructive">Falta el texto alternativo.</p>}
            </div>
            <div className="space-y-2">
              <Label>Imagen para redes (og:image, opcional - hereda de la destacada si no se define)</Label>
              <div className="flex items-center gap-3">
                <input ref={ogInputRef} type="file" accept="image/*" className="hidden" onChange={handleOgFile} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={uploadingOg}
                  onClick={() => ogInputRef.current?.click()}
                >
                  {uploadingOg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Subir imagen
                </Button>
                {ogImageUrl && <span className="text-xs text-muted-foreground">Imagen propia cargada</span>}
              </div>
            </div>
          </FormSection>

          <FormSection title="Contenido (Markdown)" bordered>
            <div className="grid gap-4 lg:grid-cols-2">
              <Textarea
                rows={20}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="font-mono text-sm"
                placeholder="## Encabezado&#10;&#10;Texto del artículo..."
              />
              <div className="prose prose-sm dark:prose-invert max-w-none overflow-y-auto rounded-md border p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '_Vista previa..._'}</ReactMarkdown>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tiempo de lectura estimado: {calculateReadingTime(content)} min
            </p>
          </FormSection>

          <FormSection title="Preguntas frecuentes (FAQ)" bordered>
            <div className="space-y-3">
              {faq.map((entry, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Pregunta"
                      value={entry.question}
                      onChange={(e) => updateFaqEntry(i, 'question', e.target.value)}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFaqEntry(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Respuesta"
                    rows={2}
                    value={entry.answer}
                    onChange={(e) => updateFaqEntry(i, 'answer', e.target.value)}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addFaqEntry}>
                <Plus className="h-4 w-4" />
                Agregar pregunta
              </Button>
            </div>
          </FormSection>

          <FormSection title="Funcionalidades relacionadas" bordered>
            <div className="flex flex-wrap gap-4">
              {FUNCTIONAL_TAGS.map((tag) => (
                <label key={tag} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={functionalTags.includes(tag)}
                    onCheckedChange={(checked) => toggleFunctionalTag(tag, checked === true)}
                  />
                  {tag}
                </label>
              ))}
            </div>
          </FormSection>

          {otherArticles.length > 0 && (
            <FormSection title="Artículos relacionados (override manual, opcional)" bordered>
              <p className="text-xs text-muted-foreground">
                Si no eliges ninguno, el sistema sugiere automáticamente por categoría y funcionalidad.
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {otherArticles.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 py-1 text-sm">
                    <Checkbox
                      checked={relatedOverride.includes(a.id)}
                      onCheckedChange={(checked) => toggleRelated(a.id, checked === true)}
                    />
                    {a.title}
                  </label>
                ))}
              </div>
            </FormSection>
          )}
        </CardContent>
      </Card>

      {/* Always visible, not just after a failed attempt - the whole point
          is that you shouldn't have to click Publish and guess to find out
          what's missing (real feedback from David's co-founder testing the
          CMS: she had no way to tell which fields were mandatory). */}
      <Card className={cn(!canPublish && 'border-amber-500/40')}>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-medium text-foreground">
            {canPublish ? 'Listo para publicar' : 'Requisitos para publicar'}
          </p>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {requiredFields.map((f) => (
              <li key={f.key} className={cn('flex items-center gap-2 text-sm', f.done ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
                {f.done ? <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" /> : <XIcon className="h-4 w-4 shrink-0" />}
                {f.label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div
        className={cn(
          'sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mx-6 sm:px-6'
        )}
      >
        <p className="text-xs text-muted-foreground">
          {existingArticle?.status === 'published' ? 'Publicado' : 'Borrador'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => handleSave('draft')} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar borrador
          </Button>
          <Button type="button" onClick={() => handleSave('published')} disabled={saving || !canPublish}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publicar
          </Button>
        </div>
      </div>
    </div>
  )
}
