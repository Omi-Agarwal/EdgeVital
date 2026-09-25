import { Link } from 'react-router-dom'

export default function Hero() {
  return (
    <section className="hero" id="hero">
      <div className="container">
        <div className="hero-inner">
          <div>
            <div className="hero-eyebrow">HealthTech &amp; Bio-Wearables &middot; NIRMAAN 2026 &middot; Coding Club BMSIT &times; Alterino Club BMSIT</div>
            <h1 className="hero-title">
              EDGE<span className="hero-title-red">&middot;</span>VITAL
            </h1>
            <p className="hero-subtitle">Edge-AI Physiological Monitoring Layer for Soldiers</p>
            <p className="hero-tagline">
              Continuous sensing without continuous transmitting. A soldier's condition and location stay
              private until the moment intervention is genuinely needed &mdash; decided on-device, not in the cloud.
            </p>
            <div className="hero-stats">
              <div className="hero-stat"><span className="hero-stat-val">94%</span><span className="hero-stat-lbl">Exertion vs Impact Separation</span></div>
              <div className="hero-stat"><span className="hero-stat-val">&lt;2s</span><span className="hero-stat-lbl">Alert Burst Latency</span></div>
              <div className="hero-stat"><span className="hero-stat-val">&lt;150g</span><span className="hero-stat-lbl">Helmet Module Weight</span></div>
              <div className="hero-stat"><span className="hero-stat-val">0</span><span className="hero-stat-lbl">Cloud Dependencies</span></div>
            </div>
            <div className="hero-ctas">
              <Link to="/command-center" className="btn-primary">Try the Command Center Live</Link>
              <a href="https://wokwi.com/projects/472486308627080193" target="_blank" rel="noopener noreferrer" className="btn-link">
                View Wokwi Simulation &rarr;
              </a>
            </div>
          </div>

          {/* Hero visual panel */}
          <div className="hero-visual">
            <div className="hv-header">
              <div className="hv-title">FIELD STATUS &middot; ALPHA SQUAD</div>
              <div className="hv-badge">SYSTEM ONLINE</div>
            </div>
            <div className="hv-soldiers">
              {[
                { id: 'ALPHA-01', vitals: 'On-device classification only', state: 'normal', label: 'NORMAL' },
                { id: 'ALPHA-02', vitals: 'Local haptic alert — no transmission',  state: 'strain',   label: 'STRAIN' },
                { id: 'ALPHA-03', vitals: 'Burst transmitted · 5 fields',   state: 'critical', label: 'CRITICAL' },
              ].map(s => (
                <div className="hv-soldier" key={s.id}>
                  <div>
                    <div className="hv-soldier-id">{s.id}</div>
                    <div className="hv-soldier-vitals">{s.vitals}</div>
                  </div>
                  <div className={`hv-state ${s.state}`}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="hv-footer">NO CONTINUOUS STREAM &middot; ON-DEVICE INFERENCE &middot; BURST ON ESCALATION &middot; GPS ON-DEMAND ONLY</div>
          </div>
        </div>
      </div>
    </section>
  )
}
