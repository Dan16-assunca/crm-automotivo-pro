import { cn } from '@/lib/cn'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} {...props} />
}

export function SkeletonCard() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[12px] p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-px">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 bg-[var(--bg-card)]">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24 shrink-0" />
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonKPI() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[12px] p-5 space-y-3 overflow-hidden relative">
      <div className="absolute top-0 left-0 right-0 h-[2px] skeleton" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-2.5 w-16" />
    </div>
  )
}
