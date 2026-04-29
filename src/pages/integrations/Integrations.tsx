import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug, CheckCircle2, Clock, ExternalLink, Plus, Megaphone,
  X, Pencil, Trash2, DollarSign, TrendingUp, Users, BarChart2,
  ChevronDown, Calendar, Save, Copy, Eye, EyeOff, RefreshCw,
  AlertCircle,
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
          status:      initial.status as 'active',
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

// ─── Modal: Configurar Facebook Lead Ads ─────────────────────────────────────

const WEBHOOK_URL        = 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/facebook-lead-webhook'
const GOOGLE_WEBHOOK_URL = 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/google-lead-webhook'
const FB_OAUTH_URL       = 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/fb-oauth'

interface FbConfig {
  id: string
  page_id: string
  page_name: string | null
  page_access_token: string
  verify_token: string
  default_stage_id: string | null
  default_salesperson_id: string | null
  default_temperature: string
  active: boolean
}

interface FbPage {
  id: string
  name: string
  access_token: string
}

// ─── Page Picker Modal ────────────────────────────────────────────────────────

function FbPagePickerModal({
  pages, storeId, onClose,
}: {
  pages: FbPage[]
  storeId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [connecting, setConnecting] = useState<string | null>(null)

  async function selectPage(page: FbPage) {
    setConnecting(page.id)
    try {
      const res = await fetch(`${FB_OAUTH_URL}?action=select_page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id:          storeId,
          page_id:           page.id,
          page_name:         page.name,
          page_access_token: page.access_token,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Erro ao conectar página')
      toast.success('Facebook conectado!', `Página "${page.name}" conectada com sucesso`)
      qc.invalidateQueries({ queryKey: ['fb-integration'] })
      // Clear fb_pages from URL
      const u = new URL(window.location.href)
      u.searchParams.delete('fb_pages')
      u.searchParams.delete('store_id')
      window.history.replaceState({}, '', u.toString())
      onClose()
    } catch (e) {
      toast.error('Erro ao conectar', e instanceof Error ? e.message : '')
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.8)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420,
        background: 'var(--surf)', border: '1px solid var(--bs)', borderRadius: 14,
        padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📘</span>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--t)', margin: 0 }}>Selecionar Página</h3>
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Escolha qual página conectar ao CRM</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pages.map(page => (
            <button
              key={page.id}
              onClick={() => selectPage(page)}
              disabled={connecting !== null}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 9, cursor: 'pointer',
                background: connecting === page.id ? '#1877F2' : 'var(--el)',
                border: `1px solid ${connecting === page.id ? '#1877F2' : 'var(--bs)'}`,
                color: connecting === page.id ? '#fff' : 'var(--t)',
                fontSize: 13, fontWeight: 600, textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                opacity: connecting !== null && connecting !== page.id ? 0.5 : 1,
                transition: 'all .15s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>📘</span>
                <span>
                  <span style={{ display: 'block' }}>{page.name}</span>
                  <span style={{ fontSize: 10, color: connecting === page.id ? 'rgba(255,255,255,.7)' : 'var(--t3)', fontWeight: 400 }}>ID: {page.id}</span>
                </span>
              </span>
              {connecting === page.id && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── FacebookConfigModal (OAuth-based) ───────────────────────────────────────

function FacebookConfigModal({ onClose, storeId, onPages }: {
  onClose: () => void
  storeId: string
  onPages: (pages: FbPage[], sid: string) => void
}) {
  const qc = useQueryClient()
  const [disconnecting, setDisconnecting] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Dados da integração existente
  const { data: existing, isLoading } = useQuery<FbConfig | null>({
    queryKey: ['fb-integration', storeId],
    queryFn: async () => {
      const { data } = await supabase
        .from('facebook_integrations')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle()
      return data as FbConfig | null
    },
    enabled: !!storeId,
  })

  async function handleDisconnect() {
    if (!existing) return
    if (!confirm('Desconectar o Facebook Lead Ads? Os leads já recebidos não serão afetados.')) return
    setDisconnecting(true)
    const { error } = await supabase.from('facebook_integrations').delete().eq('id', existing.id)
    setDisconnecting(false)
    if (error) { toast.error('Erro ao remover'); return }
    toast.success('Integração removida')
    qc.invalidateQueries({ queryKey: ['fb-integration'] })
    onClose()
  }

  function handleConnect() {
    const url = `${FB_OAUTH_URL}?action=start&store_id=${storeId}`
    const w = 620, h = 700
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2)
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2)
    const popup = window.open(url, 'fb-oauth', `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`)
    if (!popup) { toast.error('Popup bloqueado', 'Permita pop-ups para este site e tente novamente'); return }

    setConnecting(true)

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'fb-oauth-done') {
        window.removeEventListener('message', handler)
        setConnecting(false)
        if (e.data.ok) {
          toast.success('Facebook conectado!', 'Leads do formulário chegarão automaticamente')
          qc.invalidateQueries({ queryKey: ['fb-integration'] })
          onClose()
        } else {
          toast.error('Erro ao conectar', e.data.error ?? '')
        }
      } else if (e.data?.type === 'fb-oauth-pages') {
        window.removeEventListener('message', handler)
        setConnecting(false)
        onPages(e.data.pages as FbPage[], e.data.storeId as string)
        onClose()
      }
    }
    window.addEventListener('message', handler)

    // Cleanup if popup closed manually
    const timer = setInterval(() => {
      if (popup.closed) { clearInterval(timer); window.removeEventListener('message', handler); setConnecting(false) }
    }, 800)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.75)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        background: 'var(--surf)', border: '1px solid var(--bs)', borderRadius: 14,
        padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>📘</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--t)', margin: 0 }}>Facebook Lead Ads</h3>
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>
                {isLoading
                  ? 'Carregando...'
                  : existing
                    ? <span style={{ color: 'var(--neon)' }}>✓ Conectado · {existing.page_name ?? existing.page_id}</span>
                    : 'Não conectado'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        </div>

        {isLoading ? (
          <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>Carregando...</p>
        ) : existing ? (
          /* ── Connected state ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(61,247,16,.05)', border: '1px solid rgba(61,247,16,.2)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircle2 size={20} style={{ color: 'var(--neon)', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', margin: 0 }}>{existing.page_name ?? existing.page_id}</p>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>Leads do Facebook estão fluindo automaticamente para o CRM</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                style={{ height: 40, padding: '0 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: disconnecting ? 0.6 : 1 }}
              >
                <Trash2 size={12} /> {disconnecting ? 'Removendo...' : 'Desconectar'}
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting}
                style={{ flex: 1, height: 40, borderRadius: 8, background: '#1877F2', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: connecting ? 0.7 : 1 }}
              >
                {connecting ? '⏳ Aguardando...' : '📘 Reconectar com Facebook'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Not connected state ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(24,119,242,.1)', border: '2px solid rgba(24,119,242,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              📘
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>Conecte sua Página do Facebook</p>
              <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7, maxWidth: 340 }}>
                Um popup vai abrir para você fazer login no Facebook e selecionar a Página da loja. Os leads chegarão automaticamente no Pipeline.
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              style={{
                width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 800,
                background: connecting ? '#0f5fb8' : '#1877F2', border: 'none', color: '#fff', cursor: connecting ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 20px rgba(24,119,242,.4)',
                transition: 'all .15s',
              }}
            >
              {connecting ? '⏳ Aguardando login no popup...' : '📘 Conectar com Facebook'}
            </button>

            <p style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.6 }}>
              Permissões: pages_show_list, pages_manage_metadata, pages_read_engagement
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal: Configurar Google Ads Lead Form ───────────────────────────────────

interface GoogleConfig {
  id: string
  google_key: string
  account_name: string | null
  default_stage_id: string | null
  default_salesperson_id: string | null
  default_temperature: string
  active: boolean
}

function GoogleConfigModal({ onClose }: { onClose: () => void }) {
  const { store } = useAuthStore()
  const qc = useQueryClient()

  const [step, setStep]       = useState<'config' | 'instructions'>('config')
  const [saving, setSaving]   = useState(false)
  const [copied, setCopied]   = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const { data: existing, isLoading } = useQuery<GoogleConfig | null>({
    queryKey: ['google-integration', store?.id],
    queryFn: async () => {
      const { data } = await supabase.from('google_integrations').select('*').eq('store_id', store!.id).maybeSingle()
      return data as GoogleConfig | null
    },
    enabled: !!store?.id,
  })

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages', store?.id],
    queryFn: async () => { const { data } = await supabase.from('pipeline_stages').select('id,name').eq('store_id', store!.id).order('position'); return data ?? [] },
    enabled: !!store?.id,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['analytics-users', store?.id],
    queryFn: async () => { const { data } = await supabase.from('users').select('id,full_name').eq('store_id', store!.id).eq('active', true); return data ?? [] },
    enabled: !!store?.id,
  })

  const [form, setForm] = useState({ google_key: '', account_name: '', default_stage_id: '', default_salesperson_id: '', default_temperature: 'hot' })
  const [didInit, setDidInit] = useState(false)
  if (existing !== undefined && !didInit && existing) {
    setForm({ google_key: existing.google_key, account_name: existing.account_name ?? '', default_stage_id: existing.default_stage_id ?? '', default_salesperson_id: existing.default_salesperson_id ?? '', default_temperature: existing.default_temperature })
    setDidInit(true)
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key); setTimeout(() => setCopied(null), 2000)
  }

  // Gera uma chave aleatória sugerida para o cliente usar no Google Ads
  function generateKey() {
    const key = crypto.randomUUID().replace(/-/g, '').slice(0, 24)
    setForm(f => ({ ...f, google_key: key }))
  }

  async function handleSave() {
    if (!form.google_key.trim()) { toast.error('Informe a Chave de Webhook'); return }
    setSaving(true)
    try {
      const payload = { store_id: store!.id, google_key: form.google_key.trim(), account_name: form.account_name.trim() || null, default_stage_id: form.default_stage_id || null, default_salesperson_id: form.default_salesperson_id || null, default_temperature: form.default_temperature, active: true }
      if (existing) {
        const { error } = await supabase.from('google_integrations').update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('google_integrations').insert(payload)
        if (error) throw error
      }
      toast.success('Configuração salva!', 'Webhook pronto para receber leads do Google')
      qc.invalidateQueries({ queryKey: ['google-integration'] })
      setDidInit(false)
    } catch (e) {
      toast.error('Erro ao salvar', e instanceof Error ? e.message : '')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!existing || !confirm('Desconectar o Google Ads?')) return
    const { error } = await supabase.from('google_integrations').delete().eq('id', existing.id)
    if (error) { toast.error('Erro ao remover'); return }
    toast.success('Integração removida')
    qc.invalidateQueries({ queryKey: ['google-integration'] })
    onClose()
  }

  const inp: React.CSSProperties = { width: '100%', height: 38, background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 7, color: 'var(--t)', fontSize: 12, padding: '0 10px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.75)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 560, background: 'var(--surf)', border: '1px solid var(--bs)', borderRadius: 14, padding: 24, maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>🔍</span>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--t)', margin: 0 }}>Google Ads Lead Form</h3>
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {existing ? <span style={{ color: 'var(--neon)' }}>✓ Conectado · {existing.account_name ?? 'Google Ads'}</span> : 'Não configurado'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--el)', borderRadius: 7, padding: 3, marginBottom: 20, border: '1px solid var(--bs)' }}>
          {(['config', 'instructions'] as const).map(s => (
            <button key={s} onClick={() => setStep(s)} style={{ flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 11, fontWeight: 500, background: step === s ? 'var(--card)' : 'transparent', border: step === s ? '1px solid var(--bs)' : '1px solid transparent', color: step === s ? 'var(--t)' : 'var(--t3)', cursor: 'pointer' }}>
              {s === 'config' ? '⚙️ Configuração' : '📖 Como conectar'}
            </button>
          ))}
        </div>

        {/* ── Config ── */}
        {step === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isLoading ? <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: 20 }}>Carregando...</p> : (<>

              {/* URL do Webhook */}
              <div style={{ background: 'rgba(66,133,244,.08)', border: '1px solid rgba(66,133,244,.25)', borderRadius: 9, padding: '10px 12px' }}>
                <p style={{ ...lbl, color: '#4285F4', marginBottom: 6 }}>URL do Webhook — cole no Google Ads</p>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontSize: 10, color: 'var(--t2)', background: 'var(--el)', borderRadius: 6, padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{GOOGLE_WEBHOOK_URL}</code>
                  <button onClick={() => copy(GOOGLE_WEBHOOK_URL, 'url')} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', color: copied === 'url' ? 'var(--neon)' : 'var(--t3)', fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <Copy size={11} /> {copied === 'url' ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              {/* Chave de Webhook */}
              <div>
                <label style={lbl}>Chave de Webhook (Google Key) *</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input style={{ ...inp, paddingRight: 40 }} type={showKey ? 'text' : 'password'} value={form.google_key} onChange={e => setForm(f => ({ ...f, google_key: e.target.value }))} placeholder="Chave secreta para autenticar o Google Ads" />
                    <button onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <button onClick={generateKey} title="Gerar chave aleatória" style={{ height: 38, padding: '0 12px', borderRadius: 7, background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, flexShrink: 0 }}>
                    <RefreshCw size={12} /> Gerar
                  </button>
                  {form.google_key && (
                    <button onClick={() => copy(form.google_key, 'key')} style={{ height: 38, padding: '0 12px', borderRadius: 7, background: 'var(--el)', border: '1px solid var(--bs)', cursor: 'pointer', color: copied === 'key' ? 'var(--neon)' : 'var(--t3)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, flexShrink: 0 }}>
                      <Copy size={12} /> {copied === 'key' ? 'Copiado!' : 'Copiar'}
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>Você vai colar essa chave no campo "Chave" dentro do Google Ads ao configurar o webhook. O CRM a usa para identificar sua conta.</p>
              </div>

              {/* Nome da conta (display) */}
              <div>
                <label style={lbl}>Nome da conta (opcional)</label>
                <input style={inp} value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} placeholder="Ex: Google Ads — Revenda Silva" />
              </div>

              {/* Defaults */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>Etapa padrão do pipeline</label>
                  <select style={{ ...inp }} value={form.default_stage_id} onChange={e => setForm(f => ({ ...f, default_stage_id: e.target.value }))}>
                    <option value="">Primeira etapa</option>
                    {stages.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Vendedor padrão</label>
                  <select style={{ ...inp }} value={form.default_salesperson_id} onChange={e => setForm(f => ({ ...f, default_salesperson_id: e.target.value }))}>
                    <option value="">Sem vendedor</option>
                    {users.map((u: { id: string; full_name: string }) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Temperatura padrão</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ v: 'hot', l: '🔥 Quente', c: '#F43F5E' }, { v: 'warm', l: '⚡ Morno', c: '#F97316' }, { v: 'cold', l: '❄️ Frio', c: '#3B82F6' }].map(opt => (
                    <button key={opt.v} onClick={() => setForm(f => ({ ...f, default_temperature: opt.v }))} style={{ flex: 1, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: form.default_temperature === opt.v ? `2px solid ${opt.c}` : '1px solid var(--bs)', background: form.default_temperature === opt.v ? opt.c + '20' : 'var(--el)', color: form.default_temperature === opt.v ? opt.c : 'var(--t3)' }}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {existing && (
                  <button onClick={handleDelete} style={{ height: 40, padding: '0 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Trash2 size={12} /> Desconectar
                  </button>
                )}
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, height: 40, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'var(--neon)', border: 'none', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
                  <Save size={14} /> {saving ? 'Salvando...' : existing ? 'Salvar alterações' : 'Conectar Google Ads'}
                </button>
              </div>
            </>)}
          </div>
        )}

        {/* ── Instruções ── */}
        {step === 'instructions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { n: '1', title: 'Acesse o Google Ads', body: 'Faça login em ads.google.com. No menu lateral, vá em Campanhas → Recursos → Formulários de lead.' },
              { n: '2', title: 'Crie ou edite um Formulário de Lead', body: 'Crie um novo formulário ou edite um existente. Adicione os campos que deseja capturar: Nome, Telefone, E-mail, Cidade. Você pode adicionar até 10 perguntas personalizadas.' },
              { n: '3', title: 'Configure a entrega por webhook', body: 'No final do formulário, em "Entrega de leads", selecione "Webhook". Preencha:\n\n• URL do webhook: copie da aba Configuração\n• Chave: copie da aba Configuração\n\nClique em "Enviar lead de teste" para verificar a conexão.', highlight: true },
              { n: '4', title: 'Salve o formulário', body: 'Salve o formulário de lead. A partir desse momento, todos os leads preenchidos no Google Ads chegam automaticamente no CRM com nome, telefone, e-mail e dados da campanha.' },
              { n: '5', title: 'Vincule a campanha no CRM', body: 'Para o cálculo automático de CPL, vá em Integrações → Campanhas, crie a campanha com o ID correto do Google Ads. O CRM associa os leads às campanhas e calcula o CPL.' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4285F4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{s.n}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>{s.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{s.body}</p>
                  {s.highlight && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ background: 'var(--el)', borderRadius: 7, padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--t3)', minWidth: 100 }}>URL do webhook:</span>
                        <code style={{ fontSize: 10, color: 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{GOOGLE_WEBHOOK_URL}</code>
                        <button onClick={() => copy(GOOGLE_WEBHOOK_URL, 'inst-url')} style={{ padding: '4px 8px', borderRadius: 5, background: 'transparent', border: '1px solid var(--bs)', cursor: 'pointer', color: copied === 'inst-url' ? 'var(--neon)' : 'var(--t3)', fontSize: 10, display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                          <Copy size={10} /> {copied === 'inst-url' ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <div style={{ background: 'var(--el)', borderRadius: 7, padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--t3)', minWidth: 100 }}>Chave:</span>
                        <code style={{ fontSize: 10, color: form.google_key ? 'var(--t2)' : 'var(--t4)', flex: 1 }}>{form.google_key || '(configure na aba Configuração)'}</code>
                        {form.google_key && (
                          <button onClick={() => copy(form.google_key, 'inst-key')} style={{ padding: '4px 8px', borderRadius: 5, background: 'transparent', border: '1px solid var(--bs)', cursor: 'pointer', color: copied === 'inst-key' ? 'var(--neon)' : 'var(--t3)', fontSize: 10, display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                            <Copy size={10} /> {copied === 'inst-key' ? 'Copiado!' : 'Copiar'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div style={{ background: 'rgba(66,133,244,.06)', border: '1px solid rgba(66,133,244,.2)', borderRadius: 9, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertCircle size={14} style={{ color: '#4285F4', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
                O Google Ads inclui automaticamente no payload: <strong style={{ color: 'var(--t2)' }}>campaign_id, campaign_name, adgroup_id, adgroup_name, creative_id e gcl_id</strong>. Todos são salvos no lead para rastreamento completo de atribuição — sem precisar de parâmetros UTM manuais.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Integrations() {
  const { store } = useAuthStore()
  const qc = useQueryClient()

  const [activeTab, setActiveTab]       = useState<'integrations' | 'campaigns'>('integrations')
  const [showFbModal, setShowFbModal]         = useState(false)
  const [showGoogleModal, setShowGoogleModal] = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState<AdCampaign | null>(null)
  const [spendFor, setSpendFor]         = useState<AdCampaign | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [fbPages, setFbPages]           = useState<FbPage[] | null>(null)
  const [fbPagesStoreId, setFbPagesStoreId] = useState<string>('')

  // ── Handle OAuth return params ────────────────────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href)

    if (url.searchParams.get('fb_connected') === '1') {
      toast.success('Facebook conectado!', 'Leads do Facebook estão fluindo automaticamente para o CRM')
      url.searchParams.delete('fb_connected')
      window.history.replaceState({}, '', url.toString())
      qc.invalidateQueries({ queryKey: ['fb-integration'] })
    }

    if (url.searchParams.get('fb_error') === '1') {
      toast.error('Erro ao conectar Facebook', 'Tente novamente ou verifique as configurações do seu App')
      url.searchParams.delete('fb_error')
      window.history.replaceState({}, '', url.toString())
    }

    const encodedPages = url.searchParams.get('fb_pages')
    if (encodedPages) {
      try {
        const decoded = JSON.parse(atob(encodedPages)) as FbPage[]
        const sid = url.searchParams.get('store_id') ?? store?.id ?? ''
        setFbPages(decoded)
        setFbPagesStoreId(sid)
        url.searchParams.delete('fb_pages')
        url.searchParams.delete('store_id')
        window.history.replaceState({}, '', url.toString())
      } catch (e) {
        console.error('[Integrations] Failed to parse fb_pages param', e)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // ── Status da integração Google ──────────────────────────────────────────
  const { data: googleIntegration } = useQuery({
    queryKey: ['google-integration', store?.id],
    queryFn: async () => {
      const { data } = await supabase.from('google_integrations').select('id,account_name,active').eq('store_id', store!.id).maybeSingle()
      return data
    },
    enabled: !!store?.id,
  })

  // ── Status da integração Facebook ────────────────────────────────────────
  const { data: fbIntegration } = useQuery({
    queryKey: ['fb-integration', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('facebook_integrations')
        .select('id, page_name, active')
        .eq('store_id', store!.id)
        .maybeSingle()
      return data
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
          {INTEGRATIONS.map(int => {
            const isMeta   = int.name === 'Meta Ads'
            const isGoogle = int.name === 'Google Ads'
            const metaConnected   = isMeta   && !!fbIntegration?.active
            const googleConnected = isGoogle && !!googleIntegration?.active
            const isConnected = int.status === 'connected' || metaConnected || googleConnected

            function handleClick() {
              if (isMeta) {
                // If not connected, go directly to OAuth; if connected, open config modal
                if (!metaConnected) {
                  window.location.href = `${FB_OAUTH_URL}?action=start&store_id=${store?.id ?? ''}`
                } else {
                  setShowFbModal(true)
                }
                return
              }
              if (isGoogle) { setShowGoogleModal(true); return }
            }

            return (
              <Card key={int.name} style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--el)', border: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {int.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{int.name}</p>
                      <Badge variant={isConnected ? 'success' : 'default'} dot style={{ marginTop: 2 }}>
                        {isConnected
                          ? metaConnected   ? `Conectado · ${fbIntegration?.page_name ?? 'Página'}`
                          : googleConnected ? `Conectado · ${googleIntegration?.account_name ?? 'Google Ads'}`
                          : 'Conectado'
                          : 'Disponível'}
                      </Badge>
                    </div>
                  </div>
                  {isConnected
                    ? <CheckCircle2 size={16} style={{ color: 'var(--grn)', flexShrink: 0 }} />
                    : <Clock size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                  }
                </div>
                <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 12 }}>{int.desc}</p>
                <button
                  onClick={isMeta || isGoogle ? handleClick : undefined}
                  style={{
                    width: '100%', padding: '6px 0', borderRadius: 6, fontSize: 11,
                    fontWeight: isConnected ? 600 : 700,
                    background: isConnected ? 'transparent'
                      : isMeta   ? '#1877F2'
                      : isGoogle ? '#4285F4'
                      : 'var(--neon)',
                    border: isConnected ? '1px solid var(--b)' : 'none',
                    color: isConnected ? 'var(--t2)' : '#fff',
                    cursor: isMeta || isGoogle ? 'pointer' : 'default',
                  }}>
                  {isConnected ? 'Gerenciar conexão'
                    : isMeta   ? '📘 Conectar com Facebook'
                    : isGoogle ? '🔍 Conectar Google Ads'
                    : 'Conectar'}
                </button>
              </Card>
            )
          })}
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
      {showFbModal && (
        <FacebookConfigModal
          storeId={store?.id ?? ''}
          onClose={() => setShowFbModal(false)}
          onPages={(pages, sid) => { setFbPages(pages); setFbPagesStoreId(sid) }}
        />
      )}
      {fbPages && (
        <FbPagePickerModal
          pages={fbPages}
          storeId={fbPagesStoreId || store?.id || ''}
          onClose={() => setFbPages(null)}
        />
      )}
      {showGoogleModal && <GoogleConfigModal  onClose={() => setShowGoogleModal(false)} />}
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
