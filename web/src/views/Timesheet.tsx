import { useMemo, useState } from 'react'
import { makeReference, supabase } from '../lib/supabase'
import { Field, IconSpinner, SuccessScreen } from '../components/ui'

function todayISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Regular hours from clock times minus break. Handles overnight shifts. */
function regHours(timeIn: string, timeOut: string, breakMin: number): number {
  if (!timeIn || !timeOut) return 0
  const [h1, m1] = timeIn.split(':').map(Number)
  const [h2, m2] = timeOut.split(':').map(Number)
  let mins = h2 * 60 + m2 - (h1 * 60 + m1)
  if (mins <= 0) mins += 24 * 60
  mins -= breakMin
  if (mins <= 0) return 0
  return Math.round((mins / 60) * 100) / 100
}

type EmpRow = {
  id: number
  name: string
  timeIn: string
  timeOut: string
  breakMin: string
  ot: string
  pt: string
}

function newEmp(id: number): EmpRow {
  return { id, name: '', timeIn: '', timeOut: '', breakMin: '30', ot: '', pt: '' }
}

function empTotal(e: EmpRow): number {
  const reg = regHours(e.timeIn, e.timeOut, parseInt(e.breakMin, 10) || 0)
  return Math.round((reg + (parseFloat(e.ot) || 0) + (parseFloat(e.pt) || 0)) * 100) / 100
}

/** A Yes/No control with an optional detail field shown when "Yes". */
function YesNo(props: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  detail?: string
  onDetail?: (v: string) => void
  detailPlaceholder?: string
}) {
  return (
    <div className="yesno">
      <div className="yesno-head">
        <span className="yesno-label">{props.label}</span>
        <div className="segmented sm">
          <button type="button" className={!props.value ? 'on' : ''} onClick={() => props.onChange(false)}>
            No
          </button>
          <button type="button" className={props.value ? 'on danger-on' : ''} onClick={() => props.onChange(true)}>
            Yes
          </button>
        </div>
      </div>
      {props.value && props.onDetail && (
        <input
          className="input"
          style={{ marginTop: 8 }}
          placeholder={props.detailPlaceholder || 'Details'}
          value={props.detail}
          maxLength={2000}
          onChange={(e) => props.onDetail!(e.target.value)}
        />
      )}
    </div>
  )
}

export function Timesheet(props: { onHome: () => void }) {
  // day/job header
  const [jobNumber, setJobNumber] = useState('')
  const [workDate, setWorkDate] = useState(todayISO())
  const [shift, setShift] = useState('Day')
  const [jobFloor, setJobFloor] = useState('')
  const [weather, setWeather] = useState('')

  // crew
  const [emps, setEmps] = useState<EmpRow[]>([newEmp(1)])
  const [nextId, setNextId] = useState(2)

  // site conditions
  const [workStoppage, setWorkStoppage] = useState(false)
  const [workStoppageNote, setWorkStoppageNote] = useState('')
  const [injuries, setInjuries] = useState(false)
  const [injuriesNote, setInjuriesNote] = useState('')
  const [preTask, setPreTask] = useState(false)
  const [inspections, setInspections] = useState(false)
  const [inspectionsNote, setInspectionsNote] = useState('')
  const [slipWork, setSlipWork] = useState(false)

  const [workPerformed, setWorkPerformed] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [doneRef, setDoneRef] = useState('')
  const [doneRow, setDoneRow] = useState<Record<string, unknown> | null>(null)

  const grandTotal = useMemo(
    () => Math.round(emps.reduce((s, e) => s + empTotal(e), 0) * 100) / 100,
    [emps],
  )

  const setEmp = (id: number, patch: Partial<EmpRow>) =>
    setEmps((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const addEmp = () => {
    setEmps((rows) => [...rows, newEmp(nextId)])
    setNextId((n) => n + 1)
  }
  const removeEmp = (id: number) => setEmps((rows) => rows.filter((r) => r.id !== id))

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!jobNumber.trim()) e.jobNumber = 'Job number is required.'
    if (!workDate) e.workDate = 'Date is required.'
    const named = emps.filter((x) => x.name.trim())
    if (named.length === 0) e.emps = 'Add at least one employee with a name.'
    named.forEach((x) => {
      if (!x.timeIn || !x.timeOut) e.emps = 'Each employee needs a time in and time out.'
    })
    if (workStoppage && !workStoppageNote.trim()) e.workStoppage = 'Describe the work stoppage.'
    if (injuries && !injuriesNote.trim()) e.injuries = 'Describe the injury.'
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

    const employees = emps
      .filter((x) => x.name.trim())
      .map((x) => ({
        name: x.name.trim(),
        time_in: x.timeIn || null,
        time_out: x.timeOut || null,
        break_minutes: parseInt(x.breakMin, 10) || 0,
        reg_hours: regHours(x.timeIn, x.timeOut, parseInt(x.breakMin, 10) || 0),
        ot_hours: parseFloat(x.ot) || 0,
        pt_hours: parseFloat(x.pt) || 0,
        total: empTotal(x),
      }))

    const reference = makeReference('TS')
    const payload = {
      reference,
      job_number: jobNumber.trim(),
      work_date: workDate,
      shift: shift || null,
      job_floor: jobFloor.trim() || null,
      weather: weather.trim() || null,
      work_stoppage: workStoppage,
      work_stoppage_note: workStoppage ? workStoppageNote.trim() || null : null,
      injuries,
      injuries_note: injuries ? injuriesNote.trim() || null : null,
      pre_task: preTask,
      inspections,
      inspections_note: inspections ? inspectionsNote.trim() || null : null,
      slip_work: slipWork,
      employees,
      total_hours: grandTotal,
      work_performed: workPerformed.trim() || null,
      notes: notes.trim() || null,
    }
    const { error } = await supabase.from('timesheets').insert(payload)

    setSubmitting(false)
    if (error) {
      setSubmitError('The timesheet could not be submitted. Check your connection and try again.')
      return
    }
    setDoneRow({ ...payload, created_at: new Date().toISOString() })
    setDoneRef(reference)
    window.scrollTo(0, 0)
  }

  const reset = () => {
    setDoneRef('')
    setDoneRow(null)
    setEmps([newEmp(1)])
    setNextId(2)
    setWorkStoppage(false)
    setWorkStoppageNote('')
    setInjuries(false)
    setInjuriesNote('')
    setPreTask(false)
    setInspections(false)
    setInspectionsNote('')
    setSlipWork(false)
    setJobFloor('')
    setWeather('')
    setWorkPerformed('')
    setNotes('')
    setErrors({})
  }

  if (doneRef && doneRow) {
    return (
      <SuccessScreen
        title="Timesheet submitted"
        reference={doneRef}
        message="The office has been notified by email. Keep this reference for payroll questions."
        onReset={reset}
        onHome={props.onHome}
        exportKind="timesheet"
        exportRow={doneRow}
      />
    )
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {Object.keys(errors).length > 0 && (
        <div className="banner banner-error">
          Please fix the highlighted fields{errors.emps ? ` — ${errors.emps}` : ''}.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Daily crew timesheet</h2>
          <span className="hint">One report per job, per day</span>
        </div>
        <div className="card-body">
          <div className="grid cols-3">
            <Field label="Job #" required error={errors.jobNumber}>
              <input
                className={`input mono ${errors.jobNumber ? 'invalid' : ''}`}
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                placeholder="e.g. 26-1042"
                maxLength={60}
              />
            </Field>
            <Field label="Date" required error={errors.workDate}>
              <input
                type="date"
                className={`input ${errors.workDate ? 'invalid' : ''}`}
                value={workDate}
                max={todayISO()}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </Field>
            <Field label="Shift">
              <select className="select" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option>Day</option>
                <option>Night</option>
                <option>Swing</option>
                <option>Weekend</option>
              </select>
            </Field>
            <Field label="Job floor / area">
              <input
                className="input"
                value={jobFloor}
                onChange={(e) => setJobFloor(e.target.value)}
                placeholder="e.g. 3rd floor, north wing"
                maxLength={120}
              />
            </Field>
            <Field label="Weather / temp">
              <input
                className="input"
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                placeholder="e.g. Clear, 72°F"
                maxLength={120}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Crew &amp; hours</h2>
          <span className="hint">{grandTotal} total man-hours</span>
        </div>
        <div className="card-body">
          {errors.emps && <div className="field-error" style={{ marginBottom: 10 }}>{errors.emps}</div>}
          <div className="crew-table-scroll">
            <table className="crew-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>Employee</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Break</th>
                  <th>Reg</th>
                  <th>OT</th>
                  <th>PT</th>
                  <th>Total</th>
                  <th aria-label="remove"></th>
                </tr>
              </thead>
              <tbody>
                {emps.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input
                        className="input"
                        value={e.name}
                        onChange={(ev) => setEmp(e.id, { name: ev.target.value })}
                        placeholder="Full name"
                        maxLength={120}
                      />
                    </td>
                    <td>
                      <input type="time" className="input" value={e.timeIn} onChange={(ev) => setEmp(e.id, { timeIn: ev.target.value })} />
                    </td>
                    <td>
                      <input type="time" className="input" value={e.timeOut} onChange={(ev) => setEmp(e.id, { timeOut: ev.target.value })} />
                    </td>
                    <td>
                      <select className="select" value={e.breakMin} onChange={(ev) => setEmp(e.id, { breakMin: ev.target.value })}>
                        <option value="0">0</option>
                        <option value="15">15</option>
                        <option value="30">30</option>
                        <option value="45">45</option>
                        <option value="60">60</option>
                      </select>
                    </td>
                    <td className="reg-cell mono">{regHours(e.timeIn, e.timeOut, parseInt(e.breakMin, 10) || 0) || '—'}</td>
                    <td>
                      <input className="input num" inputMode="decimal" value={e.ot} onChange={(ev) => setEmp(e.id, { ot: ev.target.value.replace(/[^\d.]/g, '') })} placeholder="0" />
                    </td>
                    <td>
                      <input className="input num" inputMode="decimal" value={e.pt} onChange={(ev) => setEmp(e.id, { pt: ev.target.value.replace(/[^\d.]/g, '') })} placeholder="0" />
                    </td>
                    <td className="mono total-cell">{empTotal(e) || '—'}</td>
                    <td>
                      {emps.length > 1 && (
                        <button className="btn btn-ghost" aria-label="Remove employee" onClick={() => removeEmp(e.id)}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={addEmp}>
            + Add employee
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Site conditions</h2>
        </div>
        <div className="card-body">
          <div className="grid cols-2">
            <YesNo label="Pre-task completed?" value={preTask} onChange={setPreTask} />
            <YesNo label="Inspections?" value={inspections} onChange={setInspections} detail={inspectionsNote} onDetail={setInspectionsNote} detailPlaceholder="What was inspected" />
            <YesNo label="Slip work?" value={slipWork} onChange={setSlipWork} />
            <div className={errors.workStoppage ? 'invalid-wrap' : ''}>
              <YesNo label="Work stoppage?" value={workStoppage} onChange={setWorkStoppage} detail={workStoppageNote} onDetail={setWorkStoppageNote} detailPlaceholder="Reason for stoppage" />
              {errors.workStoppage && <span className="field-error">{errors.workStoppage}</span>}
            </div>
            <div className={errors.injuries ? 'invalid-wrap' : ''}>
              <YesNo label="Injuries?" value={injuries} onChange={setInjuries} detail={injuriesNote} onDetail={setInjuriesNote} detailPlaceholder="Describe the injury" />
              {errors.injuries && <span className="field-error">{errors.injuries}</span>}
            </div>
          </div>

          <div className="section-label" style={{ marginTop: 20 }}>Notes</div>
          <div className="grid">
            <Field label="Work performed">
              <textarea
                className="textarea"
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                placeholder="Summary of the day's work for the crew"
                maxLength={4000}
              />
            </Field>
            <Field label="Additional notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" maxLength={500} />
            </Field>
          </div>

          {submitError && <div className="banner banner-error" style={{ marginTop: 18 }}>{submitError}</div>}

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="btn btn-primary btn-lg" disabled={submitting} onClick={submit}>
              {submitting ? (<><IconSpinner /> Submitting…</>) : 'Submit timesheet'}
            </button>
            <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>
              {emps.filter((e) => e.name.trim()).length} employee(s) · {grandTotal} man-hours
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
