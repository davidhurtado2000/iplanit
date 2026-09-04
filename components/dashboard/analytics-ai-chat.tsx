'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquarePlus } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useAuth } from '@/hooks/use-auth'
import { AiAddonRequired } from '@/components/dashboard/ai-addon-required'
import { AiUsageBadge, type AiUsageBadgeHandle } from '@/components/dashboard/ai-usage-badge'
import { formatResetDate } from '@/lib/ai-usage-client'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_PREFIX = 'iplanit:ai-chat:'

// Full history is kept for display (locally, see below), but only the last
// MAX_HISTORY_SENT messages ever get sent to the API - a long-running
// conversation would otherwise resend its entire history (and cost more)
// on every single new message, growing without bound.
const MAX_HISTORY_SENT = 16

function AssistantAvatar() {
  // favicon-96x96.png is already a filled circular badge (dark background,
  // bird logo edge-to-edge) - rendering it directly at full size, instead
  // of shrinking it inside an extra padded circle, is what makes it fill
  // the whole avatar instead of floating small in the middle of it.
  return <img src="/favicon-96x96.png" alt="" className="h-9 w-9 shrink-0 rounded-full" />
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Kept in the browser (localStorage), not the database - a chat message
// here is only ever a fresh question about live data (nothing irreplaceable
// to preserve server-side, see the conversation that led to this choice),
// so this just avoids losing the conversation on an accidental reload.
// Scoped per business so switching businesses doesn't show another one's
// chat.
export function AnalyticsAiChat({ businessId, aiAddonActive }: { businessId: string; aiAddonActive: boolean }) {
  const { t, language } = useLanguage()
  const tr = t.analytics
  const { profile } = useAuth()
  const userName = profile?.full_name || profile?.email || ''
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [ready, setReady] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const usageBadgeRef = useRef<AiUsageBadgeHandle>(null)

  useEffect(() => {
    setReady(false)
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${businessId}`)
      setMessages(raw ? JSON.parse(raw) : [])
    } catch {
      setMessages([])
    }
    setReady(true)
  }, [businessId])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${businessId}`, JSON.stringify(messages))
    } catch {
      // Private browsing / storage disabled - conversation just won't
      // survive a reload, not worth surfacing an error for.
    }
  }, [messages, businessId, ready])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async (overrideText?: string) => {
    const question = (overrideText ?? input).trim()
    if (!question || loading) return

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(nextMessages)
    if (!overrideText) setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/dashboard/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, language, messages: nextMessages.slice(-MAX_HISTORY_SENT) }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        if (res.status === 429) {
          const dateLabel = formatResetDate(data?.resetsOn, language)
          setError(dateLabel ? `${tr.aiChatRateLimited} ${dateLabel}.` : tr.aiChatRateLimited)
        } else {
          setError(tr.aiChatError)
        }
        return
      }

      if (data?.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
        usageBadgeRef.current?.refresh()
      } else {
        setError(tr.aiChatError)
      }
    } catch (err) {
      console.error('[iplanit] Error sending AI chat message:', err)
      setError(tr.aiChatError)
    } finally {
      setLoading(false)
    }
  }

  const handleNewConversation = () => {
    setMessages([])
    setError(null)
  }

  const suggestions = [tr.aiChatSuggestion1, tr.aiChatSuggestion2, tr.aiChatSuggestion3, tr.aiChatSuggestion4]

  if (!aiAddonActive) {
    return <AiAddonRequired />
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b pb-4">
        <div className="flex items-center gap-2.5">
          <img src="/favicon-96x96.png" alt="" className="h-7 w-7" />
          <span className="text-sm font-medium text-foreground">{tr.aiChatHeaderTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          <AiUsageBadge ref={usageBadgeRef} businessId={businessId} />
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleNewConversation}>
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {tr.aiChatNewConversation}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex h-[500px] flex-col p-4">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">{tr.aiChatEmpty}</p>
              <div className="w-full max-w-sm space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{tr.aiChatSuggestionsLabel}</p>
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSend(q)}
                    disabled={loading}
                    className="block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'assistant' && <AssistantAvatar />}
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={profile?.avatar_url || undefined} alt="" />
                  <AvatarFallback className="text-xs">{getInitials(userName)}</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2">
              <AssistantAvatar />
              <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2.5" aria-label={tr.aiChatThinking}>
                <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: '0ms' }} />
                <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: '150ms' }} />
                <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <div className="mt-3 flex gap-2 border-t pt-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={tr.aiChatPlaceholder}
            disabled={loading}
          />
          <Button size="icon" onClick={() => handleSend()} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
