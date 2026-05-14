import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { TEMPLATE_VARS, DAY_LABELS, TRIGGER_TYPES, NODE_COLORS } from './flow-types'
import type { FlowNode } from './flow-types'

const inp: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 8px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 6, color: 'var(--t)', fontSize: 12,
  fontFamily: 'var(--fn)', outline: 'none', boxSizing: 'border-box',
}
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginBottom: 4, display: 'block' }
const field: React.CSSProperties = { marginBottom: 14 }
const textarea: React.CSSProperties = {
  ...inp, height: 'auto', padding: '8px', resize: 'vertical', minHeight: 90,
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p style={label}>{children}</p>
}

function DaysSelector({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {DAY_LABELS.map((d, i) => {
        const active = value.includes(i)
        return (
          <button key={i} type="button"
            onClick={() => onChange(active ? value.filter(v => v !== i) : [...value, i])}
            style={{
              width: 30, height: 26, borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: 'pointer',
              border: active ? '1.5px solid var(--neon)' : '1px solid var(--b)',
              background: active ? 'var(--ng)' : 'var(--el)',
              color: active ? 'var(--neon)' : 'var(--t3)',
            }}
          >{d}</button>
        )
      })}
    </div>
  )
}

function VarChips({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
      {TEMPLATE_VARS.map(v => (
        <button key={v.key} type="button" onClick={() => onInsert(v.key)}
          style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 10, cursor: 'pointer',
            background: 'var(--ng)', border: '1px solid var(--nb)', color: 'var(--neon)',
          }}
          title={v.label}>{v.key}</button>
      ))}
    </div>
  )
}

// ── Forms por tipo de nó ────────────────────────────────────────────────────

function TriggerForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={field}>
        <FieldLabel>Tipo de gatilho</FieldLabel>
        <select value={(data.triggerType as string) || ''} onChange={e => update({ ...data, triggerType: e.target.value })} style={{ ...inp, height: 32 }}>
          {TRIGGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
        </select>
      </div>
      {(data.triggerType as string) === 'lead_inactive' && (
        <div style={field}>
          <FieldLabel>Dias de inatividade</FieldLabel>
          <input type="number" min={1} value={(data.inactiveDays as number) || 7}
            onChange={e => update({ ...data, inactiveDays: +e.target.value })} style={inp} />
        </div>
      )}
      <div style={field}>
        <FieldLabel>Segmento alvo</FieldLabel>
        <select value={(data.segmentFilter as string) || 'ALL'} onChange={e => update({ ...data, segmentFilter: e.target.value })} style={{ ...inp, height: 32 }}>
          <option value="ALL">Todos os segmentos</option>
          <option value="A">A — Cliente ativo</option>
          <option value="B">B — MQL perdido</option>
          <option value="C">C — Comprador antigo</option>
        </select>
      </div>
      <div style={field}>
        <FieldLabel>Horário de disparo</FieldLabel>
        <input type="time" value={(data.sendTime as string) || '09:00'} onChange={e => update({ ...data, sendTime: e.target.value })} style={inp} />
      </div>
      <div style={field}>
        <FieldLabel>Dias da semana</FieldLabel>
        <DaysSelector value={(data.sendDays as number[]) || [1,2,3,4,5]} onChange={v => update({ ...data, sendDays: v })} />
      </div>
    </>
  )
}

function WhatsappForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  const [msg, setMsg] = useState((data.message as string) || '')
  useEffect(() => { setMsg((data.message as string) || '') }, [data.message])

  const insertVar = (v: string) => {
    const newMsg = msg + v
    setMsg(newMsg)
    update({ ...data, message: newMsg })
  }

  const preview = msg
    .replace(/\{\{nome\}\}/g, 'João Silva')
    .replace(/\{\{veiculo\}\}/g, 'Honda Civic 2023')
    .replace(/\{\{loja\}\}/g, 'Minha Loja')
    .replace(/\{\{vendedor\}\}/g, 'Carlos')
    .replace(/\{\{link_indicacao\}\}/g, 'crm.app/ref/abc123')
    .replace(/\{\{dias_sem_resposta\}\}/g, '7')

  return (
    <>
      <div style={field}>
        <FieldLabel>Mensagem</FieldLabel>
        <VarChips onInsert={insertVar} />
        <textarea value={msg} style={textarea}
          onChange={e => { setMsg(e.target.value); update({ ...data, message: e.target.value }) }}
          placeholder="Oi {{nome}}, tudo bem?" />
        <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 3 }}>{msg.length} caracteres</p>
      </div>
      {msg && (
        <div style={{ ...field, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, padding: 10 }}>
          <FieldLabel>Preview</FieldLabel>
          <p style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{preview}</p>
        </div>
      )}
      <div style={field}>
        <FieldLabel>Horário de envio</FieldLabel>
        <input type="time" value={(data.sendTime as string) || '09:00'} onChange={e => update({ ...data, sendTime: e.target.value })} style={inp} />
      </div>
      <div style={field}>
        <FieldLabel>Dias da semana</FieldLabel>
        <DaysSelector value={(data.sendDays as number[]) || [1,2,3,4,5]} onChange={v => update({ ...data, sendDays: v })} />
      </div>
    </>
  )
}

function DelayForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={{ ...field, display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Quantidade</FieldLabel>
          <input type="number" min={1} value={(data.amount as number) || 1}
            onChange={e => update({ ...data, amount: +e.target.value })} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Unidade</FieldLabel>
          <select value={(data.unit as string) || 'days'} onChange={e => update({ ...data, unit: e.target.value })} style={{ ...inp, height: 32 }}>
            <option value="hours">Horas</option>
            <option value="days">Dias</option>
            <option value="weeks">Semanas</option>
          </select>
        </div>
      </div>
      <div style={field}>
        <FieldLabel>Retomar às (horário)</FieldLabel>
        <input type="time" value={(data.sendAt as string) || '09:00'} onChange={e => update({ ...data, sendAt: e.target.value })} style={inp} />
      </div>
      <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="skipWk" checked={!!(data.skipWeekends)} onChange={e => update({ ...data, skipWeekends: e.target.checked })} />
        <label htmlFor="skipWk" style={{ fontSize: 11, color: 'var(--t2)', cursor: 'pointer' }}>Ignorar fins de semana</label>
      </div>
    </>
  )
}

function ConditionForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={field}>
        <FieldLabel>Condição</FieldLabel>
        <select value={(data.conditionType as string) || 'replied'} onChange={e => update({ ...data, conditionType: e.target.value })} style={{ ...inp, height: 32 }}>
          <option value="replied">Respondeu a última mensagem?</option>
          <option value="segment">Segmento do lead</option>
          <option value="tag">Tem tag específica?</option>
          <option value="field">Campo personalizado</option>
        </select>
      </div>
      {(data.conditionType as string) !== 'replied' && (
        <div style={field}>
          <FieldLabel>Valor</FieldLabel>
          <input value={(data.value as string) || ''} onChange={e => update({ ...data, value: e.target.value })} style={inp} placeholder="Valor a comparar" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, ...field }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Label "Sim"</FieldLabel>
          <input value={(data.labelYes as string) || 'Sim'} onChange={e => update({ ...data, labelYes: e.target.value })} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Label "Não"</FieldLabel>
          <input value={(data.labelNo as string) || 'Não'} onChange={e => update({ ...data, labelNo: e.target.value })} style={inp} />
        </div>
      </div>
    </>
  )
}

function SegmentForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={field}>
        <FieldLabel>Segmento</FieldLabel>
        <select value={(data.segment as string) || 'A'} onChange={e => update({ ...data, segment: e.target.value })} style={{ ...inp, height: 32 }}>
          <option value="A">A — Cliente ativo / recente</option>
          <option value="B">B — MQL perdido</option>
          <option value="C">C — Comprador antigo</option>
        </select>
      </div>
      <div style={field}>
        <FieldLabel>Motivo (opcional)</FieldLabel>
        <input value={(data.reason as string) || ''} onChange={e => update({ ...data, reason: e.target.value })} style={inp} placeholder="Ex: Comprou há menos de 30 dias" />
      </div>
    </>
  )
}

function TaskForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={field}>
        <FieldLabel>Título da tarefa</FieldLabel>
        <VarChips onInsert={v => update({ ...data, title: ((data.title as string) || '') + v })} />
        <input value={(data.title as string) || ''} onChange={e => update({ ...data, title: e.target.value })} style={inp} placeholder="Ligar para {{nome}}" />
      </div>
      <div style={field}>
        <FieldLabel>Vencimento (dias)</FieldLabel>
        <input type="number" min={0} value={(data.dueDays as number) ?? 1} onChange={e => update({ ...data, dueDays: +e.target.value })} style={inp} />
      </div>
      <div style={field}>
        <FieldLabel>Atribuir para</FieldLabel>
        <select value={(data.assignTo as string) || 'responsible'} onChange={e => update({ ...data, assignTo: e.target.value })} style={{ ...inp, height: 32 }}>
          <option value="responsible">Vendedor responsável</option>
          <option value="owner">Dono da loja</option>
        </select>
      </div>
    </>
  )
}

function ReferralForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <div style={field}>
        <FieldLabel>Mensagem de indicação</FieldLabel>
        <VarChips onInsert={v => update({ ...data, message: ((data.message as string) || '') + v })} />
        <textarea value={(data.message as string) || ''} style={textarea}
          onChange={e => update({ ...data, message: e.target.value })}
          placeholder="Oi {{nome}}, tem alguém que busca um carro? Indique e ganhe benefícios! {{link_indicacao}}" />
      </div>
      <div style={field}>
        <FieldLabel>Recompensa (opcional)</FieldLabel>
        <input value={(data.rewardDescription as string) || ''} onChange={e => update({ ...data, rewardDescription: e.target.value })} style={inp} placeholder="Ex: Revisão grátis" />
      </div>
    </>
  )
}

function EndForm({ data, update }: { data: Record<string, unknown>; update: (d: Record<string, unknown>) => void }) {
  return (
    <div style={field}>
      <FieldLabel>Motivo do encerramento (opcional)</FieldLabel>
      <input value={(data.reason as string) || ''} onChange={e => update({ ...data, reason: e.target.value })} style={inp} placeholder="Ex: Fluxo concluído com sucesso" />
    </div>
  )
}

// ── Painel principal ────────────────────────────────────────────────────────

function nodeTitle(type: string) {
  const map: Record<string, string> = {
    trigger: 'Gatilho', whatsapp: 'WhatsApp', delay: 'Atraso',
    condition: 'Condição', segment: 'Segmento', task: 'Tarefa',
    pipeline: 'Pipeline', referral: 'Indicação', end: 'Fim',
  }
  return map[type] ?? type
}

interface Props {
  node: FlowNode | null
  onChange: (nodeId: string, data: Record<string, unknown>) => void
}

export function PropertiesPanel({ node, onChange }: Props) {
  const update = (data: Record<string, unknown>) => {
    if (node) onChange(node.id, data)
  }

  const accent = node ? (NODE_COLORS[(node.type as string)] ?? 'var(--neon)') : 'var(--neon)'

  return (
    <div style={{
      width: 240, flexShrink: 0, background: 'var(--surf)', borderLeft: '1px solid var(--bs)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bs)', flexShrink: 0 }}>
        {node ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>
              {nodeTitle(node.type as string)}
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Propriedades</p>
        )}
        <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
          {node ? `ID: ${node.id.slice(0, 12)}…` : 'Selecione um nó para editar'}
        </p>
      </div>

      <div style={{ flex: 1, padding: '14px', overflowY: 'auto' }}>
        {!node ? (
          <>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.5 }}>
              Clique em um nó no canvas para editar suas propriedades aqui.
            </p>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              Variáveis disponíveis
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {TEMPLATE_VARS.map(v => (
                <span key={v.key} title={v.label} style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 10,
                  background: 'var(--ng)', border: '1px solid var(--nb)', color: 'var(--neon)',
                }}>{v.key}</span>
              ))}
            </div>
          </>
        ) : (
          <>
            {node.type === 'trigger'   && <TriggerForm   data={node.data} update={update} />}
            {node.type === 'whatsapp'  && <WhatsappForm  data={node.data} update={update} />}
            {node.type === 'delay'     && <DelayForm     data={node.data} update={update} />}
            {node.type === 'condition' && <ConditionForm data={node.data} update={update} />}
            {node.type === 'segment'   && <SegmentForm   data={node.data} update={update} />}
            {node.type === 'task'      && <TaskForm      data={node.data} update={update} />}
            {node.type === 'referral'  && <ReferralForm  data={node.data} update={update} />}
            {node.type === 'end'       && <EndForm       data={node.data} update={update} />}
            {node.type === 'pipeline'  && (
              <div style={field}>
                <FieldLabel>Etapa de destino</FieldLabel>
                <input value={(node.data.targetStageName as string) || ''} onChange={e => update({ ...node.data, targetStageName: e.target.value })} style={inp} placeholder="Nome da etapa" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Dica no rodapé */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bs)', flexShrink: 0 }}>
        <p style={{ fontSize: 9, color: 'var(--t3)', lineHeight: 1.5 }}>
          <kbd style={{ background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 3, padding: '1px 4px', fontSize: 9 }}>Delete</kbd> remove o nó selecionado
        </p>
      </div>
    </div>
  )
}
