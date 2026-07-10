import { useState } from 'react'
import { makeReference, supabase } from '../lib/supabase'
import fineLogo from '../assets/fine-logo.png'
import {
  createDailyQCData,
  type CoatingApplication,
  type DailyQCData,
  type YesNo,
  type YesNoNA,
} from '../lib/qc'
import { Field, IconSpinner, SuccessScreen } from '../components/ui'

const COATING_TYPES = ['Primer', 'Intermediate', 'Finish', 'Intumescent', 'Stripe', 'Sealer']
const APPLICATION_METHODS = ['Airless/Con. Spray', 'Brush', 'Roller', 'Trowel']
const SURFACE_PREP_METHODS = ['Power Tool', 'Hand Tool', 'Sanding', 'Solvent Cleaning', 'Power Wash']

function todayISO(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function weekday(iso: string): string {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  return ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'][d.getDay()]
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function Choice(props: {
  value: YesNo | YesNoNA
  onChange: (value: YesNo | YesNoNA) => void
  na?: boolean
  label?: string
}) {
  const choices: { value: YesNo | YesNoNA; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ]
  if (props.na) choices.push({ value: 'na', label: 'N/A' })
  return (
    <div className="qc-choice" aria-label={props.label}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          className={props.value === choice.value ? 'on' : ''}
          onClick={() => props.onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  )
}

function CheckList(props: { values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  return (
    <div className="qc-check-list">
      {props.options.map((option) => (
        <label key={option} className="qc-check">
          <input
            type="checkbox"
            checked={props.values.includes(option)}
            onChange={() => props.onChange(toggle(props.values, option))}
          />
          {option}
        </label>
      ))}
    </div>
  )
}

function SignatureFields(props: {
  data: DailyQCData
  onChange: (key: keyof DailyQCData, value: string) => void
}) {
  return (
    <>
      <div className="section-label">Report signoff</div>
      <div className="grid cols-2">
        <Field label="Competent Person Print">
          <input className="input" value={props.data.competent_person_print} onChange={(e) => props.onChange('competent_person_print', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Competent Person Sign">
          <input className="input" value={props.data.competent_person_signature} onChange={(e) => props.onChange('competent_person_signature', e.target.value)} maxLength={240} />
        </Field>
        <Field label="QC Supervisor Print">
          <input className="input" value={props.data.qc_supervisor_print} onChange={(e) => props.onChange('qc_supervisor_print', e.target.value)} maxLength={120} />
        </Field>
        <Field label="QC Supervisor Sign">
          <input className="input" value={props.data.qc_supervisor_signature} onChange={(e) => props.onChange('qc_supervisor_signature', e.target.value)} maxLength={240} />
        </Field>
      </div>
    </>
  )
}

export function QCReport(props: { onHome: () => void }) {
  const [reportDate, setReportDate] = useState(todayISO())
  const [data, setData] = useState<DailyQCData>(() => ({ ...createDailyQCData(), day_of_week: weekday(todayISO()) }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [doneRef, setDoneRef] = useState('')
  const [doneRow, setDoneRow] = useState<Record<string, unknown> | null>(null)

  const update = (key: keyof DailyQCData, value: string) => setData((current) => ({ ...current, [key]: value }))
  const updateDate = (value: string) => {
    setReportDate(value)
    update('day_of_week', weekday(value))
  }
  const updateAmbient = (index: number, key: keyof DailyQCData['ambient_readings'][number], value: string) => {
    setData((current) => ({
      ...current,
      ambient_readings: current.ambient_readings.map((item, i) => i === index ? { ...item, [key]: value } : item),
    }))
  }
  const updateInstrument = (index: number, key: keyof DailyQCData['instruments'][number], value: string) => {
    setData((current) => ({
      ...current,
      instruments: current.instruments.map((item, i) => i === index ? { ...item, [key]: value } : item),
    }))
  }
  const updateCoating = (index: number, key: keyof CoatingApplication, value: unknown) => {
    setData((current) => ({
      ...current,
      coating_applications: current.coating_applications.map((item, i) => i === index ? { ...item, [key]: value } : item) as CoatingApplication[],
    }))
  }
  const updateCoatingList = (index: number, key: 'batch_lot_numbers' | 'parts' | 'material_temperatures' | 'mix_times' | 'wft_readings', item: number, value: string) => {
    const items = [...data.coating_applications[index][key]]
    items[item] = value
    updateCoating(index, key, items)
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!reportDate) next.reportDate = 'Date is required.'
    if (!data.project.trim()) next.project = 'Project is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    setSubmitError('')
    const reference = makeReference('QC')
    const payload = {
      reference,
      // Compatibility values let existing installations accept the report until migration 008 is applied.
      job_number: data.project.trim(),
      report_date: reportDate,
      inspector_name: data.qc_supervisor_print.trim() || data.competent_person_print.trim() || 'Not provided',
      area_inspected: data.ambient_location.trim() || 'Not provided',
      work_inspected: data.description_of_areas_locations_work_performed.trim() || 'Not provided',
      observations: data.surface_preparation_comments.trim() || null,
      deficiencies: data.do_not_proceed_explanation.trim() || null,
      corrective_actions: null,
      result: 'pass_with_notes',
      photos: [],
      details: data,
    }
    try {
      const { error } = await supabase.from('qc_reports').insert(payload)
      if (error) throw new Error(error.message)
      setDoneRow({ ...payload, created_at: new Date().toISOString() })
      setDoneRef(reference)
      window.scrollTo(0, 0)
    } catch {
      setSubmitError('The report could not be submitted. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    const date = todayISO()
    setReportDate(date)
    setData({ ...createDailyQCData(), day_of_week: weekday(date) })
    setErrors({})
    setDoneRef('')
    setDoneRow(null)
  }

  if (doneRef && doneRow) {
    return (
      <SuccessScreen
        title="Daily QC report filed"
        reference={doneRef}
        message="The daily quality control report has been saved for the job file."
        onReset={reset}
        onHome={props.onHome}
        exportKind="qc_report"
        exportRow={doneRow}
      />
    )
  }

  return (
    <div className="qc-report" style={{ maxWidth: 1100 }}>
      {Object.keys(errors).length > 0 && <div className="banner banner-error">Please complete the date and project before filing the report.</div>}

      <div className="card">
        <div className="card-head qc-report-title">
          <img className="qc-fine-logo" src={fineLogo} alt="FINE Group, LLC" />
          <div>
            <h2>Daily Quality Control Report</h2>
            <span className="hint">Digital version of the FINE daily QC report · Pages 1–2</span>
          </div>
          <span className="qc-page-chip">Page {data.page_number || '1'} of {data.page_total || '2'}</span>
        </div>
        <div className="card-body">
          <div className="grid cols-4">
            <Field label="Date" required error={errors.reportDate}>
              <input type="date" className={`input ${errors.reportDate ? 'invalid' : ''}`} value={reportDate} onChange={(e) => updateDate(e.target.value)} />
            </Field>
            <Field label="Day">
              <input className="input" value={data.day_of_week} onChange={(e) => update('day_of_week', e.target.value.toUpperCase())} placeholder="M / T / W / TH / F / S / SU" maxLength={2} />
            </Field>
            <Field label="Page">
              <input className="input" value={data.page_number} onChange={(e) => update('page_number', e.target.value)} inputMode="numeric" maxLength={4} />
            </Field>
            <Field label="Of">
              <input className="input" value={data.page_total} onChange={(e) => update('page_total', e.target.value)} inputMode="numeric" maxLength={4} />
            </Field>
          </div>
          <div className="grid cols-2" style={{ marginTop: 16 }}>
            <Field label="Project" required error={errors.project}>
              <input className={`input ${errors.project ? 'invalid' : ''}`} value={data.project} onChange={(e) => update('project', e.target.value)} maxLength={180} />
            </Field>
            <Field label="Contract No.">
              <input className="input" value={data.contract_number} onChange={(e) => update('contract_number', e.target.value)} maxLength={120} />
            </Field>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Page 1 · Ambient conditions &amp; surface preparation</h2></div>
        <div className="card-body">
          <div className="grid cols-4">
            <Field label="Weather AM"><input className="input" value={data.weather_am} onChange={(e) => update('weather_am', e.target.value)} maxLength={120} /></Field>
            <Field label="Weather PM"><input className="input" value={data.weather_pm} onChange={(e) => update('weather_pm', e.target.value)} maxLength={120} /></Field>
            <Field label="Number of Workers Onsite"><input className="input" value={data.workers_on_site} onChange={(e) => update('workers_on_site', e.target.value)} inputMode="numeric" maxLength={10} /></Field>
            <Field label="Start / Stop Time">
              <div className="qc-time-pair"><input className="input" type="time" value={data.start_time} onChange={(e) => update('start_time', e.target.value)} /><input className="input" type="time" value={data.stop_time} onChange={(e) => update('stop_time', e.target.value)} /></div>
            </Field>
          </div>

          <div className="section-label">Ambient Conditions</div>
          <Field label="Location"><input className="input" value={data.ambient_location} onChange={(e) => update('ambient_location', e.target.value)} maxLength={300} /></Field>
          <div className="qc-table-scroll">
            <table className="qc-table">
              <thead><tr><th>Reading</th><th>Time (24hr)</th><th>Relative Humidity %</th><th>Temperature Air °F</th><th>Temperature Surface °F</th><th>Temperature Dew Point °F</th><th>Surface / Dew Point Depression</th></tr></thead>
              <tbody>{data.ambient_readings.map((reading, index) => <tr key={index}>
                <td>{index + 1}</td>
                <td><input className="input" type="time" value={reading.time} onChange={(e) => updateAmbient(index, 'time', e.target.value)} /></td>
                <td><input className="input" value={reading.relative_humidity} onChange={(e) => updateAmbient(index, 'relative_humidity', e.target.value)} inputMode="decimal" /></td>
                <td><input className="input" value={reading.air_temperature} onChange={(e) => updateAmbient(index, 'air_temperature', e.target.value)} inputMode="decimal" /></td>
                <td><input className="input" value={reading.surface_temperature} onChange={(e) => updateAmbient(index, 'surface_temperature', e.target.value)} inputMode="decimal" /></td>
                <td><input className="input" value={reading.dew_point} onChange={(e) => updateAmbient(index, 'dew_point', e.target.value)} inputMode="decimal" /></td>
                <td><input className="input" value={reading.surface_dew_point_depression} onChange={(e) => updateAmbient(index, 'surface_dew_point_depression', e.target.value)} inputMode="decimal" /></td>
              </tr>)}</tbody>
            </table>
          </div>

          <div className="section-label">Instrument Record</div>
          <div className="qc-table-scroll">
            <table className="qc-table">
              <thead><tr><th>Instrument</th><th>Serial #</th><th>Calibrated</th><th colSpan={3}>Equipment Calibration Check — Standard vs Actual Readings</th></tr></thead>
              <tbody>{data.instruments.map((instrument, index) => <tr key={index}>
                <td><input className="input" value={instrument.instrument} onChange={(e) => updateInstrument(index, 'instrument', e.target.value)} maxLength={120} /></td>
                <td><input className="input" value={instrument.serial_number} onChange={(e) => updateInstrument(index, 'serial_number', e.target.value)} maxLength={120} /></td>
                <td><Choice value={instrument.calibrated} onChange={(value) => updateInstrument(index, 'calibrated', value)} label={`Instrument ${index + 1} calibrated`} /></td>
                <td><input className="input" value={instrument.standard_reading_1} onChange={(e) => updateInstrument(index, 'standard_reading_1', e.target.value)} /></td>
                <td><input className="input" value={instrument.standard_reading_2} onChange={(e) => updateInstrument(index, 'standard_reading_2', e.target.value)} /></td>
                <td><input className="input" value={instrument.standard_reading_3} onChange={(e) => updateInstrument(index, 'standard_reading_3', e.target.value)} /></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="qc-question-row">
            <span>Has the Quality Control Supervisor collected &amp; inspected the inspection equipment within the past 12 months?</span>
            <Choice value={data.equipment_inspected_within_12_months} onChange={(value) => update('equipment_inspected_within_12_months', value)} />
          </div>

          <div className="section-label">Description of Areas / Locations &amp; Work Performed</div>
          <textarea className="textarea qc-large-text" value={data.description_of_areas_locations_work_performed} onChange={(e) => update('description_of_areas_locations_work_performed', e.target.value)} maxLength={6000} />

          <div className="section-label">Surface Preparation Quality Items</div>
          <div className="grid cols-2">
            <Field label="Surface Preparation Required: SSPC SP-"><input className="input" value={data.surface_preparation_required} onChange={(e) => update('surface_preparation_required', e.target.value)} maxLength={80} /></Field>
            <Field label="Surface Preparation Performed: SSPC SP-"><input className="input" value={data.surface_preparation_performed} onChange={(e) => update('surface_preparation_performed', e.target.value)} maxLength={80} /></Field>
            <Field label="Surface Profile Required"><input className="input" value={data.surface_profile_required} onChange={(e) => update('surface_profile_required', e.target.value)} maxLength={80} /></Field>
            <Field label="Surface Profile Achieved"><input className="input" value={data.surface_profile_achieved} onChange={(e) => update('surface_profile_achieved', e.target.value)} maxLength={80} /></Field>
          </div>
          <Field label="Method" help="Select all that apply." ><CheckList values={data.surface_preparation_methods} options={SURFACE_PREP_METHODS} onChange={(value) => setData((current) => ({ ...current, surface_preparation_methods: value }))} /></Field>
          <Field label="Other Method" ><input className="input" value={data.surface_preparation_other} onChange={(e) => update('surface_preparation_other', e.target.value)} maxLength={300} /></Field>
          <div className="qc-question-row"><span>Is the surface to be painted clean, moisture free, and free of oil, grease, dirt &amp; other contaminants?</span><Choice value={data.surface_clean_moisture_free} onChange={(value) => update('surface_clean_moisture_free', value)} /></div>
          <Field label="If No — Do Not Proceed! Explain"><textarea className="textarea" value={data.do_not_proceed_explanation} onChange={(e) => update('do_not_proceed_explanation', e.target.value)} maxLength={4000} /></Field>
          <div className="qc-question-row"><span>Was Any Hazardous Waste Generated?</span><Choice value={data.hazardous_waste_generated} onChange={(value) => update('hazardous_waste_generated', value)} /></div>
          <div className="qc-question-row"><span>If Yes, was it properly stored &amp; identified?</span><Choice value={data.hazardous_waste_properly_stored_identified} onChange={(value) => update('hazardous_waste_properly_stored_identified', value)} /></div>
          <Field label="Comments"><textarea className="textarea" value={data.surface_preparation_comments} onChange={(e) => update('surface_preparation_comments', e.target.value)} maxLength={4000} /></Field>
          <div className="grid cols-3">
            <Field label="Light Meter Serial No."><input className="input" value={data.light_meter_serial_number} onChange={(e) => update('light_meter_serial_number', e.target.value)} maxLength={120} /></Field>
            {data.light_readings.map((reading, i) => <Field key={i} label={`Light Reading ${i + 1} — FC / Time`}><div className="qc-time-pair"><input className="input" value={reading.foot_candles} onChange={(e) => setData((current) => ({ ...current, light_readings: current.light_readings.map((item, index) => index === i ? { ...item, foot_candles: e.target.value } : item) }))} inputMode="decimal" placeholder="FC" /><input className="input" type="time" value={reading.time} onChange={(e) => setData((current) => ({ ...current, light_readings: current.light_readings.map((item, index) => index === i ? { ...item, time: e.target.value } : item) }))} /></div></Field>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Page 2 · Preparation checks, safety &amp; coating application</h2></div>
        <div className="card-body">
          <div className="section-label">Surface Preparation Quality Items</div>
          <div className="qc-check-grid">
            <div className="qc-question-row"><span>Sharp Edges and Weld Splatter Removed</span><Choice na value={data.sharp_edges_weld_splatter_removed} onChange={(value) => update('sharp_edges_weld_splatter_removed', value)} /></div>
            <div className="qc-question-row"><span>Clean and Dry Abrasive</span><Choice na value={data.clean_dry_abrasive} onChange={(value) => update('clean_dry_abrasive', value)} /></div>
            <Field label="Type of Abrasive and Size"><input className="input" value={data.abrasive_type_size} onChange={(e) => update('abrasive_type_size', e.target.value)} maxLength={300} /></Field>
            <div className="qc-question-row"><span>Compressed Air Check</span><Choice na value={data.compressed_air_check} onChange={(value) => update('compressed_air_check', value)} /></div>
            <Field label="Nozzle Air Pressure"><input className="input" value={data.nozzle_air_pressure} onChange={(e) => update('nozzle_air_pressure', e.target.value)} inputMode="decimal" maxLength={40} /></Field>
            <div className="qc-question-row"><span>Blotter Test</span><Choice na value={data.blotter_test} onChange={(value) => update('blotter_test', value)} /></div>
          </div>

          <div className="section-label">Safety Check List</div>
          <div className="qc-check-grid">
            <div className="qc-question-row"><span>Any Safety Issues Occur?</span><Choice value={data.safety_issues_occurred} onChange={(value) => update('safety_issues_occurred', value)} /></div>
            <div className="qc-question-row"><span>If Yes, was a copy sent to the field office?</span><Choice value={data.safety_issue_copy_sent_to_field_office} onChange={(value) => update('safety_issue_copy_sent_to_field_office', value)} /></div>
            <div className="qc-question-row"><span>Are the workers wearing proper PPE?</span><Choice value={data.workers_wearing_proper_ppe} onChange={(value) => update('workers_wearing_proper_ppe', value)} /></div>
            <div className="qc-question-row"><span>Is pre-start Safety Talks being performed?</span><Choice value={data.pre_start_safety_talks_performed} onChange={(value) => update('pre_start_safety_talks_performed', value)} /></div>
          </div>

          {data.coating_applications.map((application, applicationIndex) => (
            <div className="qc-coating-block" key={applicationIndex}>
              <div className="section-label">Coating Application {applicationIndex + 1}</div>
              <Field label="Application Location(s)"><textarea className="textarea qc-location-text" value={application.application_locations} onChange={(e) => updateCoating(applicationIndex, 'application_locations', e.target.value)} maxLength={2000} /></Field>
              <Field label="Coating" help="Select all that apply."><CheckList values={application.coatings} options={COATING_TYPES} onChange={(value) => updateCoating(applicationIndex, 'coatings', value)} /></Field>
              <Field label="Other Coating"><input className="input" value={application.coating_other} onChange={(e) => updateCoating(applicationIndex, 'coating_other', e.target.value)} maxLength={300} /></Field>
              <div className="qc-question-row"><span>Mix(s) Witnessed &amp; Acceptable</span><Choice value={application.mix_witnessed_acceptable} onChange={(value) => updateCoating(applicationIndex, 'mix_witnessed_acceptable', value)} /></div>
              <div className="grid cols-3">
                <Field label="Manufacturer"><input className="input" value={application.manufacturer} onChange={(e) => updateCoating(applicationIndex, 'manufacturer', e.target.value)} maxLength={180} /></Field>
                <Field label="Product Name"><input className="input" value={application.product_name} onChange={(e) => updateCoating(applicationIndex, 'product_name', e.target.value)} maxLength={180} /></Field>
                <Field label="Kit Size &amp; Color"><input className="input" value={application.kit_size_color} onChange={(e) => updateCoating(applicationIndex, 'kit_size_color', e.target.value)} maxLength={180} /></Field>
              </div>
              <div className="qc-table-scroll"><table className="qc-table qc-coating-table"><thead><tr><th>Product line</th><th>Batch / Lot #</th><th>Part</th><th>Material Temp °F</th><th>Mix Time</th></tr></thead><tbody>{['1st', '2nd', '3rd'].map((label, row) => <tr key={label}><td>{label}</td><td><input className="input" value={application.batch_lot_numbers[row]} onChange={(e) => updateCoatingList(applicationIndex, 'batch_lot_numbers', row, e.target.value)} /></td><td><input className="input" value={application.parts[row]} onChange={(e) => updateCoatingList(applicationIndex, 'parts', row, e.target.value)} /></td><td><input className="input" value={application.material_temperatures[row]} onChange={(e) => updateCoatingList(applicationIndex, 'material_temperatures', row, e.target.value)} inputMode="decimal" /></td><td><input className="input" type="time" value={application.mix_times[row]} onChange={(e) => updateCoatingList(applicationIndex, 'mix_times', row, e.target.value)} /></td></tr>)}</tbody></table></div>
              <div className="grid cols-4" style={{ marginTop: 16 }}>
                <Field label="Shelf Life"><input className="input" value={application.shelf_life} onChange={(e) => updateCoating(applicationIndex, 'shelf_life', e.target.value)} maxLength={80} /></Field>
                <Field label="Reducer"><input className="input" value={application.reducer} onChange={(e) => updateCoating(applicationIndex, 'reducer', e.target.value)} maxLength={120} /></Field>
                <Field label="Reducer #"><input className="input" value={application.reducer_number} onChange={(e) => updateCoating(applicationIndex, 'reducer_number', e.target.value)} maxLength={80} /></Field>
                <Field label="Pot Life"><input className="input" value={application.pot_life} onChange={(e) => updateCoating(applicationIndex, 'pot_life', e.target.value)} maxLength={80} /></Field>
              </div>
              <div className="grid cols-2">
                <Field label="Method of Application" help="Select all that apply."><CheckList values={application.application_methods} options={APPLICATION_METHODS} onChange={(value) => updateCoating(applicationIndex, 'application_methods', value)} /></Field>
                <Field label="Total Gallons Applied"><input className="input" value={application.total_gallons_applied} onChange={(e) => updateCoating(applicationIndex, 'total_gallons_applied', e.target.value)} inputMode="decimal" maxLength={40} /></Field>
              </div>
              <div className="grid cols-2">
                <Field label="Required WFT"><input className="input" value={application.required_wft} onChange={(e) => updateCoating(applicationIndex, 'required_wft', e.target.value)} inputMode="decimal" maxLength={40} /></Field>
                <Field label="Average WFT"><input className="input" value={application.average_wft} onChange={(e) => updateCoating(applicationIndex, 'average_wft', e.target.value)} inputMode="decimal" maxLength={40} /></Field>
              </div>
              <Field label="WFT Readings"><div className="qc-wft-grid">{application.wft_readings.map((reading, i) => <input key={i} className="input" value={reading} onChange={(e) => updateCoatingList(applicationIndex, 'wft_readings', i, e.target.value)} inputMode="decimal" aria-label={`Coating ${applicationIndex + 1} WFT reading ${i + 1}`} />)}</div></Field>
            </div>
          ))}
          <Field label="Comments"><textarea className="textarea" value={data.coating_comments} onChange={(e) => update('coating_comments', e.target.value)} maxLength={4000} /></Field>
          <SignatureFields data={data} onChange={update} />
          {submitError && <div className="banner banner-error" style={{ marginTop: 18 }}>{submitError}</div>}
          <p className="qc-note">Note: this field presents information gathered by a FINE Group representative. It provides a record of measurements and observations believed to be accurate.</p>
          <button className="btn btn-primary btn-lg" disabled={submitting} onClick={submit} style={{ marginTop: 20 }}>
            {submitting ? <><IconSpinner /> Filing daily QC report…</> : 'File Daily QC Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
