import { useEffect, useMemo, useState } from 'react'
import {
  fetchMaterials,
  makeReference,
  supabase,
  type MaterialRow,
  type OrderItem,
} from '../lib/supabase'
import { Field, IconSpinner, SuccessScreen } from '../components/ui'

type Tab = 'lead' | 'painting'

type CustomRow = { id: number; name: string; quantity: string }

const LIST_LABEL: Record<string, string> = {
  lead: 'Lead Job',
  painting: 'Painting',
  custom: 'Custom',
}

function todayISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export function MaterialOrder(props: { onHome: () => void }) {
  // catalog
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<Tab>('lead')
  const [search, setSearch] = useState('')

  // order details
  const [jobNumber, setJobNumber] = useState('')
  const [siteContact, setSiteContact] = useState('')
  const [sitePhone, setSitePhone] = useState('')
  const [requestedBy, setRequestedBy] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [notes, setNotes] = useState('')

  // selections: material id -> quantity; notes per id
  const [qty, setQty] = useState<Record<string, number>>({})
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({})
  const [customRows, setCustomRows] = useState<CustomRow[]>([])
  const [nextCustomId, setNextCustomId] = useState(1)

  // submission
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [doneRef, setDoneRef] = useState('')

  const load = () => {
    setLoadError(false)
    fetchMaterials()
      .then(setMaterials)
      .catch(() => setLoadError(true))
  }
  useEffect(load, [])

  const byId = useMemo(() => {
    const m = new Map<string, MaterialRow>()
    materials?.forEach((row) => m.set(row.id, row))
    return m
  }, [materials])

  const visible = useMemo(() => {
    if (!materials) return []
    const q = search.trim().toLowerCase()
    return materials.filter(
      (m) => m.list === tab && (!q || m.name.toLowerCase().includes(q)),
    )
  }, [materials, tab, search])

  const groups = useMemo(() => {
    const g: { label: string; items: MaterialRow[] }[] = []
    const mats = visible.filter((m) => m.grp === 'materials')
    const paper = visible.filter((m) => m.grp === 'paperwork_signs')
    if (mats.length) g.push({ label: 'Materials & Equipment', items: mats })
    if (paper.length) g.push({ label: 'Paperwork & Signs', items: paper })
    return g
  }, [visible])

  const selected = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => ({ row: byId.get(id)!, n }))
        .filter((s) => s.row),
    [qty, byId],
  )

  const customValid = customRows.filter((r) => r.name.trim() && r.quantity.trim())
  const totalLines = selected.length + customValid.length

  const setQuantity = (id: string, n: number) => {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(999, n)) }))
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!jobNumber.trim()) e.jobNumber = 'Job number is required.'
    if (!siteContact.trim()) e.siteContact = 'Site contact is required.'
    if (!requestedBy.trim()) e.requestedBy = 'Your name is required.'
    if (!neededBy) e.neededBy = 'Choose the date materials must ship by.'
    else if (neededBy < todayISO()) e.neededBy = 'Date cannot be in the past.'
    if (totalLines === 0) e.items = 'Add at least one item to the order.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    setSubmitError('')

    const items: OrderItem[] = [
      ...selected.map(({ row, n }) => ({
        name: row.name,
        list: row.list,
        quantity: String(n),
        ...(itemNotes[row.id]?.trim() ? { note: itemNotes[row.id].trim() } : {}),
      })),
      ...customValid.map((r) => ({
        name: r.name.trim(),
        list: 'custom' as const,
        quantity: r.quantity.trim(),
      })),
    ]

    const reference = makeReference('MO')
    const { error } = await supabase.from('material_orders').insert({
      reference,
      job_number: jobNumber.trim(),
      site_contact: siteContact.trim(),
      site_contact_phone: sitePhone.trim() || null,
      requested_by: requestedBy.trim(),
      needed_by: neededBy,
      items,
      notes: notes.trim() || null,
    })

    setSubmitting(false)
    if (error) {
      setSubmitError(
        'The order could not be submitted. Check your connection and try again — if it keeps failing, call the office.',
      )
      return
    }
    setDoneRef(reference)
    window.scrollTo(0, 0)
  }

  const reset = () => {
    setDoneRef('')
    setQty({})
    setItemNotes({})
    setCustomRows([])
    setNotes('')
    setNeededBy('')
    setSearch('')
    setErrors({})
  }

  if (doneRef) {
    return (
      <SuccessScreen
        title="Order submitted"
        reference={doneRef}
        message="The warehouse has been notified by email and will prepare your shipment for the requested date. Keep this reference for follow-up."
        onReset={reset}
        onHome={props.onHome}
      />
    )
  }

  return (
    <div className="order-layout">
      <div>
        {Object.keys(errors).length > 0 && (
          <div className="banner banner-error">
            Please fix the highlighted fields{errors.items ? ` — ${errors.items}` : ''}.
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Order details</h2>
            <span className="hint">Matches the paper order sheet header</span>
          </div>
          <div className="card-body">
            <div className="grid cols-2">
              <Field label="Job #" required error={errors.jobNumber}>
                <input
                  className={`input mono ${errors.jobNumber ? 'invalid' : ''}`}
                  value={jobNumber}
                  onChange={(e) => setJobNumber(e.target.value)}
                  placeholder="e.g. 26-1042"
                  maxLength={60}
                />
              </Field>
              <Field label="Requested by" required error={errors.requestedBy}>
                <input
                  className={`input ${errors.requestedBy ? 'invalid' : ''}`}
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Your name"
                  maxLength={120}
                />
              </Field>
              <Field label="Site contact" required error={errors.siteContact}>
                <input
                  className={`input ${errors.siteContact ? 'invalid' : ''}`}
                  value={siteContact}
                  onChange={(e) => setSiteContact(e.target.value)}
                  placeholder="Who receives the delivery"
                  maxLength={120}
                />
              </Field>
              <Field label="Site contact phone">
                <input
                  className="input"
                  value={sitePhone}
                  onChange={(e) => setSitePhone(e.target.value)}
                  placeholder="(555) 555-0100"
                  maxLength={40}
                  inputMode="tel"
                />
              </Field>
              <Field
                label="Needed by (ship-out date)"
                required
                error={errors.neededBy}
                help="Date the order must leave the warehouse."
              >
                <input
                  type="date"
                  className={`input ${errors.neededBy ? 'invalid' : ''}`}
                  value={neededBy}
                  min={todayISO()}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </Field>
              <Field label="Order notes">
                <input
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery instructions, gate codes, etc."
                  maxLength={500}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Materials</h2>
            <span className="hint">Set a quantity to add an item</span>
          </div>
          <div className="card-body">
            <div className="catalog-toolbar">
              <div className="segmented">
                <button className={tab === 'lead' ? 'on' : ''} onClick={() => setTab('lead')}>
                  Lead Job Order List
                </button>
                <button
                  className={tab === 'painting' ? 'on' : ''}
                  onClick={() => setTab('painting')}
                >
                  Painting Order List
                </button>
              </div>
              <input
                className="input"
                placeholder="Search materials…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="catalog-count">
                {materials ? `${visible.length} items` : ''}
              </span>
            </div>

            {loadError && (
              <div className="banner banner-error">
                Could not load the materials catalog.{' '}
                <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={load}>
                  Retry
                </button>
              </div>
            )}

            {!materials && !loadError && (
              <div className="item-list">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 50 }} />
                ))}
              </div>
            )}

            {materials &&
              groups.map((g) => (
                <div key={g.label}>
                  <div className="section-label">{g.label}</div>
                  <div className="item-list">
                    {g.items.map((m) => {
                      const n = qty[m.id] ?? 0
                      return (
                        <div key={m.id} className={`item-row ${n > 0 ? 'selected' : ''}`}>
                          <span className="item-name">
                            {m.name}
                            {m.detail && <span className="item-detail">{m.detail}</span>}
                          </span>
                          <span className="stepper">
                            <button aria-label={`Remove one ${m.name}`} onClick={() => setQuantity(m.id, n - 1)}>−</button>
                            <input
                              value={n === 0 ? '' : n}
                              inputMode="numeric"
                              placeholder="0"
                              aria-label={`Quantity of ${m.name}`}
                              onChange={(e) => {
                                const v = parseInt(e.target.value.replace(/\D/g, ''), 10)
                                setQuantity(m.id, Number.isNaN(v) ? 0 : v)
                              }}
                            />
                            <button aria-label={`Add one ${m.name}`} onClick={() => setQuantity(m.id, n + 1)}>+</button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

            {materials && visible.length === 0 && (
              <p style={{ color: 'var(--faint)', padding: '12px 0' }}>
                No materials match “{search}”. Add it as a custom item below.
              </p>
            )}

            <div className="section-label">Custom / Misc items</div>
            {customRows.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Item not on the lists"
                  value={r.name}
                  maxLength={120}
                  onChange={(e) =>
                    setCustomRows((rows) =>
                      rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="input"
                  style={{ width: 110 }}
                  placeholder="Qty"
                  value={r.quantity}
                  maxLength={20}
                  onChange={(e) =>
                    setCustomRows((rows) =>
                      rows.map((x) => (x.id === r.id ? { ...x, quantity: e.target.value } : x)),
                    )
                  }
                />
                <button
                  className="btn btn-ghost"
                  aria-label="Remove custom item"
                  onClick={() => setCustomRows((rows) => rows.filter((x) => x.id !== r.id))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn btn-secondary"
              onClick={() => {
                setCustomRows((rows) => [...rows, { id: nextCustomId, name: '', quantity: '' }])
                setNextCustomId((n) => n + 1)
              }}
            >
              + Add custom item
            </button>
          </div>
        </div>
      </div>

      {/* ---- Summary ---- */}
      <div className="summary">
        <div className="card">
          <div className="card-head">
            <h2>Order summary</h2>
            <span className="hint">
              {totalLines} line{totalLines === 1 ? '' : 's'}
            </span>
          </div>
          <div className="card-body">
            {totalLines === 0 && (
              <p className="summary-empty">
                No items yet. Set quantities in the materials list to build the order.
              </p>
            )}
            <div className="summary-items">
              {selected.map(({ row, n }) => (
                <div key={row.id} className="summary-row">
                  <span className="qty">{n}</span>
                  <span className="nm">
                    {row.name}
                    <span className="src">{LIST_LABEL[row.list]}</span>
                    <input
                      className="note-input"
                      placeholder="Line note (size, brand…)"
                      value={itemNotes[row.id] ?? ''}
                      maxLength={200}
                      onChange={(e) =>
                        setItemNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                    />
                  </span>
                  <button
                    className="btn btn-ghost"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => setQuantity(row.id, 0)}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {customValid.map((r) => (
                <div key={`c${r.id}`} className="summary-row">
                  <span className="qty">{r.quantity}</span>
                  <span className="nm">
                    {r.name}
                    <span className="src">Custom</span>
                  </span>
                </div>
              ))}
            </div>

            {submitError && <div className="banner banner-error" style={{ marginTop: 14 }}>{submitError}</div>}

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 16 }}
              disabled={submitting}
              onClick={submit}
            >
              {submitting ? (
                <>
                  <IconSpinner /> Submitting…
                </>
              ) : (
                'Submit order'
              )}
            </button>
            <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 10, lineHeight: 1.5 }}>
              The warehouse is notified by email the moment you submit.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
