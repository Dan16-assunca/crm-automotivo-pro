import { create } from 'zustand'
import { useEffect } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  add: (toast: Omit<Toast, 'id'>) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (toast) =>
    set((s) => ({ toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }] })),
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'error', title, message }),
  warning: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'warning', title, message }),
  info: (title: string, message?: string) =>
    useToastStore.getState().add({ type: 'info', title, message }),
}

const CONFIG: Record<ToastType, { icon: React.ReactNode; color: string; border: string }> = {
  success: { icon: <CheckCircle2 size={15} />, color: 'var(--status-won)',     border: 'rgba(48,209,88,0.4)' },
  error:   { icon: <XCircle size={15} />,      color: 'var(--status-error)',    border: 'rgba(255,59,48,0.4)' },
  warning: { icon: <AlertTriangle size={15} />, color: 'var(--status-warning)', border: 'rgba(255,214,10,0.4)' },
  info:    { icon: <Info size={15} />,          color: 'var(--status-info)',     border: 'rgba(10,132,255,0.4)' },
}

function ToastItem({ toast: t, onRemove }: { toast: Toast; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, t.duration ?? 4000)
    return () => clearTimeout(timer)
  }, [t.duration, onRemove])

  const cfg = CONFIG[t.type]

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-[12px] min-w-[300px] max-w-[400px] shadow-[var(--shadow-lg)]"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid var(--border-default)`,
        borderLeft: `3px solid ${cfg.color}`,
        animation: 'slide-in-right 0.3s ease',
      }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
        {t.message && (
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.message}</p>
        )}
        {/* Progress bar */}
        <div className="h-[2px] rounded-full mt-2 overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
          <div
            className="h-full rounded-full"
            style={{
              background: cfg.color,
              animation: `progress-shrink ${t.duration ?? 4000}ms linear forwards`,
              width: '100%',
            }}
          />
        </div>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts, remove } = useToastStore()
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => remove(t.id)} />
      ))}
    </div>
  )
}
