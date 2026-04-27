import { Link } from 'react-router-dom'
import { Car, Shield, ArrowLeft } from 'lucide-react'

const LAST_UPDATED = '26 de abril de 2026'
const COMPANY_NAME = 'CRM Automotivo Pro'
const COMPANY_EMAIL = 'privacidade@crmautomotivopro.com'
const COMPANY_CNPJ = 'XX.XXX.XXX/0001-XX' // substituir antes do go-live

export default function Privacy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--fn)', color: 'var(--t)' }}>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,10,.9)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(61,247,16,.08)', border: '1px solid rgba(61,247,16,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={14} style={{ color: 'var(--neon)' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--neon)', letterSpacing: '.1em' }}>CRM AUTO</span>
          </Link>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t3)', textDecoration: 'none' }}>
            <ArrowLeft size={14} /> Voltar
          </Link>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 80px' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(61,247,16,.08)', border: '1px solid rgba(61,247,16,.2)', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 600, color: 'var(--neon)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 20 }}>
            <Shield size={12} /> LGPD Compliance
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: 'var(--t)', marginBottom: 12, lineHeight: 1.2 }}>
            Política de Privacidade
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t3)' }}>
            Última atualização: {LAST_UPDATED}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <Section title="1. Quem somos">
            <P>
              O <strong style={{ color: 'var(--t)' }}>{COMPANY_NAME}</strong> é uma plataforma SaaS de gestão de relacionamento com clientes (CRM) voltada para o setor automotivo, desenvolvida e operada por empresa inscrita no CNPJ {COMPANY_CNPJ}.
            </P>
            <P>
              Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos seus dados pessoais, em conformidade com a <strong style={{ color: 'var(--t)' }}>Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)</strong>.
            </P>
          </Section>

          <Section title="2. Dados que coletamos">
            <P>Coletamos as seguintes categorias de dados:</P>
            <TableStyled rows={[
              ['Dados de cadastro', 'Nome, e-mail, telefone, CNPJ/CPF, nome da empresa, endereço', 'Prestação do serviço (art. 7º, V, LGPD)'],
              ['Dados de uso', 'Páginas acessadas, ações realizadas, timestamps, IP, navegador', 'Interesse legítimo — segurança e melhoria do produto'],
              ['Dados de leads', 'Nome, e-mail, telefone e informações fornecidas por terceiros (ex: leads de Meta Ads / Google Ads)', 'Prestação do serviço ao cliente (controller/processor)'],
              ['Dados de pagamento', 'Processados diretamente pelo Stripe — não armazenamos número de cartão', 'Execução do contrato'],
              ['Cookies e rastreamento', 'UTM parameters, fbclid, gclid, sessionStorage para atribuição de marketing', 'Interesse legítimo — analytics'],
            ]} />
          </Section>

          <Section title="3. Como usamos seus dados">
            <List items={[
              'Criar e manter sua conta e a conta da sua concessionária',
              'Prestar os serviços contratados (pipeline, WhatsApp, relatórios, automações)',
              'Processar pagamentos via Stripe',
              'Enviar comunicações relacionadas ao serviço (onboarding, alertas, faturas)',
              'Melhorar continuamente a plataforma com base em dados de uso',
              'Cumprir obrigações legais e regulatórias',
              'Detectar e prevenir fraudes e acessos não autorizados',
            ]} />
          </Section>

          <Section title="4. Compartilhamento de dados">
            <P>Não vendemos seus dados. Compartilhamos apenas com:</P>
            <List items={[
              <><strong style={{ color: 'var(--t)' }}>Supabase Inc.</strong> — infraestrutura de banco de dados e autenticação (data center: us-east-1)</>,
              <><strong style={{ color: 'var(--t)' }}>Stripe Inc.</strong> — processamento de pagamentos</>,
              <><strong style={{ color: 'var(--t)' }}>Anthropic PBC</strong> — geração de mensagens de IA (dados mínimos, sem retenção pelo fornecedor)</>,
              <><strong style={{ color: 'var(--t)' }}>Meta Platforms / Google LLC</strong> — apenas quando você configura a integração de Lead Ads (dados trafegam via webhook)</>,
              <><strong style={{ color: 'var(--t)' }}>Autoridades competentes</strong> — quando exigido por lei ou ordem judicial</>,
            ]} />
          </Section>

          <Section title="5. Cookies e rastreamento">
            <P>
              Utilizamos <strong style={{ color: 'var(--t)' }}>sessionStorage</strong> (não cookies persistentes) para capturar parâmetros de UTM e identificadores de clique (fbclid, gclid) na sessão atual, com o único propósito de atribuir a origem de marketing de leads gerados naquela sessão.
            </P>
            <P>
              Esses dados são apagados automaticamente ao encerrar a sessão do navegador ou ao criar um lead. Não utilizamos rastreamento cross-site.
            </P>
          </Section>

          <Section title="6. Retenção de dados">
            <TableStyled rows={[
              ['Dados de conta ativa', 'Durante toda a vigência do contrato + 5 anos após encerramento (obrigações fiscais)'],
              ['Leads e atividades', 'Durante toda a vigência do contrato; excluídos em até 30 dias após cancelamento'],
              ['Logs de acesso', '6 meses (Marco Civil da Internet, art. 15)'],
              ['Dados de pagamento', 'Conforme política do Stripe (mínimo legal de 5 anos)'],
            ]} />
          </Section>

          <Section title="7. Seus direitos (LGPD)">
            <P>Como titular de dados, você tem direito a:</P>
            <List items={[
              'Confirmar a existência de tratamento dos seus dados',
              'Acessar seus dados pessoais armazenados',
              'Corrigir dados incompletos, inexatos ou desatualizados',
              'Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários',
              'Portabilidade dos dados para outro fornecedor de serviço',
              'Revogar o consentimento (quando aplicável)',
              'Solicitar informações sobre compartilhamento com terceiros',
              'Peticionar à Autoridade Nacional de Proteção de Dados (ANPD)',
            ]} />
            <P>
              Para exercer seus direitos, entre em contato com nosso DPO pelo e-mail: <strong style={{ color: 'var(--neon)' }}>{COMPANY_EMAIL}</strong>. Responderemos em até <strong style={{ color: 'var(--t)' }}>15 dias úteis</strong>.
            </P>
          </Section>

          <Section title="8. Segurança dos dados">
            <List items={[
              'Comunicação criptografada em trânsito com TLS 1.3',
              'Dados em repouso criptografados via AES-256 (Supabase)',
              'Row Level Security (RLS) — cada loja acessa apenas seus próprios dados',
              'Autenticação com tokens JWT de curta duração',
              'Tokens de integração (WhatsApp, Facebook, Google) armazenados criptografados',
              'Acesso ao banco de produção restrito a membros autorizados da equipe',
            ]} />
          </Section>

          <Section title="9. Transferências internacionais">
            <P>
              Seus dados são processados nos Estados Unidos (Supabase us-east-1, Stripe, Anthropic). Adotamos salvaguardas contratuais compatíveis com o art. 33 da LGPD para garantir proteção equivalente à legislação brasileira.
            </P>
          </Section>

          <Section title="10. Menores de idade">
            <P>
              Nossa plataforma é destinada exclusivamente a pessoas jurídicas e profissionais maiores de 18 anos. Não coletamos conscientemente dados de menores. Se identificarmos tal situação, os dados serão excluídos imediatamente.
            </P>
          </Section>

          <Section title="11. Alterações nesta política">
            <P>
              Reservamo-nos o direito de atualizar esta política a qualquer momento. Mudanças significativas serão comunicadas por e-mail com antecedência mínima de 15 dias. A continuação do uso do serviço após o prazo implica aceite das novas condições.
            </P>
          </Section>

          <Section title="12. Contato e DPO">
            <P>
              Para dúvidas, solicitações ou reclamações sobre o tratamento de dados pessoais:
            </P>
            <div style={{ background: 'rgba(61,247,16,.04)', border: '1px solid rgba(61,247,16,.12)', borderRadius: 10, padding: '20px 24px', marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>{COMPANY_NAME}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--t3)' }}>Encarregado de Proteção de Dados (DPO)</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--neon)' }}>{COMPANY_EMAIL}</p>
            </div>
          </Section>
        </div>

        {/* Links */}
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/termos" style={{ fontSize: 13, color: 'var(--t3)', textDecoration: 'none' }}>Termos de Uso</Link>
          <Link to="/" style={{ fontSize: 13, color: 'var(--t3)', textDecoration: 'none' }}>Página inicial</Link>
          <Link to="/registro" style={{ fontSize: 13, color: 'var(--neon)', textDecoration: 'none', fontWeight: 600 }}>Começar grátis →</Link>
        </div>
      </main>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: 'var(--t3)', lineHeight: 1.8, margin: 0 }}>{children}</p>
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, color: 'var(--t3)', lineHeight: 1.7 }}>{item}</li>
      ))}
    </ul>
  )
}

function TableStyled({ rows }: { rows: (string | React.ReactNode)[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '10px 14px',
                  color: j === 0 ? 'var(--t)' : 'var(--t3)',
                  fontWeight: j === 0 ? 600 : 400,
                  verticalAlign: 'top',
                  minWidth: j === 0 ? 160 : undefined,
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
