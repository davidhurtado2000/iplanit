import React from 'react'

/**
 * Deliberately tiny markdown subset for reservation notes: **bold** spans
 * and "- " bullet lines, nothing else (no links/headings/etc - this is a
 * notes field, not a document editor). Renders straight to React elements
 * instead of HTML, so plain text nodes are auto-escaped by React and there
 * is no dangerouslySetInnerHTML/sanitizer to get wrong.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-b${i}`}>{part}</strong> : part
  )
}

export function renderSimpleMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let bulletBuffer: string[] = []

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-4">
        {bulletBuffer.map((line, i) => (
          <li key={i}>{renderInline(line, `ul-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    )
    bulletBuffer = []
  }

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2))
      return
    }
    flushBullets()
    if (line.trim() === '') {
      blocks.push(<br key={`br-${i}`} />)
    } else {
      blocks.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>)
    }
  })
  flushBullets()

  return blocks
}
