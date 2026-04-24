// Edge Function: create-store-and-user
// Cria conta + loja de forma transacional usando service role.
// O frontend NÃO usa service role key — toda a operação privilegiada fica aqui.
// Aceita `slug` para multi-tenancy — gera automaticamente se não fornecido.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/** Gera slug a partir do nome da loja */
function generateSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[áàâãä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
  return normalized || 'loja'
}

/** Garante unicidade do slug adicionando sufixo numérico se necessário */
async function ensureUniqueSlug(admin: ReturnType<typeof createClient>, base: string): Promise<string> {
  let candidate = base
  let attempt = 0
  while (attempt < 20) {
    const { data } = await admin.from('stores').select('id').eq('slug', candidate).single()
    if (!data) return candidate  // disponível
    attempt++
    candidate = `${base}${attempt}`
  }
  // Fallback com timestamp
  return `${base}-${Date.now().toString(36).slice(-4)}`
}

// ─── Email de boas-vindas ──────────────────────────────────────────────────────

function buildWelcomeEmail(name: string, storeName: string, loginUrl: string, slug: string): string {
  const firstName = name.split(' ')[0]
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;border:1px solid #1e1e1e;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#111 0%,#0f1a0f 100%);padding:32px 40px;text-align:center;border-bottom:1px solid #1e1e1e;">
          <div style="font-size:28px;font-weight:900;color:#3df710;letter-spacing:-0.5px;">CRM<span style="color:#fff;">Auto</span></div>
          <div style="font-size:11px;color:#555;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Automotivo Pro</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h1 style="color:#fff;font-size:22px;font-weight:700;margin:0 0 8px;">Bem-vindo, ${firstName}! 🚗</h1>
          <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 24px;">
            Sua conta da <strong style="color:#fff;">${storeName}</strong> foi criada com sucesso.
            Você tem <strong style="color:#3df710;">14 dias de trial gratuito</strong> com acesso completo à plataforma.
          </p>
          <!-- CTA -->
          <div style="text-align:center;margin:32px 0;">
            <a href="${loginUrl}" style="background:#3df710;color:#000;font-size:15px;font-weight:800;padding:14px 32px;border-radius:10px;text-decoration:none;display:inline-block;letter-spacing:0.3px;">
              Acessar minha conta →
            </a>
          </div>
          <!-- Steps -->
          <div style="background:#0f0f0f;border-radius:10px;border:1px solid #1e1e1e;padding:20px;margin-bottom:24px;">
            <p style="color:#3df710;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 14px;">Próximos passos</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="background:#3df71020;color:#3df710;border-radius:6px;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">1</span>
                <span style="color:#ccc;font-size:13px;">Conecte seu WhatsApp em <strong style="color:#fff;">Configurações → WhatsApp</strong></span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="background:#3df71020;color:#3df710;border-radius:6px;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">2</span>
                <span style="color:#ccc;font-size:13px;">Cadastre seu primeiro veículo no <strong style="color:#fff;">Estoque</strong></span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="background:#3df71020;color:#3df710;border-radius:6px;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">3</span>
                <span style="color:#ccc;font-size:13px;">Crie sua primeira automação de follow-up</span>
              </div>
            </div>
          </div>
          <!-- Subdomain info -->
          <div style="background:#0a1200;border:1px solid #3df71030;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
            <p style="color:#3df710;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Seu link de acesso exclusivo</p>
            <p style="color:#fff;font-size:13px;font-family:monospace;margin:0;">${loginUrl}</p>
            <p style="color:#555;font-size:10px;margin:4px 0 0;">Subdomínio: ${slug}.crmautomotivopro.com</p>
          </div>
          <p style="color:#555;font-size:11px;line-height:1.5;margin-top:24px;">
            Em caso de dúvidas, responda este email. Estamos aqui para ajudar!
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #1e1e1e;text-align:center;">
          <p style="color:#333;font-size:11px;margin:0;">© ${new Date().getFullYear()} CRM Automotivo Pro. Todos os direitos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const { full_name, store_name, slug: requestedSlug, email, password } = await req.json()

    // Validação básica
    if (!full_name?.trim() || !store_name?.trim() || !email?.trim() || !password) {
      return json({ error: 'Campos obrigatórios ausentes' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'Senha deve ter ao menos 6 caracteres' }, 400)
    }

    // ── Clientes Supabase ────────────────────────────────────────────────────
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const anon = createClient(supabaseUrl, anonKey)

    // ── 1. Criar usuário no Auth (já confirmado) ─────────────────────────────
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (authError) {
      const isDuplicate =
        authError.message.toLowerCase().includes('already registered') ||
        authError.message.toLowerCase().includes('already been registered')
      return json(
        { error: isDuplicate ? 'Este email já está cadastrado. Faça login.' : authError.message },
        400,
      )
    }

    const userId = authData.user.id
    let storeId: string | null = null
    let finalSlug: string | null = null

    try {
      // ── 2. Resolver slug único ───────────────────────────────────────────────
      const baseSlug = requestedSlug?.trim()
        ? requestedSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
        : generateSlug(store_name.trim())

      finalSlug = await ensureUniqueSlug(admin, baseSlug)

      // ── 3. Criar loja ──────────────────────────────────────────────────────
      const { data: store, error: storeErr } = await admin
        .from('stores')
        .insert({
          name:     store_name.trim(),
          slug:     finalSlug,
          plan:     'starter',
          status:   'trial',
          active:   true,
          settings: {
            whatsapp_instance: null,
            whatsapp_status:   'disconnected',
          },
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()

      if (storeErr) throw new Error('Erro ao criar loja: ' + storeErr.message)
      storeId = store.id

      // ── 4. Criar perfil do usuário (admin da loja) ─────────────────────────
      const { error: userErr } = await admin.from('users').insert({
        id:        userId,
        store_id:  storeId,
        full_name: full_name.trim(),
        email:     email.trim().toLowerCase(),
        role:      'admin',
        active:    true,
      })
      if (userErr) throw new Error('Erro ao criar perfil: ' + userErr.message)

      // ── 5. Criar etapas padrão do pipeline ────────────────────────────────
      const { error: stagesErr } = await admin.rpc('create_default_stages', { p_store_id: storeId })
      if (stagesErr) {
        console.warn('create_default_stages warning:', stagesErr.message)
      }

      // ── 6. Sign-in e retorno da session ───────────────────────────────────
      const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      })
      if (signInErr) throw new Error('Conta criada mas erro ao entrar: ' + signInErr.message)

      // ── 7. Email de boas-vindas (Resend) — não bloqueia o retorno ──────────
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (resendKey) {
        const loginUrl = `https://${finalSlug}.crmautomotivopro.com/login`
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'CRM Automotivo Pro <noreply@crmautomotivopro.com>',
            to:   [email.trim().toLowerCase()],
            subject: `Bem-vindo ao CRM Automotivo Pro, ${full_name.trim().split(' ')[0]}!`,
            html: buildWelcomeEmail(full_name.trim(), store_name.trim(), loginUrl, finalSlug!),
          }),
        }).catch(err => console.warn('[welcome-email] failed:', err))
      }

      return json({ session: signIn.session, user: signIn.user, slug: finalSlug })

    } catch (err) {
      // ── ROLLBACK ──────────────────────────────────────────────────────────
      console.error('[create-store-and-user] rollback:', err)
      if (storeId) {
        await admin.from('stores').delete().eq('id', storeId).catch(() => {})
      }
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      throw err
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno do servidor'
    return json({ error: msg }, 500)
  }
})
