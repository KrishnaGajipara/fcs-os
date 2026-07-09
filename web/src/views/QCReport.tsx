import { useRef, useState } from 'react'
import { makeReference, supabase } from '../lib/supabase'
import { Field, IconSpinner, SuccessScreen } from '../components/ui'

type Photo = { file: File; preview: string }

const MAX_PHOTOS = 10
const MAX_SIZE = 10 * 1024 * 1024

function todayISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export function QCReport(props: { onHome: () => void }) {
  const [jobNumber, setJobNumber] = useState('')
  const [reportDate, setReportDate] = useState(todayISO())
  const [inspector, setInspector] = useState('')
  const [area, setArea] = useState('')
  const [workInspected, setWorkInspected] = useState('')
  const [observations, setObservations] = useState('')
  const [deficiencies, setDeficiencies] = useState('')
  const [corrective, setCorrective] = useState('')
  const [result, setResult] = useState<'pass' | 'pass_with_notes' | 'fail' | ''>('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [drag, setDrag] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [doneRef, setDoneRef] = useState('')
  const [doneRow, setDoneRow] = useState<Record<string, unknown> | null>(null)

  const addFiles = (list: FileList | File[]) => {
    const incoming = [...list].filter((f) => f.type.startsWith('image/'))
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length
      const usable = incoming
        .filter((f) => f.size <= MAX_SIZE)
        .slice(0, Math.max(0, room))
        .map((file) => ({ file, preview: URL.createObjectURL(file) }))
      return [...prev, ...usable]
    })
  }

  const removePhoto = (i: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!jobNumber.trim()) e.jobNumber = 'Job number is required.'
    if (!reportDate) e.reportDate = 'Date is required.'
    if (!inspector.trim()) e.inspector = 'Inspector name is required.'
    if (!area.trim()) e.area = 'Area inspected is required.'
    if (!workInspected.trim()) e.workInspected = 'Describe the work inspected.'
    if (!result) e.result = 'Choose an inspection result.'
    if (result === 'fail' && !corrective.trim())
      e.corrective = 'Corrective actions are required for a failed inspection.'
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

    const reference = makeReference('QC')

    try {
      // 1. upload photos
      const paths: string[] = []
      for (const [i, p] of photos.entries()) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`)
        const ext = (p.file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 6)
        const path = `${reference}/photo-${i + 1}.${ext}`
        const { error } = await supabase.storage.from('qc-photos').upload(path, p.file, {
          contentType: p.file.type,
          upsert: false,
        })
        if (error) throw new Error(`photo upload failed: ${error.message}`)
        paths.push(path)
      }

      // 2. insert report
      setProgress('Saving report…')
      const payload = {
        reference,
        job_number: jobNumber.trim(),
        report_date: reportDate,
        inspector_name: inspector.trim(),
        area_inspected: area.trim(),
        work_inspected: workInspected.trim(),
        observations: observations.trim() || null,
        deficiencies: deficiencies.trim() || null,
        corrective_actions: corrective.trim() || null,
        result,
        photos: paths,
      }
      const { error } = await supabase.from('qc_reports').insert(payload)
      if (error) throw new Error(error.message)

      setDoneRow({ ...payload, created_at: new Date().toISOString() })
      setDoneRef(reference)
      window.scrollTo(0, 0)
    } catch {
      setSubmitError(
        'The report could not be submitted. Check your connection and try again — photos may need a stronger signal.',
      )
    } finally {
      setSubmitting(false)
      setProgress('')
    }
  }

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview))
    setDoneRef('')
    setDoneRow(null)
    setArea('')
    setWorkInspected('')
    setObservations('')
    setDeficiencies('')
    setCorrective('')
    setResult('')
    setPhotos([])
    setErrors({})
  }

  if (doneRef && doneRow) {
    return (
      <SuccessScreen
        title="QC report filed"
        reference={doneRef}
        message="The office has been notified by email, including links to your photos. Keep this reference for the job file."
        onReset={reset}
        onHome={props.onHome}
        exportKind="qc_report"
        exportRow={doneRow}
      />
    )
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {Object.keys(errors).length > 0 && (
        <div className="banner banner-error">Please fix the highlighted fields.</div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Inspection</h2>
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
            <Field label="Date" required error={errors.reportDate}>
              <input
                type="date"
                className={`input ${errors.reportDate ? 'invalid' : ''}`}
                value={reportDate}
                max={todayISO()}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </Field>
            <Field label="Inspector" required error={errors.inspector}>
              <input
                className={`input ${errors.inspector ? 'invalid' : ''}`}
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Full name"
                maxLength={120}
              />
            </Field>
          </div>

          <div className="section-label">Scope</div>
          <div className="grid">
            <Field label="Area inspected" required error={errors.area}>
              <input
                className={`input ${errors.area ? 'invalid' : ''}`}
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Bridge span 3, north face — containment area B"
                maxLength={300}
              />
            </Field>
            <Field label="Work inspected" required error={errors.workInspected}>
              <textarea
                className={`textarea ${errors.workInspected ? 'invalid' : ''}`}
                value={workInspected}
                onChange={(e) => setWorkInspected(e.target.value)}
                placeholder="What work was inspected (surface prep, containment, coating application…)"
                maxLength={4000}
              />
            </Field>
            <Field label="Observations">
              <textarea
                className="textarea"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Measurements, readings, conditions"
                maxLength={4000}
              />
            </Field>
          </div>

          <div className="section-label">Findings</div>
          <div className="grid">
            <Field label="Deficiencies">
              <textarea
                className="textarea"
                value={deficiencies}
                onChange={(e) => setDeficiencies(e.target.value)}
                placeholder="Anything out of spec — leave blank if none"
                maxLength={4000}
              />
            </Field>
            <Field label="Corrective actions" error={errors.corrective}>
              <textarea
                className={`textarea ${errors.corrective ? 'invalid' : ''}`}
                value={corrective}
                onChange={(e) => setCorrective(e.target.value)}
                placeholder="Required if the inspection fails"
                maxLength={4000}
              />
            </Field>
            <Field label="Result" required error={errors.result}>
              <div className="segmented">
                <button
                  className={result === 'pass' ? 'on' : ''}
                  onClick={() => setResult('pass')}
                  type="button"
                >
                  Pass
                </button>
                <button
                  className={result === 'pass_with_notes' ? 'on' : ''}
                  onClick={() => setResult('pass_with_notes')}
                  type="button"
                >
                  Pass w/ notes
                </button>
                <button
                  className={result === 'fail' ? 'on' : ''}
                  onClick={() => setResult('fail')}
                  type="button"
                >
                  Fail
                </button>
              </div>
            </Field>
          </div>

          <div className="section-label">Photos</div>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            Tap to take or attach photos ({photos.length}/{MAX_PHOTOS}) — JPG/PNG up to 10 MB
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {photos.length > 0 && (
            <div className="thumbs">
              {photos.map((p, i) => (
                <div key={p.preview} className="thumb">
                  <img src={p.preview} alt={`Photo ${i + 1}`} />
                  <button aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {submitError && <div className="banner banner-error" style={{ marginTop: 18 }}>{submitError}</div>}

          <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn btn-primary btn-lg" disabled={submitting} onClick={submit}>
              {submitting ? (
                <>
                  <IconSpinner /> {progress || 'Submitting…'}
                </>
              ) : (
                'File QC report'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
