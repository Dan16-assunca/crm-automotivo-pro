// Edge Function: stripe-checkout
// Cria uma Stripe Checkout Session e retorna a URL de pagamento.
// O frontend redireciona o usuário para essa URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_API        = 'https://api.stripe.com/v1'

// IDs dos produtos/preços no Stripe (preencher após criar no dashboard Stripe)
const PRICE_IDS: Record<string, string> = {
  starter:    Deno.env.get('STRIPE_PRICE_STARTER')    ?? '',
  pro:        Deno.env.get('STRIPE_PRICE_PRO')        ?? '',
  enterprise: Deno.env.get('STRIPE_PRICE_ENTERPRISE') ?? '',
}

async function stripePost(path: string, body: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams(body)
  return fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
}

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
    // Autentica o usuário via JWT do Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return json({ error: 'Não autorizado' }, 401)

    const { plan } = await req.json() as { plan: string }
    const priceId = PRICE_IDS[plan]
    if (!priceId) return json({ error: `Plano inválido: ${plan}` }, 400)

    // Busca dados da loja
    const { data: profile } = await supabase
      .from('users')
      .select('store_id, full_name, email, stores(id, slug, name, stripe_customer_id)')
      .eq('id', user.id)
      .single()

    if (!profile) return json({ error: 'Perfil não encontrado' }, 404)

    const store = profile.stores as { id: string; slug: string; name: string; stripe_customer_id: string | null } | null
    if (!store) return json({ error: 'Loja não encontrada' }, 404)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Cria ou recupera o Stripe Customer
    let customerId = store.stripe_customer_id
    if (!customerId) {
      const res = await stripePost('/customers', {
        email: profile.email ?? user.email ?? '',
        name:  profile.full_name ?? store.name,
        'metadata[store_id]': store.id,
        'metadata[slug]':     store.slug,
      })
      const customer = await res.json()
      if (!res.ok) throw new Error(`Stripe customer error: ${customer.error?.message}`)
      customerId = customer.id

      // Salva o customer_id no banco
      await admin.from('stores').update({ stripe_customer_id: customerId }).eq('id', store.id)
    }

    const slug          = store.slug
    const successUrl    = `https://${slug}.crmautomotivopro.com/settings?checkout=success`
    const cancelUrl     = `https://${slug}.crmautomotivopro.com/settings?checkout=cancelled`

    // Cria a Checkout Session
    const res = await stripePost('/checkout/sessions', {
      'customer':                    customerId,
      'mode':                        'subscription',
      'line_items[0][price]':        priceId,
      'line_items[0][quantity]':     '1',
      'success_url':                 successUrl,
      'cancel_url':                  cancelUrl,
      'allow_promotion_codes':       'true',
      'billing_address_collection':  'auto',
      'subscription_data[trial_end]': '0', // sem trial duplo — já fez trial
      'metadata[store_id]':          store.id,
      'metadata[plan]':              plan,
    })
    const session = await res.json()
    if (!res.ok) throw new Error(`Stripe session error: ${session.error?.message}`)

    return json({ url: session.url })
  } catch (err) {
    console.error('[stripe-checkout]', err)
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500)
  }
})
