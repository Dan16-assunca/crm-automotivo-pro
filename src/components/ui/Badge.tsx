import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.03em] uppercase font-[Space_Grotesk,sans-serif]',
  {
    variants: {
      variant: {
        default:  'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-default)]',
        neon:     'bg-[var(--neon-muted)] text-[var(--neon)] border border-[var(--border-neon)]',
        hot:      'bg-[rgba(255,59,48,0.15)]  text-[#FF3B30] border border-[rgba(255,59,48,0.3)]',
        warm:     'bg-[rgba(255,159,10,0.15)] text-[#FF9F0A] border border-[rgba(255,159,10,0.3)]',
        cold:     'bg-[rgba(10,132,255,0.15)] text-[#0A84FF] border border-[rgba(10,132,255,0.3)]',
        success:  'bg-[rgba(48,209,88,0.15)]  text-[#30D158] border border-[rgba(48,209,88,0.3)]',
        danger:   'bg-[rgba(255,59,48,0.15)]  text-[#FF3B30] border border-[rgba(255,59,48,0.3)]',
        warning:  'bg-[rgba(255,214,10,0.15)] text-[#FFD60A] border border-[rgba(255,214,10,0.3)]',
        info:     'bg-[rgba(10,132,255,0.15)] text-[#0A84FF] border border-[rgba(10,132,255,0.3)]',
        purple:   'bg-[rgba(191,90,242,0.15)] text-[#BF5AF2] border border-[rgba(191,90,242,0.3)]',
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
