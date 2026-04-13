// Edge Function: invite-team-member
// Valida permissão do chamador, usa inviteUserByEmail (service role)
// e já cria o perfil do usuário convidado imediatamente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ── Autenticação do chamador ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Não autenticado' }, 401)
    }

    const { email, full_name, role } = await req.json()

    if (!email?.trim() || !role) {
      return json({ error: 'email e role são obrigatórios' }, 400)
    }
    if (!['admin', 'manager', 'salesperson'].includes(role)) {
      return json({ error: 'Role inválido' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Admin client (service role)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Client com JWT do usuário chamador — valida quem está chamando
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // ── Verificar quem está chamando ─────────────────────────────────────────
    const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser()
    if (callerErr || !callerUser) {
      return json({ error: 'Token inválido ou expirado' }, 401)
    }

    // Buscar perfil do chamador no banco
    const { data: callerProfile, error: profileErr } = await admin
      .from('users')
      .select('role, store_id')
      .eq('id', callerUser.id)
      .single()

    if (profileErr || !callerProfile) {
      return json({ error: 'Perfil não encontrado' }, 403)
    }

    // Apenas admin ou manager pode convidar
    if (!['admin', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'Sem permissão: apenas admin ou gerente pode convidar membros' }, 403)
    }

    // Manager não pode convidar outro admin
    if (callerProfile.role === 'manager' && role === 'admin') {
      return json({ error: 'Gerentes não podem convidar administradores' }, 403)
    }

    const storeId = callerProfile.store_id

    // ── URL de redirect após aceite do convite ───────────────────────────────
    const appUrl =
      Deno.env.get('APP_URL') ??
      req.headers.get('origin') ??
      'https://crm-automotivo-pro.vercel.app'

    // ── Enviar convite via Supabase Auth (service role obrigatório) ──────────
    const { data: inviteData, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
        redirectTo: `${appUrl}/convite`,
        data: { full_name: full_name?.trim() ?? '', store_id: storeId, role },
      })

    if (inviteErr) {
      const msg = inviteErr.message
      if (msg.includes('already been invited'))
        return json({ error: 'Este email já recebeu um convite pendente.' }, 400)
      if (msg.includes('already registered'))
        return json({ error: 'Este email já possui uma conta na plataforma.' }, 400)
      return json({ error: msg }, 400)
    }

    const newUserId = inviteData.user.id

    // ── Criar perfil do usuário imediatamente ────────────────────────────────
    // Assim ele aparece na lista de equipe mesmo antes de aceitar o convite.
    const { error: userErr } = await admin.from('users').upsert({
      id:        newUserId,
      store_id:  storeId,
      full_name: full_name?.trim() ?? email.split('@')[0],
      email:     email.trim().toLowerCase(),
      role,
      active:    true,
    })

    if (userErr) {
      // Não é fatal — o convite foi enviado. Logamos o erro mas não falhamos.
      console.error('[invite-team-member] user profile upsert error:', userErr.message)
    }

    // ── Registrar convite na tabela de rastreamento ──────────────────────────
    await admin.from('team_invites').insert({
      store_id:   storeId,
      email:      email.trim().toLowerCase(),
      full_name:  full_name?.trim() ?? null,
      role,
      invited_by: callerUser.id,
      // accepted_at permanece null até o usuário fazer login pela primeira vez
    }).catch(() => {}) // não é crítico

    return json({ success: true, email: email.trim().toLowerCase() })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno do servidor'
    return json({ error: msg }, 500)
  }
})
