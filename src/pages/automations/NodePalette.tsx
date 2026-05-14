import { NODE_COLORS, TRIGGER_TYPES } from './flow-types'

interface PaletteItem {
  type: string
  label: string
  icon: string
  color: string
  defaultData: Record<string, unknown>
}

const PALETTE: { section: string; items: PaletteItem[] }[] = [
  {
    section: 'Gatilhos',
    items: TRIGGER_TYPES.map(t => ({
      type: 'trigger', label: t.label, icon: t.icon, color: t.color,
      defaultData: { triggerType: t.id, segmentFilter: 'ALL', sendTime: '09:00', sendDays: [1,2,3,4,5] },
    })),
  },
  {
    section: 'Ações',
    items: [
      { type: 'whatsapp', label: 'Enviar WhatsApp',   icon: '💬', color: NODE_COLORS.whatsapp,
        defaultData: { message: '', sendTime: '09:00', sendDays: [1,2,3,4,5] } },
      { type: 'task',     label: 'Criar tarefa',       icon: '✅', color: NODE_COLORS.task,
        defaultData: { title: '', dueDays: 1, assignTo: 'responsible' } },
      { type: 'pipeline', label: 'Mover pipeline',     icon: '📋', color: NODE_COLORS.pipeline,
        defaultData: { targetStageId: '', targetStageName: '' } },
      { type: 'segment',  label: 'Classificar (A/B/C)',icon: '🏷️', color: NODE_COLORS.segment,
        defaultData: { segment: 'A', reason: '' } },
      { type: 'referral', label: 'Pedir indicação',    icon: '🤝', color: NODE_COLORS.referral,
        defaultData: { message: 'Oi {{nome}}, indicar alguém ganha benefícios! {{link_indicacao}}' } },
    ],
  },
  {
    section: 'Lógica',
    items: [
      { type: 'condition', label: 'Condição',    icon: '🔀', color: NODE_COLORS.condition,
        defaultData: { conditionType: 'replied', operator: 'eq', value: '', labelYes: 'Respondeu', labelNo: 'Não respondeu' } },
      { type: 'delay',    label: 'Aguardar',     icon: '⏱️', color: NODE_COLORS.delay,
        defaultData: { amount: 1, unit: 'days', sendAt: '09:00', skipWeekends: false } },
      { type: 'end',      label: 'Fim do fluxo', icon: '🏁', color: NODE_COLORS.end,
        defaultData: { reason: '' } },
    ],
  },
]

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify({ type: item.type, defaultData: item.defaultData }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div style={{
      width: 200, flexShrink: 0, background: 'var(--surf)', borderRight: '1px solid var(--bs)',
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--bs)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Componentes
        </p>
      </div>

      {PALETTE.map(group => (
        <div key={group.section}>
          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '10px 12px 4px' }}>
            {group.section}
          </p>
          {group.items.map(item => (
            <div
              key={`${item.type}-${item.label}`}
              draggable
              onDragStart={e => onDragStart(e, item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', cursor: 'grab', borderRadius: 6, margin: '1px 6px',
                userSelect: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0, fontSize: 13,
                background: `${item.color}18`, border: `1px solid ${item.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.icon}
              </div>
              <span style={{ fontSize: 11, color: 'var(--t2)', flex: 1, lineHeight: 1.3 }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ padding: '12px', marginTop: 'auto', borderTop: '1px solid var(--bs)' }}>
        <p style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.5 }}>
          Arraste os componentes para o canvas e conecte-os.
        </p>
      </div>
    </div>
  )
}
