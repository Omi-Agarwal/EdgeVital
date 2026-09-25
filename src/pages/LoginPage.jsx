import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function LoginPage({ dark, setDark }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // First try backend authentication if server is online
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }).catch(() => null)

      if (res && res.ok) {
        const data = await res.json()
        localStorage.setItem('edgevital-auth-user', JSON.stringify({ username: data.username || username, role: 'FIELD_MEDIC_ADMIN' }))
        localStorage.setItem('edgevital-auth-token', data.token || 'edgevital-auth-active')
        navigate('/command-center')
        return
      }

      // Fallback local auth for offline/standalone demo mode
      if (
        (username === 'admin' && password === 'edgevital2026') ||
        (username === 'medic' && password === 'medic123') ||
        (username === 'omi' && password === 'nirmaan2026')
      ) {
        localStorage.setItem(
          'edgevital-auth-user',
          JSON.stringify({
            username: username.toUpperCase(),
            role: username === 'medic' ? 'TACTICAL_MEDIC' : 'COMMAND_ADMIN',
            timestamp: new Date().toISOString(),
          })
        )
        localStorage.setItem('edgevital-auth-token', 'edgevital-session-token-' + Date.now())
        navigate('/command-center')
      } else {
        setError('Invalid Security Credentials. Access Denied.')
      }
    } catch {
      setError('Authentication server error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemoCreds = (user, pass) => {
    setUsername(user)
    setPassword(pass)
    setError('')
  }

  return (
    <div className="login-wrapper">
      <div className="login-backdrop-glow"></div>
      
      {/* Top Header */}
      <header className="login-header">
        <Link to="/" className="login-brand">
          <span className="brand-dot"></span>
          <span className="brand-text">EDGE<span className="brand-vital">·VITAL</span></span>
        </Link>
        <div className="login-header-actions">
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => setDark(!dark)}
            title="Toggle theme"
          >
            {dark ? '☀️' : '🌙'}
          </button>
          <Link to="/" className="back-link">← Return to Public Portal</Link>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="login-container">
        <div className="login-card">
          <div className="login-card-header">
            <div className="security-badge">
              <span className="security-icon">🔒</span>
              <span className="security-text">RESTRICTED ACCESS // LEVEL-4 CLEARANCE</span>
            </div>
            <h1 className="login-title">Medic Command Portal</h1>
            <p className="login-subtitle">
              Physiological telemetry monitoring & tactical casualty response authorization.
            </p>
          </div>

          {error && (
            <div className="login-alert-error" role="alert">
              <span className="alert-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">OPERATOR CALLSIGN / USERNAME</label>
              <div className="input-affix-wrapper">
                <span className="input-prefix">👤</span>
                <input
                  id="username"
                  type="text"
                  className="login-input"
                  placeholder="e.g. admin or medic"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">SECURITY CLEARANCE KEY</label>
              <div className="input-affix-wrapper">
                <span className="input-prefix">🔑</span>
                <input
                  id="password"
                  type="password"
                  className="login-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-login-submit"
              disabled={loading}
            >
              {loading ? (
                <span className="login-spinner">AUTHENTICATING CIPHER...</span>
              ) : (
                <>
                  <span>AUTHORIZE ENTRY</span>
                  <span className="btn-arrow">→</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Access Bar */}
          <div className="demo-credentials-box">
            <div className="demo-creds-title">
              <span>⚡ QUICK DEMO CREDENTIALS (NIRMAAN 2026)</span>
            </div>
            <div className="demo-creds-buttons">
              <button
                type="button"
                className="demo-chip"
                onClick={() => fillDemoCreds('admin', 'edgevital2026')}
              >
                <strong>Admin:</strong> admin / edgevital2026
              </button>
              <button
                type="button"
                className="demo-chip"
                onClick={() => fillDemoCreds('medic', 'medic123')}
              >
                <strong>Medic:</strong> medic / medic123
              </button>
            </div>
          </div>

          <div className="login-footer-meta">
            <span>DEFENSE HEALTH BIOMETRIC BUS // CLASSIFICATION ENGINE v1.0.0</span>
            <span>END-TO-END ZERO-CLOUD LOGGING ACTIVE</span>
          </div>
        </div>
      </main>
    </div>
  )
}
