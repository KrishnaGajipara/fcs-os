import logo from './assets/fine-logo.png'
import { useRoute, type Route } from './lib/router'
import { IconClipboard, IconClock, IconGrid, IconLock, IconTruck } from './components/ui'
import { Home } from './views/Home'
import { MaterialOrder } from './views/MaterialOrder'
import { Timesheet } from './views/Timesheet'
import { QCReport } from './views/QCReport'
import { Admin } from './views/Admin'
import { Track } from './views/Track'

const PAGES: Record<Route, { title: string; sub: string }> = {
  home: {
    title: 'FCS Operating System',
    sub: 'Internal operations · Fine Construction Specialties',
  },
  orders: {
    title: 'Material Order',
    sub: 'Request materials from the warehouse for shipment to your job site.',
  },
  timesheet: {
    title: 'Timesheet',
    sub: 'Record daily hours against a job number.',
  },
  qc: {
    title: 'QC Report',
    sub: 'File a quality control inspection report with photos.',
  },
  admin: {
    title: 'Admin',
    sub: 'Operations dashboard — restricted access.',
  },
  track: {
    title: 'Order Tracking',
    sub: 'Shipment status for a material order.',
  },
}

export default function App() {
  const [route, navigate] = useRoute()
  const page = PAGES[route]

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo-tile">
            <img src={logo} alt="FINE — Fine Construction Specialties" />
          </div>
          <div>
            <div className="brand-name">FCS OS</div>
            <div className="brand-sub">Operating System</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-label">Modules</span>
          <button
            className={`nav-item ${route === 'home' ? 'active' : ''}`}
            onClick={() => navigate('home')}
          >
            <IconGrid /> Overview
          </button>
          <button
            className={`nav-item ${route === 'orders' ? 'active' : ''}`}
            onClick={() => navigate('orders')}
          >
            <IconTruck /> Material Order
          </button>
          <button
            className={`nav-item ${route === 'timesheet' ? 'active' : ''}`}
            onClick={() => navigate('timesheet')}
          >
            <IconClock /> Timesheet
          </button>
          <button
            className={`nav-item ${route === 'qc' ? 'active' : ''}`}
            onClick={() => navigate('qc')}
          >
            <IconClipboard /> QC Report
          </button>

          <span className="nav-label" style={{ marginTop: 10 }}>Office</span>
          <button
            className={`nav-item ${route === 'admin' ? 'active' : ''}`}
            onClick={() => navigate('admin')}
          >
            <IconLock /> Admin
          </button>
        </nav>

        <div className="sidebar-foot">
          Fine Construction Specialties
          <br />
          Internal use only
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{page.title}</h1>
          <p>{page.sub}</p>
        </header>
        <main className={route === 'admin' ? 'content content-wide' : 'content'}>
          {route === 'home' && <Home onNavigate={navigate} />}
          {route === 'orders' && <MaterialOrder onHome={() => navigate('home')} />}
          {route === 'timesheet' && <Timesheet onHome={() => navigate('home')} />}
          {route === 'qc' && <QCReport onHome={() => navigate('home')} />}
          {route === 'admin' && <Admin onHome={() => navigate('home')} />}
          {route === 'track' && <Track onHome={() => navigate('home')} />}
        </main>
      </div>
    </div>
  )
}
