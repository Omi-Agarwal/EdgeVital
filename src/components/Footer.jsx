export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-brand">EDGE<span>&middot;</span>VITAL</div>
      <div className="footer-team">
        Built by <strong>Team EdgeVital</strong> &mdash; Harshita Shakya (Leader) &middot; Vaibhav Chindalia &middot; Omi Agarwal &middot; Abhishek Iyer
      </div>
      <div className="footer-hackathon">
        <strong>NIRMAAN 2026</strong> &mdash; Coding Club BMSIT &times; Alterino Club BMSIT &middot; HealthTech &amp; Bio-Wearables Track
      </div>
      <div>
        <a href="https://wokwi.com/projects/472486308627080193" target="_blank" rel="noopener noreferrer" className="footer-wokwi">
          🔗 View the Wokwi Device Simulation →
        </a>
      </div>
      <div className="footer-disclaimer">
        This dashboard is a scripted simulation of the command-center receiving end &mdash; the physiological
        state classification itself runs on the physical/simulated device shown in the linked Wokwi project.
        EdgeVital does not diagnose injuries &mdash; it detects deviations from personalised baselines.
      </div>
    </footer>
  )
}
