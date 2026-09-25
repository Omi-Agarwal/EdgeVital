import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import Problem from '../components/Problem'
import Solution from '../components/Solution'
import Architecture from '../components/Architecture'
import Features from '../components/Features'
import Roadmap from '../components/Roadmap'
import Footer from '../components/Footer'

export default function LandingPage({ dark, setDark }) {
  return (
    <>
      <Navbar dark={dark} setDark={setDark} />
      <Hero />
      <Problem />
      <Solution />
      <Architecture />
      <Features />
      <Roadmap />

      {/* Command Center CTA */}
      <section className="demo-cta-section" id="demo">
        <div className="container">
          <div className="section-tag on-dark">Interactive Simulation</div>
          <h2>Medical Command &amp; Control</h2>
          <p>
            A scripted state machine simulating what HQ sees when an EdgeVital device escalates.
            Walk through all four states live: NORMAL stays silent, STRAIN triggers a local cue,
            CRITICAL generates a compact alert burst, and NETWORK DOWN shows the local decision holding
            while the alert queues instead of blocking detection.
          </p>
          <div className="demo-cta-links">
            <Link to="/command-center" className="btn-launch">
              ⚡ Open Command Center
            </Link>
            <a href="https://wokwi.com/projects/472486308627080193" target="_blank" rel="noopener noreferrer" className="btn-wokwi-cta">
              🔧 View Wokwi Hardware Simulation →
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
