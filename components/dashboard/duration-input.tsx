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
  /** Forces the starting unit instead of guessing from value - used for a
   * brand-new service (default 30-min value would otherwise guess "min",
   * but new services should start on "horas" per feedback). Omit to fall
   * back to the value-based guess (editing/duplicating an existing value). */
  initialUnit?: DurationUnit
}

// Always stores/emits minutes - the unit toggle only changes what's typed
// and displayed, so a service's duration can be entered as "1.5 horas"
// instead of forcing everyone to do the minutes math themselves.
//
// Which unit to SHOW is never persisted (only the final minute count is
// saved), so there's no way to know for certain "this was originally typed
// in hours" once it comes back from the database - editing, viewing, or
// duplicating a service always used to default back to minutes regardless
// of how it was entered, which read as if the value itself had changed
// (it hadn't - same total time, just relabeled). Defaulting to hours
// whenever the incoming value is a full hour or more is a reasonable
// guess that matches how services are normally described ("2 horas" vs
// "45 min"), and removes the surprise for the common case.
export function DurationInput({ id, value, onChange, className, initialUnit }: DurationInputProps) {
  const { t } = useLanguage()
  const [unit, setUnit] = useState<DurationUnit>(
    () => initialUnit ?? (typeof value === 'number' && value >= 60 ? 'hours' : 'min')
  )

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
