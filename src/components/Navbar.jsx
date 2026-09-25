import { Link } from 'react-router-dom'

export default function Navbar({ dark, setDark }) {
  const token = localStorage.getItem('edgevital-auth-token')

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">EDGE<span>&middot;</span>VITAL</Link>
      <ul className="nav-links">
        <li><a href="/#problem">Problem</a></li>
        <li><a href="/#solution">Solution</a></li>
        <li><a href="/#architecture">Architecture</a></li>
        <li><a href="/#features">Features</a></li>
        <li><a href="/#roadmap">Roadmap</a></li>
        <li><a href="/#demo">Live Demo</a></li>
      </ul>
      <div className="nav-right">
        {token ? (
          <Link to="/command-center" className="nav-admin-btn nav-admin-active">
            <span className="live-dot-green"></span>
            Command Center
          </Link>
        ) : (
          <Link to="/login" className="nav-admin-btn">
            <span>🔒</span> Admin Login
          </Link>
        )}
        <span className="nav-tag">NIRMAAN 2026</span>
        <button
          className="theme-toggle"
          onClick={() => setDark(d => !d)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  )
}
