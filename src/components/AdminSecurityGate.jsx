import { useState, useEffect } from 'react'

const DEFAULT_ADMIN_KEY = 'admin123'

export default function AdminSecurityGate({ children, dark, setDark }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('edgevital_authed') === 'true'
  })
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    localStorage.setItem('edgevital_authed', isAuthenticated ? 'true' : 'false')
  }, [isAuthenticated])

  const handleLogin = (e) => {
    e.preventDefault()
    if (passwordInput.trim() === DEFAULT_ADMIN_KEY || passwordInput.trim() === 'edgevital2026') {
      setIsAuthenticated(true)
      setErrorMsg('')
    } else {
      setAttempts(a => a + 1)
      setErrorMsg('ACCESS DENIED — INVALID ADMIN SECURITY KEY')
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setPasswordInput('')
    setErrorMsg('')
  }

  if (isAuthenticated) {
    return (
      <div className="security-wrapper">
        <div className="security-bar">
          <div className="security-bar-left">
            <span className="sec-shield">🛡️</span>
            <span className="sec-tag">ADMIN CLEARANCE: ACTIVE</span>
            <span className="sec-divider">|</span>
            <span className="sec-loc">13.1337° N, 77.5682° E</span>
          </div>
          <button className="btn-sec-lock" onClick={handleLogout} title="Lock Command Center">
            🔒 LOCK SYSTEM
          </button>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="sec-gate-container">
      <div className="sec-gate-box">
        <div className="sec-gate-hdr">
          <div className="sec-icon-wrap">
            <div className="sec-icon">🔒</div>
            <div className="sec-pulse-ring" />
          </div>
          <h2 className="sec-title">EDGEVITAL COMMAND &amp; CONTROL</h2>
          <div className="sec-clearance-badge">
            LEVEL 4 RESTRICTED ACCESS · ADMIN AUTHENTICATION
          </div>
          <div className="sec-loc-badge">
            13.1337° N, 77.5682° E
          </div>
        </div>

        <form onSubmit={handleLogin} className="sec-form">
          <label className="sec-label">ENTER ADMIN SECURITY KEY / PASSWORD:</label>
          <div className="sec-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="Enter passcode..."
              className="sec-input"
              autoFocus
            />
            <button
              type="button"
              className="sec-pwd-toggle"
              onClick={() => setShowPassword(p => !p)}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {errorMsg && (
            <div className="sec-error-banner">
              ⚠️ {errorMsg} (Attempt {attempts})
            </div>
          )}

          <button type="submit" className="sec-btn-submit">
            🔓 AUTHENTICATE &amp; ACCESS COMMAND CENTER
          </button>
        </form>

        <div className="sec-hint-box">
          <span className="sec-hint-title">🔑 DEMO PASSCODE:</span>
          <code>admin123</code> or <code>edgevital2026</code>
        </div>
      </div>
    </div>
  )
}
