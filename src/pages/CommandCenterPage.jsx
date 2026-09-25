import { Link, useNavigate } from 'react-router-dom'
import CommandCenter from '../components/CommandCenter'

export default function CommandCenterPage({ dark, setDark }) {
  const navigate = useNavigate()
  
  let user = { username: 'ADMIN', role: 'FIELD_MEDIC_ADMIN' }
  try {
    const raw = localStorage.getItem('edgevital-auth-user')
    if (raw) user = JSON.parse(raw)
  } catch {
    // fallback
  }

  const handleLogout = () => {
    localStorage.removeItem('edgevital-auth-token')
    localStorage.removeItem('edgevital-auth-user')
    navigate('/login')
  }

  return (
    <div className="cc-page">
      {/* Top bar */}
      <div className="cc-page-header">
        <div className="cc-page-header-left">
          <Link to="/" className="cc-page-back">← Back to EdgeVital</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(202,220,252,0.12)' }} />
          <span className="cc-app-title">EDGEVITAL COMMAND &amp; CONTROL</span>
          <span className="cc-hq-tag">HQ-01</span>
          <div className="operator-pill">
            <span className="operator-dot"></span>
            <span className="operator-name">{user.username || 'ADMIN'}</span>
            <span className="operator-role">({user.role || 'OPERATOR'})</span>
          </div>
        </div>
        
        <div className="cc-page-header-right">
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            title="End Session & Lock Portal"
          >
            🔒 Logout
          </button>
          <button
            className="theme-toggle"
            onClick={() => setDark(d => !d)}
            title="Toggle dark mode"
            style={{ fontSize: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(202,220,252,0.15)', color: '#CADCFC' }}
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      <div className="cc-page-body">
        <CommandCenter />
      </div>
    </div>
  )
}
