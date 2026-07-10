import type ExcelJS from 'exceljs'
import logoUrl from '../assets/fine-logo.png'
import type { OrderItem } from './supabase'
import { normalizeDailyQCData, yesNoLabel, type DailyQCData } from './qc'

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

const QC_TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/daily-qc-report-template.xlsx`
const TIMESHEET_TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/timesheet-template.xlsx`
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CHECKED = '\u2611'
const EMPTY_BOX = '\u2610'

function sheetDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US')
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function setInlineCell(xml: string, address: string, value: string): string {
  const escapedAddress = address.replace(/\$/g, '\\$&')
  const inlineCell = (attrs: string) => {
    const style = attrs.match(/\ss="([^"]+)"/)?.[1]
    const styleAttr = style ? ` s="${style}"` : ''
    return `<c r="${address}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
  }
  const emptyCellPattern = new RegExp(`<c r="${escapedAddress}"([^>]*)\\/>`)
  if (emptyCellPattern.test(xml)) return xml.replace(emptyCellPattern, (_cell, attrs: string) => inlineCell(attrs))
  const cellPattern = new RegExp(`<c r="${escapedAddress}"([^>]*)>[\\s\\S]*?<\\/c>`)
  return xml.replace(emptyCellPattern, (_cell, attrs: string) => inlineCell(attrs))
    .replace(cellPattern, (_cell, attrs: string) => inlineCell(attrs))
}

function applyCellPatches(xml: string, patches: Record<string, string>): string {
  return Object.entries(patches).reduce((current, [address, value]) => setInlineCell(current, address, value), xml)
}

function addPatch(patches: Record<string, string>, address: string, value: unknown) {
  const text = String(value ?? '').trim()
  if (text) patches[address] = text
}

function box(on: boolean): string {
  return on ? CHECKED : EMPTY_BOX
}

function markYesNo(value: string, yes = 'YES', no = 'NO'): string {
  return `${box(value === 'yes')} ${yes}    ${box(value === 'no')} ${no}`
}

function markYesNoNA(value: string): string {
  return `${box(value === 'yes')} YES    ${box(value === 'no')} NO    ${box(value === 'na')} N/A`
}

function dayLine(value: string): string {
  const selected = value.trim().toUpperCase()
  return ['M', 'T', 'W', 'TH', 'F', 'S', 'SU']
    .map((day) => `${box(selected === day)} ${day}`)
    .join('    ')
    .replace(/^/, 'DAY:    ')
}

function withUnit(value: string, unit: string): string {
  const text = value.trim()
  return text ? `${text}${unit}` : unit
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  const paragraphs = clean.split('\n').flatMap((line) => line.trim() ? [line.trim()] : [''])
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      if (lines.length < maxLines) lines.push('')
      continue
    }
    let current = ''
    for (const word of paragraph.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word
      if (next.length > maxChars && current) {
        lines.push(current)
        current = word
        if (lines.length >= maxLines) return lines
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
    if (lines.length >= maxLines) return lines
  }
  return lines.slice(0, maxLines)
}

function addWrappedRows(patches: Record<string, string>, column: string, startRow: number, endRow: number, text: string, maxChars: number) {
  wrapLines(text, maxChars, endRow - startRow + 1).forEach((line, index) => {
    patches[`${column}${startRow + index}`] = line
  })
}

function optionChecked(values: string[], label: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '')
  const wanted = norm(label)
  return values.some((value) => norm(value) === wanted)
}

function surfaceMethodLine(d: DailyQCData): string {
  const options = ['Power Tool', 'Hand Tool', 'Sanding', 'Solvent Cleaning', 'Power Wash']
  const parts = options.map((label) => `${box(optionChecked(d.surface_preparation_methods, label))} ${label}`)
  const hasOther = Boolean(d.surface_preparation_other.trim())
  parts.push(`${box(hasOther)} Other${hasOther ? ` ${d.surface_preparation_other.trim()}` : '______________'}`)
  return `Method:   ${parts.join('     ')}`
}

function coatingLine(application: DailyQCData['coating_applications'][number]): string {
  const options = ['Primer', 'Intermediate', 'Finish', 'Intumescent', 'Stripe', 'Sealer']
  const parts = options.map((label) => `${box(optionChecked(application.coatings, label))} ${label}`)
  const hasOther = Boolean(application.coating_other.trim())
  parts.push(`${box(hasOther)} Other${hasOther ? ` ${application.coating_other.trim()}` : '________________'}`)
  return `Coating:    ${parts.join('    ')}`
}

function applicationMethodLine(application: DailyQCData['coating_applications'][number]): string {
  const methods = [
    ['Airless/Con. Spray', 'Airless/Con.Spray'],
    ['Brush', 'Brush'],
    ['Roller', 'Roller'],
    ['Trowel', 'Trowel'],
  ] as const
  return `Method of Application:    ${methods
    .map(([stored, label]) => `${box(optionChecked(application.application_methods, stored))} ${label}`)
    .join('    ')}`
}

function blankLine(value: string, blank = '______________________________________'): string {
  return value.trim() || blank
}

function wftLine(readings: string[]): string {
  return `WFT Readings:      ${Array.from({ length: 7 }, (_, index) => readings[index]?.trim() || '').join(' / ')}`
}

function fillHeader(patches: Record<string, string>, q: AnyRow, d: DailyQCData, page: number) {
  patches.P1 = `PAGE ${page} of ${d.page_total || '2'}`
  patches.E3 = dayLine(d.day_of_week)
  addPatch(patches, 'B4', sheetDate(q.report_date as string))
  addPatch(patches, 'N4', d.contract_number)
  addPatch(patches, 'B5', d.project || String(q.job_number ?? ''))
}

function fillCoatingBlock(patches: Record<string, string>, startRow: number, application: DailyQCData['coating_applications'][number]) {
  const coatingRow = startRow + 2
  const mixRow = startRow + 3
  const manufactureRow = startRow + 4
  const productRow = startRow + 5
  const kitRow = startRow + 6
  const shelfRow = startRow + 7
  const methodRow = startRow + 8
  const wftRow = startRow + 9

  addWrappedRows(patches, 'D', startRow, startRow, application.application_locations, 115)
  addWrappedRows(patches, 'A', startRow + 1, startRow + 1, application.application_locations.length > 115 ? application.application_locations.slice(115) : '', 150)
  patches[`A${coatingRow}`] = coatingLine(application)
  patches[`A${mixRow}`] = `Mix(s) Witnessed & Acceptable:    ${markYesNo(application.mix_witnessed_acceptable)}`
  patches[`A${manufactureRow}`] = `Manufacture: ${application.manufacturer}`
  patches[`A${productRow}`] = `Product Name: ${application.product_name}`
  patches[`A${kitRow}`] = `Kit Size & Color: ${application.kit_size_color}`
  patches[`A${shelfRow}`] = `Shelf Life: ${application.shelf_life}`
  patches[`I${manufactureRow}`] = `Part: ${application.parts[0] ?? ''}`
  patches[`I${productRow}`] = `Part: ${application.parts[1] ?? ''}`
  patches[`I${kitRow}`] = `Part: ${application.parts[2] ?? ''}`
  addPatch(patches, `K${manufactureRow}`, application.batch_lot_numbers[0])
  addPatch(patches, `K${productRow}`, application.batch_lot_numbers[1])
  addPatch(patches, `K${kitRow}`, application.batch_lot_numbers[2])
  addPatch(patches, `M${manufactureRow}`, application.number_of_mixes)
  ;[manufactureRow, productRow, kitRow].forEach((row, index) => {
    const ordinal = ['1st', '2nd', '3rd'][index]
    patches[`N${row}`] = `${ordinal} : ${application.material_temperatures[index] ?? ''}`
    patches[`S${row}`] = `: ${application.mix_times[index] ?? ''}`
  })
  patches[`I${shelfRow}`] = `Reducer: ${application.reducer}        #: ${application.reducer_number}`
  patches[`N${shelfRow}`] = `Pot Life: ${application.pot_life}`
  patches[`A${methodRow}`] = applicationMethodLine(application)
  patches[`N${methodRow}`] = `Total Gallons Applied: ${application.total_gallons_applied}`
  patches[`A${wftRow}`] = `Required WFT: ${application.required_wft}`
  patches[`F${wftRow}`] = wftLine(application.wft_readings)
  patches[`S${wftRow}`] = `Avg WFT: ${application.average_wft}`
}

function dailyQCPatches(q: AnyRow): Record<string, Record<string, string>> {
  const d = qcData(q)
  const page1: Record<string, string> = {}
  const page2: Record<string, string> = {}
  fillHeader(page1, q, d, 1)
  fillHeader(page2, q, d, 2)

  addPatch(page1, 'C6', d.weather_am)
  addPatch(page1, 'M6', d.weather_pm)
  addPatch(page1, 'E7', d.workers_on_site)
  addPatch(page1, 'M7', d.start_time)
  addPatch(page1, 'R7', d.stop_time)
  addPatch(page1, 'B10', d.ambient_location)

  const ambientColumns = ['B', 'D', 'F', 'H']
  d.ambient_readings.forEach((reading, index) => {
    const col = ambientColumns[index]
    if (!col) return
    addPatch(page1, `${col}12`, reading.time)
    page1[`${col}13`] = withUnit(reading.relative_humidity, '%')
    page1[`${col}14`] = withUnit(reading.air_temperature, '°F')
    page1[`${col}15`] = withUnit(reading.surface_temperature, '°F')
    page1[`${col}16`] = withUnit(reading.dew_point, '°F')
    addPatch(page1, `${col}17`, reading.surface_dew_point_depression)
  })

  d.instruments.slice(0, 4).forEach((instrument, index) => {
    const row = 12 + index
    addPatch(page1, `K${row}`, instrument.instrument)
    addPatch(page1, `L${row}`, instrument.serial_number)
    page1[`N${row}`] = instrument.calibrated ? markYesNo(instrument.calibrated, 'Y', 'N') : 'Y      N'
    addPatch(page1, `P${row}`, instrument.standard_reading_1)
    addPatch(page1, `R${row}`, instrument.standard_reading_2)
    addPatch(page1, `T${row}`, instrument.standard_reading_3)
  })
  page1.K16 = `Has the Quality Control Supervisor collected & inspected the inspection equipment within the past 12 months?      ${markYesNo(d.equipment_inspected_within_12_months)}`

  addWrappedRows(page1, 'A', 19, 30, d.description_of_areas_locations_work_performed, 145)
  page1.A32 = `Surface Preparation Required:  SSPC SP-${d.surface_preparation_required}`
  page1.K32 = `Surface Preparation Performed:  SSPC SP-${d.surface_preparation_performed}`
  page1.A33 = `Surface Profile Required: ${d.surface_profile_required}`
  page1.K33 = `Surface Profile Achieved: ${d.surface_profile_achieved}`
  page1.A34 = surfaceMethodLine(d)
  page1.A35 = `Is the surface to be painted:  Clean, Moisture Free, Free of oil, Grease, Dirt & other Contaminants?      ${markYesNo(d.surface_clean_moisture_free)}`
  page1.A36 = `IF NO DO NOT PROCEED!  Explain: ${d.do_not_proceed_explanation}`
  page1.A37 = `Was Any Hazardous Waste Generated?   ${markYesNo(d.hazardous_waste_generated)}.   If Yes was it properly stored & identified? ${markYesNo(d.hazardous_waste_properly_stored_identified)}`
  page1.A38 = `COMMENTS: ${d.surface_preparation_comments}`
  page1.A39 = `Light Meter Serial No. ${blankLine(d.light_meter_serial_number, '____________')}    Light Reading Inside Enclosure ${blankLine(d.light_readings[0]?.foot_candles ?? '', '______')} FC ${blankLine(d.light_readings[0]?.time ?? '', '______')} Time ${blankLine(d.light_readings[1]?.foot_candles ?? '', '______')} FC ${blankLine(d.light_readings[1]?.time ?? '', '______')} Time`
  addPatch(page1, 'D41', d.competent_person_print)
  addPatch(page1, 'O41', d.competent_person_signature)
  addPatch(page1, 'D43', d.qc_supervisor_print)
  addPatch(page1, 'O43', d.qc_supervisor_signature)

  page2.A8 = `Sharp Edges and Weld Splatter Removed      ${markYesNoNA(d.sharp_edges_weld_splatter_removed)}`
  page2.A9 = `Clean and Dry Abrasive      ${markYesNoNA(d.clean_dry_abrasive)}`
  page2.A10 = `Type of Abrasive and Size ${blankLine(d.abrasive_type_size)}`
  page2.A11 = `Compressed Air Check      ${markYesNoNA(d.compressed_air_check)}`
  page2.A12 = `Nozzle Air Pressure ${blankLine(d.nozzle_air_pressure)}`
  page2.A13 = `Blotter Test      ${markYesNoNA(d.blotter_test)}`
  page2.A15 = `Any Safety Issues occur?      ${markYesNo(d.safety_issues_occurred, 'Yes', 'No')}`
  page2.I15 = `If Yes was a copy sent to the field office?      ${markYesNo(d.safety_issue_copy_sent_to_field_office, 'Yes', 'No')}`
  page2.A16 = `Are the workers wearing proper PPE?      ${markYesNo(d.workers_wearing_proper_ppe, 'Yes', 'No')}`
  page2.I16 = `Is pre start Safety Talks being performed?      ${markYesNo(d.pre_start_safety_talks_performed, 'Yes', 'No')}`
  fillCoatingBlock(page2, 18, d.coating_applications[0])
  fillCoatingBlock(page2, 29, d.coating_applications[1])
  page2.A39 = `Comments: ${d.coating_comments}`
  addPatch(page2, 'D41', d.competent_person_print)
  addPatch(page2, 'O41', d.competent_person_signature)
  addPatch(page2, 'D43', d.qc_supervisor_print)
  addPatch(page2, 'O43', d.qc_supervisor_signature)

  return {
    'xl/worksheets/sheet1.xml': page1,
    'xl/worksheets/sheet2.xml': page2,
  }
}

async function saveDailyQCTemplateWorkbook(q: AnyRow, filename: string) {
  const [{ default: JSZip }, template] = await Promise.all([
    import('jszip'),
    fetch(QC_TEMPLATE_URL).then((res) => {
      if (!res.ok) throw new Error(`Unable to load QC Excel template (${res.status})`)
      return res.arrayBuffer()
    }),
  ])
  const zip = await JSZip.loadAsync(template)
  const patches = dailyQCPatches(q)
  await Promise.all(Object.entries(patches).map(async ([path, cellPatches]) => {
    const file = zip.file(path)
    if (!file) throw new Error(`QC Excel template is missing ${path}`)
    const xml = await file.async('string')
    zip.file(path, applyCellPatches(xml, cellPatches))
  }))
  const blob = await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME })
  download(blob, filename)
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
  location_of_work?: string | null
  type_of_work?: string | null
  payment?: string | null
  code?: string | null
}

const yesNo = (v: unknown) => (v ? 'Yes' : 'No')
const txt = (v: unknown): string => String(v ?? '').trim()

type TimesheetDailyReport = {
  ambient_time_1?: string
  relative_humidity_1?: string
  ambient_temp_1?: string
  surface_temp_1?: string
  dew_point_1?: string
  ambient_time_2?: string
  relative_humidity_2?: string
  ambient_temp_2?: string
  surface_temp_2?: string
  dew_point_2?: string
  paint_batch_part_a?: string
  paint_batch_part_b?: string
  paint_type?: string
  mixing_time_part_a?: string
  mixing_time_part_b?: string
  mixing_time_combined?: string
  surface_prep_performed?: string
  surface_clean?: boolean
  wet_mil_readings_a?: string
  wet_mil_readings_b?: string
  time_between_coats?: string
  recoat_exceeded?: boolean
  corrective_action?: string
  remarks?: string
}

function timesheetDailyReport(t: AnyRow): TimesheetDailyReport {
  return (t.daily_report && typeof t.daily_report === 'object' ? t.daily_report : {}) as TimesheetDailyReport
}

function slashList(value: unknown, slots: number): string {
  const text = txt(value)
  if (!text) return Array.from({ length: slots }, () => '').join(' / ')
  const parts = text.includes('/') ? text.split('/') : text.split(/[,;\n]+/)
  return Array.from({ length: slots }, (_, index) => txt(parts[index])).join(' / ')
}

function markedYesNo(value: boolean | undefined, defaultValue = false): string {
  const on = value ?? defaultValue
  return `${on ? 'X' : '____'} Yes    ${on ? '____' : 'X'} No`
}

function fillTemplateLine(label: string, value: unknown): string {
  return `${label}${txt(value)}`
}

function tempF(value: unknown): string {
  const text = txt(value)
  if (!text) return ''
  return /[fF]$/.test(text) ? text : `${text}°F`
}

function timesheetMeta(t: AnyRow): MetaRow[] {
  const emps = (Array.isArray(t.employees) ? t.employees : []) as EmployeeEntry[]
  const crew = emps
    .map((e) => `${e.name} (${e.total ?? 0}h${e.ot_hours ? `, OT ${e.ot_hours}` : ''}${e.pt_hours ? `, PT ${e.pt_hours}` : ''})`)
    .join('; ')
  return [
    { label: 'Reference', value: String(t.reference ?? '') },
    { label: 'Submitted', value: fmtDateTime(t.created_at as string) },
    { label: 'Job #', value: String(t.job_number ?? '') },
    { label: 'Job name', value: String(t.job_name ?? '') || '—' },
    { label: 'Written by', value: String(t.written_by ?? '') || '—' },
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
      { header: 'Location of Work', width: 24 },
      { header: 'Type of Work', width: 24 },
      { header: 'Payment', width: 12 },
      { header: 'Code', width: 10 },
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
      e.location_of_work ?? '',
      e.type_of_work ?? '',
      e.payment ?? '',
      e.code ?? '',
    ]),
  }
}

function timesheetTemplatePatches(t: AnyRow): Record<string, string> {
  const patches: Record<string, string> = {}
  const daily = timesheetDailyReport(t)
  const emps = (Array.isArray(t.employees) ? t.employees : []) as EmployeeEntry[]
  const defaultLocation = txt(t.job_floor)
  const defaultWork = txt(t.work_performed)
  const hiddenEmployees = emps.slice(23)

  patches.A2 = `Job #: ${txt(t.job_number)}`
  patches.C2 = `Job Name: ${txt(t.job_name)}`
  patches.D2 = `Written by (Print) : ${txt(t.written_by)}`
  patches.A3 = `Date: ${sheetDate(t.work_date as string)}`
  patches.D3 = `Date: ${sheetDate((t.created_at as string) || (t.work_date as string))}`

  emps.slice(0, 23).forEach((employee, index) => {
    const row = 6 + index
    patches[`A${row}`] = txt(employee.name)
    patches[`B${row}`] = txt(employee.total)
    patches[`C${row}`] = txt(employee.location_of_work) || defaultLocation
    patches[`D${row}`] = txt(employee.type_of_work) || defaultWork
    patches[`E${row}`] = txt(employee.payment)
    patches[`F${row}`] = txt(employee.code)
  })

  patches.A30 = `Time ${txt(daily.ambient_time_1)}   Relative Humidity ${txt(daily.relative_humidity_1)} %   Ambient Temp ${tempF(daily.ambient_temp_1)}`
  patches.D30 = `Surface Temp ${tempF(daily.surface_temp_1)}   Dew Point ${tempF(daily.dew_point_1)}`
  patches.A31 = `Time ${txt(daily.ambient_time_2)}   Relative Humidity ${txt(daily.relative_humidity_2)} %   Ambient Temp ${tempF(daily.ambient_temp_2)}`
  patches.D31 = `Surface Temp ${tempF(daily.surface_temp_2)}    Dew Point ${tempF(daily.dew_point_2)}`
  patches.A32 = `Paint Batch # Part A ${slashList(daily.paint_batch_part_a, 3)}    Paint Batch  # Part B ${slashList(daily.paint_batch_part_b, 3)}   Paint Type: ${txt(daily.paint_type) || 'Latex,  Epoxy,  Oil'}`
  patches.A33 = `Mixing Time for: Part A ${txt(daily.mixing_time_part_a)}  Part B ${txt(daily.mixing_time_part_b)} Combined ${txt(daily.mixing_time_combined)}   Describe Surface Preparation Performed: ${txt(daily.surface_prep_performed) || 'SP1,  SP2,  SP3,  Other'}`
  patches.A34 = `Is the surface to be painted: Clean, Dry, Free of Oil, Grease, Dirt and other contaminants?   ${markedYesNo(daily.surface_clean, true)} IF NO DO NOT PROCEED! (Check one)`
  patches.A35 = `Wet Mil Readings ${slashList(daily.wet_mil_readings_a, 5)}     Wet Mil Readings ${slashList(daily.wet_mil_readings_b, 5)}`
  patches.A36 = `Actual time between last coat and today's coat ${txt(daily.time_between_coats)}  Was recoat window exceeded? ${markedYesNo(daily.recoat_exceeded)} If yes what corrective action was taken? ${txt(daily.corrective_action)}`

  const flags = [
    t.work_stoppage ? `Work stoppage: ${txt(t.work_stoppage_note) || 'Yes'}` : '',
    t.injuries ? `Injuries: ${txt(t.injuries_note) || 'Yes'}` : '',
    hiddenEmployees.length ? `Additional employees not shown: ${hiddenEmployees.map((e) => e.name).join(', ')}` : '',
  ].filter(Boolean)
  patches.A37 = fillTemplateLine('Remarks ', [daily.remarks, t.notes, flags.join(' | ')].map(txt).filter(Boolean).join(' | '))

  return patches
}

async function saveTimesheetTemplateWorkbook(t: AnyRow, filename: string) {
  const [{ default: JSZip }, template] = await Promise.all([
    import('jszip'),
    fetch(TIMESHEET_TEMPLATE_URL).then((res) => {
      if (!res.ok) throw new Error(`Unable to load timesheet Excel template (${res.status})`)
      return res.arrayBuffer()
    }),
  ])
  const zip = await JSZip.loadAsync(template)
  const path = 'xl/worksheets/sheet1.xml'
  const file = zip.file(path)
  if (!file) throw new Error(`Timesheet Excel template is missing ${path}`)
  const xml = await file.async('string')
  zip.file(path, applyCellPatches(xml, timesheetTemplatePatches(t)))
  const blob = await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME })
  download(blob, filename)
}

function qcData(q: AnyRow): DailyQCData {
  return normalizeDailyQCData(q.details)
}

function qcRows(q: AnyRow): MetaRow[] {
  const d = qcData(q)
  const rows: MetaRow[] = [
    { label: 'Reference', value: String(q.reference ?? '') },
    { label: 'Submitted', value: fmtDateTime(q.created_at as string) },
    { label: 'Date', value: fmtDate(q.report_date as string) },
    { label: 'Day', value: d.day_of_week },
    { label: 'Page', value: `${d.page_number} of ${d.page_total}` },
    { label: 'Project', value: d.project || String(q.job_number ?? '') },
    { label: 'Contract No.', value: d.contract_number },
    { label: 'Weather AM', value: d.weather_am },
    { label: 'Weather PM', value: d.weather_pm },
    { label: 'Number of Workers Onsite', value: d.workers_on_site },
    { label: 'Start Time', value: d.start_time },
    { label: 'Stop Time', value: d.stop_time },
    { label: 'AMBIENT CONDITIONS — Location', value: d.ambient_location },
  ]
  d.ambient_readings.forEach((reading, index) => {
    const n = index + 1
    rows.push(
      { label: `Ambient ${n} — Time (24hr)`, value: reading.time },
      { label: `Ambient ${n} — Relative Humidity %`, value: reading.relative_humidity },
      { label: `Ambient ${n} — Temperature Air °F`, value: reading.air_temperature },
      { label: `Ambient ${n} — Temperature Surface °F`, value: reading.surface_temperature },
      { label: `Ambient ${n} — Temperature Dew Point °F`, value: reading.dew_point },
      { label: `Ambient ${n} — Surface / Dew Point Depression`, value: reading.surface_dew_point_depression },
    )
  })
  d.instruments.forEach((instrument, index) => {
    const n = index + 1
    rows.push(
      { label: `Instrument ${n} — Instrument`, value: instrument.instrument },
      { label: `Instrument ${n} — Serial #`, value: instrument.serial_number },
      { label: `Instrument ${n} — Calibrated`, value: yesNoLabel(instrument.calibrated) },
      { label: `Instrument ${n} — Calibration Check Reading 1`, value: instrument.standard_reading_1 },
      { label: `Instrument ${n} — Calibration Check Reading 2`, value: instrument.standard_reading_2 },
      { label: `Instrument ${n} — Calibration Check Reading 3`, value: instrument.standard_reading_3 },
    )
  })
  rows.push(
    { label: 'Equipment collected & inspected within past 12 months', value: yesNoLabel(d.equipment_inspected_within_12_months) },
    { label: 'DESCRIPTION OF AREAS / LOCATIONS & WORK PERFORMED', value: d.description_of_areas_locations_work_performed },
    { label: 'Surface Preparation Required: SSPC SP-', value: d.surface_preparation_required },
    { label: 'Surface Preparation Performed: SSPC SP-', value: d.surface_preparation_performed },
    { label: 'Surface Profile Required', value: d.surface_profile_required },
    { label: 'Surface Profile Achieved', value: d.surface_profile_achieved },
    { label: 'Surface Preparation Method', value: d.surface_preparation_methods.join(', ') },
    { label: 'Surface Preparation Method — Other', value: d.surface_preparation_other },
    { label: 'Surface clean, moisture free, free of contaminants', value: yesNoLabel(d.surface_clean_moisture_free) },
    { label: 'If no, do not proceed — Explain', value: d.do_not_proceed_explanation },
    { label: 'Hazardous waste generated', value: yesNoLabel(d.hazardous_waste_generated) },
    { label: 'Hazardous waste properly stored & identified', value: yesNoLabel(d.hazardous_waste_properly_stored_identified) },
    { label: 'Surface Preparation Comments', value: d.surface_preparation_comments },
    { label: 'Light Meter Serial No.', value: d.light_meter_serial_number },
  )
  d.light_readings.forEach((reading, index) => rows.push(
    { label: `Light Reading ${index + 1} — FC`, value: reading.foot_candles },
    { label: `Light Reading ${index + 1} — Time`, value: reading.time },
  ))
  rows.push(
    { label: 'Sharp Edges and Weld Splatter Removed', value: yesNoLabel(d.sharp_edges_weld_splatter_removed) },
    { label: 'Clean and Dry Abrasive', value: yesNoLabel(d.clean_dry_abrasive) },
    { label: 'Type of Abrasive and Size', value: d.abrasive_type_size },
    { label: 'Compressed Air Check', value: yesNoLabel(d.compressed_air_check) },
    { label: 'Nozzle Air Pressure', value: d.nozzle_air_pressure },
    { label: 'Blotter Test', value: yesNoLabel(d.blotter_test) },
    { label: 'Any Safety Issues Occur', value: yesNoLabel(d.safety_issues_occurred) },
    { label: 'Safety issue copy sent to field office', value: yesNoLabel(d.safety_issue_copy_sent_to_field_office) },
    { label: 'Workers wearing proper PPE', value: yesNoLabel(d.workers_wearing_proper_ppe) },
    { label: 'Pre-start Safety Talks being performed', value: yesNoLabel(d.pre_start_safety_talks_performed) },
  )
  d.coating_applications.forEach((application, index) => {
    const n = index + 1
    rows.push(
      { label: `COATING APPLICATION ${n} — Application Location(s)`, value: application.application_locations },
      { label: `Coating Application ${n} — Coating`, value: application.coatings.join(', ') },
      { label: `Coating Application ${n} — Other`, value: application.coating_other },
      { label: `Coating Application ${n} — Mix(s) Witnessed & Acceptable`, value: yesNoLabel(application.mix_witnessed_acceptable) },
      { label: `Coating Application ${n} — Manufacturer`, value: application.manufacturer },
      { label: `Coating Application ${n} — Product Name`, value: application.product_name },
      { label: `Coating Application ${n} — Kit Size & Color`, value: application.kit_size_color },
      { label: `Coating Application ${n} — Shelf Life`, value: application.shelf_life },
      { label: `Coating Application ${n} — Reducer`, value: application.reducer },
      { label: `Coating Application ${n} — Reducer #`, value: application.reducer_number },
      { label: `Coating Application ${n} — Pot Life`, value: application.pot_life },
      { label: `Coating Application ${n} — # Of Mixes`, value: application.number_of_mixes },
      { label: `Coating Application ${n} — Method of Application`, value: application.application_methods.join(', ') },
      { label: `Coating Application ${n} — Total Gallons Applied`, value: application.total_gallons_applied },
      { label: `Coating Application ${n} — Required WFT`, value: application.required_wft },
      { label: `Coating Application ${n} — Average WFT`, value: application.average_wft },
    )
    application.batch_lot_numbers.forEach((value, row) => rows.push(
      { label: `Coating Application ${n} — Batch / Lot # ${row + 1}`, value },
      { label: `Coating Application ${n} — Part ${row + 1}`, value: application.parts[row] },
      { label: `Coating Application ${n} — Material Temp ${row + 1} °F`, value: application.material_temperatures[row] },
      { label: `Coating Application ${n} — Mix Time ${row + 1}`, value: application.mix_times[row] },
    ))
    application.wft_readings.forEach((value, row) => rows.push({ label: `Coating Application ${n} — WFT Reading ${row + 1}`, value }))
  })
  rows.push(
    { label: 'Coating Comments', value: d.coating_comments },
    { label: 'Competent Person Print', value: d.competent_person_print },
    { label: 'Competent Person Sign', value: d.competent_person_signature },
    { label: 'QC Supervisor Print', value: d.qc_supervisor_print },
    { label: 'QC Supervisor Sign', value: d.qc_supervisor_signature },
  )
  return rows
}

function qcMeta(q: AnyRow): MetaRow[] {
  return qcRows(q)
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
  if (kind === 'qc_report') {
    await saveDailyQCTemplateWorkbook(row, `${row.reference ?? kind}.xlsx`)
    return
  }
  if (kind === 'timesheet') {
    await saveTimesheetTemplateWorkbook(row, `${row.reference ?? kind}.xlsx`)
    return
  }
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
    rows.push(['Employee', 'In', 'Out', 'Break', 'Reg', 'OT', 'PT', 'Total', 'Location of Work', 'Type of Work', 'Payment', 'Code'])
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
    { header: 'Job name', width: 24, key: 'job_name' },
    { header: 'Work date', width: 14, key: '_work_date' },
    { header: 'Written by', width: 18, key: 'written_by' },
    { header: 'Shift', width: 10, key: 'shift' },
    { header: 'Crew', width: 8, key: '_crew' },
    { header: 'Man-hours', width: 10, key: 'total_hours' },
    { header: 'Stoppage', width: 10, key: '_stoppage' },
    { header: 'Injuries', width: 10, key: '_injuries' },
  ],
  qc_report: [
    { header: 'Reference', width: 18, key: 'reference' },
    { header: 'Submitted', width: 20, key: '_submitted' },
    { header: 'Project', width: 24, key: '_qc_project' },
    { header: 'Contract No.', width: 18, key: '_qc_contract' },
    { header: 'Report date', width: 14, key: '_report_date' },
    { header: 'QC supervisor', width: 22, key: '_qc_supervisor' },
    { header: 'Work / location', width: 34, key: '_qc_work' },
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
    case '_qc_project':
      return qcData(row).project || String(row.job_number ?? '')
    case '_qc_contract':
      return qcData(row).contract_number
    case '_qc_supervisor':
      return qcData(row).qc_supervisor_print || String(row.inspector_name ?? '')
    case '_qc_work':
      return qcData(row).description_of_areas_locations_work_performed || String(row.area_inspected ?? '')
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
