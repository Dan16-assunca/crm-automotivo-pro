import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[.03em] uppercase',
  {
    variants: {
      variant: {
        default:  'bg-[var(--el)] text-[var(--t2)] border border-[var(--b)]',
        neon:     'bg-[var(--ng)] text-[var(--neon)] border border-[var(--nb)]',
        hot:      'bg-[rgba(244,63,94,.12)]  text-[var(--red)] border border-[rgba(244,63,94,.2)]',
        warm:     'bg-[rgba(249,115,22,.12)] text-[var(--ora)] border border-[rgba(249,115,22,.2)]',
        cold:     'bg-[rgba(59,130,246,.12)] text-[var(--blu)] border border-[rgba(59,130,246,.2)]',
        success:  'bg-[rgba(34,197,94,.12)]  text-[var(--grn)] border border-[rgba(34,197,94,.2)]',
        danger:   'bg-[rgba(244,63,94,.12)]  text-[var(--red)] border border-[rgba(244,63,94,.2)]',
        warning:  'bg-[rgba(234,179,8,.12)]  text-[var(--yel)] border border-[rgba(234,179,8,.2)]',
        info:     'bg-[rgba(59,130,246,.12)] text-[var(--blu)] border border-[rgba(59,130,246,.2)]',
        purple:   'bg-[rgba(168,85,247,.12)] text-[var(--pur)] border border-[rgba(168,85,247,.2)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="w-[5px] h-[5px] rounded-full bg-current pulse-dot shrink-0" />}
      {children}
    </span>
  )
}
