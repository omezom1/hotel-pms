import { createClient } from '@supabase/supabase-js'

// Fallback placeholders keep createClient from throwing at build time when the
// Vercel Preview environment lacks NEXT_PUBLIC_SUPABASE_* (prerender of static
// pages like /_not-found). Production (main) embeds the real values at build.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
