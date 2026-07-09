import { useEffect, useState } from 'react'
import {
  ApiError,
  clearToken,
  fetchData,
  getToken,
  login,
  type AdminData,
} from '../lib/admin'
import { IconSpinner } from '../components/ui'
import { Dashboard } from './admin/Dashboard'

type Status = 'checking' | 'login' | 'ready'

export function Admin(props: { onHome: () => void }) {
  const [status, setStatus] = useState<Status>(getToken() ? 'checking' : 'login')
  const [data, setData] = useState<AdminData | null>(null)
  const [loadError, setLoadError] = useState('')

  // password form
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [loginError, setLoginError] = useState('')

  const load = async () => {
    try {
      const d = await fetchData()
      setData(d)
      setStatus('ready')
      setLoadError('')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken()
        setStatus('login')
      } else {
        setLoadError(e instanceof Error ? e.message : 'Could not load data.')
        setStatus('login')
      }
    }
  }

  useEffect(() => {
    if (status === 'checking') load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setSigningIn(true)
    setLoginError('')
    try {
      await login(password)
      setPassword('')
      setStatus('checking')
      await load()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setSigningIn(false)
    }
  }

  const signOut = () => {
    clearToken()
    setData(null)
    setStatus('login')
  }

  if (status === 'checking') {
    return (
      <div className="admin-center">
        <IconSpinner size={22} />
        <span style={{ marginTop: 10, color: 'var(--muted)' }}>Loading dashboard…</span>
      </div>
    )
  }

  if (status === 'ready' && data) {
    return <Dashboard data={data} onRefresh={load} onSignOut={signOut} />
  }

  // login
  return (
    <div className="admin-center">
      <form className="login-card" onSubmit={submitLogin}>
        <div className="login-lock">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15.5" r="1.3" />
          </svg>
        </div>
        <h2>Admin Access</h2>
        <p className="login-sub">Enter the admin password to view the operations dashboard.</p>
        {loadError && <div className="banner banner-error" style={{ textAlign: 'left' }}>{loadError}</div>}
        <input
          type="password"
          className={`input ${loginError ? 'invalid' : ''}`}
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {loginError && <div className="field-error" style={{ textAlign: 'left' }}>{loginError}</div>}
        <button className="btn btn-primary" type="submit" disabled={signingIn || !password} style={{ width: '100%' }}>
          {signingIn ? <><IconSpinner /> Signing in…</> : 'Sign in'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={props.onHome} style={{ marginTop: 4 }}>
          ← Back to FCS OS
        </button>
      </form>
    </div>
  )
}
