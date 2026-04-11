import { cn } from '@/lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  kpi?: boolean
  neon?: boolean
  glass?: boolean
  accent?: string
}

export function Card({ className, kpi, neon, glass, accent, children, style, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-[9px] transition-all duration-[200ms]',
        glass
          ? 'bg-[rgba(13,13,13,0.9)] backdrop-blur-xl border border-[var(--nb)]'
          : 'bg-[var(--card)] border border-[var(--bs)]',
        !glass && !neon && 'hover:border-[var(--nb)]',
        neon && 'border-[var(--nb)]',
        className
      )}
      style={style}
      {...props}
    >
      {(kpi || accent) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '9px 9px 0 0',
          background: accent ?? 'var(--neon)', opacity: .8,
        }} />
      )}
      {children}
    </div>
  )
}

export function CardHeader({ className, children, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between', className)} style={style} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[10px] font-semibold uppercase tracking-[.06em]', className)}
      style={{ color: 'var(--t2)' }}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props}>{children}</div>
}
