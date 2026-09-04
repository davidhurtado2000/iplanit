import OpenAI from 'openai'

// Server-only - OPENAI_API_KEY has no NEXT_PUBLIC_ prefix on purpose, so
// bundlers never ship it to the browser. Only import this file from API
// routes / server code.
let _client: OpenAI | undefined

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    _client = new OpenAI({ apiKey })
  }
  return _client
}

// Model is env-driven so local dev never has to remember to switch it by
// hand: .env.local has no AI_MODEL set, so it falls back to gpt-5.4-mini
// (works on the free OpenAI tier, no credits touched - confirmed working
// 2026-09-02). Production sets AI_MODEL=gpt-5.6-luna once credits are
// loaded (cheaper per token - see docs/roadmap-ia-whatsapp.md for the cost
// comparison), so real customer usage never runs on the dev default and
// David's own local testing never spends production credit.
//
// Kept as two separate constants (both reading the same env var today)
// rather than one shared one, so the analytics chat can move to a more
// capable model later without also changing the one-shot summary feature.
export const AI_SUMMARY_MODEL = process.env.AI_MODEL || 'gpt-5.4-mini'
export const AI_CHAT_MODEL = process.env.AI_MODEL || 'gpt-5.4-mini'
