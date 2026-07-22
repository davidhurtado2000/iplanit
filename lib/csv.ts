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
