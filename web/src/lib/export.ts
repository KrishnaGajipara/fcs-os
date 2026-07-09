import type ExcelJS from 'exceljs'
import logoUrl from '../assets/fine-logo.png'
import type { OrderItem } from './supabase'

/* ==========================================================================
   Branded exports — Excel (.xlsx) with the FINE logo + styling, and plain CSV.
   Used both on form success screens (single submission) and in the admin
   dashboard (list exports).
   ========================================================================== */

const INK = 'FF16202E'
const ACCENT = 'FF1F5788'
const ORANGE = 'FFC8643C'
const PAPER = 'FFF2F4F6'
const LINE = 'FFD8DEE6'
const MUTED = 'FF5C6775'
const WHITE = 'FFFFFFFF'

type MetaRow = { label: string; value: string }
type Table = { columns: { header: string; width: number }[]; rows: (string | number)[][] }

let logoBase64: string | null = null
async function getLogoBase64(): Promise<string> {
  if (logoBase64) return logoBase64
  const res = await fetch(logoUrl)
  const buf = await res.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  logoBase64 = btoa(binary)
  return logoBase64
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---- Excel builder -------------------------------------------------------- */

type SheetSpec = {
  kindLabel: string // e.g. "MATERIAL ORDER"
  subtitle: string // e.g. reference or a description
  meta: MetaRow[]
  tableTitle?: string
  table?: Table
}

async function buildWorkbook(sheets: SheetSpec[]): Promise<ExcelJS.Workbook> {
  // Lazy-loaded: exceljs is ~940 KB and only needed when someone exports.
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FCS OS'
  wb.created = new Date()
  const logo = await getLogoBase64()
  const imageId = wb.addImage({ base64: logo, extension: 'png' })

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.kindLabel.slice(0, 28), {
      properties: { defaultRowHeight: 18 },
      views: [{ showGridLines: false }],
    })

    ws.columns = [
      { width: 4 },
      { width: 26 },
      { width: 26 },
      { width: 22 },
      { width: 16 },
      { width: 30 },
    ]

    // Logo floats over rows 1-3
    ws.addImage(imageId, {
      tl: { col: 1, row: 0.35 },
      ext: { width: 150, height: 52 },
      editAs: 'oneCell',
    })
    ws.getRow(1).height = 22
    ws.getRow(2).height = 22
    ws.getRow(3).height = 14

    // Kind label (top-right)
    ws.mergeCells('D1:F1')
    const kindCell = ws.getCell('D1')
    kindCell.value = spec.kindLabel
    kindCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: ORANGE } }
    kindCell.alignment = { horizontal: 'right', vertical: 'middle' }
    ws.mergeCells('D2:F2')
    const subCell = ws.getCell('D2')
    subCell.value = spec.subtitle
    subCell.font = { name: 'Arial', size: 10, color: { argb: MUTED } }
    subCell.alignment = { horizontal: 'right', vertical: 'middle' }

    // Dark band row 4
    ws.mergeCells('B4:F4')
    const band = ws.getCell('B4')
    band.value = 'FINE CONSTRUCTION SPECIALTIES  ·  OPERATING SYSTEM'
    band.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } }
    band.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    band.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    ws.getRow(4).height = 20
    for (const col of ['B', 'C', 'D', 'E', 'F']) {
      ws.getCell(`${col}4`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    }

    let r = 6

    // Meta rows: label in B, value merged C:F
    for (const m of spec.meta) {
      const labelCell = ws.getCell(`B${r}`)
      labelCell.value = m.label.toUpperCase()
      labelCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: MUTED } }
      labelCell.alignment = { vertical: 'middle' }
      ws.mergeCells(`C${r}:F${r}`)
      const valueCell = ws.getCell(`C${r}`)
      valueCell.value = m.value
      valueCell.font = { name: 'Arial', size: 11, color: { argb: INK } }
      valueCell.alignment = { vertical: 'middle', wrapText: true }
      ws.getRow(r).height = 20
      // bottom border
      for (const col of ['B', 'C', 'D', 'E', 'F']) {
        ws.getCell(`${col}${r}`).border = {
          bottom: { style: 'thin', color: { argb: LINE } },
        }
      }
      r++
    }

    // Table
    if (spec.table && spec.table.rows.length > 0) {
      r += 1
      if (spec.tableTitle) {
        ws.mergeCells(`B${r}:F${r}`)
        const t = ws.getCell(`B${r}`)
        t.value = spec.tableTitle.toUpperCase()
        t.font = { name: 'Arial', size: 10, bold: true, color: { argb: ACCENT } }
        r++
      }
      // header
      const startCol = 2 // B
      spec.table.columns.forEach((c, i) => {
        const cell = ws.getCell(r, startCol + i)
        cell.value = c.header
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT } }
        cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' }
      })
      ws.getRow(r).height = 18
      r++
      // data
      spec.table.rows.forEach((row, ri) => {
        row.forEach((val, i) => {
          const cell = ws.getCell(r, startCol + i)
          cell.value = val
          cell.font = { name: 'Arial', size: 10, color: { argb: INK } }
          cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left', wrapText: true }
          cell.border = { bottom: { style: 'hair', color: { argb: LINE } } }
          if (ri % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAPER } }
          }
        })
        r++
      })
    }

    // Footer
    r += 1
    ws.mergeCells(`B${r}:F${r}`)
    const foot = ws.getCell(`B${r}`)
    foot.value = `Generated by FCS OS · ${fmtDateTime(new Date().toISOString())}`
    foot.font = { name: 'Arial', size: 8, italic: true, color: { argb: MUTED } }
  }

  return wb
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  download(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}

/* ---- CSV builder ---------------------------------------------------------- */

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvFromRows(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

function saveCsv(rows: (string | number)[][], filename: string) {
  const bom = '﻿' // Excel-friendly UTF-8
  download(new Blob([bom + csvFromRows(rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

/* ==========================================================================
   Per-kind field maps
   ========================================================================== */

type AnyRow = Record<string, unknown>

function orderMeta(o: AnyRow): MetaRow[] {
  return [
    { label: 'Reference', value: String(o.reference ?? '') },
    { label: 'Submitted', value: fmtDateTime(o.created_at as string) },
    { label: 'Job #', value: String(o.job_number ?? '') },
    {
      label: 'Site contact',
      value:
        String(o.site_contact ?? '') +
        (o.site_contact_phone ? `  ·  ${o.site_contact_phone}` : ''),
    },
    { label: 'Requested by', value: String(o.requested_by ?? '') },
    { label: 'Needed by (ship-out)', value: fmtDate(o.needed_by as string) },
    { label: 'Status', value: String(o.status ?? 'pending') },
    { label: 'Notes', value: String(o.notes ?? '') || '—' },
  ]
}

const LIST_LABEL: Record<string, string> = {
  lead: 'Lead Job',
  painting: 'Painting',
  custom: 'Custom',
}

function orderItemsTable(o: AnyRow): Table {
  const items = (Array.isArray(o.items) ? o.items : []) as OrderItem[]
  return {
    columns: [
      { header: '#', width: 4 },
      { header: 'Item', width: 30 },
      { header: 'List', width: 16 },
      { header: 'Qty', width: 10 },
      { header: 'Note', width: 26 },
    ],
    rows: items.map((it, i) => [
      i + 1,
      it.name,
      LIST_LABEL[it.list] ?? it.list,
      it.quantity,
      it.note ?? '',
    ]),
  }
}

type EmployeeEntry = {
  name: string
  time_in: string | null
  time_out: string | null
  break_minutes: number
  reg_hours: number
  ot_hours: number
  pt_hours: number
  total: number
}

const yesNo = (v: unknown) => (v ? 'Yes' : 'No')

function timesheetMeta(t: AnyRow): MetaRow[] {
  const emps = (Array.isArray(t.employees) ? t.employees : []) as EmployeeEntry[]
  const crew = emps
    .map((e) => `${e.name} (${e.total ?? 0}h${e.ot_hours ? `, OT ${e.ot_hours}` : ''}${e.pt_hours ? `, PT ${e.pt_hours}` : ''})`)
    .join('; ')
  return [
    { label: 'Reference', value: String(t.reference ?? '') },
    { label: 'Submitted', value: fmtDateTime(t.created_at as string) },
    { label: 'Job #', value: String(t.job_number ?? '') },
    { label: 'Work date', value: fmtDate(t.work_date as string) },
    { label: 'Shift', value: String(t.shift ?? '') || '—' },
    { label: 'Job floor / area', value: String(t.job_floor ?? '') || '—' },
    { label: 'Weather / temp', value: String(t.weather ?? '') || '—' },
    { label: 'Crew', value: crew || '—' },
    { label: 'Total man-hours', value: String(t.total_hours ?? '') },
    { label: 'Pre-task', value: yesNo(t.pre_task) },
    { label: 'Inspections', value: yesNo(t.inspections) + (t.inspections_note ? ` — ${t.inspections_note}` : '') },
    { label: 'Slip work', value: yesNo(t.slip_work) },
    { label: 'Work stoppage', value: yesNo(t.work_stoppage) + (t.work_stoppage_note ? ` — ${t.work_stoppage_note}` : '') },
    { label: 'Injuries', value: yesNo(t.injuries) + (t.injuries_note ? ` — ${t.injuries_note}` : '') },
    { label: 'Work performed', value: String(t.work_performed ?? '') || '—' },
    { label: 'Notes', value: String(t.notes ?? '') || '—' },
  ]
}

function timesheetCrewTable(t: AnyRow): Table {
  const emps = (Array.isArray(t.employees) ? t.employees : []) as EmployeeEntry[]
  return {
    columns: [
      { header: 'Employee', width: 26 },
      { header: 'In', width: 10 },
      { header: 'Out', width: 10 },
      { header: 'Break', width: 8 },
      { header: 'Reg', width: 8 },
      { header: 'OT', width: 8 },
      { header: 'PT', width: 8 },
      { header: 'Total', width: 10 },
    ],
    rows: emps.map((e) => [
      e.name,
      e.time_in ?? '—',
      e.time_out ?? '—',
      e.break_minutes ?? 0,
      e.reg_hours ?? 0,
      e.ot_hours ?? 0,
      e.pt_hours ?? 0,
      e.total ?? 0,
    ]),
  }
}

const QC_RESULT: Record<string, string> = {
  pass: 'PASS',
  pass_with_notes: 'PASS WITH NOTES',
  fail: 'FAIL',
}

function qcMeta(q: AnyRow): MetaRow[] {
  const photos = Array.isArray(q.photos) ? q.photos : []
  return [
    { label: 'Reference', value: String(q.reference ?? '') },
    { label: 'Submitted', value: fmtDateTime(q.created_at as string) },
    { label: 'Job #', value: String(q.job_number ?? '') },
    { label: 'Report date', value: fmtDate(q.report_date as string) },
    { label: 'Inspector', value: String(q.inspector_name ?? '') },
    { label: 'Result', value: QC_RESULT[String(q.result)] ?? String(q.result ?? '') },
    { label: 'Area inspected', value: String(q.area_inspected ?? '') },
    { label: 'Work inspected', value: String(q.work_inspected ?? '') },
    { label: 'Observations', value: String(q.observations ?? '') || '—' },
    { label: 'Deficiencies', value: String(q.deficiencies ?? '') || '—' },
    { label: 'Corrective actions', value: String(q.corrective_actions ?? '') || '—' },
    { label: 'Photos', value: `${photos.length} attached` },
  ]
}

export type ExportKind = 'material_order' | 'timesheet' | 'qc_report'

const KIND_LABEL: Record<ExportKind, string> = {
  material_order: 'MATERIAL ORDER',
  timesheet: 'TIMESHEET',
  qc_report: 'QC REPORT',
}

function metaFor(kind: ExportKind, row: AnyRow): MetaRow[] {
  if (kind === 'material_order') return orderMeta(row)
  if (kind === 'timesheet') return timesheetMeta(row)
  return qcMeta(row)
}

/* ==========================================================================
   Public API — single submission
   ========================================================================== */

export async function exportSubmissionExcel(kind: ExportKind, row: AnyRow) {
  const spec: SheetSpec = {
    kindLabel: KIND_LABEL[kind],
    subtitle: String(row.reference ?? ''),
    meta: metaFor(kind, row),
  }
  if (kind === 'material_order') {
    spec.tableTitle = 'Items requested'
    spec.table = orderItemsTable(row)
  } else if (kind === 'timesheet') {
    spec.tableTitle = 'Crew'
    spec.table = timesheetCrewTable(row)
  }
  const wb = await buildWorkbook([spec])
  await saveWorkbook(wb, `${row.reference ?? kind}.xlsx`)
}

export function exportSubmissionCsv(kind: ExportKind, row: AnyRow) {
  const rows: (string | number)[][] = [['Field', 'Value']]
  for (const m of metaFor(kind, row)) rows.push([m.label, m.value])
  if (kind === 'material_order') {
    rows.push([])
    rows.push(['#', 'Item', 'List', 'Qty', 'Note'])
    const items = (Array.isArray(row.items) ? row.items : []) as OrderItem[]
    items.forEach((it, i) =>
      rows.push([i + 1, it.name, LIST_LABEL[it.list] ?? it.list, it.quantity, it.note ?? '']),
    )
  } else if (kind === 'timesheet') {
    rows.push([])
    rows.push(['Employee', 'In', 'Out', 'Break', 'Reg', 'OT', 'PT', 'Total'])
    timesheetCrewTable(row).rows.forEach((r) => rows.push(r))
  }
  saveCsv(rows, `${row.reference ?? kind}.csv`)
}

/* ==========================================================================
   Public API — admin list exports
   ========================================================================== */

const LIST_COLUMNS: Record<ExportKind, { header: string; width: number; key: string }[]> = {
  material_order: [
    { header: 'Reference', width: 18, key: 'reference' },
    { header: 'Submitted', width: 20, key: '_submitted' },
    { header: 'Job #', width: 12, key: 'job_number' },
    { header: 'Site contact', width: 22, key: 'site_contact' },
    { header: 'Requested by', width: 20, key: 'requested_by' },
    { header: 'Needed by', width: 14, key: '_needed' },
    { header: 'Status', width: 12, key: 'status' },
    { header: 'Items', width: 8, key: '_items' },
  ],
  timesheet: [
    { header: 'Reference', width: 18, key: 'reference' },
    { header: 'Submitted', width: 20, key: '_submitted' },
    { header: 'Job #', width: 12, key: 'job_number' },
    { header: 'Work date', width: 14, key: '_work_date' },
    { header: 'Shift', width: 10, key: 'shift' },
    { header: 'Crew', width: 8, key: '_crew' },
    { header: 'Man-hours', width: 10, key: 'total_hours' },
    { header: 'Stoppage', width: 10, key: '_stoppage' },
    { header: 'Injuries', width: 10, key: '_injuries' },
  ],
  qc_report: [
    { header: 'Reference', width: 18, key: 'reference' },
    { header: 'Submitted', width: 20, key: '_submitted' },
    { header: 'Job #', width: 12, key: 'job_number' },
    { header: 'Report date', width: 14, key: '_report_date' },
    { header: 'Inspector', width: 20, key: 'inspector_name' },
    { header: 'Area', width: 26, key: 'area_inspected' },
    { header: 'Result', width: 16, key: '_result' },
    { header: 'Photos', width: 8, key: '_photos' },
  ],
}

function listCell(row: AnyRow, key: string): string | number {
  switch (key) {
    case '_submitted':
      return fmtDateTime(row.created_at as string)
    case '_needed':
      return fmtDate(row.needed_by as string)
    case '_work_date':
      return fmtDate(row.work_date as string)
    case '_report_date':
      return fmtDate(row.report_date as string)
    case '_result':
      return QC_RESULT[String(row.result)] ?? String(row.result ?? '')
    case '_items':
      return Array.isArray(row.items) ? row.items.length : 0
    case '_photos':
      return Array.isArray(row.photos) ? row.photos.length : 0
    case '_crew':
      return Array.isArray(row.employees) ? row.employees.length : 0
    case '_stoppage':
      return row.work_stoppage ? 'Yes' : 'No'
    case '_injuries':
      return row.injuries ? 'Yes' : 'No'
    default:
      return (row[key] as string | number) ?? ''
  }
}

const LIST_TITLE: Record<ExportKind, string> = {
  material_order: 'Material Orders',
  timesheet: 'Timesheets',
  qc_report: 'QC Reports',
}

export async function exportListExcel(kind: ExportKind, rows: AnyRow[]) {
  const cols = LIST_COLUMNS[kind]
  const spec: SheetSpec = {
    kindLabel: KIND_LABEL[kind],
    subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
    meta: [
      { label: 'Report', value: LIST_TITLE[kind] },
      { label: 'Records', value: String(rows.length) },
      { label: 'Exported', value: fmtDateTime(new Date().toISOString()) },
    ],
    tableTitle: LIST_TITLE[kind],
    table: {
      columns: cols.map((c) => ({ header: c.header, width: c.width })),
      rows: rows.map((row) => cols.map((c) => listCell(row, c.key))),
    },
  }
  const wb = await buildWorkbook([spec])
  const stamp = new Date().toISOString().slice(0, 10)
  await saveWorkbook(wb, `FCS-${LIST_TITLE[kind].replace(/\s+/g, '-')}-${stamp}.xlsx`)
}

export function exportListCsv(kind: ExportKind, rows: AnyRow[]) {
  const cols = LIST_COLUMNS[kind]
  const out: (string | number)[][] = [cols.map((c) => c.header)]
  rows.forEach((row) => out.push(cols.map((c) => listCell(row, c.key))))
  const stamp = new Date().toISOString().slice(0, 10)
  saveCsv(out, `FCS-${LIST_TITLE[kind].replace(/\s+/g, '-')}-${stamp}.csv`)
}
