import { useEffect, useState } from 'react'
import {
  getOrder,
  parseTrackParams,
  setOrderStatus,
  type OrderEvent,
  type TrackResult,
  type TrackedOrder,
} from '../lib/tracking'
import { IconSpinner } from '../components/ui'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}
const STATUS_DESC: Record<string, string> = {
  pending: 'Received by the warehouse — not yet started.',
  processing: 'The warehouse is preparing this order.',
  shipped: 'This order has shipped to the job site.',
  cancelled: 'This order was cancelled.',
}
const STATUS_ORDER = ['pending', 'processing', 'shipped']
const SOURCE_LABEL: Record<string, string> = {
  submitted: 'Order submitted',
  warehouse: 'Updated by warehouse',
  office: 'Updated by office',
  system: 'Updated',
}
const LIST_LABEL: Record<string, string> = { lead: 'Lead Job', painting: 'Painting', custom: 'Custom' }

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function StatusStepper({ status }: { status: string }) {
  if (status === 'cancelled') {
    return <div className="track-status-line"><span className="status-badge s-cancelled">Cancelled</span></div>
  }
  const activeIndex = STATUS_ORDER.indexOf(status)
  return (
    <div className="stepper-track">
      {STATUS_ORDER.map((s, i) => (
        <div key={s} className={`step ${i <= activeIndex ? 'done' : ''} ${i === activeIndex ? 'current' : ''}`}>
          <div className="step-dot">{i < activeIndex ? '✓' : i + 1}</div>
          <div className="step-label">{STATUS_LABEL[s]}</div>
        </div>
      ))}
    </div>
  )
}

export function Track(props: { onHome: () => void }) {
  const [{ ref, manage }] = useState(parseTrackParams)
  const [result, setResult] = useState<TrackResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')
  const [actionError, setActionError] = useState('')

  const load = async () => {
    if (!ref) {
      setError('No order reference provided.')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setResult(await getOrder(ref))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this order.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyStatus = async (status: TrackedOrder['status']) => {
    setUpdating(status)
    setActionError('')
    try {
      setResult(await setOrderStatus(ref, manage, status))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update status.')
    } finally {
      setUpdating('')
    }
  }

  if (loading) {
    return (
      <div className="admin-center">
        <IconSpinner size={22} />
        <span style={{ marginTop: 10, color: 'var(--muted)' }}>Loading order…</span>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="track-wrap">
        <div className="card"><div className="card-body">
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>Order not found</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            {error || 'We could not find that order.'} Check the link, or contact the office.
          </p>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={props.onHome}>
            ← Back to FCS OS
          </button>
        </div></div>
      </div>
    )
  }

  const { order, events } = result
  const canManage = manage.length > 0

  return (
    <div className="track-wrap">
      <div className="card">
        <div className="card-head">
          <div>
            <span className="drawer-kind">Material Order</span>
            <div style={{ fontSize: 19, fontWeight: 700 }} className="mono">{order.reference}</div>
          </div>
          <span className={`status-badge s-${order.status}`} style={{ fontSize: 13, padding: '4px 12px' }}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>
        <div className="card-body">
          <StatusStepper status={order.status} />
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, marginTop: 4 }}>
            {STATUS_DESC[order.status]}
            {order.status_updated_at ? ` · Updated ${fmtDateTime(order.status_updated_at)}` : ''}
          </p>

          <div className="track-meta">
            <div><span className="tm-label">Job #</span><span className="mono">{order.job_number}</span></div>
            <div><span className="tm-label">Requested by</span>{order.requested_by}</div>
            <div>
              <span className="tm-label">Site contact</span>
              {order.site_contact}
              {order.site_contact_phone ? <span className="recent-sub">{order.site_contact_phone}</span> : null}
            </div>
            <div><span className="tm-label">Needed by</span>{fmtDate(order.needed_by)}</div>
            <div><span className="tm-label">Submitted</span>{fmtDate(order.created_at)}</div>
            <div><span className="tm-label">Items</span>{order.items?.length ?? 0}</div>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="card-head"><h2>Update shipment status</h2><span className="hint">Warehouse</span></div>
          <div className="card-body">
            <div className="track-actions">
              {(['pending', 'processing', 'shipped', 'cancelled'] as const).map((s) => (
                <button
                  key={s}
                  className={`btn ${order.status === s ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={updating !== '' || order.status === s}
                  onClick={() => applyStatus(s)}
                >
                  {updating === s ? <IconSpinner /> : null} Mark {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            {actionError && <div className="banner banner-error" style={{ marginTop: 14 }}>{actionError}</div>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>Order contents</h2></div>
        <div className="card-body">
          <table className="drawer-items" style={{ width: '100%' }}>
            <thead><tr><th>Item</th><th>List</th><th>Qty</th></tr></thead>
            <tbody>
              {(order.items ?? []).map((it, i) => (
                <tr key={i}>
                  <td>{it.name}{it.note ? <span className="item-note"> — {it.note}</span> : ''}</td>
                  <td>{LIST_LABEL[it.list] ?? it.list}</td>
                  <td className="mono">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>History</h2></div>
        <div className="card-body">
          <Timeline events={events} />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <button className="btn btn-ghost" onClick={props.onHome}>← Back to FCS OS</button>
      </div>
    </div>
  )
}

function Timeline({ events }: { events: OrderEvent[] }) {
  if (events.length === 0) return <p style={{ color: 'var(--faint)' }}>No history yet.</p>
  return (
    <div className="timeline">
      {events.map((e, i) => (
        <div key={i} className="timeline-item">
          <div className="timeline-dot" />
          <div>
            <div className="timeline-title">
              {STATUS_LABEL[e.status] ?? e.status}
              <span className="timeline-source">{SOURCE_LABEL[e.source] ?? e.source}</span>
            </div>
            <div className="timeline-time">{fmtDateTime(e.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
