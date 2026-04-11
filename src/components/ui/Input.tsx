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
    <div className="flex flex-col gap-1">
      {label && (
        <label style={{
          fontSize: 10, fontWeight: 600, color: 'var(--t3)',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--t3)' }}>
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-[7px] outline-none transition-all',
            'text-[12px]',
            className
          )}
          style={{
            height: 34, padding: icon ? '0 11px 0 32px' : '0 11px',
            background: 'var(--el)', border: `1px solid ${error ? 'var(--red)' : 'var(--b)'}`,
            color: 'var(--t)', fontFamily: 'var(--fn)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--nb)')}
          onBlur={e => (e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--b)')}
          {...props}
        />
      </div>
      {hint && !error && <p style={{ fontSize: 10, color: 'var(--t3)' }}>{hint}</p>}
      {error && <p style={{ fontSize: 10, color: 'var(--red)' }}>{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
