import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-semibold text-[12px] tracking-[.01em]',
    'transition-all duration-[180ms] ease-out',
    'focus-visible:outline-none',
    'disabled:opacity-40 disabled:pointer-events-none select-none',
    'cursor-pointer border-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--neon)] text-black rounded-[6px]',
          'hover:bg-[var(--nd)] hover:shadow-[0_0_12px_rgba(61,247,16,.28)] hover:-translate-y-px',
          'active:translate-y-0',
        ].join(' '),
        secondary: [
          'bg-transparent text-[var(--t2)] border border-[var(--b)] rounded-[6px]',
          'hover:border-[var(--nb)] hover:text-[var(--t)]',
        ].join(' '),
        ghost: [
          'bg-transparent text-[var(--t3)] rounded-[6px]',
          'hover:bg-[var(--el)] hover:text-[var(--t)]',
        ].join(' '),
        danger: [
          'bg-[var(--red)] text-white rounded-[6px]',
          'hover:brightness-110',
        ].join(' '),
        outline: [
          'bg-transparent border border-[var(--b)] text-[var(--t2)] rounded-[6px]',
          'hover:border-[var(--nb)] hover:text-[var(--t)]',
        ].join(' '),
      },
      size: {
        sm:   'h-7 px-3 text-[11px]',
        md:   'h-8 px-4 text-[12px]',
        lg:   'h-10 px-5 text-[13px]',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, style, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      style={style}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
