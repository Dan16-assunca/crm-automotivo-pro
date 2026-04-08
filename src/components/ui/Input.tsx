import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, hint, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.04em]">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-[38px] rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-default)]',
            'text-[var(--text-primary)] text-[14px] font-[Space_Grotesk,sans-serif]',
            'px-3 transition-all outline-none',
            'placeholder:text-[var(--text-muted)]',
            'hover:not(:focus):border-[var(--border-strong)]',
            'focus:border-[var(--border-neon-full)] focus:shadow-[0_0_0_3px_var(--neon-muted)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            icon && 'pl-9',
            error && 'border-[var(--status-error)] focus:border-[var(--status-error)] focus:shadow-[0_0_0_3px_rgba(255,59,48,0.15)]',
            className
          )}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>}
      {error && <p className="text-[11px] text-[var(--status-error)]">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
