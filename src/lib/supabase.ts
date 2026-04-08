import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

export type Database = {
  public: {
    Tables: {
      stores: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      users: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      leads: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      activities: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      vehicles: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      pipeline_stages: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      sales_goals: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      whatsapp_messages: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      notifications: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      automations: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
    }
  }
}
