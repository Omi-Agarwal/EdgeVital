const states = [
  {
    cls: 's-normal',
    icon: '✓',
    label: 'State 1',
    title: 'NORMAL',
    text: "Vitals within the soldier's personal baseline. The device senses and classifies continuously — HR, SpO₂, HRV, motion, temperature, respiration, GSR — but transmits nothing. Zero emissions. Zero exposure.",
    badge: 'Nothing sent',
  },
  {
    cls: 's-strain',
    icon: '⚠',
    label: 'State 2',
    title: 'STRAIN',
    text: "Elevated readings detected — exertion pattern, heat stress, or early physiological drift. The device triggers a local haptic/audio alert to the soldier and nearby team. Still no transmission — network stays clean.",
    badge: 'Local alert only',
  },
  {
    cls: 's-critical',
    icon: '🚨',
    label: 'State 3',
    title: 'CRITICAL',
    text: "A genuine deviation confirmed — impact + physiological deterioration pattern. A single compact burst is sent: timestamp, severity, HR, SpO₂, model confidence, last-known GPS location. Delivered in under 2 seconds.",
    badge: 'Single burst · 5 fields · <2s',
  },
]

const sensorInputs = [
  'HR / SpO₂ (MAX30102)',
  'HRV (R-R interval)',
  'Motion energy (MPU6050 IMU)',
  'Impact / pressure spikes',
  'Temperature gradient (MLX90614)',
  'Respiration variability',
  'Sweat / GSR trend',
]

export default function Solution() {
  return (
    <section className="solution" id="solution">
      <div className="container">
        <div className="section-tag">How EdgeVital Works</div>
        <h2 className="solution-h2">Three states. Two of them stay silent.</h2>
        <p className="solution-sub">Instead of reacting to a single threshold, EdgeVital separates exertion from danger by reading <strong>combinations, sequence, and trend</strong> — achieving 94% simulated exertion-vs-impact separation. The discriminator is the pattern, not a single number.</p>

        <div className="solution-states">
          {states.map(s => (
            <div className={`state-card ${s.cls}`} key={s.title}>
              <div className="state-dot">{s.icon}</div>
              <div className="state-label">{s.label}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <span className="state-badge">{s.badge}</span>
            </div>
          ))}
        </div>

        <div className="solution-sensors">
          <h3 className="sensors-title">Sensor Inputs Driving Classification</h3>
          <div className="sensor-chips">
            {sensorInputs.map(s => (
              <span className="sensor-chip" key={s}>{s}</span>
            ))}
          </div>
        </div>

        <div className="solution-callout">
          <div className="callout-icon">🧠</div>
          <div>
            <p>
              <strong>EdgeVital doesn't diagnose injuries</strong> — it learns each soldier's own normal,
              and reveals status and location only when it detects a genuine deviation. It never claims to
              diagnose an injury. Personalised baselines eliminate false alerts and ensure every
              transmission is actionable.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
