export interface CsvColumn<T> {
  label: string
  value: (row: T) => string | number | null | undefined
}

/** Wraps a field in quotes only when it actually needs escaping (RFC 4180),
 * so simple values stay readable in the raw file. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',')
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(String(c.value(row) ?? ''))).join(',')
  )
  // Leading BOM so Excel opens accented characters (á, é, ñ) as UTF-8
  // instead of guessing the wrong codepage - otherwise names/notes with
  // accents render as garbled characters for anyone opening this in Excel.
  return '﻿' + [header, ...lines].join('\r\n')
}

/** RFC 4180 parser (quoted fields, "" escaping, CRLF/LF, optional leading
 * BOM) - the inverse of toCsv's escaping, so a file exported from this app
 * round-trips cleanly back through import. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        field += char
        i++
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
    } else if (char === ',') {
      row.push(field)
      field = ''
      i++
    } else if (char === '\r') {
      i++
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else {
      field += char
      i++
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
