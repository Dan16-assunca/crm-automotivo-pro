/**
 * useTenant — resolução client-side de tenant para Vite React SPA
 *
 * Adaptação do middleware Next.js para SPA: lê hostname, extrai subdomínio,
 * consulta Supabase para resolver o tenant (store).
 *
 * Em desenvolvimento (localhost): usa `?tenant=slug` na URL para simular subdomínio.
 * Em produção: lê o subdomínio de `slug.crmautomotivopro.com`.
 *
 * Segurança: o isolamento de dados é garantido pelo Supabase RLS, não pelo JS.
 * O `useTenant` é apenas para UX (saber em qual loja estamos).
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined) ?? 'crmautomotivopro.com'

const RESERVED = new Set([
  'app', 'www', 'api', 'admin', 'mail', 'smtp',
  'ftp', 'blog', 'docs', 'status', 'suporte', 'billing',
])

export interface TenantStore {
  id: string
  name: string
  slug: string | null
  status: string
  plan: string
  settings: Record<string, unknown>
}

// Cache em memória para evitar query repetida durante a sessão
const tenantCache: Record<string, TenantStore | null> = {}

/** Extrai o slug do hostname atual */
export function getSlugFromHost(hostname = window.location.hostname): string | null {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Dev: usa ?tenant=slug
    return new URLSearchParams(window.location.search).get('tenant')
  }
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.split('.')[0]
    return RESERVED.has(sub) ? null : sub
  }
  // Domínio customizado (enterprise) — resolve pela query custom_domain
  return null
}

/** Verifica se o host atual é um subdomínio de tenant */
export function isOnTenantSubdomain(hostname = window.location.hostname): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return !!new URLSearchParams(window.location.search).get('tenant')
  }
  const sub = hostname.split('.')[0]
  return hostname.endsWith(`.${ROOT_DOMAIN}`) && !RESERVED.has(sub)
}

/**
 * Redireciona para o subdomínio da loja.
 * Em localhost: adiciona ?tenant=slug.
 * Em produção: redireciona para `slug.crmautomotivopro.com/path`.
 */
export function redirectToTenant(slug: string, path = '/dashboard') {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Em dev, apenas adiciona o tenant param e recarrega
    const url = new URL(window.location.href)
    url.searchParams.set('tenant', slug)
    url.pathname = path
    window.location.href = url.toString()
    return
  }
  // Produção: redireciona para o subdomínio
  window.location.href = `https://${slug}.${ROOT_DOMAIN}${path}`
}

export function useTenant() {
  const [tenant, setTenant] = useState<TenantStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    resolve()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resolve() {
    const hostname = window.location.hostname

    if (tenantCache[hostname] !== undefined) {
      setTenant(tenantCache[hostname])
      setLoading(false)
      return
    }

    const slug = getSlugFromHost(hostname)

    if (!slug) {
      // Não estamos em nenhum subdomínio de tenant
      tenantCache[hostname] = null
      setLoading(false)
      return
    }

    try {
      const { data, error: dbError } = await supabase
        .from('stores')
        .select('id, name, slug, status, plan, settings')
        .or(`slug.eq.${slug},custom_domain.eq.${hostname}`)
        .single()

      if (dbError || !data) {
        tenantCache[hostname] = null
        setError('Loja não encontrada')
        setLoading(false)
        return
      }

      if (data.status === 'suspended') {
        setError('Esta loja está suspensa. Entre em contato com o suporte.')
        setLoading(false)
        return
      }

      tenantCache[hostname] = data as TenantStore
      setTenant(data as TenantStore)
    } catch {
      setError('Erro ao carregar informações da loja')
    } finally {
      setLoading(false)
    }
  }

  return { tenant, loading, error }
}
