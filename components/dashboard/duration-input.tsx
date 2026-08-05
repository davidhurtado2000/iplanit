'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

type DurationUnit = 'min' | 'hours'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface DurationInputProps {
  id?: string
  value: number | ''
  onChange: (minutes: number | '') => void
  className?: string
}

// Always stores/emits minutes - the unit toggle only changes what's typed
// and displayed, so a service's duration can be entered as "1.5 horas"
// instead of forcing everyone to do the minutes math themselves.
export function DurationInput({ id, value, onChange, className }: DurationInputProps) {
  const { t } = useLanguage()
  const [unit, setUnit] = useState<DurationUnit>('min')

  const displayValue = value === '' ? '' : unit === 'hours' ? round2(value / 60) : value

  const handleValueChange = (raw: string) => {
    if (raw.trim() === '') {
      onChange('')
      return
    }
    const parsed = parseFloat(raw)
    if (Number.isNaN(parsed)) {
      onChange('')
      return
    }
    onChange(unit === 'hours' ? Math.round(parsed * 60) : Math.round(parsed))
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        id={id}
        type="number"
        min={unit === 'hours' ? 0.25 : 5}
        step={unit === 'hours' ? 0.25 : 5}
        value={displayValue}
        onChange={(e) => handleValueChange(e.target.value)}
        className="flex-1"
      />
      <Select value={unit} onValueChange={(v: DurationUnit) => setUnit(v)}>
        <SelectTrigger className="w-[100px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="min">{t.services.durationUnitMin}</SelectItem>
          <SelectItem value="hours">{t.services.durationUnitHours}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
