import { Handle, Position } from '@xyflow/react'

interface BaseNodeProps {
  selected?: boolean
  children?: React.ReactNode
  accentColor: string
  icon: string
  typeLabel: string
  title: string
  subtitle?: string
  hasInput?: boolean
  hasOutput?: boolean
  hasYesNo?: boolean
}

export function BaseNode({
  selected, children, accentColor, icon, typeLabel, title, subtitle,
  hasInput = true, hasOutput = true, hasYesNo = false,
}: BaseNodeProps) {
  const border = selected ? `1.5px solid ${accentColor}` : '1px solid var(--bs)'
  const shadow = selected ? `0 0 0 3px ${accentColor}22` : 'none'

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 12, border,
      boxShadow: shadow, minWidth: 175, maxWidth: 220,
      transition: 'border .12s, box-shadow .12s', cursor: 'pointer',
      overflow: 'hidden',
    }}>
      {hasInput && (
        <Handle type="target" position={Position.Top} style={{
          width: 10, height: 10, background: 'var(--bg)',
          border: `2px solid ${accentColor}`, top: -5,
        }} />
      )}

      {/* Stripe + icon */}
      <div style={{ height: 3, background: accentColor }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: `${accentColor}18`, border: `1px solid ${accentColor}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1 }}>
              {typeLabel}
            </p>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </p>
          </div>
        </div>
        {subtitle && (
          <p style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>

      {hasOutput && !hasYesNo && (
        <Handle type="source" position={Position.Bottom} style={{
          width: 10, height: 10, background: 'var(--bg)',
          border: `2px solid ${accentColor}`, bottom: -5,
        }} />
      )}

      {hasYesNo && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 8px', marginTop: -4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e' }}>SIM</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#f87171' }}>NÃO</span>
          </div>
          <Handle id="yes" type="source" position={Position.Bottom}
            style={{ width: 10, height: 10, left: '30%', background: '#22c55e', border: '2px solid #16a34a', bottom: -5 }} />
          <Handle id="no" type="source" position={Position.Bottom}
            style={{ width: 10, height: 10, left: '70%', background: '#f87171', border: '2px solid #dc2626', bottom: -5 }} />
        </>
      )}
    </div>
  )
}
