import type { Route } from '../lib/router'
import { IconClipboard, IconClock, IconTruck } from '../components/ui'

const MODULES: {
  route: Route
  icon: React.ReactNode
  title: string
  desc: string
}[] = [
  {
    route: 'orders',
    icon: <IconTruck size={20} />,
    title: 'Material Order',
    desc: 'Browse the Lead Job and Painting order lists and request materials for shipment to your site.',
  },
  {
    route: 'timesheet',
    icon: <IconClock size={20} />,
    title: 'Timesheet',
    desc: 'Submit daily hours with time in / out, breaks, and work performed against a job number.',
  },
  {
    route: 'qc',
    icon: <IconClipboard size={20} />,
    title: 'QC Report',
    desc: 'File quality control inspections with findings, corrective actions, and site photos.',
  },
]

export function Home(props: { onNavigate: (r: Route) => void }) {
  return (
    <>
      <div className="banner banner-info">
        Submissions are delivered to the office by email automatically. Material orders are
        prepared by the warehouse and shipped for the date you request.
      </div>
      <div className="module-grid">
        {MODULES.map((m) => (
          <button key={m.route} className="module-card" onClick={() => props.onNavigate(m.route)}>
            <div className="module-icon">{m.icon}</div>
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
            <div className="go">Open →</div>
          </button>
        ))}
      </div>
    </>
  )
}
