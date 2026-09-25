const roadmapPhases = [
  {
    phase: 'NOW',
    title: '24-Hour Grand Finale Build',
    color: '#2E7D32',
    items: [
      'Wire sensor array to nRF52840 helmet hub and RPi4 core',
      'Implement explainable rule/statistical state machine (NORMAL/STRAIN/CRITICAL)',
      'Demo full silent-sensing-to-alert flow on Wokwi prototype',
      'Live walk-through of all 4 states: NORMAL, STRAIN, CRITICAL, NETWORK DOWN',
    ],
  },
  {
    phase: 'SHORT TERM',
    title: 'Validated Intelligence',
    color: '#1976D2',
    items: [
      'Validate quantized 1D-CNN classifier with ethical proxy data',
      'Test across exertion, impact-then-stillness, hypoxia-signature, and heat-strain classes',
      'Controlled studies for classification accuracy validation',
    ],
  },
  {
    phase: 'MID TERM',
    title: 'Production Hardware',
    color: '#C97A1A',
    items: [
      'Move inference from RPi4 to STM32U5 / nRF5340-class MCU',
      'Add duty-cycled sensing for power optimization',
      'Target sub-100mW idle draw for multi-day field operation',
    ],
  },
  {
    phase: 'LONG TERM',
    title: 'Field Validation & Expansion',
    color: '#7B1FA2',
    items: [
      'Structured medic-workflow trials with defense-health units',
      'Tune thresholds, explanations, and response fit with real operators',
      'Add second body-worn sensor node for broader coverage',
      'Extend to remote healthcare, disaster response, and industrial settings',
    ],
  },
]

export default function Roadmap() {
  return (
    <section className="roadmap" id="roadmap">
      <div className="container">
        <div className="section-tag">Future Roadmap</div>
        <h2 className="roadmap-h2">From interpretable core to validated, low-power intelligence.</h2>
        <p className="roadmap-sub">
          Start with an interpretable core, then build toward validated, low-power intelligence —
          validate the decision logic first, then add learned intelligence, production efficiency,
          and field testing on the same modular signal path.
        </p>

        <div className="roadmap-timeline">
          {roadmapPhases.map((p, i) => (
            <div className="roadmap-phase" key={p.phase}>
              <div className="roadmap-marker" style={{ background: p.color }}>
                <span className="roadmap-phase-label">{p.phase}</span>
              </div>
              <div className="roadmap-content">
                <h3 style={{ color: p.color }}>{p.title}</h3>
                <ul>
                  {p.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              </div>
              {i < roadmapPhases.length - 1 && <div className="roadmap-connector" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
