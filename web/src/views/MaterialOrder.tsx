import { useEffect, useMemo, useState } from 'react'
import {
  fetchCategories,
  fetchMaterials,
  makeReference,
  supabase,
  type CategoryRow,
  type MaterialRow,
  type OrderItem,
} from '../lib/supabase'
import { Field, IconSpinner, SuccessScreen } from '../components/ui'

type CustomRow = { id: number; name: string; quantity: string }

function fallbackCategories(materials: MaterialRow[]): CategoryRow[] {
  const seen = new Set<string>()
  const rows: CategoryRow[] = []
  for (const material of materials) {
    if (seen.has(material.list)) continue
    seen.add(material.list)
    rows.push({
      id: material.list,
      slug: material.list,
      name: material.list
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      sort_order: rows.length + 1,
    })
  }
  return rows
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
  const [categories, setCategories] = useState<CategoryRow[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<string>('')
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
  const [doneRow, setDoneRow] = useState<Record<string, unknown> | null>(null)

  const load = () => {
    setLoadError(false)
    Promise.allSettled([fetchMaterials(), fetchCategories()])
      .then(([materialsResult, categoriesResult]) => {
        if (materialsResult.status === 'rejected') {
          throw materialsResult.reason
        }
        const mats = materialsResult.value
        const cats =
          categoriesResult.status === 'fulfilled' && categoriesResult.value.length > 0
            ? categoriesResult.value
            : fallbackCategories(mats)
        setMaterials(mats)
        setCategories(cats)
        setTab((prev) =>
          prev && cats.some((cat) => cat.slug === prev) ? prev : cats[0]?.slug || '',
        )
      })
      .catch(() => setLoadError(true))
  }
  useEffect(load, [])

  const categoryName = useMemo(() => {
    const m = new Map<string, string>()
    categories?.forEach((c) => m.set(c.slug, c.name))
    return m
  }, [categories])

  const byId = useMemo(() => {
    const m = new Map<string, MaterialRow>()
    materials?.forEach((row) => m.set(row.id, row))
    return m
  }, [materials])

  const visible = useMemo(() => {
    if (!materials) return []
    const q = search.trim().toLowerCase()
    const currentTab = tab || categories?.[0]?.slug || ''
    return materials.filter(
      (m) => m.list === currentTab && (!q || m.name.toLowerCase().includes(q)),
    )
  }, [materials, categories, tab, search])

  const groups = useMemo(() => {
    const order: string[] = []
    const byGrp = new Map<string, MaterialRow[]>()
    for (const m of visible) {
      if (!byGrp.has(m.grp)) {
        byGrp.set(m.grp, [])
        order.push(m.grp)
      }
      byGrp.get(m.grp)!.push(m)
    }
    return order.map((label) => ({ label, items: byGrp.get(label)! }))
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
        list: categoryName.get(row.list) ?? row.list,
        quantity: String(n),
        ...(itemNotes[row.id]?.trim() ? { note: itemNotes[row.id].trim() } : {}),
      })),
      ...customValid.map((r) => ({
        name: r.name.trim(),
        list: 'Custom',
        quantity: r.quantity.trim(),
      })),
    ]

    const reference = makeReference('MO')
    const payload = {
      reference,
      job_number: jobNumber.trim(),
      site_contact: siteContact.trim(),
      site_contact_phone: sitePhone.trim() || null,
      requested_by: requestedBy.trim(),
      needed_by: neededBy,
      items,
      notes: notes.trim() || null,
    }
    const { error } = await supabase.from('material_orders').insert(payload)

    setSubmitting(false)
    if (error) {
      setSubmitError(
        'The order could not be submitted. Check your connection and try again — if it keeps failing, call the office.',
      )
      return
    }
    setDoneRow({ ...payload, status: 'pending', created_at: new Date().toISOString() })
    setDoneRef(reference)
    window.scrollTo(0, 0)
  }

  const reset = () => {
    setDoneRef('')
    setDoneRow(null)
    setQty({})
    setItemNotes({})
    setCustomRows([])
    setNotes('')
    setNeededBy('')
    setSearch('')
    setErrors({})
  }

  if (doneRef && doneRow) {
    return (
      <SuccessScreen
        title="Order submitted"
        reference={doneRef}
        message="The warehouse has been notified by email and will prepare your shipment for the requested date. Keep this reference for follow-up."
        onReset={reset}
        onHome={props.onHome}
        exportKind="material_order"
        exportRow={doneRow}
        trackHref={`#/track?ref=${encodeURIComponent(doneRef)}`}
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
                {categories?.map((c) => (
                  <button
                    key={c.slug}
                    className={tab === c.slug ? 'on' : ''}
                    onClick={() => setTab(c.slug)}
                  >
                    {c.name}
                  </button>
                ))}
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
                    <span className="src">{categoryName.get(row.list) ?? row.list}</span>
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
