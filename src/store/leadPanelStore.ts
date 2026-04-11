import { create } from 'zustand'
import type { Lead } from '@/types'

interface LeadPanelState {
  open: boolean
  leadId: string | null
  mode: 'view' | 'create'
  initialData: Partial<Lead> | null
  openLeadPanel: (leadId: string) => void
  openLeadPanelCreate: (data: Partial<Lead>) => void
  closeLeadPanel: () => void
}

export const useLeadPanelStore = create<LeadPanelState>((set) => ({
  open: false,
  leadId: null,
  mode: 'view',
  initialData: null,
  openLeadPanel: (leadId) => set({ open: true, leadId, mode: 'view', initialData: null }),
  openLeadPanelCreate: (data) => set({ open: true, leadId: null, mode: 'create', initialData: data }),
  closeLeadPanel: () => set({ open: false, leadId: null, initialData: null }),
}))
