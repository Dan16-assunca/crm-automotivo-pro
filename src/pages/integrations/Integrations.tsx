import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug, CheckCircle2, Clock, ExternalLink, Plus, Megaphone,
  X, Pencil, Trash2, DollarSign, TrendingUp, Users, BarChart2,
  ChevronDown, Calendar, Save,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/utils/format'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AdCampaign {
  id: string
  store_id: string
  platform: string
  name: string
  campaign_id?: string
  adset_name?: string
  adset_id?: string
  ad_name?: string
  ad_id?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  status: 'active' | 'paused' | 'ended'
  start_date?: string
  end_date?: string
  notes?: string
  created_at: string
}

interface CampaignSpend {
  id: string
  campaign_id: string
  spend_date: string
  amount: number
  impressions?: number
  clicks?: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLATFORMS = [
  { value: 'facebook',  label: 'Facebook Ads',   icon: '📘', color: '#1877F2' },
  { value: 'instagram', label: 'Instagram Ads',  icon: '📸', color: '#E1306C' },
  { value: 'google',    label: 'Google Ads',     icon: '🔍', color: '#4285F4' },
  { value: 'tiktok',   label: 'TikTok Ads',     icon: '🎵', color: '#010101' },
  { value: 'email',     label: 'E-mail',         icon: '📧', color: '#F59E0B' },
  { value: 'organic',   label: 'Orgânico',       icon: '🌱', color: '#10B981' },
  { value: 'other',     label: 'Outros',         icon: '📣', color: '#8B5CF6' },
]

const STATUS_OPTS = [
  { value: 'active', label: 'Ativa',    color: 'var(--neon)' },
  { value: 'paused', label: 'Pausada',  color: 'var(--yel)'  },
  { value: 'ended',  label: 'Encerrada',color: 'var(--t3)'   },
]

const INTEGRATIONS = [
  { name: 'Evolution API', desc: 'WhatsApp Business via Evolution API', status: 'connected', icon: '💬' },
  { name: 'Meta Ads',      desc: 'Captura de leads pelo Facebook/Instagram Ads', status: 'pending', icon: '📘' },
  { name: 'Google Ads',    desc: 'Integração de campanhas e leads do Google', status: 'pending', icon: '🔍' },
  { name: 'OLX Autos',     desc: 'Importação automática de leads da OLX', status: 'pending', icon: '🚗' },
  { name: 'WebMotors',     desc: 'Sincronização de estoque e leads', status: 'pending', icon: '🔧' },
  { name: 'iCarros',       desc: 'Integração com portal iCarros', status: 'pending', icon: '🚘' },
]

const EMPTY_FORM = {
  platform: 'facebook', name: '', utm_source: 'facebook', utm_medium: 'cpc',
  utm_campaign: '', utm_content: '', utm_term: '',
  campaign_id: '', adset_name: '', adset_id: '', ad_name: '', ad_id: '',
  status: 'active' as const, start_date: '', end_date: '', notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function platformInfo(p: string) {
  return PLATFORMS.find(pl => pl.value === p) ?? PLATFORMS[PLATFORMS.length - 1]
}

// ─── Modal: Nova / Editar Campanha ────────────────────────────────────────────

function CampaignModal({
  initial, onClose, onSave,
}: {
  initial?: AdCampaign | null
  onClose: () => void
  onSave: (data: typeof EMPTY_FORM) => void
}) {
  const [form, setForm] = useState<typeof EMPTY_FORM>(
    initial
      ? {
          platform:    initial.platform,
          name:        initial.name,
          utm_source:  initial.utm_source  ?? '',
          utm_medium:  initial.utm_medium  ?? '',
          utm_campaign:initial.utm_campaign ?? '',
          utm_content: initial.utm_content  ?? '',
          utm_term:    initial.utm_term     ?? '',
          campaign_id: initial.campaign_id  ?? '',
          adset_name:  initial.adset_name   ?? '',
          adset_id:    initial.adset_id     ?? '',
          ad_name:     initial.ad_name      ?? '',
          ad_id:       initial.ad_id        ?? '',
          status:      initial.status,
          start_date:  initial.start_date   ?? '',
          end_date:    initial.end_date     ?? '',
          notes:       initial.notes        ?? '',
        }
      : { ...EMPTY_FORM },
  )
  const [section, setSection] = useState<'basic' | 'utm' | 'ids'>('basic')

  const set = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  // Auto-fill utm_source from platform
  function handlePlatform(p: string) {
    const srcMap: Record<string, string> = {
      facebook: 'facebook', instagram: 'instagram',
      google: 'google', tiktok: 'tiktok', email: 'email', organic: 'organic',
    }
    setForm(f => ({ ...f, platform: p, utm_source: srcMap[p] ?? p }))
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 38, background: 'var(--el)', border: '1px solid var(--bs)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12, padding: '0 10px',
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase',
    letterSpacing: '.07em', display: 'block', marginBottom: 4,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 520,
        background: 'var(--surf)', border: '1px solid var(--bs)', borderRadius: 14,
        padding: 24, maxHeight: '90dvh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--t)', margin: 0 }}>
              {initial ? 'Editar Campanha' : 'Nova Campanha'}
            </h3>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              Configure os dados e parâmetros UTM
            </p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Abas internas */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--el)', borderRadius: 7, padding: 3, marginBottom: 18, border: '1px solid var(--bs)' }}>
          {(['basic', 'utm', 'ids'] as const).map(s => (
            <button key={s} onClick={() => setSection(s)} style={{
              flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 11, fontWeight: 500,
              background: section === s ? 'var(--card)' : 'transparent',
              border: section === s ? '1px solid var(--bs)' : '1px solid transparent',
              color: section === s ? 'var(--t)' : 'var(--t3)', cursor: 'pointer',
            }}>
              {s === 'basic' ? 'Geral' : s === 'utm' ? 'UTM' : 'IDs da Plataforma'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {section === 'basic' && <>
            {/* Plataforma */}
            <div>
              <label style={lbl}>Plataforma</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLATFORMS.map(pl => (
                  <button key={pl.value} onClick={() => handlePlatform(pl.value)} style={{
                    padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    border: form.platform === pl.value ? `2px solid ${pl.color}` : '1px solid var(--bs)',
                    background: form.platform === pl.value ? pl.color + '18' : 'var(--el)',
                    color: form.platform === pl.value ? pl.color : 'var(--t3)',
                  }}>
                    {pl.icon} {pl.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Nome */}
            <div>
              <label style={lbl}>Nome da campanha *</label>
              <input style={inp} value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Ex: HB20 Abril 2026 — Campanha Conversão" />
            </div>
            {/* Status + Datas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <label style={lbl}>Status</label>
                <select style={{ ...inp }} value={form.status} onChange={e => set('status', e.target.value as 'active' | 'paused' | 'ended')}>
                  {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Início</label>
                <input style={inp} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Fim</label>
                <input style={inp} type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            </div>
            {/* Observações */}
            <div>
              <label style={lbl}>Observações</label>
              <textarea style={{ ...inp, height: 64, paddingTop: 8, paddingBottom: 8, resize: 'none', lineHeight: 1.5 }}
                value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Segmentação, objetivo, público..." />
            </div>
          </>}

          {section === 'utm' && <>
            <div style={{ background: 'rgba(61,247,16,.05)', border: '1px solid rgba(61,247,16,.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              Esses parâmetros devem ser adicionados na URL do anúncio. O CRM vai identificar leads que vieram dessa campanha automaticamente.
            </div>
            {[
              { key: 'utm_source',   label: 'utm_source',   ph: 'facebook' },
              { key: 'utm_medium',   label: 'utm_medium',   ph: 'cpc' },
              { key: 'utm_campaign', label: 'utm_campaign', ph: 'hb20-abril-2026' },
              { key: 'utm_content',  label: 'utm_content',  ph: 'video-carro-vermelho' },
              { key: 'utm_term',     label: 'utm_term',     ph: 'comprar hb20 usado' },
            ].map(f => (
              <div key={f.key}>
                <label style={lbl}>{f.label}</label>
                <input style={inp} value={(form as Record<string, string>)[f.key]} placeholder={f.ph}
                  onChange={e => set(f.key as keyof typeof EMPTY_FORM, e.target.value)} />
              </div>
            ))}
            {/* Preview da URL */}
            {(form.utm_source || form.utm_campaign) && (
              <div style={{ background: 'var(--el)', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>Preview do link</p>
                <p style={{ fontSize: 10, color: 'var(--t2)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                  https://seusite.com/?
                  {[
                    form.utm_source   && `utm_source=${form.utm_source}`,
                    form.utm_medium   && `utm_medium=${form.utm_medium}`,
                    form.utm_campaign && `utm_campaign=${form.utm_campaign}`,
                    form.utm_content  && `utm_content=${form.utm_content}`,
                    form.utm_term     && `utm_term=${form.utm_term}`,
                  ].filter(Boolean).join('&')}
                </p>
              </div>
            )}
          </>}

          {section === 'ids' && <>
            <div style={{ background: 'rgba(61,247,16,.05)', border: '1px solid rgba(61,247,16,.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              IDs da plataforma de anúncios. Usados para relatórios e para o webhook de Lead Ads (Facebook). Opcional.
            </div>
            {[
              { key: 'campaign_id', label: 'ID da Campanha',    ph: '120200123456789' },
              { key: 'adset_name',  label: 'Nome do Conjunto',  ph: 'Lookalike 2% SP' },
              { key: 'adset_id',    label: 'ID do Conjunto',    ph: '120200987654321' },
              { key: 'ad_name',     label: 'Nome do Anúncio',   ph: 'Video Carro Vermelho' },
              { key: 'ad_id',       label: 'ID do Anúncio',     ph: '120200111222333' },
            ].map(f => (
              <div key={f.key}>
                <label style={lbl}>{f.label}</label>
                <input style={inp} value={(form as Record<string, string>)[f.key]} placeholder={f.ph}
                  onChange={e => set(f.key as keyof typeof EMPTY_FORM, e.target.value)} />
              </div>
            ))}
          </>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, height: 40, borderRadius: 8, background: 'var(--el)', border: '1px solid var(--bs)', color: 'var(--t2)', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            disabled={!form.name.trim()}
            onClick={() => onSave(form)}
            style={{
              flex: 2, height: 40, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: form.name.trim() ? 'var(--neon)' : 'var(--el)',
              border: 'none', color: form.name.trim() ? '#000' : 'var(--t3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Save size={14} /> {initial ? 'Salvar alterações' : 'Criar campanha'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Lançar Investimento ───────────────────────────────────────────────

function SpendModal({ campaign, onClose }: { campaign: AdCampaign; onClose: () => void }) {
  const { store } = useAuthStore()
  const qc = useQueryClient()
  const pl = platformInfo(campaign.platform)

  const [date,        setDate]        = useState(today())
  const [amount,      setAmount]      = useState('')
  const [impressions, setImpressions] = useState('')
  const [clicks,      setClicks]      = useState('')
  const [saving,      setSaving]      = useState(false)

  // Histórico de lançamentos desta campanha (últimos 30 dias)
  const { data: history = [] } = useQuery<CampaignSpend[]>({
    queryKey: ['campaign-spend-history', campaign.id],
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('campaign_spend')
        .select('*')
        .eq('campaign_id', campaign.id)
        .gte('spend_date', from)
        .order('spend_date', { ascending: false })
      return (data ?? []) as CampaignSpend[]
    },
  })

  const totalSpend = history.reduce((s, r) => s + Number(r.amount), 0)

  async function handleSave() {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!amt || amt <= 0) { toast.error('Valor inválido'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('campaign_spend').upsert({
        store_id:    store!.id,
        campaign_id: campaign.id,
        spend_date:  date,
        amount:      amt,
        impressions: impressions ? parseInt(impressions) : null,
        clicks:      clicks      ? parseInt(clicks)      : null,
      }, { onConflict: 'campaign_id,spend_date' })

      if (error) throw error
      toast.success('Investimento lançado!', `${formatCurrency(amt)} em ${date}`)
      qc.invalidateQueries({ queryKey: ['campaign-spend-history', campaign.id] })
      qc.invalidateQueries({ queryKey: ['campaign-spend'] })
      setAmount(''); setImpressions(''); setClicks('')
    } catch (e) {
      toast.error('Erro ao salvar', e instanceof Error ? e.message : 'Tente novamente')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 38, background: 'var(--el)', border: '1px solid var(--bs)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12, padding: '0 10px',
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 440,
        background: 'var(--surf)', border: '1px solid var(--bs)', borderRadius: 14,
        padding: 24, maxHeight: '90dvh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 18 }}>{pl.icon}</span>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--t)', margin: 0 }}>Lançar Investimento</h3>
            </div>
            <p style={{ fontSize: 11, color: 'var(--t3)' }}>{campaign.name}</p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Total últimos 30 dias */}
        <div style={{ background: 'rgba(61,247,16,.06)', border: '1px solid rgba(61,247,16,.15)', borderRadius: 9, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>Total últimos 30 dias</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--neon)' }}>{formatCurrency(totalSpend)}</span>
        </div>

        {/* Formulário */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Data</label>
            <input style={inp} type="date" value={date} onChange={e => setDate(e.target.value)} max={today()} />
          </div>

          <div>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>
              Valor investido (R$) *
            </label>
            <div style={{ position: 'relative' }}>
              <DollarSign size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
              <input style={{ ...inp, paddingLeft: 30 }} type="text" inputMode="decimal"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0,00" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Impressões</label>
              <input style={inp} type="number" value={impressions} onChange={e => setImpressions(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Cliques</label>
              <input style={inp} type="number" value={clicks} onChange={e => setClicks(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        <button
          disabled={saving || !amount.trim()}
          onClick={handleSave}
          style={{
            width: '100%', height: 42, borderRadius: 8, marginTop: 16, fontSize: 13, fontWeight: 700,
            background: amount.trim() ? 'var(--neon)' : 'var(--el)',
            border: 'none', color: amount.trim() ? '#000' : 'var(--t3)',
            cursor: amount.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar lançamento'}
        </button>

        {/* Histórico */}
        {history.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
              Histórico — últimos 30 dias
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--el)', borderRadius: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={11} style={{ color: 'var(--t3)' }} />
                    <span style={{ fontSize: 11, color: 'var(--t2)' }}>
                      {new Date(h.spend_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    {h.clicks && <span style={{ fontSize: 10, color: 'var(--t3)' }}>{h.clicks.toLocaleString('pt-BR')} cliques</span>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yel)' }}>{formatCurrency(Number(h.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card de campanha ─────────────────────────────────────────────────────────

function CampaignCard({
  campaign, spend, leads, won,
  onEdit, onDelete, onSpend,
}: {
  campaign: AdCampaign
  spend: number
  leads: number
  won: number
  onEdit: () => void
  onDelete: () => void
  onSpend: () => void
}) {
  const pl = platformInfo(campaign.platform)
  const statusOpt = STATUS_OPTS.find(s => s.value === campaign.status) ?? STATUS_OPTS[0]
  const cpl  = spend > 0 && leads > 0  ? spend / leads : 0
  const roas = spend > 0 && won > 0    ? won / spend   : 0
  const conv = leads > 0               ? Math.round((won / leads) * 100) : 0

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header do card */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9, flexShrink: 0,
            background: pl.color + '18', border: `1px solid ${pl.color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>
            {pl.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campaign.name}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 10, color: pl.color, fontWeight: 600 }}>{pl.label}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--t4)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: statusOpt.color }}>{statusOpt.label}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={onSpend} title="Lançar investimento" style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(61,247,16,.1)', border: '1px solid rgba(61,247,16,.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neon)' }}>
            <DollarSign size={12} />
          </button>
          <button onClick={onEdit} title="Editar" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
            <Pencil size={12} />
          </button>
          <button onClick={onDelete} title="Excluir" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* UTM badge */}
      {campaign.utm_campaign && (
        <div style={{ background: 'var(--el)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace' }}>
          utm_campaign=<span style={{ color: 'var(--t2)' }}>{campaign.utm_campaign}</span>
        </div>
      )}

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { icon: <Users size={10} />,     label: 'Leads',       value: leads,                           color: 'var(--blu)' },
          { icon: <TrendingUp size={10} />, label: 'Conv.',        value: `${conv}%`,                     color: conv >= 15 ? 'var(--neon)' : conv >= 8 ? 'var(--yel)' : 'var(--t3)' },
          { icon: <DollarSign size={10} />, label: 'Investido',    value: spend > 0 ? formatCurrency(spend) : '—', color: spend > 0 ? 'var(--yel)' : 'var(--t4)' },
          { icon: <BarChart2 size={10} />,  label: 'CPL',          value: cpl > 0  ? formatCurrency(cpl)  : '—', color: cpl > 0  ? 'var(--t2)'  : 'var(--t4)' },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--el)', borderRadius: 7, padding: '7px 8px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: m.color, marginBottom: 2 }}>{m.icon}</div>
            <p style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{typeof m.value === 'number' ? m.value : m.value}</p>
            <p style={{ fontSize: 8, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* ROAS bar */}
      {roas > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--t3)', minWidth: 36 }}>ROAS</span>
          <div style={{ flex: 1, height: 5, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(roas * 20, 100)}%`, background: roas >= 5 ? 'var(--neon)' : roas >= 2 ? 'var(--yel)' : 'var(--red)', borderRadius: 99 }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: roas >= 5 ? 'var(--neon)' : roas >= 2 ? 'var(--yel)' : 'var(--red)', minWidth: 30 }}>{roas.toFixed(2)}x</span>
        </div>
      )}

      {/* Botão de investimento expandido */}
      <button onClick={onSpend} style={{
        width: '100%', height: 34, borderRadius: 7, fontSize: 12, fontWeight: 600,
        background: 'transparent', border: '1px solid rgba(61,247,16,.2)', color: 'var(--neon)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <DollarSign size={12} /> Lançar investimento
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Integrations() {
  const { store } = useAuthStore()
  const qc = useQueryClient()

  const [activeTab, setActiveTab]       = useState<'integrations' | 'campaigns'>('integrations')
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState<AdCampaign | null>(null)
  const [spendFor, setSpendFor]         = useState<AdCampaign | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPlatform, setFilterPlatform] = useState<string>('all')

  // ── Campanhas ─────────────────────────────────────────────────────────────
  const { data: campaigns = [] } = useQuery<AdCampaign[]>({
    queryKey: ['ad-campaigns', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('store_id', store!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as AdCampaign[]
    },
    enabled: !!store?.id,
  })

  // ── Investimentos (últimos 90 dias) ───────────────────────────────────────
  const { data: allSpend = [] } = useQuery<CampaignSpend[]>({
    queryKey: ['campaign-spend', store?.id],
    queryFn: async () => {
      const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('campaign_spend')
        .select('*')
        .eq('store_id', store!.id)
        .gte('spend_date', from)
      return (data ?? []) as CampaignSpend[]
    },
    enabled: !!store?.id,
  })

  // ── Leads com UTM (últimos 90 dias) ───────────────────────────────────────
  const { data: utmLeads = [] } = useQuery({
    queryKey: ['utm-leads', store?.id],
    queryFn: async () => {
      const from = new Date(Date.now() - 90 * 86_400_000).toISOString()
      const { data } = await supabase
        .from('leads')
        .select('utm_campaign, utm_source, status')
        .eq('store_id', store!.id)
        .gte('created_at', from)
        .not('utm_campaign', 'is', null)
      return data ?? []
    },
    enabled: !!store?.id,
  })

  // Agrupa métricas por campanha
  const campaignMetrics = useMemo(() => {
    const map: Record<string, { spend: number; leads: number; won: number }> = {}
    campaigns.forEach(c => { map[c.id] = { spend: 0, leads: 0, won: 0 } })

    allSpend.forEach(s => {
      if (map[s.campaign_id]) map[s.campaign_id].spend += Number(s.amount)
    })

    campaigns.forEach(c => {
      if (!c.utm_campaign) return
      utmLeads.forEach((l: { utm_campaign: string | null; status: string }) => {
        if (l.utm_campaign === c.utm_campaign) {
          map[c.id].leads++
          if (l.status === 'won') map[c.id].won++
        }
      })
    })

    return map
  }, [campaigns, allSpend, utmLeads])

  // Filtros
  const filtered = useMemo(() => campaigns.filter(c => {
    if (filterStatus !== 'all'   && c.status   !== filterStatus)   return false
    if (filterPlatform !== 'all' && c.platform !== filterPlatform) return false
    return true
  }), [campaigns, filterStatus, filterPlatform])

  // Totais
  const totals = useMemo(() => {
    const spend = Object.values(campaignMetrics).reduce((s, m) => s + m.spend, 0)
    const leads = Object.values(campaignMetrics).reduce((s, m) => s + m.leads, 0)
    const won   = Object.values(campaignMetrics).reduce((s, m) => s + m.won, 0)
    return { spend, leads, won, cpl: leads > 0 && spend > 0 ? spend / leads : 0 }
  }, [campaignMetrics])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: async (form: typeof EMPTY_FORM) => {
      const payload = {
        store_id:     store!.id,
        platform:     form.platform,
        name:         form.name.trim(),
        utm_source:   form.utm_source   || null,
        utm_medium:   form.utm_medium   || null,
        utm_campaign: form.utm_campaign || null,
        utm_content:  form.utm_content  || null,
        utm_term:     form.utm_term     || null,
        campaign_id:  form.campaign_id  || null,
        adset_name:   form.adset_name   || null,
        adset_id:     form.adset_id     || null,
        ad_name:      form.ad_name      || null,
        ad_id:        form.ad_id        || null,
        status:       form.status,
        start_date:   form.start_date   || null,
        end_date:     form.end_date     || null,
        notes:        form.notes        || null,
      }
      if (editing) {
        const { error } = await supabase.from('ad_campaigns').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ad_campaigns').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Campanha atualizada!' : 'Campanha criada!')
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] })
      setShowModal(false); setEditing(null)
    },
    onError: (e) => toast.error('Erro ao salvar', e instanceof Error ? e.message : ''),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ad_campaigns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Campanha removida')
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] })
    },
    onError: () => toast.error('Erro ao remover campanha'),
  })

  function handleDelete(c: AdCampaign) {
    if (!confirm(`Remover a campanha "${c.name}"? Os lançamentos de investimento também serão apagados.`)) return
    deleteMut.mutate(c.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Integrações</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Conectores e gerenciamento de campanhas de anúncios</p>
        </div>
        {activeTab === 'campaigns' && (
          <button onClick={() => { setEditing(null); setShowModal(true) }} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
            background: 'var(--neon)', border: 'none', borderRadius: 8,
            color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 20px rgba(61,247,16,.3)',
          }}>
            <Plus size={14} /> Nova Campanha
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--el)', borderRadius: 8, padding: 3, width: 'fit-content', border: '1px solid var(--bs)' }}>
        {[
          { id: 'integrations' as const, label: '🔌 Integrações' },
          { id: 'campaigns'    as const, label: '📊 Campanhas' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: activeTab === t.id ? 'var(--card)' : 'transparent',
            border: activeTab === t.id ? '1px solid var(--bs)' : '1px solid transparent',
            color: activeTab === t.id ? 'var(--t)' : 'var(--t3)', cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Integrações ── */}
      {activeTab === 'integrations' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {INTEGRATIONS.map(int => (
            <Card key={int.name} style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--el)', border: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {int.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{int.name}</p>
                    <Badge variant={int.status === 'connected' ? 'success' : 'default'} dot style={{ marginTop: 2 }}>
                      {int.status === 'connected' ? 'Conectado' : 'Disponível'}
                    </Badge>
                  </div>
                </div>
                {int.status === 'connected'
                  ? <CheckCircle2 size={16} style={{ color: 'var(--grn)', flexShrink: 0 }} />
                  : <Clock size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                }
              </div>
              <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 12 }}>{int.desc}</p>
              <button style={{
                width: '100%', padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: int.status === 'connected' ? 600 : 700,
                background: int.status === 'connected' ? 'transparent' : 'var(--neon)',
                border: int.status === 'connected' ? '1px solid var(--b)' : 'none',
                color: int.status === 'connected' ? 'var(--t2)' : '#000', cursor: 'pointer',
              }}>
                {int.status === 'connected' ? 'Configurar' : 'Conectar'}
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* ── Campanhas ── */}
      {activeTab === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* KPIs de campanhas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { icon: <Megaphone size={13} />, label: 'Campanhas ativas', value: campaigns.filter(c => c.status === 'active').length.toString(), color: 'var(--neon)' },
              { icon: <DollarSign size={13} />, label: 'Investimento (90d)', value: formatCurrency(totals.spend), color: 'var(--yel)' },
              { icon: <Users size={13} />,      label: 'Leads rastreados',  value: totals.leads.toString(),       color: 'var(--blu)' },
              { icon: <BarChart2 size={13} />,  label: 'CPL médio',         value: totals.cpl > 0 ? formatCurrency(totals.cpl) : '—', color: 'var(--t2)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <span style={{ color: k.color }}>{k.icon}</span>
                  <span style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</span>
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Status */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ v: 'all', l: 'Todos' }, ...STATUS_OPTS.map(s => ({ v: s.value, l: s.label }))].map(f => (
                <button key={f.v} onClick={() => setFilterStatus(f.v)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: filterStatus === f.v ? '2px solid var(--neon)' : '1px solid var(--bs)',
                  background: filterStatus === f.v ? 'var(--ng)' : 'var(--el)',
                  color: filterStatus === f.v ? 'var(--neon)' : 'var(--t3)',
                }}>
                  {f.l}
                </button>
              ))}
            </div>
            {/* Plataforma */}
            <div style={{ position: 'relative' }}>
              <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={{
                height: 30, padding: '0 28px 0 10px', background: 'var(--el)', border: '1px solid var(--bs)',
                borderRadius: 20, color: 'var(--t2)', fontSize: 11, cursor: 'pointer', appearance: 'none', outline: 'none',
              }}>
                <option value="all">Todas as plataformas</option>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
              </select>
              <ChevronDown size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Grid de campanhas */}
          {filtered.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
              {filtered.map(c => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  spend={campaignMetrics[c.id]?.spend ?? 0}
                  leads={campaignMetrics[c.id]?.leads ?? 0}
                  won={campaignMetrics[c.id]?.won ?? 0}
                  onEdit={() => { setEditing(c); setShowModal(true) }}
                  onDelete={() => handleDelete(c)}
                  onSpend={() => setSpendFor(c)}
                />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12 }}>
              <Megaphone size={40} style={{ color: 'var(--t4)', marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>
                {campaigns.length === 0 ? 'Nenhuma campanha cadastrada' : 'Nenhuma campanha com esses filtros'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>
                Cadastre suas campanhas do Facebook, Google ou outros canais para rastrear leads e calcular CPL automaticamente.
              </p>
              {campaigns.length === 0 && (
                <button onClick={() => { setEditing(null); setShowModal(true) }} style={{
                  padding: '9px 20px', background: 'var(--neon)', border: 'none', borderRadius: 8,
                  color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <Plus size={14} /> Criar primeira campanha
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      {showModal && (
        <CampaignModal
          initial={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={(form) => createMut.mutate(form)}
        />
      )}
      {spendFor && (
        <SpendModal campaign={spendFor} onClose={() => setSpendFor(null)} />
      )}
    </div>
  )
}
