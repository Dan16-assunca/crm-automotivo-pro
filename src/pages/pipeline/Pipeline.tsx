import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, closestCorners,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Phone, MessageSquare, Clock, X,
  User, Car, DollarSign, MapPin, ChevronRight,
  Calendar, CheckCircle, BarChart2, Download,
  SlidersHorizontal, Zap,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { formatCurrency, daysInStage, timeAgo } from '@/utils/format'
import type { Lead, PipelineStage } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sel = (extra?: React.CSSProperties): React.CSSProperties => ({
  height: 34, padding: '0 10px',
  borderRadius: 7, background: 'var(--bg3)',
  border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12,
  outline: 'none', width: '100%', fontFamily: 'inherit',
  ...extra,
})

function qualScore(lead: Lead) {
  const intentMap: Record<string, number> = { hot: 90, warm: 58, cold: 28 }
  const intent = intentMap[lead.temperature] ?? 50
  const bMax = lead.budget_max ?? 0
  const capacity = bMax > 400000 ? 88 : bMax > 150000 ? 72 : bMax > 60000 ? 55 : 35
  const prioMap: Record<string, number> = { high: 85, medium: 55, low: 28 }
  const urgency = prioMap[lead.priority ?? 'medium'] ?? 55
  return { intent, capacity, urgency }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`[${label}] Timeout após ${ms / 1000}s`)), ms)
  )
  return Promise.race([promise, timeout])
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  client_name: z.string().min(2, 'Nome obrigatório'),
  client_phone: z.string().optional(),
  client_email: z.string().optional(),
  client_city: z.string().optional(),
  vehicle_interest: z.string().optional(),
  vehicle_year_min: z.string().optional(),
  vehicle_year_max: z.string().optional(),
  budget_min: z.string().optional(),
  budget_max: z.string().optional(),
  payment_type: z.enum(['avista', 'financiamento', 'consorcio', '']).optional(),
  trade_in: z.boolean().optional(),
  trade_in_vehicle: z.string().optional(),
  source: z.string().optional(),
  temperature: z.enum(['hot', 'warm', 'cold']),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  notes: z.string().optional(),
  profissao: z.string().optional(),
  renda: z.string().optional(),
  cnh: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

// ─── Source / Payment labels ───────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook',
  meta_ads: 'Meta Ads', google_ads: 'Google Ads', olx: 'OLX',
  webmotors: 'WebMotors', icarros: 'iCarros', indicacao: 'Indicação',
  site: 'Site', telefone: 'Tel.', presencial: 'Presencial',
}
const PAYMENT_LABEL: Record<string, string> = { financiamento: 'Financ.', avista: 'À vista', consorcio: 'Consórcio' }

// ─── New Lead Modal ────────────────────────────────────────────────────────────
function NewLeadModal({ open, onClose, stages, defaultStageId }: {
  open: boolean; onClose: () => void; stages: PipelineStage[]; defaultStageId: string
}) {
  const { store, user } = useAuthStore()
  const queryClient = useQueryClient()
  const [stageId, setStageId] = useState(defaultStageId)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { temperature: 'cold', priority: 'medium', trade_in: false, cnh: false },
  })

  const mut = useMutation({
    mutationFn: async (d: FormData) => {
      const { error } = await supabase.from('leads').insert({
        store_id: store!.id, salesperson_id: user!.id, stage_id: stageId,
        client_name: d.client_name,
        client_phone: d.client_phone || null,
        client_email: d.client_email || null,
        client_city: d.client_city || null,
        vehicle_interest: d.vehicle_interest || null,
        vehicle_year_min: d.vehicle_year_min ? parseInt(d.vehicle_year_min) : null,
        vehicle_year_max: d.vehicle_year_max ? parseInt(d.vehicle_year_max) : null,
        budget_min: d.budget_min ? parseFloat(d.budget_min) : null,
        budget_max: d.budget_max ? parseFloat(d.budget_max) : null,
        payment_type: d.payment_type || null,
        trade_in: d.trade_in ?? false,
        trade_in_vehicle: d.trade_in_vehicle || null,
        source: d.source || null,
        temperature: d.temperature,
        priority: d.priority || 'medium',
        notes: d.notes || null,
        status: 'active',
        custom_fields: {
          profissao: d.profissao || null,
          renda: d.renda || null,
          cnh: d.cnh ?? false,
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Lead criado!', 'Adicionado ao pipeline')
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
      reset(); onClose()
    },
    onError: () => toast.error('Erro ao criar lead'),
  })

  if (!open) return null

  const SLabel = ({ children }: { children: React.ReactNode }) => (
    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text4)', display: 'block', marginBottom: 5 }}>
      {children}
    </label>
  )
  const Section = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <span style={{ color: 'var(--neon)' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      {children}
    </div>
  )

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={onClose}
      >
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          style={{ width: '100%', maxWidth: 600, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.8)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, var(--neon-dim), transparent 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Novo Lead</h2>
                <p style={{ fontSize: 11, color: 'var(--text4)' }}>Preencha os dados do potencial comprador</p>
              </div>
              <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'var(--bg3)', color: 'var(--text4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={14} />
              </button>
            </div>
            {/* Stage selector */}
            <div style={{ display: 'flex', gap: 5, marginTop: 12, flexWrap: 'wrap' }}>
              {stages.filter(s => !s.is_final).map(s => {
                const active = stageId === s.id
                return (
                  <button key={s.id} type="button" onClick={() => setStageId(s.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: active ? s.color + '22' : 'var(--bg3)',
                    color: active ? s.color : 'var(--text4)',
                    outline: active ? `1.5px solid ${s.color}60` : '1px solid var(--border)',
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color }} />
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit(d => mut.mutate(d))}>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '58vh', overflowY: 'auto' }}>
              <Section icon={<User size={13} />} label="Dados do Comprador">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <Input label="Nome completo *" placeholder="João Silva" error={errors.client_name?.message} {...register('client_name')} />
                  </div>
                  <Input label="Telefone / WhatsApp" placeholder="(11) 99999-9999" {...register('client_phone')} />
                  <Input label="Email" placeholder="joao@email.com" {...register('client_email')} />
                  <Input label="Cidade" placeholder="São Paulo" icon={<MapPin size={12} />} {...register('client_city')} />
                  <Input label="Profissão" placeholder="Motorista, Empresário..." {...register('profissao')} />
                  <Input label="Renda mensal" placeholder="5000" icon={<DollarSign size={12} />} {...register('renda')} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
                    <input type="checkbox" id="cnh" {...register('cnh')} style={{ width: 14, height: 14, accentColor: 'var(--neon)', cursor: 'pointer' }} />
                    <label htmlFor="cnh" style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>Possui CNH</label>
                  </div>
                </div>
              </Section>

              <Section icon={<Car size={13} />} label="Interesse no Veículo">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <Input label="Veículo desejado" placeholder="HB20, Corolla, Civic..." {...register('vehicle_interest')} />
                  </div>
                  <Input label="Ano mínimo" placeholder="2020" {...register('vehicle_year_min')} />
                  <Input label="Ano máximo" placeholder="2024" {...register('vehicle_year_max')} />
                  <Input label="Orçamento mínimo (R$)" placeholder="40000" {...register('budget_min')} />
                  <Input label="Orçamento máximo (R$)" placeholder="70000" {...register('budget_max')} />
                  <div>
                    <SLabel>Forma de pagamento</SLabel>
                    <select {...register('payment_type')} style={sel()}>
                      <option value="">Selecionar</option>
                      <option value="avista">À Vista</option>
                      <option value="financiamento">Financiamento</option>
                      <option value="consorcio">Consórcio</option>
                    </select>
                  </div>
                  <div>
                    <SLabel>Urgência</SLabel>
                    <select {...register('priority')} style={sel()}>
                      <option value="high">🔴 Esta semana</option>
                      <option value="medium">🟡 Este mês</option>
                      <option value="low">🔵 Sem prazo</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="trade_in" {...register('trade_in')} style={{ width: 14, height: 14, accentColor: 'var(--neon)', cursor: 'pointer' }} />
                    <label htmlFor="trade_in" style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>Possui veículo para troca</label>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <Input label="Veículo da troca (modelo e ano)" placeholder="Fiat Uno 2015..." {...register('trade_in_vehicle')} />
                  </div>
                </div>
              </Section>

              <Section icon={<BarChart2 size={13} />} label="Qualificação">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <SLabel>Origem</SLabel>
                    <select {...register('source')} style={sel()}>
                      <option value="">Selecionar</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="meta_ads">Meta Ads</option>
                      <option value="google_ads">Google Ads</option>
                      <option value="olx">OLX</option>
                      <option value="webmotors">WebMotors</option>
                      <option value="icarros">iCarros</option>
                      <option value="indicacao">Indicação</option>
                      <option value="site">Site próprio</option>
                      <option value="telefone">Telefone</option>
                      <option value="presencial">Presencial</option>
                    </select>
                  </div>
                  <div>
                    <SLabel>Temperatura</SLabel>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[
                        { v: 'hot', e: '🔥', l: 'Quente' },
                        { v: 'warm', e: '☀️', l: 'Morno' },
                        { v: 'cold', e: '❄️', l: 'Frio' },
                      ].map(t => (
                        <label key={t.v} style={{ flex: 1, cursor: 'pointer' }}>
                          <input type="radio" value={t.v} {...register('temperature')} style={{ display: 'none' }} />
                          <div style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text4)', cursor: 'pointer' }}>
                            {t.e}<br /><span style={{ fontSize: 9 }}>{t.l}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <SLabel>Observações</SLabel>
                    <textarea {...register('notes')} placeholder="Informações adicionais..." rows={2}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              </Section>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Button type="button" variant="secondary" size="md" style={{ flex: 1 }} onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="primary" size="md" style={{ flex: 1 }} loading={mut.isPending}>
                <Plus size={14} /> Criar Lead
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onClick, isSelected }: { lead: Lead; onClick: () => void; isSelected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })
  const days = daysInStage(lead.updated_at)
  const isUrgent = lead.priority === 'high'

  const initials = lead.client_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const tempColor = lead.temperature === 'hot' ? 'var(--red)' : lead.temperature === 'warm' ? 'var(--amber)' : 'var(--blue)'
  const tempBg = lead.temperature === 'hot' ? 'rgba(255,68,68,0.12)' : lead.temperature === 'warm' ? 'rgba(245,166,35,0.12)' : 'rgba(74,158,255,0.12)'
  const tempLabel = lead.temperature === 'hot' ? 'Hot' : lead.temperature === 'warm' ? 'Morno' : 'Frio'
  const budgetRange = lead.budget_min && lead.budget_max
    ? `R$ ${Math.round(lead.budget_min / 1000)}k–${Math.round(lead.budget_max / 1000)}k`
    : lead.budget_max
      ? `até R$ ${Math.round(lead.budget_max / 1000)}k`
      : null

  const borderColor = isSelected
    ? 'var(--neon-border)'
    : isUrgent ? 'rgba(255,68,68,0.35)' : 'var(--border)'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onClick}
    >
      <div style={{
        background: isSelected ? 'var(--neon-dim)' : 'var(--bg2)',
        border: `1px solid ${borderColor}`,
        borderRadius: 9,
        padding: '10px 10px 8px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all .15s',
        marginBottom: 5,
      }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--neon-border)' }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = borderColor }}
      >
        {/* Top row: avatar + name + temp badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: tempBg, border: `1.5px solid ${tempColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: tempColor,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.client_name}
              </p>
              <span style={{
                fontSize: 9, fontWeight: 700, flexShrink: 0,
                color: tempColor, background: tempBg,
                padding: '1px 5px', borderRadius: 8,
              }}>
                {tempLabel}
              </span>
            </div>
            {lead.client_phone && (
              <p style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>{lead.client_phone}</p>
            )}
          </div>
        </div>

        {/* Vehicle line */}
        {(lead.vehicle_interest || budgetRange) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 11 }}>
            <Car size={10} style={{ color: 'var(--text4)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {lead.vehicle_interest ?? ''}
              {budgetRange && <span style={{ color: 'var(--text4)' }}> — {budgetRange}</span>}
            </span>
          </div>
        )}

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 7 }}>
          {lead.payment_type === 'financiamento' && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(74,158,255,0.12)', color: 'var(--blue)' }}>
              Financ.
            </span>
          )}
          {lead.payment_type === 'avista' && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(57,255,20,0.1)', color: 'var(--neon)' }}>
              À vista
            </span>
          )}
          {lead.payment_type === 'consorcio' && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', color: 'var(--purple)' }}>
              Consórcio
            </span>
          )}
          {lead.trade_in && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', color: 'var(--purple)' }}>
              Troca
            </span>
          )}
          {isUrgent && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,68,68,0.12)', color: 'var(--red)' }}>
              Urgente
            </span>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: 'var(--text4)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={8} /> {days}d
          </span>
          <span style={{ fontSize: 9, color: 'var(--text4)' }}>
            {lead.source ? (SOURCE_LABEL[lead.source] ?? lead.source) : ''}
          </span>
          <div style={{ display: 'flex', gap: 1 }}>
            <button style={{ padding: '2px 4px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text4)', cursor: 'pointer' }}
              onClick={e => e.stopPropagation()}
              onMouseEnter={e => { e.currentTarget.style.color = '#25D366' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text4)' }}
            ><MessageSquare size={10} /></button>
            <button style={{ padding: '2px 4px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text4)', cursor: 'pointer' }}
              onClick={e => e.stopPropagation()}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--neon)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text4)' }}
            ><Phone size={10} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ stage, leads, onLeadClick, onAddLead, selectedLeadId }: {
  stage: PipelineStage; leads: Lead[]; onLeadClick: (l: Lead) => void
  onAddLead: (id: string) => void; selectedLeadId: string | null
}) {
  const totalValue = leads.reduce((s, l) => s + (l.budget_max ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 210, flexShrink: 0 }}>
      {/* Header */}
      <div style={{
        background: 'var(--bg2)', borderRadius: 9, padding: '9px 10px', marginBottom: 6,
        borderTop: `2px solid ${stage.color}`,
        border: `1px solid var(--border)`, borderTopColor: stage.color,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {stage.name}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
              background: stage.color + '20', color: stage.color,
            }}>
              {leads.length}
            </span>
          </div>
          <button onClick={() => onAddLead(stage.id)} style={{
            width: 20, height: 20, borderRadius: 5, border: 'none', background: 'var(--bg3)',
            color: 'var(--text4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--neon-dim)'; e.currentTarget.style.color = 'var(--neon)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text4)' }}
          >
            <Plus size={11} />
          </button>
        </div>
        {totalValue > 0 && (
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)' }}>
            R$ {Math.round(totalValue / 1000)}k
          </p>
        )}
      </div>

      {/* Cards */}
      <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          minHeight: 80, borderRadius: 9, background: 'var(--bg)',
          border: '1px solid var(--border)', padding: '6px 6px',
          overflowY: 'auto', maxHeight: 'calc(100vh - 320px)',
        }}>
          {leads.map(l => (
            <LeadCard
              key={l.id} lead={l}
              onClick={() => onLeadClick(l)}
              isSelected={selectedLeadId === l.id}
            />
          ))}
          {leads.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64, fontSize: 10, color: 'var(--text4)', flexDirection: 'column', gap: 4 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px dashed ${stage.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={9} style={{ color: stage.color, opacity: 0.4 }} />
              </div>
              Arraste aqui
            </div>
          )}
        </div>
      </SortableContext>

      {/* Add button */}
      <button onClick={() => onAddLead(stage.id)} style={{
        marginTop: 5, padding: '6px 0', borderRadius: 7, border: '1px dashed var(--border)',
        background: 'transparent', color: 'var(--text4)', fontSize: 11, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        transition: 'all .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neon-border)'; e.currentTarget.style.color = 'var(--neon)'; e.currentTarget.style.background = 'var(--neon-dim)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text4)'; e.currentTarget.style.background = 'transparent' }}
      >
        <Plus size={11} /> Adicionar
      </button>
    </div>
  )
}

// ─── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color = 'var(--neon)' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
        <span style={{ color: 'var(--text3)' }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 99, background: color }}
        />
      </div>
    </div>
  )
}

// ─── Inline Lead Panel ─────────────────────────────────────────────────────────
function LeadPanel({ lead, stages, onClose, onAdvance }: {
  lead: Lead; stages: PipelineStage[]; onClose: () => void; onAdvance: (leadId: string, stageId: string) => void
}) {
  const scores = qualScore(lead)
  const avgScore = lead.score || Math.round((scores.intent + scores.capacity + scores.urgency) / 3)
  const currentStage = stages.find(s => s.id === lead.stage_id)
  const nextStage = stages.find(s => s.position === (currentStage?.position ?? 0) + 1 && !s.is_final)
  const initials = lead.client_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const tempColor = lead.temperature === 'hot' ? 'var(--red)' : lead.temperature === 'warm' ? 'var(--amber)' : 'var(--blue)'
  const tempBg = lead.temperature === 'hot' ? 'rgba(255,68,68,0.12)' : lead.temperature === 'warm' ? 'rgba(245,166,35,0.12)' : 'rgba(74,158,255,0.12)'
  const tempLabel = lead.temperature === 'hot' ? 'Quente' : lead.temperature === 'warm' ? 'Morno' : 'Frio'
  const cf = lead.custom_fields as Record<string, any> ?? {}
  const budgetRange = lead.budget_min && lead.budget_max
    ? `R$ ${Math.round(lead.budget_min / 1000)}k – R$ ${Math.round(lead.budget_max / 1000)}k`
    : lead.budget_max ? formatCurrency(lead.budget_max) : '—'
  const prazoLabel = lead.priority === 'high' ? 'Essa semana' : lead.priority === 'medium' ? 'Este mês' : 'Sem prazo'

  const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--text4)', flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 8, marginTop: 14 }}>
      {children}
    </p>
  )

  return (
    <motion.div
      key={lead.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        width: 300, flexShrink: 0,
        background: 'var(--bg2)', border: '1px solid var(--border2)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg3) 0%, var(--bg2) 100%)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: tempBg, border: `2px solid ${tempColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: tempColor,
            }}>{initials}</div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{lead.client_name}</h3>
              <p style={{ fontSize: 10, color: 'var(--text4)' }}>
                {currentStage?.name ?? 'Lead'}
                {lead.source ? ` · ${SOURCE_LABEL[lead.source] ?? lead.source}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 4, border: 'none', background: 'transparent', color: 'var(--text4)', cursor: 'pointer', borderRadius: 5, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text4)' }}
          ><X size={14} /></button>
        </div>
        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: tempBg, color: tempColor }}>
            {tempLabel}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: 'var(--bg4)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
            Score {avgScore}/100
          </span>
          {lead.payment_type && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: 'rgba(74,158,255,0.12)', color: 'var(--blue)' }}>
              {PAYMENT_LABEL[lead.payment_type] ?? lead.payment_type}
            </span>
          )}
          {lead.trade_in && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', color: 'var(--purple)' }}>
              Troca
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {/* Qualificação */}
        <SectionTitle>Qualificação</SectionTitle>
        <ScoreBar label="Intenção de compra" value={scores.intent} color="var(--neon)" />
        <ScoreBar label="Capacidade financeira" value={scores.capacity} color="var(--blue)" />
        <ScoreBar label="Urgência de compra" value={scores.urgency} color={scores.urgency >= 70 ? 'var(--amber)' : 'var(--text4)'} />

        {/* Veículo */}
        <SectionTitle>Veículo & Negócio</SectionTitle>
        <Row label="Modelo" value={lead.vehicle_interest} />
        <Row label="Orçamento" value={budgetRange} />
        <Row label="Pagamento" value={lead.payment_type ? (PAYMENT_LABEL[lead.payment_type] ?? lead.payment_type) : null} />
        <Row label="Troca" value={lead.trade_in ? (lead.trade_in_vehicle ?? 'Sim') : 'Não'} />
        <Row label="Prazo" value={prazoLabel} />

        {/* Comprador */}
        <SectionTitle>Dados do Comprador</SectionTitle>
        <Row label="Telefone" value={lead.client_phone} />
        <Row label="E-mail" value={lead.client_email} />
        <Row label="Cidade" value={lead.client_city} />
        <Row label="Profissão" value={cf.profissao} />
        <Row label="Renda" value={cf.renda ? `R$ ${Number(cf.renda).toLocaleString('pt-BR')}` : null} />
        <Row label="CNH" value={cf.cnh ? 'Sim' : cf.cnh === false ? 'Não' : null} />

        {lead.notes && (
          <div style={{ margin: '12px 0', padding: '9px 10px', background: 'var(--bg3)', borderRadius: 7, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 9, color: 'var(--text4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Observações</p>
            <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{lead.notes}</p>
          </div>
        )}

        <p style={{ fontSize: 9, color: 'var(--text4)', padding: '10px 0 14px' }}>
          Criado {timeAgo(lead.created_at)} · Atualizado {timeAgo(lead.updated_at)}
        </p>
      </div>

      {/* Actions footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{
            flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg3)', color: 'var(--text3)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.color = '#25D366' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
          ><MessageSquare size={12} /> WhatsApp</button>
          <button style={{
            flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--bg3)', color: 'var(--text3)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
          ><Calendar size={12} /> Agendar</button>
        </div>

        {nextStage && (
          <button
            onClick={() => onAdvance(lead.id, nextStage.id)}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 7, border: 'none',
              background: 'var(--neon)', color: '#000',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            Avançar: {nextStage.name} <ChevronRight size={13} />
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button style={{
            padding: '7px 0', borderRadius: 7, border: '1px solid rgba(57,255,20,0.25)',
            background: 'rgba(57,255,20,0.08)', color: 'var(--neon)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <CheckCircle size={11} /> Ganho
          </button>
          <button style={{
            padding: '7px 0', borderRadius: 7, border: '1px solid rgba(255,68,68,0.25)',
            background: 'rgba(255,68,68,0.08)', color: 'var(--red)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <X size={11} /> Perdido
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── KPI Bar (6 metrics) ───────────────────────────────────────────────────────
function PipelineKPIs({ leads }: { leads: Lead[] }) {
  const active = leads.filter(l => l.status === 'active')
  const hot = active.filter(l => l.temperature === 'hot').length
  const totalValue = active.reduce((s, l) => s + (l.budget_max ?? 0), 0)
  const withFollowup = active.filter(l => l.next_followup_at).length
  const proposals = active.filter(l => {
    const stage = (l as any).stage?.name?.toLowerCase() ?? ''
    return stage.includes('propost') || stage.includes('negoc')
  }).length
  const closedMonth = leads.filter(l => l.status === 'won').length
  const cpl = active.length > 0 ? Math.round(totalValue / active.length / 1000) : 0

  const kpis = [
    { label: 'Leads ativos', value: active.length.toString(), sub: `${hot} quentes`, color: 'var(--neon)' },
    { label: 'Pipeline total', value: `R$ ${Math.round(totalValue / 1000)}k`, sub: 'valor estimado', color: 'var(--blue)' },
    { label: 'Visitas agend.', value: withFollowup.toString(), sub: 'com follow-up', color: 'var(--amber)' },
    { label: 'Propostas', value: proposals > 0 ? proposals.toString() : active.filter(l => l.payment_type).length.toString(), sub: 'em negociação', color: 'var(--amber)' },
    { label: 'Fechados/mês', value: closedMonth.toString(), sub: 'conversões', color: 'var(--neon)' },
    { label: 'Ticket médio', value: `R$ ${cpl}k`, sub: 'por lead', color: 'var(--text3)' },
  ]

  return (
    <div style={{ display: 'flex', gap: 1, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      {kpis.map((k, i) => (
        <div key={i} style={{ flex: 1, padding: '10px 14px', background: 'var(--bg2)', minWidth: 0 }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</p>
          <p style={{ fontSize: 9, color: 'var(--text4)', marginTop: 3 }}>{k.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Filter Chips ──────────────────────────────────────────────────────────────
const CHIPS = [
  { id: 'all', label: 'Todos' },
  { id: 'hot', label: '🔥 Quentes' },
  { id: 'financiamento', label: 'Financiamento' },
  { id: 'troca', label: 'Troca' },
  { id: 'avista', label: 'À vista' },
  { id: 'meta_ads', label: 'Meta Ads' },
  { id: 'google_ads', label: 'Google Ads' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'indicacao', label: 'Indicação' },
]

// ─── Pipeline Page ─────────────────────────────────────────────────────────────
export default function Pipeline() {
  const { store, user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showNewLead, setShowNewLead] = useState(false)
  const [newLeadStageId, setNewLeadStageId] = useState('')

  const storeId = store?.id ?? ''

  const { data: stages, isLoading: stagesLoading, isError: stagesError, error: stagesErr } = useQuery({
    queryKey: ['pipeline-stages', storeId],
    staleTime: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from('pipeline_stages').select('*').eq('store_id', storeId).order('position'),
        8000, 'stages'
      )
      if (error) throw error
      return (data ?? []) as PipelineStage[]
    },
    enabled: !!storeId,
  })

  const { data: leads } = useQuery({
    queryKey: ['pipeline-leads', storeId],
    staleTime: 30 * 1000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from('leads').select('*').eq('store_id', storeId).eq('status', 'active').order('created_at', { ascending: false }),
        8000, 'leads'
      )
      if (error) throw error
      return (data ?? []) as Lead[]
    },
    enabled: !!storeId,
  })

  const filteredLeads = useMemo(() => {
    if (!leads) return []
    let r = leads
    if (search) r = r.filter(l =>
      l.client_name.toLowerCase().includes(search.toLowerCase()) ||
      l.client_phone?.includes(search) ||
      l.vehicle_interest?.toLowerCase().includes(search.toLowerCase())
    )
    if (filter === 'hot') r = r.filter(l => l.temperature === 'hot')
    else if (filter === 'financiamento') r = r.filter(l => l.payment_type === 'financiamento')
    else if (filter === 'troca') r = r.filter(l => l.trade_in)
    else if (filter === 'avista') r = r.filter(l => l.payment_type === 'avista')
    else if (filter !== 'all') r = r.filter(l => l.source === filter)
    return r
  }, [leads, search, filter])

  const moveMutation = useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const { error } = await supabase.from('leads')
        .update({ stage_id: stageId, updated_at: new Date().toISOString() })
        .eq('id', leadId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] }),
    onError: () => toast.error('Erro ao mover lead'),
  })

  const handleDragStart = (e: DragStartEvent) => setDraggingId(e.active.id as string)
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const targetStage = stages?.find(s => {
      const sl = leads?.filter(l => l.stage_id === s.id) ?? []
      return sl.some(l => l.id === over.id) || s.id === over.id
    })
    if (targetStage) {
      const lead = leads?.find(l => l.id === active.id)
      if (lead && lead.stage_id !== targetStage.id) {
        moveMutation.mutate({ leadId: lead.id, stageId: targetStage.id })
      }
    }
  }, [stages, leads, moveMutation])

  const handleAddLead = (stageId: string) => { setNewLeadStageId(stageId); setShowNewLead(true) }
  const handleAdvance = (leadId: string, stageId: string) => {
    moveMutation.mutate({ leadId, stageId })
    setSelectedLead(prev => prev ? { ...prev, stage_id: stageId } : prev)
    toast.success('Lead avançado!', 'Etapa atualizada com sucesso')
  }
  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(prev => prev?.id === lead.id ? null : lead)
  }

  const draggingLead = draggingId ? leads?.find(l => l.id === draggingId) : null

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    window.location.href = '/login'
  }

  if (!storeId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Sessão sem loja vinculada</p>
        <p style={{ fontSize: 12, color: 'var(--text4)' }}>userId: {user?.id ?? 'não autenticado'}</p>
        <button onClick={handleLogout} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Sair e entrar novamente
        </button>
      </div>
    )
  }

  if (stagesError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text4)' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)' }}>Erro ao carregar o pipeline</p>
        <p style={{ fontSize: 12, color: 'var(--text4)', maxWidth: 360, textAlign: 'center' }}>
          {(stagesErr as Error)?.message ?? 'Erro desconhecido'}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] })}
            style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
            Tentar novamente
          </button>
          <button onClick={handleLogout}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            Sair e entrar novamente
          </button>
        </div>
      </div>
    )
  }

  if (stagesLoading) {
    return (
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton style={{ height: 48, borderRadius: 9 }} />
            {[...Array(3)].map((_, j) => <Skeleton key={j} style={{ height: 96, borderRadius: 9 }} />)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Pipeline
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text4)' }}>— {store?.name}</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button style={{
            height: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
          >
            <Download size={13} /> Exportar
          </button>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text4)', pointerEvents: 'none' }} />
            <input
              placeholder="Buscar lead, veículo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ height: 34, paddingLeft: 30, paddingRight: 12, borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, outline: 'none', width: 200, fontFamily: 'inherit' }}
            />
          </div>
          <Button variant="secondary" size="sm"><SlidersHorizontal size={13} /> Filtros</Button>
          <Button size="sm" onClick={() => handleAddLead(stages?.find(s => !s.is_final)?.id ?? '')}>
            <Plus size={13} /> Novo Lead
          </Button>
        </div>
      </div>

      {/* KPI bar */}
      {leads && <PipelineKPIs leads={leads} />}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {CHIPS.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: filter === c.id ? '1.5px solid var(--neon)' : '1px solid var(--border)',
            background: filter === c.id ? 'var(--neon-dim)' : 'var(--bg3)',
            color: filter === c.id ? 'var(--neon)' : 'var(--text3)',
            transition: 'all .15s',
          }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Main board area: kanban + optional inline panel */}
      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
        {/* Kanban */}
        <DndContext collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, flex: 1 }}>
            {stages?.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={filteredLeads.filter(l => l.stage_id === stage.id)}
                onLeadClick={handleLeadClick}
                onAddLead={handleAddLead}
                selectedLeadId={selectedLead?.id ?? null}
              />
            ))}
          </div>

          <DragOverlay>
            {draggingLead && (
              <div style={{
                background: 'var(--bg2)', border: '1.5px solid var(--neon-border)', borderRadius: 9, padding: '10px 10px',
                width: 210, boxShadow: 'var(--neon-glow)', transform: 'rotate(1.5deg)', opacity: 0.9,
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{draggingLead.client_name}</p>
                <p style={{ fontSize: 10, color: 'var(--text4)', marginTop: 3 }}>{draggingLead.vehicle_interest}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Inline detail panel */}
        <AnimatePresence>
          {selectedLead && (
            <LeadPanel
              lead={selectedLead}
              stages={stages ?? []}
              onClose={() => setSelectedLead(null)}
              onAdvance={handleAdvance}
            />
          )}
        </AnimatePresence>
      </div>

      {/* New lead modal */}
      {showNewLead && stages && (
        <NewLeadModal open={showNewLead} onClose={() => setShowNewLead(false)} stages={stages} defaultStageId={newLeadStageId} />
      )}
    </div>
  )
}
