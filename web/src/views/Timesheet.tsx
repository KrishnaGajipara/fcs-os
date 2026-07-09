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

function computeHours(timeIn: string, timeOut: string, breakMin: number): number | null {
  if (!timeIn || !timeOut) return null
  const [h1, m1] = timeIn.split(':').map(Number)
  const [h2, m2] = timeOut.split(':').map(Number)
  let mins = h2 * 60 + m2 - (h1 * 60 + m1)
  if (mins <= 0) mins += 24 * 60 // overnight shift
  mins -= breakMin
  if (mins <= 0) return null
  return Math.round((mins / 60) * 100) / 100
}

export function Timesheet(props: { onHome: () => void }) {
  const [employee, setEmployee] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [workDate, setWorkDate] = useState(todayISO())
  const [timeIn, setTimeIn] = useState('')
  const [timeOut, setTimeOut] = useState('')
  const [breakMin, setBreakMin] = useState('30')
  const [workPerformed, setWorkPerformed] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [doneRef, setDoneRef] = useState('')

  const totalHours = useMemo(
    () => computeHours(timeIn, timeOut, parseInt(breakMin, 10) || 0),
    [timeIn, timeOut, breakMin],
  )

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!employee.trim()) e.employee = 'Employee name is required.'
    if (!jobNumber.trim()) e.jobNumber = 'Job number is required.'
    if (!workDate) e.workDate = 'Date is required.'
    if (!timeIn) e.timeIn = 'Start time is required.'
    if (!timeOut) e.timeOut = 'End time is required.'
    if (timeIn && timeOut && totalHours === null)
      e.timeOut = 'Hours come out to zero — check the times and break.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSubmitting(true)
    setSubmitError('')

    const reference = makeReference('TS')
    const { error } = await supabase.from('timesheets').insert({
      reference,
      employee_name: employee.trim(),
      job_number: jobNumber.trim(),
      work_date: workDate,
      time_in: timeIn,
      time_out: timeOut,
      break_minutes: parseInt(breakMin, 10) || 0,
      total_hours: totalHours,
      work_performed: workPerformed.trim() || null,
      notes: notes.trim() || null,
    })

    setSubmitting(false)
    if (error) {
      setSubmitError('The timesheet could not be submitted. Check your connection and try again.')
      return
    }
    setDoneRef(reference)
    window.scrollTo(0, 0)
  }

  const reset = () => {
    setDoneRef('')
    setTimeIn('')
    setTimeOut('')
    setWorkPerformed('')
    setNotes('')
    setErrors({})
  }

  if (doneRef) {
    return (
      <SuccessScreen
        title="Timesheet submitted"
        reference={doneRef}
        message="The office has been notified by email. Keep this reference for payroll questions."
        onReset={reset}
        onHome={props.onHome}
      />
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="card">
        <div className="card-head">
          <h2>Daily timesheet</h2>
          <span className="hint">One entry per employee, per job, per day</span>
        </div>
        <div className="card-body">
          <div className="grid cols-2">
            <Field label="Employee name" required error={errors.employee}>
              <input
                className={`input ${errors.employee ? 'invalid' : ''}`}
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                placeholder="Full name"
                maxLength={120}
              />
            </Field>
            <Field label="Job #" required error={errors.jobNumber}>
              <input
                className={`input mono ${errors.jobNumber ? 'invalid' : ''}`}
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                placeholder="e.g. 26-1042"
                maxLength={60}
              />
            </Field>
          </div>

          <div className="section-label">Hours</div>
          <div className="grid cols-4">
            <Field label="Date" required error={errors.workDate}>
              <input
                type="date"
                className={`input ${errors.workDate ? 'invalid' : ''}`}
                value={workDate}
                max={todayISO()}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </Field>
            <Field label="Time in" required error={errors.timeIn}>
              <input
                type="time"
                className={`input ${errors.timeIn ? 'invalid' : ''}`}
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
              />
            </Field>
            <Field label="Time out" required error={errors.timeOut}>
              <input
                type="time"
                className={`input ${errors.timeOut ? 'invalid' : ''}`}
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
              />
            </Field>
            <Field label="Break (minutes)">
              <select className="select" value={breakMin} onChange={(e) => setBreakMin(e.target.value)}>
                <option value="0">None</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
                <option value="60">60</option>
              </select>
            </Field>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              background: 'var(--paper)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
              TOTAL HOURS
            </span>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {totalHours ?? '—'}
            </span>
          </div>

          <div className="section-label">Work</div>
          <div className="grid">
            <Field label="Work performed">
              <textarea
                className="textarea"
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                placeholder="Brief description of the day's work"
                maxLength={4000}
              />
            </Field>
            <Field label="Notes">
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                maxLength={500}
              />
            </Field>
          </div>

          {submitError && <div className="banner banner-error" style={{ marginTop: 18 }}>{submitError}</div>}

          <div style={{ marginTop: 22 }}>
            <button className="btn btn-primary btn-lg" disabled={submitting} onClick={submit}>
              {submitting ? (
                <>
                  <IconSpinner /> Submitting…
                </>
              ) : (
                'Submit timesheet'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
