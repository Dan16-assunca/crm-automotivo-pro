import { Link } from 'react-router-dom'
import { Car, FileText, ArrowLeft } from 'lucide-react'

const LAST_UPDATED = '26 de abril de 2026'
const COMPANY_NAME = 'CRM Automotivo Pro'
const COMPANY_EMAIL = 'suporte@crmautomotivopro.com'
const COMPANY_CNPJ = 'XX.XXX.XXX/0001-XX' // substituir antes do go-live
const TRIAL_DAYS = 14

export default function Terms() {
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
            <FileText size={12} /> Documento Legal
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 900, color: 'var(--t)', marginBottom: 12, lineHeight: 1.2 }}>
            Termos de Uso
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t3)' }}>
            Última atualização: {LAST_UPDATED}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <Section title="1. Aceitação dos termos">
            <P>
              Ao criar uma conta ou utilizar qualquer funcionalidade do <strong style={{ color: 'var(--t)' }}>{COMPANY_NAME}</strong> (CNPJ {COMPANY_CNPJ}), você concorda com estes Termos de Uso e com nossa <Link to="/privacidade" style={{ color: 'var(--neon)', textDecoration: 'none' }}>Política de Privacidade</Link>. Caso não concorde, não utilize a plataforma.
            </P>
            <P>
              Estes termos constituem um contrato juridicamente vinculante entre você (Usuário ou Cliente) e o {COMPANY_NAME}.
            </P>
          </Section>

          <Section title="2. Descrição do serviço">
            <P>
              O {COMPANY_NAME} é uma plataforma SaaS (Software as a Service) de CRM automotivo que oferece:
            </P>
            <List items={[
              'Gestão de pipeline de vendas com Kanban visual',
              'Integração com WhatsApp Business via API',
              'Captação automática de leads via Meta Lead Ads e Google Ads Lead Forms',
              'Gestão de estoque automotivo com inteligência artificial',
              'Relatórios de vendas, atribuição de marketing e analytics',
              'Automações de follow-up e mensagens',
              'Gestão de equipe com controle de acesso por função',
              'Calculadora financeira automotiva',
              'Aplicativo móvel progressivo (PWA)',
            ]} />
          </Section>

          <Section title="3. Cadastro e conta">
            <P>
              Para usar o serviço, você deve criar uma conta com informações verdadeiras e completas. Você é responsável por:
            </P>
            <List items={[
              'Manter a confidencialidade da sua senha',
              'Todas as atividades realizadas sob sua conta',
              'Notificar-nos imediatamente em caso de acesso não autorizado',
              'Não compartilhar credenciais entre usuários (cada membro da equipe deve ter seu próprio acesso)',
            ]} />
            <P>
              Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos.
            </P>
          </Section>

          <Section title="4. Período de trial e pagamento">
            <P>
              Oferecemos um período de avaliação gratuita de <strong style={{ color: 'var(--t)' }}>{TRIAL_DAYS} dias</strong>, sem necessidade de cartão de crédito. Ao final do trial:
            </P>
            <List items={[
              'Sua conta será automaticamente pausada até a contratação de um plano',
              'Seus dados permanecem armazenados por 30 dias adicionais para facilitar a retomada',
              'O pagamento é processado mensalmente ou anualmente, conforme o plano escolhido',
              'Não há contratos de fidelidade — cancele quando quiser',
            ]} />
            <P>
              Os preços podem ser alterados com aviso prévio de 30 dias. A alteração se aplica na próxima renovação.
            </P>
          </Section>

          <Section title="5. Cancelamento e reembolso">
            <P>
              Você pode cancelar sua assinatura a qualquer momento pelo painel de configurações. Ao cancelar:
            </P>
            <List items={[
              'O acesso permanece ativo até o final do período já pago',
              'Não realizamos reembolso proporcional de períodos não utilizados',
              'Seus dados ficam disponíveis para exportação por 30 dias após o cancelamento',
              'Após 30 dias, os dados são excluídos permanentemente',
            ]} />
            <P>
              Exceção: em caso de falha grave do serviço causada por nós, analisaremos solicitações de reembolso caso a caso.
            </P>
          </Section>

          <Section title="6. Uso aceitável">
            <P>Você concorda em não utilizar a plataforma para:</P>
            <List items={[
              'Enviar spam ou mensagens não solicitadas em massa via WhatsApp',
              'Armazenar ou processar dados de menores de 18 anos',
              'Realizar engenharia reversa, cópia ou redistribuição do software',
              'Tentativas de invasão, teste de vulnerabilidades sem autorização',
              'Qualquer atividade ilegal ou que viole direitos de terceiros',
              'Compartilhar acesso com competidores da plataforma para fins de análise',
            ]} />
          </Section>

          <Section title="7. WhatsApp e integrações de terceiros">
            <P>
              A integração com WhatsApp utiliza API de terceiros (Uazapi/Evolution API). O uso deve respeitar os <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon)', textDecoration: 'none' }}>Termos Comerciais do WhatsApp</a>. O envio de mensagens em massa não solicitadas pode resultar no bloqueio do seu número pelo WhatsApp e suspensão da conta na plataforma.
            </P>
            <P>
              Para integrações com Meta (Facebook/Instagram) e Google Ads, você é responsável por obter as permissões adequadas dos usuários cujos dados trafegam via webhooks.
            </P>
          </Section>

          <Section title="8. Propriedade intelectual">
            <P>
              O {COMPANY_NAME} e todos os seus componentes (código, design, marca, documentação) são propriedade exclusiva da empresa. Concedemos a você uma licença limitada, não exclusiva e intransferível para usar o serviço conforme contratado.
            </P>
            <P>
              Seus dados e os dados de seus clientes permanecem de sua propriedade. Não reivindicamos qualquer direito sobre eles, exceto os necessários para prestar o serviço.
            </P>
          </Section>

          <Section title="9. Disponibilidade e SLA">
            <P>
              Nos comprometemos a manter a plataforma disponível com meta de <strong style={{ color: 'var(--t)' }}>99% de uptime mensal</strong>. Manutenções programadas são avisadas com antecedência de 48 horas pelo e-mail cadastrado.
            </P>
            <P>
              Não nos responsabilizamos por indisponibilidades causadas por falhas em serviços de terceiros (Supabase, WhatsApp, Meta, Google), força maior ou eventos fora do nosso controle razoável.
            </P>
          </Section>

          <Section title="10. Limitação de responsabilidade">
            <P>
              Até o limite máximo permitido por lei, o {COMPANY_NAME} não é responsável por danos indiretos, incidentais, especiais ou consequentes, incluindo lucros cessantes, perda de dados ou oportunidades de negócio.
            </P>
            <P>
              Nossa responsabilidade total em qualquer situação é limitada ao valor pago pelo Cliente nos 3 meses anteriores ao evento que originou a reclamação.
            </P>
          </Section>

          <Section title="11. Alterações nos termos">
            <P>
              Podemos modificar estes Termos a qualquer momento. Alterações substanciais serão comunicadas por e-mail com antecedência de <strong style={{ color: 'var(--t)' }}>15 dias</strong>. A continuação do uso da plataforma após esse prazo implica aceitação dos novos termos.
            </P>
          </Section>

          <Section title="12. Lei aplicável e foro">
            <P>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. As partes elegem o foro da Comarca de São Paulo — SP para dirimir quaisquer litígios, com renúncia expressa a qualquer outro foro, por mais privilegiado que seja.
            </P>
          </Section>

          <Section title="13. Contato">
            <P>Para dúvidas sobre estes Termos de Uso, entre em contato:</P>
            <div style={{ background: 'rgba(61,247,16,.04)', border: '1px solid rgba(61,247,16,.12)', borderRadius: 10, padding: '20px 24px', marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>{COMPANY_NAME}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--neon)' }}>{COMPANY_EMAIL}</p>
            </div>
          </Section>
        </div>

        {/* Links */}
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/privacidade" style={{ fontSize: 13, color: 'var(--t3)', textDecoration: 'none' }}>Política de Privacidade</Link>
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
