export type YesNo = 'yes' | 'no' | ''
export type YesNoNA = YesNo | 'na'

export type AmbientReading = {
  time: string
  relative_humidity: string
  air_temperature: string
  surface_temperature: string
  dew_point: string
  surface_dew_point_depression: string
}

export type InstrumentRecord = {
  instrument: string
  serial_number: string
  calibrated: YesNo
  standard_reading_1: string
  standard_reading_2: string
  standard_reading_3: string
}

export type CoatingApplication = {
  application_locations: string
  coatings: string[]
  coating_other: string
  mix_witnessed_acceptable: YesNo
  manufacturer: string
  product_name: string
  kit_size_color: string
  shelf_life: string
  batch_lot_numbers: string[]
  parts: string[]
  number_of_mixes: string
  material_temperatures: string[]
  mix_times: string[]
  reducer: string
  reducer_number: string
  pot_life: string
  application_methods: string[]
  total_gallons_applied: string
  required_wft: string
  wft_readings: string[]
  average_wft: string
}

export type DailyQCData = {
  day_of_week: string
  page_number: string
  page_total: string
  project: string
  contract_number: string
  weather_am: string
  weather_pm: string
  workers_on_site: string
  start_time: string
  stop_time: string
  ambient_location: string
  ambient_readings: AmbientReading[]
  instruments: InstrumentRecord[]
  equipment_inspected_within_12_months: YesNo
  description_of_areas_locations_work_performed: string
  surface_preparation_required: string
  surface_preparation_performed: string
  surface_profile_required: string
  surface_profile_achieved: string
  surface_preparation_methods: string[]
  surface_preparation_other: string
  surface_clean_moisture_free: YesNo
  do_not_proceed_explanation: string
  hazardous_waste_generated: YesNo
  hazardous_waste_properly_stored_identified: YesNo
  surface_preparation_comments: string
  light_meter_serial_number: string
  light_readings: { foot_candles: string; time: string }[]
  sharp_edges_weld_splatter_removed: YesNoNA
  clean_dry_abrasive: YesNoNA
  abrasive_type_size: string
  compressed_air_check: YesNoNA
  nozzle_air_pressure: string
  blotter_test: YesNoNA
  safety_issues_occurred: YesNo
  safety_issue_copy_sent_to_field_office: YesNo
  workers_wearing_proper_ppe: YesNo
  pre_start_safety_talks_performed: YesNo
  coating_applications: CoatingApplication[]
  coating_comments: string
  competent_person_print: string
  competent_person_signature: string
  qc_supervisor_print: string
  qc_supervisor_signature: string
}

const ambientReading = (): AmbientReading => ({
  time: '',
  relative_humidity: '',
  air_temperature: '',
  surface_temperature: '',
  dew_point: '',
  surface_dew_point_depression: '',
})

const instrumentRecord = (): InstrumentRecord => ({
  instrument: '',
  serial_number: '',
  calibrated: '',
  standard_reading_1: '',
  standard_reading_2: '',
  standard_reading_3: '',
})

export const coatingApplication = (): CoatingApplication => ({
  application_locations: '',
  coatings: [],
  coating_other: '',
  mix_witnessed_acceptable: '',
  manufacturer: '',
  product_name: '',
  kit_size_color: '',
  shelf_life: '',
  batch_lot_numbers: ['', '', ''],
  parts: ['', '', ''],
  number_of_mixes: '',
  material_temperatures: ['', '', ''],
  mix_times: ['', '', ''],
  reducer: '',
  reducer_number: '',
  pot_life: '',
  application_methods: [],
  total_gallons_applied: '',
  required_wft: '',
  wft_readings: ['', '', '', '', '', '', ''],
  average_wft: '',
})

export function createDailyQCData(): DailyQCData {
  return {
    day_of_week: '',
    page_number: '1',
    page_total: '2',
    project: '',
    contract_number: '',
    weather_am: '',
    weather_pm: '',
    workers_on_site: '',
    start_time: '',
    stop_time: '',
    ambient_location: '',
    ambient_readings: Array.from({ length: 4 }, ambientReading),
    instruments: Array.from({ length: 4 }, instrumentRecord),
    equipment_inspected_within_12_months: '',
    description_of_areas_locations_work_performed: '',
    surface_preparation_required: '',
    surface_preparation_performed: '',
    surface_profile_required: '',
    surface_profile_achieved: '',
    surface_preparation_methods: [],
    surface_preparation_other: '',
    surface_clean_moisture_free: '',
    do_not_proceed_explanation: '',
    hazardous_waste_generated: '',
    hazardous_waste_properly_stored_identified: '',
    surface_preparation_comments: '',
    light_meter_serial_number: '',
    light_readings: [{ foot_candles: '', time: '' }, { foot_candles: '', time: '' }],
    sharp_edges_weld_splatter_removed: '',
    clean_dry_abrasive: '',
    abrasive_type_size: '',
    compressed_air_check: '',
    nozzle_air_pressure: '',
    blotter_test: '',
    safety_issues_occurred: '',
    safety_issue_copy_sent_to_field_office: '',
    workers_wearing_proper_ppe: '',
    pre_start_safety_talks_performed: '',
    coating_applications: [coatingApplication(), coatingApplication()],
    coating_comments: '',
    competent_person_print: '',
    competent_person_signature: '',
    qc_supervisor_print: '',
    qc_supervisor_signature: '',
  }
}

function strings(value: unknown, length: number): string[] {
  const source = Array.isArray(value) ? value : []
  return Array.from({ length }, (_, index) => String(source[index] ?? ''))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Safely reads both new structured reports and older reports without details. */
export function normalizeDailyQCData(value: unknown): DailyQCData {
  const blank = createDailyQCData()
  const raw = asRecord(value)
  const ambient = Array.isArray(raw.ambient_readings) ? raw.ambient_readings : []
  const instruments = Array.isArray(raw.instruments) ? raw.instruments : []
  const applications = Array.isArray(raw.coating_applications) ? raw.coating_applications : []
  const toYesNo = (v: unknown): YesNo => (v === 'yes' || v === 'no' ? v : '')
  const toYesNoNA = (v: unknown): YesNoNA => (v === 'yes' || v === 'no' || v === 'na' ? v : '')
  const text = (key: keyof DailyQCData) => String(raw[key] ?? blank[key] ?? '')

  return {
    ...blank,
    ...Object.fromEntries(Object.keys(blank).map((key) => [key, text(key as keyof DailyQCData)])),
    ambient_readings: blank.ambient_readings.map((item, i) => ({ ...item, ...asRecord(ambient[i]) })),
    instruments: blank.instruments.map((item, i) => {
      const r = asRecord(instruments[i])
      return {
        ...item,
        ...r,
        calibrated: toYesNo(r.calibrated),
      } as InstrumentRecord
    }),
    surface_preparation_methods: strings(raw.surface_preparation_methods, 99).filter(Boolean),
    surface_clean_moisture_free: toYesNo(raw.surface_clean_moisture_free),
    hazardous_waste_generated: toYesNo(raw.hazardous_waste_generated),
    hazardous_waste_properly_stored_identified: toYesNo(raw.hazardous_waste_properly_stored_identified),
    equipment_inspected_within_12_months: toYesNo(raw.equipment_inspected_within_12_months),
    sharp_edges_weld_splatter_removed: toYesNoNA(raw.sharp_edges_weld_splatter_removed),
    clean_dry_abrasive: toYesNoNA(raw.clean_dry_abrasive),
    compressed_air_check: toYesNoNA(raw.compressed_air_check),
    blotter_test: toYesNoNA(raw.blotter_test),
    safety_issues_occurred: toYesNo(raw.safety_issues_occurred),
    safety_issue_copy_sent_to_field_office: toYesNo(raw.safety_issue_copy_sent_to_field_office),
    workers_wearing_proper_ppe: toYesNo(raw.workers_wearing_proper_ppe),
    pre_start_safety_talks_performed: toYesNo(raw.pre_start_safety_talks_performed),
    light_readings: blank.light_readings.map((item, i) => ({ ...item, ...asRecord((raw.light_readings as unknown[] | undefined)?.[i]) })),
    coating_applications: blank.coating_applications.map((item, i) => {
      const r = asRecord(applications[i])
      return {
        ...item,
        ...r,
        coatings: strings(r.coatings, 99).filter(Boolean),
        application_methods: strings(r.application_methods, 99).filter(Boolean),
        batch_lot_numbers: strings(r.batch_lot_numbers, 3),
        parts: strings(r.parts, 3),
        material_temperatures: strings(r.material_temperatures, 3),
        mix_times: strings(r.mix_times, 3),
        wft_readings: strings(r.wft_readings, 7),
        mix_witnessed_acceptable: toYesNo(r.mix_witnessed_acceptable),
      } as CoatingApplication
    }),
  }
}

export function yesNoLabel(value: YesNo | YesNoNA): string {
  return value === 'yes' ? 'YES' : value === 'no' ? 'NO' : value === 'na' ? 'N/A' : ''
}
