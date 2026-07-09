import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('Supabase environment variables are not configured.')
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
})

/** Human-readable submission reference, e.g. MO-260708-K4TQ. */
export function makeReference(prefix: 'MO' | 'TS' | 'QC'): string {
  const d = new Date()
  const ymd = [
    String(d.getFullYear()).slice(2),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('')
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
  const rand = crypto.getRandomValues(new Uint32Array(4))
  const suffix = [...rand].map((n) => alphabet[n % alphabet.length]).join('')
  return `${prefix}-${ymd}-${suffix}`
}

export type MaterialRow = {
  id: string
  list: string
  grp: string
  name: string
  detail: string | null
  sort_order: number
}

export type CategoryRow = {
  id: string
  slug: string
  name: string
  sort_order: number
}

/** list holds the category's display name at submission time (e.g. "Lead
 *  Job Order List") so emails/exports never need a live category lookup. */
export type OrderItem = {
  name: string
  list: string
  quantity: string
  note?: string
}

let materialsCache: MaterialRow[] | null = null
let categoriesCache: CategoryRow[] | null = null

export async function fetchMaterials(): Promise<MaterialRow[]> {
  if (materialsCache) return materialsCache
  const { data, error } = await supabase
    .from('materials')
    .select('id, list, grp, name, detail, sort_order')
    .eq('active', true)
    .order('list')
    .order('grp')
    .order('sort_order')
  if (error) throw error
  materialsCache = data as MaterialRow[]
  return materialsCache
}

export async function fetchCategories(): Promise<CategoryRow[]> {
  if (categoriesCache) return categoriesCache
  const { data, error } = await supabase
    .from('material_categories')
    .select('id, slug, name, sort_order')
    .order('sort_order')
  if (error) throw error
  categoriesCache = data as CategoryRow[]
  return categoriesCache
}
