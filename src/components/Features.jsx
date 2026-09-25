const featureCards = [
  { icon: '🧠', title: 'On-Device Edge Inference', text: "All physiological state classification runs locally on the body-worn core module (Raspberry Pi 4 prototype, production path to STM32U5/nRF5340). No cloud dependency — the decision loop works in a Faraday cage, underground, or in a jammed zone." },
  { icon: '📏', title: 'Personalised Baseline Learning', text: "The model calibrates to each individual's resting and active norms during a short initialization window. Separates exertion from danger — not a single threshold, but combinations, sequence, and trend." },
  { icon: '📦', title: 'Burst-Only Transmission', text: "Only a compact 5-field packet is ever sent — timestamp, severity, HR, SpO₂, confidence, and GPS location — and only on genuine CRITICAL escalation. Raw sensor streams are never transmitted." },
  { icon: '📍', title: 'GPS On-Demand Only', text: 'GPS is powered off during NORMAL and STRAIN states. It is queried once, at the exact moment of CRITICAL escalation, included in the burst packet. No continuous location tracking — ever.' },
  { icon: '🔬', title: 'Explainable Rule-Based Core', text: 'An explainable rule/statistical decision core reads HRV, motion energy, impact/pressure spikes, SpO₂ slope, temperature gradient, respiration variability, and GSR trend. A deterministic fallback ensures the system always produces a decision.' },
  { icon: '🛡️', title: 'Two-Module Architecture', text: 'Helmet/headband module (sensor array + nRF52840 hub, wired UART/I2C only, no radio) paired with body-worn core module (Raspberry Pi 4). Target: <150g helmet weight, multi-day battery life.' },
]

const techChips = [
  '🔴 Raspberry Pi 4 (Core)', '📶 nRF52840 BLE Hub (Helmet)', '🔧 STM32U5 / nRF5340 (Production)',
  '❤️ MAX30102 (HR/SpO₂)', '🌡️ MLX90614 (Temp Gradient)', '⚡ MPU6050 IMU (Motion/Impact)',
  '💧 GSR Sensor (Sweat/Stress)', '🫁 Respiration Sensor', '🔌 UART/I2C Wired Link',
  '🧠 Explainable Rule Engine', '📐 Quantized 1D-CNN (Planned)', '📍 GPS Module (On-Demand)',
  '🔊 Buzzer/Haptic Module', '📟 OLED Display', '📡 Wi-Fi (Alert Transmission)',
]

export default function Features() {
  return (
    <section className="features" id="features">
      <div className="container">
        <div className="section-tag on-dark">Architecture &amp; Features</div>
        <h2 className="features-h2">Built to survive the edge — and the battlefield.</h2>
        <p className="features-sub">Every design decision starts with the same constraint: what happens when connectivity fails? EdgeVital's answer: the decision never leaves the device until it has to.</p>

        <div className="features-grid">
          {featureCards.map(f => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>

        <div className="tech-strip">
          <div className="tech-strip-label">Hardware &amp; Tech Stack</div>
          <div className="tech-chips">
            {techChips.map(c => (
              <div className="tech-chip" key={c}>{c}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
