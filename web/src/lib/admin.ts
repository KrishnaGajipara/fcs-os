/* Admin dashboard API client — talks to the admin-api edge function.
   The session token lives in sessionStorage (cleared when the tab closes). */

const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`
const TOKEN_KEY = 'fcs_admin_token'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}
function setToken(t: string) {
  sessionStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

async function call<T = unknown>(body: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Network error — check your connection.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || 'Request failed.', res.status)
  }
  return data as T
}

export type MaterialOrder = {
  id: string
  reference: string
  job_number: string
  site_contact: string
  site_contact_phone: string | null
  requested_by: string
  needed_by: string
  items: { name: string; list: string; quantity: string; note?: string }[]
  notes: string | null
  status: 'pending' | 'processing' | 'shipped' | 'cancelled'
  created_at: string
}

export type TimesheetEmployee = {
  name: string
  time_in: string | null
  time_out: string | null
  break_minutes: number
  reg_hours: number
  ot_hours: number
  pt_hours: number
  total: number
}

export type Timesheet = {
  id: string
  reference: string
  job_number: string
  work_date: string
  shift: string | null
  job_floor: string | null
  weather: string | null
  work_stoppage: boolean
  work_stoppage_note: string | null
  injuries: boolean
  injuries_note: string | null
  pre_task: boolean
  inspections: boolean
  inspections_note: string | null
  slip_work: boolean
  employees: TimesheetEmployee[]
  total_hours: number
  work_performed: string | null
  notes: string | null
  created_at: string
}

export type QCReport = {
  id: string
  reference: string
  job_number: string
  report_date: string
  inspector_name: string
  area_inspected: string
  work_inspected: string
  observations: string | null
  deficiencies: string | null
  corrective_actions: string | null
  result: 'pass' | 'pass_with_notes' | 'fail'
  photos: string[]
  created_at: string
}

export type AdminData = {
  material_orders: MaterialOrder[]
  timesheets: Timesheet[]
  qc_reports: QCReport[]
}

export async function login(password: string): Promise<void> {
  const d = await call<{ token: string }>({ action: 'login', password })
  setToken(d.token)
}

export function fetchData(): Promise<AdminData> {
  return call<AdminData>({ action: 'data', token: getToken() })
}

export async function updateOrderStatus(
  id: string,
  status: MaterialOrder['status'],
): Promise<MaterialOrder> {
  const d = await call<{ order: MaterialOrder }>({
    action: 'update_order_status',
    token: getToken(),
    id,
    status,
  })
  return d.order
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await call({ action: 'change_password', token: getToken(), currentPassword, newPassword })
}

export async function signedPhoto(path: string): Promise<string> {
  const d = await call<{ url: string }>({ action: 'signed_photo', token: getToken(), path })
  return d.url
}

/* ---- Materials & categories management ---- */

export type AdminCategory = {
  id: string
  slug: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
}

export type AdminMaterial = {
  id: string
  list: string
  grp: string
  name: string
  detail: string | null
  sort_order: number
  active: boolean
  created_at: string
}

export async function fetchCategoriesAdmin(): Promise<AdminCategory[]> {
  const d = await call<{ categories: AdminCategory[] }>({ action: 'categories', token: getToken() })
  return d.categories
}

export async function createCategory(name: string): Promise<AdminCategory> {
  const d = await call<{ category: AdminCategory }>({ action: 'create_category', token: getToken(), name })
  return d.category
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<AdminCategory, 'name' | 'active' | 'sort_order'>>,
): Promise<AdminCategory> {
  const d = await call<{ category: AdminCategory }>({
    action: 'update_category',
    token: getToken(),
    id,
    ...patch,
  })
  return d.category
}

export async function deleteCategory(id: string): Promise<void> {
  await call({ action: 'delete_category', token: getToken(), id })
}

export async function fetchMaterialsAdmin(): Promise<AdminMaterial[]> {
  const d = await call<{ materials: AdminMaterial[] }>({ action: 'materials_all', token: getToken() })
  return d.materials
}

export async function createMaterial(input: {
  list: string
  grp: string
  name: string
  detail?: string
}): Promise<AdminMaterial> {
  const d = await call<{ material: AdminMaterial }>({
    action: 'create_material',
    token: getToken(),
    ...input,
  })
  return d.material
}

export async function updateMaterial(
  id: string,
  patch: Partial<Pick<AdminMaterial, 'name' | 'detail' | 'grp' | 'list' | 'active' | 'sort_order'>>,
): Promise<AdminMaterial> {
  const d = await call<{ material: AdminMaterial }>({
    action: 'update_material',
    token: getToken(),
    id,
    ...patch,
  })
  return d.material
}

export async function deleteMaterial(id: string): Promise<void> {
  await call({ action: 'delete_material', token: getToken(), id })
}
