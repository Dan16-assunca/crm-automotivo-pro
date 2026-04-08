import { cn } from '@/lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  kpi?: boolean
  neon?: boolean
  glass?: boolean
}

export function Card({ className, kpi, neon, glass, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-[12px] p-5 transition-all duration-[250ms]',
        glass
          ? 'bg-[rgba(16,16,16,0.85)] backdrop-blur-xl border border-[rgba(57,255,20,0.12)]'
          : 'bg-[var(--bg-card)] border border-[var(--border-subtle)]',
        'shadow-[var(--shadow-card)]',
        'hover:border-[var(--border-neon)] hover:shadow-[var(--shadow-card),var(--neon-glow-sm)]',
        kpi && 'overflow-hidden',
        neon && 'border-[var(--border-neon)] shadow-[var(--shadow-card),var(--neon-glow-sm)]',
        className
      )}
      {...props}
    >
      {kpi && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--neon)] to-transparent opacity-60" />
      )}
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props}>{children}</div>
}
