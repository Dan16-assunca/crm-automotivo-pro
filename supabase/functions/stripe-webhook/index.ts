// Edge Function: stripe-webhook
// Recebe eventos do Stripe (checkout.session.completed, invoice.paid,
// customer.subscription.deleted, etc.) e atualiza o banco.
//
// Configure em: Stripe Dashboard → Developers → Webhooks
// URL: https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/stripe-webhook
// Eventos: checkout.session.completed, invoice.paid, invoice.payment_failed,
//          customer.subscription.updated, customer.subscription.deleted

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ─── Verificação de assinatura Stripe ────────────────────────────────────────

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',')
    const ts    = parts.find(p => p.startsWith('t='))?.split('=')[1]
    const v1    = parts.find(p => p.startsWith('v1='))?.split('=')[1]
    if (!ts || !v1) return false

    const signed = `${ts}.${payload}`
    const key    = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
    const hex  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    return hex === v1
  } catch {
    return false
  }
}

// ─── Mapeamento de planos Stripe → internos ────────────────────────────────

function planFromPriceId(priceId: string): 'starter' | 'pro' | 'enterprise' {
  const map: Record<string, 'starter' | 'pro' | 'enterprise'> = {
    [Deno.env.get('STRIPE_PRICE_STARTER')    ?? '__none__']: 'starter',
    [Deno.env.get('STRIPE_PRICE_PRO')        ?? '__none__']: 'pro',
    [Deno.env.get('STRIPE_PRICE_ENTERPRISE') ?? '__none__']: 'enterprise',
  }
  return map[priceId] ?? 'starter'
}

// ─── Handlers de eventos ──────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Record<string, unknown>) {
  const storeId  = session.metadata as Record<string, string> | null
  const id       = storeId?.store_id
  const plan     = storeId?.plan as 'starter' | 'pro' | 'enterprise' | undefined

  if (!id) { console.warn('[stripe-webhook] checkout: sem store_id'); return }

  await admin.from('stores').update({
    plan:              plan ?? 'starter',
    status:            'active',
    stripe_session_id: session.id as string,
    trial_ends_at:     null, // plano pago não tem mais trial
  }).eq('id', id)

  console.log(`[stripe-webhook] checkout.completed store=${id} plan=${plan}`)
}

async function handleInvoicePaid(invoice: Record<string, unknown>) {
  const customerId = invoice.customer as string
  if (!customerId) return

  const { data: store } = await admin.from('stores')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!store) { console.warn('[stripe-webhook] invoice.paid: store não encontrado para customer', customerId); return }

  // Pega o plano da linha do invoice
  const lines      = (invoice.lines as { data: { price: { id: string } }[] })?.data
  const priceId    = lines?.[0]?.price?.id
  const plan       = priceId ? planFromPriceId(priceId) : undefined

  await admin.from('stores').update({
    status:        'active',
    ...(plan ? { plan } : {}),
    trial_ends_at: null,
  }).eq('id', store.id)

  console.log(`[stripe-webhook] invoice.paid store=${store.id}`)
}

async function handleInvoicePaymentFailed(invoice: Record<string, unknown>) {
  const customerId = invoice.customer as string
  if (!customerId) return

  const { data: store } = await admin.from('stores')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!store) return

  // Suspende a loja após falha de pagamento
  await admin.from('stores').update({ status: 'suspended' }).eq('id', store.id)
  console.log(`[stripe-webhook] invoice.payment_failed → suspended store=${store.id}`)
}

async function handleSubscriptionUpdated(sub: Record<string, unknown>) {
  const customerId = sub.customer as string
  if (!customerId) return

  const { data: store } = await admin.from('stores')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!store) return

  const stripeStatus = sub.status as string
  const items = (sub.items as { data: { price: { id: string } }[] })?.data
  const priceId = items?.[0]?.price?.id
  const plan    = priceId ? planFromPriceId(priceId) : undefined

  const statusMap: Record<string, string> = {
    active:             'active',
    past_due:           'suspended',
    canceled:           'cancelled',
    unpaid:             'suspended',
    trialing:           'trial',
    paused:             'suspended',
    incomplete:         'trial',
    incomplete_expired: 'cancelled',
  }

  await admin.from('stores').update({
    status:  statusMap[stripeStatus] ?? 'suspended',
    ...(plan ? { plan } : {}),
  }).eq('id', store.id)

  console.log(`[stripe-webhook] subscription.updated store=${store.id} status=${stripeStatus}`)
}

async function handleSubscriptionDeleted(sub: Record<string, unknown>) {
  const customerId = sub.customer as string
  if (!customerId) return

  const { data: store } = await admin.from('stores')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!store) return

  await admin.from('stores').update({ status: 'cancelled', plan: 'free' }).eq('id', store.id)
  console.log(`[stripe-webhook] subscription.deleted → cancelled store=${store.id}`)
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body   = await req.text()
  const sig    = req.headers.get('stripe-signature') ?? ''

  // Verifica assinatura apenas em produção
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(body, sig, STRIPE_WEBHOOK_SECRET)
    if (!valid) {
      console.error('[stripe-webhook] assinatura inválida')
      return new Response('Webhook signature mismatch', { status: 400 })
    }
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }

  const obj = event.data.object

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(obj)
        break
      case 'invoice.paid':
        await handleInvoicePaid(obj)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(obj)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(obj)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(obj)
        break
      default:
        // Ignora eventos não tratados
        break
    }
  } catch (err) {
    console.error(`[stripe-webhook] erro em ${event.type}:`, err)
    // Retorna 200 para evitar retry infinito do Stripe em erros internos
    return new Response('Erro interno processado', { status: 200 })
  }

  return new Response('ok', { status: 200 })
})
