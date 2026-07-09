import { useEffect, useMemo, useState } from 'react'
import { getRecentOrders, type TrackedOrder } from '../lib/tracking'
import { IconSpinner } from '../components/ui'

const STATUS_LABEL: Record<TrackedOrder['status'], string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function searchable(order: TrackedOrder): string {
  return [
    order.reference,
    order.job_number,
    order.requested_by,
    order.site_contact,
    order.site_contact_phone,
    order.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function RecentOrders() {
  const [orders, setOrders] = useState<TrackedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getRecentOrders()
      setOrders(result.orders)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recent orders.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((order) => searchable(order).includes(q))
  }, [orders, query])

  const openOrder = (reference: string) => {
    window.location.hash = `/track?ref=${encodeURIComponent(reference)}`
    window.scrollTo(0, 0)
  }

  return (
    <div className="recent-wrap">
      <div className="recent-toolbar">
        <input
          className="input"
          placeholder="Search job #, requester, contact, or reference..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <IconSpinner /> : null} Refresh
        </button>
      </div>

      {error && (
        <div className="banner banner-error">
          {error}
          <button className="btn btn-secondary" style={{ marginLeft: 10 }} onClick={load}>
            Retry
          </button>
        </div>
      )}

      {loading && !error ? (
        <div className="recent-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 96 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="card-body admin-empty">
            {orders.length === 0 ? 'No material orders have been submitted yet.' : 'No orders match that search.'}
          </div>
        </div>
      ) : (
        <div className="recent-list">
          {filtered.map((order) => (
            <button
              key={order.reference}
              className="recent-order-card"
              onClick={() => openOrder(order.reference)}
            >
              <div className="recent-order-main">
                <div>
                  <div className="recent-ref mono">{order.reference}</div>
                  <div className="recent-title">
                    Job <span className="mono">{order.job_number}</span>
                  </div>
                </div>
                <span className={`status-badge s-${order.status}`}>{STATUS_LABEL[order.status]}</span>
              </div>

              <div className="recent-grid">
                <div>
                  <span className="tm-label">Requested by</span>
                  {order.requested_by}
                </div>
                <div>
                  <span className="tm-label">Site contact</span>
                  {order.site_contact}
                  {order.site_contact_phone ? <span className="recent-sub">{order.site_contact_phone}</span> : null}
                </div>
                <div>
                  <span className="tm-label">Needed by</span>
                  {fmtDate(order.needed_by)}
                </div>
                <div>
                  <span className="tm-label">Submitted</span>
                  {fmtDateTime(order.created_at)}
                </div>
                <div>
                  <span className="tm-label">Items</span>
                  {order.items?.length ?? 0}
                </div>
              </div>
              <div className="recent-open">Open status page &gt;</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
