export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0,2)}) ${cleaned.slice(2,7)}-${cleaned.slice(7)}`
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0,2)}) ${cleaned.slice(2,6)}-${cleaned.slice(6)}`
  }
  return phone
}

export const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export const formatDateTime = (date: string): string => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export const timeAgo = (date: string): string => {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `${diffMins}m atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `${diffDays}d atrás`
  return formatDate(date)
}

export const daysInStage = (date: string): number => {
  const start = new Date(date)
  const now = new Date()
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export const temperatureLabel = (temp: string): string => {
  const map: Record<string, string> = { hot: 'Quente', warm: 'Morno', cold: 'Frio' }
  return map[temp] ?? temp
}

export const temperatureColor = (temp: string): string => {
  const map: Record<string, string> = {
    hot: 'text-red-400 bg-red-400/10',
    warm: 'text-yellow-400 bg-yellow-400/10',
    cold: 'text-blue-400 bg-blue-400/10',
  }
  return map[temp] ?? ''
}

export const sourceLabel = (source: string): string => {
  const map: Record<string, string> = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    facebook: 'Facebook',
    olx: 'OLX',
    webmotors: 'WebMotors',
    indicacao: 'Indicação',
    site: 'Site',
    telefone: 'Telefone',
    presencial: 'Presencial',
  }
  return map[source] ?? source
}
