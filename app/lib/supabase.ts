/**
 * Supabase client — server-side only.
 * Install: npm install @supabase/supabase-js
 *
 * Run this SQL in your Supabase project to create the tables:
 *
 * -- Users table (extends Supabase auth.users)
 * create table public.profiles (
 *   id uuid references auth.users on delete cascade primary key,
 *   email text,
 *   stripe_customer_id text,
 *   plan text,                         -- 'quick-score' | 'full-audit'
 *   credits integer default 0,         -- for pay-per-report
 *   reports_used integer default 0,
 *   created_at timestamptz default now()
 * );
 *
 * -- Reports table
 * create table public.reports (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references public.profiles(id) on delete cascade,
 *   url text,
 *   listing_data jsonb,
 *   report_data jsonb,
 *   overall_score integer,
 *   created_at timestamptz default now()
 * );
 *
 * -- RLS
 * alter table public.profiles enable row level security;
 * alter table public.reports enable row level security;
 * create policy "Users see own profile" on profiles for select using (auth.uid() = id);
 * create policy "Users see own reports" on reports for select using (auth.uid() = user_id);
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Lazy-initialized clients — won't crash if env vars are missing
let _supabaseAdmin: SupabaseClient | null = null
let _supabasePublic: SupabaseClient | null = null

/** Server-side client with full privileges (never expose to browser) */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _supabaseAdmin
}

/** Browser-safe client (read-only, respects RLS) */
export function getSupabasePublic(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null
  if (!_supabasePublic) {
    _supabasePublic = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _supabasePublic
}

export interface Profile {
  id: string
  email: string
  stripe_customer_id: string | null
  plan: string
  credits: number
  reports_used: number
  created_at: string
}

export interface StoredReport {
  id: string
  user_id: string
  url: string | null
  listing_data: Record<string, unknown>
  report_data: Record<string, unknown>
  overall_score: number
  created_at: string
}


/** Report limits per plan (-1 = unlimited, 0 = no access) */
export const PLAN_LIMITS: Record<string, number> = {
  'quick-score': 1,
  'full-audit': 1,
  'expired': 0,
}

/** Get the report limit for a plan, defaulting to 0 for unknown plans */
export function getPlanLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? 0
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data as Profile
}

export async function saveReport(
  userId: string,
  url: string,
  listingData: object,
  reportData: object,
  overallScore: number
): Promise<string | null> {
  const db = getSupabaseAdmin()
  if (!db) { console.warn('[db] Supabase not configured, skipping saveReport'); return null }
  const { data, error } = await db
    .from('reports')
    .insert({ user_id: userId, url, listing_data: listingData, report_data: reportData, overall_score: overallScore })
    .select('id')
    .single()
  if (error) { console.error('[db] saveReport:', error); return null }

  // Increment reports_used
  await db.rpc('increment_reports_used', { uid: userId })

  return data.id
}

/** Save a report to Supabase keyed by Stripe session ID (for email re-access) */
export async function cacheReport(sessionId: string, plan: string, listingUrl: string, reportData: object, photoResults?: object | null, photoPreviews?: string[] | null): Promise<boolean> {
  const db = getSupabaseAdmin()
  if (!db) { console.warn('[db] Supabase not configured, skipping cacheReport'); return false }
  const { error } = await db
    .from('cached_reports')
    .upsert({
      session_id: sessionId,
      plan,
      listing_url: listingUrl,
      report_data: reportData,
      photo_results: photoResults || null,
      photo_previews: photoPreviews || null,
    })
  if (error) { console.error('[db] cacheReport:', error); return false }
  console.log(`[db] Cached report for session ${sessionId}`)
  return true
}

/** Load a cached report by Stripe session ID */
export async function getCachedReportBySession(sessionId: string): Promise<{
  plan: string
  listingUrl: string
  reportData: Record<string, unknown>
  photoResults: Record<string, unknown> | null
  photoPreviews: string[] | null
} | null> {
  const db = getSupabaseAdmin()
  if (!db) return null
  const { data, error } = await db
    .from('cached_reports')
    .select('*')
    .eq('session_id', sessionId)
    .single()
  if (error || !data) return null
  return {
    plan: data.plan,
    listingUrl: data.listing_url,
    reportData: data.report_data,
    photoResults: data.photo_results,
    photoPreviews: data.photo_previews,
  }
}

/** Update cached report with photo results (added after initial report) */
export async function updateCachedPhotos(sessionId: string, photoResults: object, photoPreviews?: string[] | null): Promise<boolean> {
  const db = getSupabaseAdmin()
  if (!db) return false
  // Use upsert to handle race condition where cacheReport hasn't finished inserting yet
  const { error } = await db
    .from('cached_reports')
    .upsert(
      { session_id: sessionId, photo_results: photoResults, photo_previews: photoPreviews || null },
      { onConflict: 'session_id', ignoreDuplicates: false }
    )
  if (error) { console.error('[db] updateCachedPhotos:', error); return false }
  return true
}

export async function getReportsThisMonth(userId: string): Promise<number> {
  const db = getSupabaseAdmin()
  if (!db) return 0
  const start = new Date()
  start.setDate(1); start.setHours(0, 0, 0, 0)
  const { count } = await db
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
  return count ?? 0
}
