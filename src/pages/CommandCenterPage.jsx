import { Link } from 'react-router-dom'
import CommandCenter from '../components/CommandCenter'
import AdminSecurityGate from '../components/AdminSecurityGate'

export default function CommandCenterPage({ dark, setDark }) {
  return (
    <div className="cc-page">
      {/* Top bar */}
      <div className="cc-page-header">
        <div className="cc-page-header-left">
          <Link to="/" className="cc-page-back">← Back to EdgeVital</Link>
          <div style={{ width: 1, height: 18, background: 'rgba(202,220,252,0.12)' }} />
          <span className="cc-app-title">EDGEVITAL COMMAND &amp; CONTROL</span>
          <span className="cc-hq-tag">HQ-01</span>
          <span className="cc-loc-header" style={{ marginLeft: 12, fontSize: 11, color: '#3498db', background: 'rgba(52, 152, 219, 0.12)', padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5 }}>
            13.1337° N, 77.5682° E
          </span>
        </div>
        <button
          className="theme-toggle"
          onClick={() => setDark(d => !d)}
          title="Toggle dark mode"
          style={{ fontSize: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(202,220,252,0.15)', color: '#CADCFC' }}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="cc-page-body">
        <AdminSecurityGate dark={dark} setDark={setDark}>
          <CommandCenter />
        </AdminSecurityGate>
      </div>
    </div>
  )
}
