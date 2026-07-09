import { useEffect, useState } from 'react'

export type Route = 'home' | 'orders' | 'timesheet' | 'qc' | 'admin' | 'track'

const VALID: Route[] = ['home', 'orders', 'timesheet', 'qc', 'admin', 'track']

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return (VALID.includes(h as Route) ? h : 'home') as Route
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const onHash = () => setRoute(parse())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (r: Route) => {
    window.location.hash = r === 'home' ? '/' : `/${r}`
    window.scrollTo(0, 0)
  }

  return [route, navigate]
}
