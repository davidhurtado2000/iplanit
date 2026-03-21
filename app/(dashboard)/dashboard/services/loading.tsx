import { Skeleton } from '@/components/ui/skeleton'

export default function ServicesLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Search */}
      <Skeleton className="h-10 w-full max-w-sm" />

      {/* Table */}
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b p-4 last:border-b-0">
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
