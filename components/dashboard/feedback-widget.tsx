'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageSquarePlus, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import { useBusinesses } from '@/hooks/use-businesses'
import { useLanguage } from '@/context/language-context'
import { createClient } from '@/lib/supabase/client'

// Deliberately minimal: free text only, no categories or forms - the goal
// is a low enough bar that people actually use it. Read directly from the
// Supabase table view/SQL editor, no admin UI on top of it (see
// scripts/038-feedback.sql).
export function FeedbackWidget() {
  const { user } = useAuth()
  const { currentBusiness } = useBusinesses()
  const { t } = useLanguage()
  const pathname = usePathname()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!user || !message.trim()) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        business_id: currentBusiness?.id ?? null,
        message: message.trim(),
        page_url: pathname,
      })
      if (error) throw error
      setSent(true)
      setMessage('')
      setTimeout(() => {
        setSent(false)
        setOpen(false)
      }, 1800)
    } catch (err) {
      console.error('[iplanit] Error submitting feedback:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          // Docked to the right edge, vertically centered, instead of the
          // bottom-right corner - that spot is already where toasts land
          // (components/ui/toast.tsx) and is the conventional home for a
          // primary action (WhatsApp's send button, most FABs), so a
          // feedback button there kept reading as "the" action instead of
          // an aside. A half-pill edge tab is a well-worn pattern for a
          // secondary, always-available action (Intercom/Canny-style) that
          // doesn't compete with either.
          className="fixed right-0 top-1/2 z-40 h-11 w-11 -translate-y-1/2 rounded-l-full rounded-r-none shadow-lg"
          title={t.feedback.buttonLabel}
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" align="center" sideOffset={8} className="w-80">
        {sent ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Check className="h-6 w-6 text-green-600" />
            <p className="text-sm font-medium">{t.feedback.thanks}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">{t.feedback.title}</p>
              <p className="text-xs text-muted-foreground">{t.feedback.subtitle}</p>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.feedback.placeholder}
              rows={4}
              maxLength={2000}
              disabled={submitting}
            />
            <Button
              size="sm"
              className="w-full gap-2"
              disabled={submitting || !message.trim()}
              onClick={handleSubmit}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.feedback.send}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
