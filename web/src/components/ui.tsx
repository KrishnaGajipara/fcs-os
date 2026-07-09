import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  exportSubmissionCsv,
  exportSubmissionExcel,
  type ExportKind,
} from '../lib/export'

/* ---- Icons (stroke line icons, 18px grid) -------------------------------- */

type IconProps = { size?: number }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const IconGrid = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
  </svg>
)

export const IconTruck = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M3.5 6.5h11v10h-11z" />
    <path d="M14.5 10.5h3.6l2.4 3v3h-6z" />
    <circle cx="7.5" cy="17.5" r="1.6" />
    <circle cx="17" cy="17.5" r="1.6" />
  </svg>
)

export const IconClock = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const IconClipboard = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="5.5" y="4.5" width="13" height="16" rx="1.5" />
    <path d="M9 4.5V3h6v1.5" />
    <path d="M8.5 10l2 2 4-4.5" />
    <path d="M8.5 16h7" />
  </svg>
)

export const IconLock = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
)

export const IconCheck = ({ size = 26 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2.2}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
)

export const IconSpinner = ({ size = 16 }: IconProps) => (
  <svg className="spin" width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
)

/* ---- Field wrapper -------------------------------------------------------- */

export function Field(props: {
  label: string
  required?: boolean
  error?: string
  help?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>
        {props.label}
        {props.required && <span className="req">*</span>}
      </label>
      {props.children}
      {props.help && !props.error && <span className="help">{props.help}</span>}
      {props.error && <span className="field-error">{props.error}</span>}
    </div>
  )
}

/* ---- Success screen -------------------------------------------------------- */

export const IconDownload = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 4v11" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </svg>
)

export function SuccessScreen(props: {
  title: string
  reference: string
  message: string
  onReset: () => void
  onHome: () => void
  exportKind: ExportKind
  exportRow: Record<string, unknown>
  trackHref?: string
}) {
  const [busy, setBusy] = useState(false)

  const doExcel = async () => {
    setBusy(true)
    try {
      await exportSubmissionExcel(props.exportKind, props.exportRow)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="success-wrap">
      <div className="success-mark">
        <IconCheck />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700 }}>{props.title}</h2>
      <div className="success-ref">{props.reference}</div>
      <p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.6 }}>{props.message}</p>

      <div className="export-bar">
        <span className="export-bar-label">Keep a copy</span>
        <div className="export-bar-btns">
          <button className="btn btn-secondary" disabled={busy} onClick={doExcel}>
            {busy ? <IconSpinner /> : <IconDownload />} Excel
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => exportSubmissionCsv(props.exportKind, props.exportRow)}
          >
            <IconDownload /> CSV
          </button>
        </div>
      </div>

      {props.trackHref && (
        <a className="track-link" href={props.trackHref}>
          Track this order&apos;s shipment status →
        </a>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22 }}>
        <button className="btn btn-secondary" onClick={props.onHome}>
          Back to FCS OS
        </button>
        <button className="btn btn-primary" onClick={props.onReset}>
          Submit another
        </button>
      </div>
    </div>
  )
}
