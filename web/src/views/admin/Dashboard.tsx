import { useEffect, useMemo, useState } from 'react'
import {
  changePassword,
  updateOrderStatus,
  type AdminData,
  type MaterialOrder,
  type QCReport,
  type Timesheet,
} from '../../lib/admin'
import {
  exportListCsv,
  exportListExcel,
  exportSubmissionCsv,
  exportSubmissionExcel,
  type ExportKind,
} from '../../lib/export'
import { normalizeDailyQCData, yesNoLabel } from '../../lib/qc'
import { IconDownload, IconSpinner } from '../../components/ui'
import { MaterialsManager } from './MaterialsManager'

type Tab = 'material_orders' | 'timesheets' | 'qc_reports'
type Range = 'today' | 'week' | 'month' | 'all'

const TAB_LABEL: Record<Tab, string> = {
  material_orders: 'Material Orders',
  timesheets: 'Timesheets',
  qc_reports: 'QC Reports',
}
const TAB_KIND: Record<Tab, ExportKind> = {
  material_orders: 'material_order',
  timesheets: 'timesheet',
  qc_reports: 'qc_report',
}
const ORDER_STATUSES: MaterialOrder['status'][] = ['pending', 'processing', 'shipped', 'cancelled']
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
function fmtTime(t: string | null): string {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`
}

function rangeStart(range: Range): number {
  if (range === 'all') return 0
  const now = new Date()
  if (range === 'today') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return d.getTime()
  }
  const days = range === 'week' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

type AnyRecord = MaterialOrder | Timesheet | QCReport

function dailyQC(q: QCReport) {
  return normalizeDailyQCData(q.details)
}

function searchText(tab: Tab, r: AnyRecord): string {
  if (tab === 'material_orders') {
    const o = r as MaterialOrder
    return [o.reference, o.job_number, o.requested_by, o.site_contact, o.status].join(' ').toLowerCase()
  }
  if (tab === 'timesheets') {
    const t = r as Timesheet
    const names = (t.employees ?? []).map((e) => e.name).join(' ')
    return [t.reference, t.job_number, t.job_name, t.written_by, t.shift, names].join(' ').toLowerCase()
  }
  const q = r as QCReport
  const d = dailyQC(q)
  return [q.reference, d.project || q.job_number, d.contract_number, d.qc_supervisor_print || q.inspector_name, d.ambient_location, d.description_of_areas_locations_work_performed].join(' ').toLowerCase()
}

export function Dashboard(props: {
  data: AdminData
  onRefresh: () => Promise<void>
  onSignOut: () => void
}) {
  const [local, setLocal] = useState<AdminData>(props.data)
  const [tab, setTab] = useState<Tab>('material_orders')
  const [range, setRange] = useState<Range>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AnyRecord | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [showMaterials, setShowMaterials] = useState(false)

  useEffect(() => setLocal(props.data), [props.data])

  const rowsForTab = local[tab] as AnyRecord[]

  const filtered = useMemo(() => {
    const start = rangeStart(range)
    const q = search.trim().toLowerCase()
    return rowsForTab.filter((r) => {
      if (new Date(r.created_at).getTime() < start) return false
      if (q && !searchText(tab, r).includes(q)) return false
      return true
    })
  }, [rowsForTab, range, search, tab])

  // stats
  const stats = useMemo(() => {
    const startToday = rangeStart('today')
    const startWeek = rangeStart('week')
    const all = [...local.material_orders, ...local.timesheets, ...local.qc_reports]
    const submittedToday = all.filter((r) => new Date(r.created_at).getTime() >= startToday).length
    const thisWeek = all.filter((r) => new Date(r.created_at).getTime() >= startWeek).length
    const pending = local.material_orders.filter((o) => o.status === 'pending').length
    return { submittedToday, pending, thisWeek, total: all.length }
  }, [local])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await props.onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const changeStatus = async (order: MaterialOrder, status: MaterialOrder['status']) => {
    const updated = await updateOrderStatus(order.id, status)
    setLocal((prev) => ({
      ...prev,
      material_orders: prev.material_orders.map((o) => (o.id === order.id ? updated : o)),
    }))
    setSelected((s) => (s && 'status' in s && s.id === order.id ? updated : s))
  }

  if (showMaterials) {
    return (
      <div className="admin">
        <MaterialsManager onClose={() => setShowMaterials(false)} />
      </div>
    )
  }

  return (
    <div className="admin">
      <div className="admin-topline">
        <div>
          <h2 className="admin-title">Operations Dashboard</h2>
          <p className="admin-subtitle">Live view of every submission across FCS OS.</p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? <IconSpinner /> : <RefreshIcon />} Refresh
          </button>
          <button className="btn btn-secondary" onClick={() => setShowMaterials(true)}>
            Manage materials
          </button>
          <button className="btn btn-secondary" onClick={() => setShowPwd(true)}>
            Change password
          </button>
          <button className="btn btn-secondary" onClick={props.onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="stat-row">
        <StatTile label="Submitted today" value={stats.submittedToday} accent />
        <StatTile label="Pending orders" value={stats.pending} />
        <StatTile label="This week" value={stats.thisWeek} />
        <StatTile label="Total records" value={stats.total} />
      </div>

      <div className="admin-tabs">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            className={`admin-tab ${tab === t ? 'on' : ''}`}
            onClick={() => {
              setTab(t)
              setSelected(null)
            }}
          >
            {TAB_LABEL[t]}
            <span className="tab-count">{local[t].length}</span>
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <div className="segmented">
          {(['today', 'week', 'month', 'all'] as Range[]).map((r) => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {r === 'today' ? 'Today' : r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All'}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Search job #, name, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="admin-result-count">{filtered.length} shown</span>
        <div className="admin-export">
          <button
            className="btn btn-secondary"
            disabled={filtered.length === 0}
            onClick={() => exportListExcel(TAB_KIND[tab], filtered)}
          >
            <IconDownload /> Excel
          </button>
          <button
            className="btn btn-secondary"
            disabled={filtered.length === 0}
            onClick={() => exportListCsv(TAB_KIND[tab], filtered)}
          >
            <IconDownload /> CSV
          </button>
        </div>
      </div>

      <div className="card admin-table-card">
        {filtered.length === 0 ? (
          <div className="admin-empty">No records match the current filter.</div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>{renderHead(tab)}</thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className={selected?.id === r.id ? 'sel' : ''}>
                    {renderRow(tab, r, changeStatus)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailDrawer
          tab={tab}
          record={selected}
          onClose={() => setSelected(null)}
          onChangeStatus={changeStatus}
        />
      )}

      {showPwd && <ChangePasswordModal onClose={() => setShowPwd(false)} />}
    </div>
  )
}

/* ---- table rendering ------------------------------------------------------ */

function renderHead(tab: Tab) {
  if (tab === 'material_orders') {
    return (
      <tr>
        <th>Reference</th><th>Submitted</th><th>Job #</th><th>Requested by</th>
        <th>Needed by</th><th>Items</th><th>Status</th>
      </tr>
    )
  }
  if (tab === 'timesheets') {
    return (
      <tr>
        <th>Reference</th><th>Submitted</th><th>Job #</th><th>Work date</th>
        <th>Shift</th><th>Crew</th><th>Man-hrs</th><th>Flags</th>
      </tr>
    )
  }
  return (
    <tr>
      <th>Reference</th><th>Submitted</th><th>Project</th><th>QC supervisor</th>
      <th>Work / location</th><th>Contract no.</th>
    </tr>
  )
}

function renderRow(
  tab: Tab,
  r: AnyRecord,
  changeStatus: (o: MaterialOrder, s: MaterialOrder['status']) => void,
) {
  if (tab === 'material_orders') {
    const o = r as MaterialOrder
    return (
      <>
        <td className="mono">{o.reference}</td>
        <td>{fmtDateTime(o.created_at)}</td>
        <td className="mono">{o.job_number}</td>
        <td>{o.requested_by}</td>
        <td>{fmtDate(o.needed_by)}</td>
        <td>{Array.isArray(o.items) ? o.items.length : 0}</td>
        <td onClick={(e) => e.stopPropagation()}>
          <select
            className="status-select"
            value={o.status}
            onChange={(e) => changeStatus(o, e.target.value as MaterialOrder['status'])}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </td>
      </>
    )
  }
  if (tab === 'timesheets') {
    const t = r as Timesheet
    return (
      <>
        <td className="mono">{t.reference}</td>
        <td>{fmtDateTime(t.created_at)}</td>
        <td className="mono">{t.job_number}</td>
        <td>{fmtDate(t.work_date)}</td>
        <td>{t.shift ?? '—'}</td>
        <td>{t.employees?.length ?? 0}</td>
        <td className="mono">{t.total_hours}</td>
        <td>
          {t.injuries && <span className="result-badge r-fail" style={{ marginRight: 4 }}>Injury</span>}
          {t.work_stoppage && <span className="result-badge r-pass_with_notes">Stoppage</span>}
          {!t.injuries && !t.work_stoppage && <span style={{ color: 'var(--faint)' }}>—</span>}
        </td>
      </>
    )
  }
  const q = r as QCReport
  const d = dailyQC(q)
  return (
    <>
      <td className="mono">{q.reference}</td>
      <td>{fmtDateTime(q.created_at)}</td>
      <td className="mono">{d.project || q.job_number}</td>
      <td>{d.qc_supervisor_print || q.inspector_name}</td>
      <td className="truncate">{d.description_of_areas_locations_work_performed || d.ambient_location || q.area_inspected}</td>
      <td>{d.contract_number || '—'}</td>
    </>
  )
}

/* ---- detail drawer -------------------------------------------------------- */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="drawer-row">
      <span className="drawer-label">{label}</span>
      <span className="drawer-value">{value}</span>
    </div>
  )
}

function DetailDrawer(props: {
  tab: Tab
  record: AnyRecord
  onClose: () => void
  onChangeStatus: (o: MaterialOrder, s: MaterialOrder['status']) => void
}) {
  const { tab, record } = props
  const kind = TAB_KIND[tab]

  return (
    <div className="drawer-backdrop" onClick={props.onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="drawer-kind">{TAB_LABEL[tab]}</div>
            <div className="drawer-ref mono">{record.reference}</div>
          </div>
          <button className="drawer-close" onClick={props.onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {tab === 'material_orders' && <OrderDetail o={record as MaterialOrder} onChangeStatus={props.onChangeStatus} />}
          {tab === 'timesheets' && <TimesheetDetail t={record as Timesheet} />}
          {tab === 'qc_reports' && <QCDetail q={record as QCReport} />}
        </div>

        <div className="drawer-foot">
          <span className="drawer-foot-label">Export this record</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => exportSubmissionExcel(kind, record as unknown as Record<string, unknown>)}>
              <IconDownload /> Excel
            </button>
            <button className="btn btn-secondary" onClick={() => exportSubmissionCsv(kind, record as unknown as Record<string, unknown>)}>
              <IconDownload /> CSV
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function OrderDetail({ o, onChangeStatus }: {
  o: MaterialOrder
  onChangeStatus: (o: MaterialOrder, s: MaterialOrder['status']) => void
}) {
  const LIST_LABEL: Record<string, string> = { lead: 'Lead Job', painting: 'Painting', custom: 'Custom' }
  return (
    <>
      <Row label="Status" value={
        <select className="status-select" value={o.status}
          onChange={(e) => onChangeStatus(o, e.target.value as MaterialOrder['status'])}>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      } />
      <Row label="Submitted" value={fmtDateTime(o.created_at)} />
      <Row label="Job #" value={<span className="mono">{o.job_number}</span>} />
      <Row label="Site contact" value={o.site_contact + (o.site_contact_phone ? ` · ${o.site_contact_phone}` : '')} />
      <Row label="Requested by" value={o.requested_by} />
      <Row label="Needed by" value={fmtDate(o.needed_by)} />
      <Row label="Notes" value={o.notes} />
      <div className="drawer-section">Items ({o.items?.length ?? 0})</div>
      <table className="drawer-items">
        <thead><tr><th>Item</th><th>List</th><th>Qty</th></tr></thead>
        <tbody>
          {(o.items ?? []).map((it, i) => (
            <tr key={i}>
              <td>{it.name}{it.note ? <span className="item-note"> — {it.note}</span> : ''}</td>
              <td>{LIST_LABEL[it.list] ?? it.list}</td>
              <td className="mono">{it.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function YesNoValue({ on, note }: { on: boolean; note?: string | null }) {
  return (
    <span>
      <strong style={{ color: on ? 'var(--danger)' : 'var(--muted)' }}>{on ? 'Yes' : 'No'}</strong>
      {on && note ? ` — ${note}` : ''}
    </span>
  )
}

function TimesheetDetail({ t }: { t: Timesheet }) {
  return (
    <>
      <Row label="Submitted" value={fmtDateTime(t.created_at)} />
      <Row label="Job #" value={<span className="mono">{t.job_number}</span>} />
      <Row label="Job name" value={t.job_name} />
      <Row label="Written by" value={t.written_by} />
      <Row label="Work date" value={fmtDate(t.work_date)} />
      <Row label="Shift" value={t.shift} />
      <Row label="Job floor / area" value={t.job_floor} />
      <Row label="Weather / temp" value={t.weather} />
      <Row label="Total man-hours" value={<strong>{t.total_hours}</strong>} />

      <div className="drawer-section">Crew ({t.employees?.length ?? 0})</div>
      <table className="drawer-items">
        <thead>
          <tr><th>Employee</th><th>In–Out</th><th>Reg</th><th>OT</th><th>PT</th><th>Total</th><th>Location</th><th>Work</th><th>Code</th></tr>
        </thead>
        <tbody>
          {(t.employees ?? []).map((e, i) => (
            <tr key={i}>
              <td>{e.name}</td>
              <td className="mono">{fmtTime(e.time_in)}–{fmtTime(e.time_out)}</td>
              <td className="mono">{e.reg_hours}</td>
              <td className="mono">{e.ot_hours || '—'}</td>
              <td className="mono">{e.pt_hours || '—'}</td>
              <td className="mono"><strong>{e.total}</strong></td>
              <td>{e.location_of_work || '—'}</td>
              <td>{e.type_of_work || '—'}</td>
              <td className="mono">{e.code || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="drawer-section">Site conditions</div>
      <Row label="Pre-task" value={<YesNoValue on={t.pre_task} />} />
      <Row label="Inspections" value={<YesNoValue on={t.inspections} note={t.inspections_note} />} />
      <Row label="Slip work" value={<YesNoValue on={t.slip_work} />} />
      <Row label="Work stoppage" value={<YesNoValue on={t.work_stoppage} note={t.work_stoppage_note} />} />
      <Row label="Injuries" value={<YesNoValue on={t.injuries} note={t.injuries_note} />} />

      <div className="drawer-section">Notes</div>
      <Row label="Work performed" value={t.work_performed} />
      <Row label="Additional notes" value={t.notes} />
    </>
  )
}

function QCDetail({ q }: { q: QCReport }) {
  const d = dailyQC(q)
  return (
    <>
      <Row label="Submitted" value={fmtDateTime(q.created_at)} />
      <Row label="Date / Day" value={`${fmtDate(q.report_date)}${d.day_of_week ? ` · ${d.day_of_week}` : ''}`} />
      <Row label="Project" value={<span className="mono">{d.project || q.job_number}</span>} />
      <Row label="Contract No." value={d.contract_number} />
      <Row label="Weather AM / PM" value={`${d.weather_am || '—'} / ${d.weather_pm || '—'}`} />
      <Row label="Workers / Start / Stop" value={`${d.workers_on_site || '—'} / ${d.start_time || '—'} / ${d.stop_time || '—'}`} />

      <div className="drawer-section">Ambient conditions</div>
      <Row label="Location" value={d.ambient_location || q.area_inspected} />
      {d.ambient_readings.map((item, i) => (
        <Row key={i} label={`Reading ${i + 1}`} value={`Time ${item.time || '—'} · RH ${item.relative_humidity || '—'}% · Air ${item.air_temperature || '—'}°F · Surface ${item.surface_temperature || '—'}°F · Dew point ${item.dew_point || '—'}°F · Depression ${item.surface_dew_point_depression || '—'}`} />
      ))}

      <div className="drawer-section">Instrument record</div>
      {d.instruments.map((item, i) => item.instrument || item.serial_number || item.calibrated ? (
        <Row key={i} label={`Instrument ${i + 1}`} value={`${item.instrument || '—'} · S/N ${item.serial_number || '—'} · Calibrated ${yesNoLabel(item.calibrated) || '—'} · Checks: ${[item.standard_reading_1, item.standard_reading_2, item.standard_reading_3].filter(Boolean).join(' / ') || '—'}`} />
      ) : null)}
      <Row label="Equipment inspected within 12 months" value={yesNoLabel(d.equipment_inspected_within_12_months)} />

      <div className="drawer-section">Preparation &amp; safety</div>
      <Row label="Work performed" value={d.description_of_areas_locations_work_performed || q.work_inspected} />
      <Row label="SSPC preparation required / performed" value={`${d.surface_preparation_required || '—'} / ${d.surface_preparation_performed || '—'}`} />
      <Row label="Surface profile required / achieved" value={`${d.surface_profile_required || '—'} / ${d.surface_profile_achieved || '—'}`} />
      <Row label="Preparation method" value={[...d.surface_preparation_methods, d.surface_preparation_other].filter(Boolean).join(', ')} />
      <Row label="Surface clean & moisture free" value={yesNoLabel(d.surface_clean_moisture_free)} />
      <Row label="Do not proceed explanation" value={d.do_not_proceed_explanation} />
      <Row label="Hazardous waste generated / stored" value={`${yesNoLabel(d.hazardous_waste_generated) || '—'} / ${yesNoLabel(d.hazardous_waste_properly_stored_identified) || '—'}`} />
      <Row label="Sharp edges & weld splatter removed" value={yesNoLabel(d.sharp_edges_weld_splatter_removed)} />
      <Row label="Clean & dry abrasive" value={yesNoLabel(d.clean_dry_abrasive)} />
      <Row label="Abrasive type & size" value={d.abrasive_type_size} />
      <Row label="Compressed air check / Nozzle air pressure / Blotter test" value={`${yesNoLabel(d.compressed_air_check) || '—'} / ${d.nozzle_air_pressure || '—'} / ${yesNoLabel(d.blotter_test) || '—'}`} />
      <Row label="Safety issues / Field office copy" value={`${yesNoLabel(d.safety_issues_occurred) || '—'} / ${yesNoLabel(d.safety_issue_copy_sent_to_field_office) || '—'}`} />
      <Row label="Proper PPE / Pre-start safety talks" value={`${yesNoLabel(d.workers_wearing_proper_ppe) || '—'} / ${yesNoLabel(d.pre_start_safety_talks_performed) || '—'}`} />

      {d.coating_applications.map((application, i) => (
        <div key={i}>
          <div className="drawer-section">Coating application {i + 1}</div>
          <Row label="Location(s)" value={application.application_locations} />
          <Row label="Coating / mix acceptable" value={`${[...application.coatings, application.coating_other].filter(Boolean).join(', ') || '—'} / ${yesNoLabel(application.mix_witnessed_acceptable) || '—'}`} />
          <Row label="Manufacturer / Product / Kit" value={`${application.manufacturer || '—'} / ${application.product_name || '—'} / ${application.kit_size_color || '—'}`} />
          <Row label="Batch / Lot #" value={application.batch_lot_numbers.filter(Boolean).join(' / ')} />
          <Row label="Parts / Material Temps / Mix Times" value={`${application.parts.filter(Boolean).join(' / ') || '—'} · ${application.material_temperatures.filter(Boolean).join(' / ') || '—'} °F · ${application.mix_times.filter(Boolean).join(' / ') || '—'}`} />
          <Row label="Shelf life / Reducer / Pot life" value={`${application.shelf_life || '—'} / ${application.reducer || '—'} ${application.reducer_number || ''} / ${application.pot_life || '—'}`} />
          <Row label="Application method / Gallons" value={`${application.application_methods.join(', ') || '—'} / ${application.total_gallons_applied || '—'}`} />
          <Row label="Required / Average WFT" value={`${application.required_wft || '—'} / ${application.average_wft || '—'}`} />
          <Row label="WFT readings" value={application.wft_readings.filter(Boolean).join(' / ')} />
        </div>
      ))}
      <div className="drawer-section">Comments &amp; signoff</div>
      <Row label="Surface preparation comments" value={d.surface_preparation_comments || q.observations} />
      <Row label="Coating comments" value={d.coating_comments} />
      <Row label="Light meter" value={`${d.light_meter_serial_number || '—'} · ${d.light_readings.map((reading, i) => `${i + 1}: ${reading.foot_candles || '—'} FC / ${reading.time || '—'}`).join(' · ')}`} />
      <Row label="Competent person print / sign" value={`${d.competent_person_print || '—'} / ${d.competent_person_signature || '—'}`} />
      <Row label="QC supervisor print / sign" value={`${d.qc_supervisor_print || '—'} / ${d.qc_supervisor_signature || '—'}`} />
    </>
  )
}

/* ---- change password modal ------------------------------------------------ */

function ChangePasswordModal(props: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next.length < 8) return setError('New password must be at least 8 characters.')
    if (next !== confirm) return setError('New passwords do not match.')
    setBusy(true)
    try {
      await changePassword(current, next)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="drawer-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-kind">Change admin password</div>
          <button className="drawer-close" onClick={props.onClose} aria-label="Close">✕</button>
        </div>
        {done ? (
          <div style={{ padding: 24 }}>
            <p style={{ marginBottom: 18 }}>Password updated. It takes effect on the next sign-in.</p>
            <button className="btn btn-primary" onClick={props.onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Current password</label>
              <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>New password</label>
              <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
              <span className="help">At least 8 characters.</span>
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="field-error">{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={props.onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy || !current || !next}>
                {busy ? <><IconSpinner /> Saving…</> : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* ---- small components ----------------------------------------------------- */

function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`stat-tile ${accent ? 'accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11a8 8 0 0 0-14.3-3.7M4 5v4h4" />
    <path d="M4 13a8 8 0 0 0 14.3 3.7M20 19v-4h-4" />
  </svg>
)
