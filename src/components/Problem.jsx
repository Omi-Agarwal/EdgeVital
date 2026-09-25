const cards = [
  {
    icon: '🔇',
    title: 'Silent Casualties',
    text: 'An injured or unconscious soldier may never be able to raise an alert. The problem is not a lack of data — it is a lack of timely, trusted detection.',
  },
  {
    icon: '📡',
    title: 'Bandwidth & RF Footprint',
    text: 'Always-on telemetry burdens tactical bandwidth. Continuous RF transmission increases the tactical footprint and exposes positions to adversaries.',
  },
  {
    icon: '🌐',
    title: 'Contested Connectivity',
    text: 'Existing systems rely on continuous transmission or cloud-dependent decisions, which fail exactly when the network is degraded — in jammed or contested environments.',
  },
  {
    icon: '⚡',
    title: 'False Alert Fatigue',
    text: 'Single-threshold systems cannot distinguish exertion from danger. A 150 BPM reading during a sprint is very different from 150 BPM at rest after impact.',
  },
]

export default function Problem() {
  return (
    <section className="problem" id="problem">
      <div className="container">
        <div className="section-tag">The Problem</div>
        <h2 className="problem-headline">
          In the field, the problem is not a lack of data — it is a lack of timely, trusted detection.
        </h2>
        <p className="problem-audience">
          <strong>Target Audience:</strong> Soldiers and field personnel in contested, low-connectivity environments,
          plus medics who need justified, actionable alerts — not raw biometric feeds. The same architecture extends to
          remote/rural healthcare workers, disaster-response teams, and high-risk industrial workers.
        </p>
        <div className="problem-cards">
          {cards.map(c => (
            <div className="problem-card" key={c.title}>
              <div className="problem-icon">{c.icon}</div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
