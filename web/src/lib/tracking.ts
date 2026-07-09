/* Public order tracking client — talks to the order-status edge function.
   No auth for reads; status changes require the manage token from the
   warehouse email. */

const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-status`

export type OrderEvent = { status: string; source: string; created_at: string }

export type TrackedOrder = {
  reference: string
  job_number: string
  needed_by: string
  notes: string | null
  items: { name: string; list: string; quantity: string; note?: string }[]
  status: 'pending' | 'processing' | 'shipped' | 'cancelled'
  status_updated_at: string | null
  created_at: string
}

export type TrackResult = { order: TrackedOrder; events: OrderEvent[] }

async function call(body: Record<string, unknown>): Promise<TrackResult> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Request failed.')
  return data as TrackResult
}

export function getOrder(ref: string): Promise<TrackResult> {
  return call({ action: 'get', ref })
}

export function setOrderStatus(
  ref: string,
  token: string,
  status: TrackedOrder['status'],
): Promise<TrackResult> {
  return call({ action: 'set', ref, token, status })
}

/** Parse ?ref=&m= out of the hash route (#/track?ref=...&m=...). */
export function parseTrackParams(): { ref: string; manage: string } {
  const hash = window.location.hash
  const qIndex = hash.indexOf('?')
  const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '')
  return { ref: params.get('ref') || '', manage: params.get('m') || '' }
}
