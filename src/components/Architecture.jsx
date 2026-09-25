export default function Architecture() {
  return (
    <section className="architecture" id="architecture">
      <div className="container">
        <div className="section-tag">System Architecture</div>
        <h2 className="architecture-h2">Two modules. One silent sensor path. One controlled escalation path.</h2>

        <div className="arch-modules">
          {/* Helmet Module */}
          <div className="arch-module helmet">
            <div className="arch-module-icon">🪖</div>
            <h3>Helmet / Headband Module</h3>
            <p className="arch-module-desc">Senses locally — no radio transmission</p>
            <ul className="arch-specs">
              <li><strong>Hub:</strong> nRF52840 sensor hub</li>
              <li><strong>Link:</strong> Wired UART/I2C only (no RF)</li>
              <li><strong>Weight:</strong> Target &lt;150g</li>
              <li><strong>Sensors:</strong> HR/SpO₂, temperature, motion/impact, pressure-wave, respiration, GSR</li>
            </ul>
          </div>

          {/* Arrow */}
          <div className="arch-arrow">
            <div className="arch-arrow-line" />
            <div className="arch-arrow-label">UART / I2C<br/>Wired Link</div>
            <div className="arch-arrow-line" />
          </div>

          {/* Body Module */}
          <div className="arch-module body">
            <div className="arch-module-icon">🦺</div>
            <h3>Body-Worn Core Module</h3>
            <p className="arch-module-desc">Interprets and decides — escalates proportionally</p>
            <ul className="arch-specs">
              <li><strong>Prototype:</strong> Raspberry Pi 4</li>
              <li><strong>Production:</strong> STM32U5 / nRF5340-class MCU</li>
              <li><strong>Inference:</strong> Explainable rule/statistical engine</li>
              <li><strong>Storage:</strong> Local SQLite logging (no cloud)</li>
              <li><strong>GPS:</strong> On-demand, queried only on CRITICAL</li>
              <li><strong>Battery:</strong> Multi-day field operation target</li>
            </ul>
          </div>
        </div>

        <div className="arch-flow">
          <div className="arch-flow-title">Decision Flow</div>
          <div className="arch-flow-steps">
            <div className="arch-step">
              <div className="arch-step-num">1</div>
              <div className="arch-step-text">Sensors sample continuously</div>
            </div>
            <div className="arch-step-arrow">→</div>
            <div className="arch-step">
              <div className="arch-step-num">2</div>
              <div className="arch-step-text">nRF52840 aggregates &amp; sends via UART</div>
            </div>
            <div className="arch-step-arrow">→</div>
            <div className="arch-step">
              <div className="arch-step-num">3</div>
              <div className="arch-step-text">RPi4 runs classification engine</div>
            </div>
            <div className="arch-step-arrow">→</div>
            <div className="arch-step">
              <div className="arch-step-num">4</div>
              <div className="arch-step-text">NORMAL: silent · STRAIN: local cue · CRITICAL: burst alert</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
