import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?? 'https://eakdywmuewvuzyqfpcpl.supabase.co'
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVha2R5d211ZXd2dXp5cWZwY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjQ5MTgsImV4cCI6MjA5MDMwMDkxOH0.EeUINhQUomMKqhfkjGnkDpO3aO5NZ4Yqd15qof-mB20'

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
