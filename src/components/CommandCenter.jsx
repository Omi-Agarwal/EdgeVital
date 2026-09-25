import { useState, useEffect, useRef, useCallback } from 'react'

// States: 0=offline, 1=init, 2=monitoring, 3=jammed, 4=incoming, 5=dispatch, 6=modal, 7=enroute
const OFFLINE = 0, INIT = 1, MONITORING = 2, JAMMED = 3, INCOMING = 4, DISPATCH = 5, MODAL = 6, ENROUTE = 7

function ts() {
  const n = new Date()
  return [n.getHours(), n.getMinutes(), n.getSeconds()].map(v => String(v).padStart(2, '0')).join(':')
}

function useEventLog() {
  const [entries, setEntries] = useState([])
  const logRef = useRef(null)

  const addLog = useCallback((tag, msg) => {
    setEntries(prev => [...prev, { id: Date.now() + Math.random(), tag, msg, time: ts() }])
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [entries])

  return { entries, addLog, logRef }
}

export default function CommandCenter() {
  const [phase, setPhase]         = useState(OFFLINE)
  const [progress, setProgress]   = useState(0)
  const [checks, setChecks]       = useState([false, false, false, false, false, false])
  const [checksDone, setChecksDone] = useState([false, false, false, false, false, false])
  const [showStatus, setShowStatus] = useState(false)
  const [commsAvail, setCommsAvail] = useState(true)
  const [simDisabled, setSimDisabled] = useState(false)
  const [enrouteAnim, setEnrouteAnim] = useState(false)
  const [resetKey, setResetKey]   = useState(0)

  const { entries, addLog, logRef } = useEventLog()

  const checkLabels = ['COMMAND LINK', 'nRF52840 SENSOR HUB', 'UART/I2C BRIDGE', 'TELEMETRY ENGINE', 'LOCATION SERVICES', 'EDGE INFERENCE']

  // State 0 → 1
  function systemOn() {
    setPhase(INIT)
    const totalMs = 3000
    const start = Date.now()
    const barIv = setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - start) / totalMs) * 100))
      setProgress(p)
      if (p >= 100) clearInterval(barIv)
    }, 30)

    checkLabels.forEach((_, i) => {
      const d = 400 + i * 360
      setTimeout(() => setChecks(prev => { const n = [...prev]; n[i] = true; return n }), d)
      setTimeout(() => setChecksDone(prev => { const n = [...prev]; n[i] = true; return n }), d + 280)
    })
    setTimeout(() => setShowStatus(true), 400 + 6 * 360 + 200)
    setTimeout(() => {
      setPhase(MONITORING)
      addLog('SYSTEM', 'EdgeVital SYSTEM initialized — edge inference active')
      setTimeout(() => addLog('SYSTEM', 'Monitoring channel active — on-device classification running'), 400)
      setTimeout(() => addLog('SENSOR', 'nRF52840 hub: HR/SpO₂, IMU, Temp, GSR sensors online'), 800)
    }, totalMs + 200)
  }

  // Simulate critical
  function simulateCritical() {
    setSimDisabled(true)
    if (!commsAvail) {
      setPhase(JAMMED)
      setTimeout(() => addLog('ALERT', 'Local CRITICAL classification (on-device edge inference)'), 100)
      setTimeout(() => addLog('SYSTEM', 'Transmission queued — comms unavailable. Detection continues locally.'), 500)
    } else {
      goIncoming()
    }
  }

  // When comms toggled back from jammed
  function handleCommsToggle(val) {
    setCommsAvail(val)
    if (!val && phase === MONITORING) return
    if (val && phase === JAMMED) {
      addLog('SYSTEM', 'Connectivity restored — queued transmission received')
      setTimeout(() => goIncoming(), 300)
    }
  }

  function goIncoming() {
    setPhase(INCOMING)
    addLog('ALERT', 'Incoming burst transmission detected')
    setTimeout(() => {
      setPhase(DISPATCH)
      addLog('TELEMETRY', 'HR: 150 BPM (elevated)')
      setTimeout(() => addLog('TELEMETRY', 'SpO₂: 85% (below threshold)'), 200)
      setTimeout(() => addLog('TELEMETRY', 'HRV: 18ms RMSSD (suppressed)'), 350)
      setTimeout(() => addLog('TELEMETRY', 'Motion: 0.2g (near-stillness post impact)'), 500)
      setTimeout(() => addLog('TELEMETRY', 'Temp gradient: +2.1°C from baseline'), 650)
      setTimeout(() => addLog('TELEMETRY', 'Confidence: 87% (rule + statistical core)'), 800)
      setTimeout(() => addLog('LOCATION', 'GPS position received: 22.5726°N 88.3639°E (queried at escalation)'), 1000)
      setTimeout(() => addLog('ALERT', 'Severity classified: CRITICAL — impact + physiological deterioration pattern'), 1200)
    }, 800)
  }

  // Dispatch confirm
  function confirmDispatch() {
    setPhase(ENROUTE)
    setEnrouteAnim(false)
    setTimeout(() => setEnrouteAnim(true), 50)
    addLog('RESPONSE', 'Medic dispatch authorized')
    setTimeout(() => addLog('RESPONSE', 'MED-01 assigned — field medic unit'), 400)
    setTimeout(() => addLog('RESPONSE', 'Unit status: EN ROUTE to 22.5726°N 88.3639°E'), 800)
  }

  function resetDemo() {
    setPhase(OFFLINE)
    setProgress(0)
    setChecks([false, false, false, false, false, false])
    setChecksDone([false, false, false, false, false, false])
    setShowStatus(false)
    setCommsAvail(true)
    setSimDisabled(false)
    setEnrouteAnim(false)
    setResetKey(k => k + 1)
  }

  const isOnline = phase >= MONITORING
  const showMonitoringLayout = phase >= MONITORING

  return (
    <div className="cc-app" key={resetKey}>
      {/* Header row (controls) */}
      <div className="cc-app-header">
        <div className="cc-header-left">
          <div className="cc-title">EDGEVITAL COMMAND &amp; CONTROL</div>
          <div className="cc-divider" />
          <div className="cc-hq">HQ-01</div>
        </div>
        <div className="cc-header-right">
          {isOnline && (
            <div className="cc-controls">
              <button
                className="btn-sim"
                disabled={simDisabled}
                onClick={simulateCritical}
              >
                SIMULATE CRITICAL EVENT
              </button>
              <div className="comms-toggle-wrap">
                <span className="comms-lbl">COMMS:</span>
                <label className="toggle-sw">
                  <input
                    type="checkbox"
                    checked={commsAvail}
                    onChange={e => handleCommsToggle(e.target.checked)}
                  />
                  <div className="toggle-track" />
                  <div className="toggle-thumb" />
                </label>
                <span className={`comms-val ${commsAvail ? 'available' : 'jammed'}`}>
                  {commsAvail ? 'AVAILABLE' : 'JAMMED'}
                </span>
              </div>
            </div>
          )}
          <div className={`cc-status-badge ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {phase === OFFLINE && (
          <div className="state-offline">
            <div className="offline-icon">⬛</div>
            <div className="offline-text">NO ACTIVE SESSIONS · SYSTEM STANDBY</div>
            <div className="offline-sub">EdgeVital edge inference engine ready for activation</div>
            <button className="btn-system-on" onClick={systemOn}>SYSTEM ON</button>
          </div>
        )}

        {phase === INIT && (
          <div className="state-init">
            <div className="init-title">INITIALIZING EDGEVITAL COMMAND LINK...</div>
            <div className="pb-wrap">
              <div className="pb-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="checklist">
              {checkLabels.map((label, i) => (
                <div
                  key={label}
                  className={`check-item ${checks[i] ? 'visible' : ''} ${checksDone[i] ? 'done' : ''}`}
                >
                  <div className="check-box">{checksDone[i] ? '✓' : '·'}</div>
                  {label}
                </div>
              ))}
            </div>
            {showStatus && (
              <div className="init-status-line">ESTABLISHING MONITORING LINK — EDGE INFERENCE ACTIVE...</div>
            )}
          </div>
        )}

        {showMonitoringLayout && (
          <div className="cc-body">
            {/* MAIN PANEL */}
            <div className="main-panel">
              {/* Incidents */}
              <div className="panel-box">
                <div className="panel-header"><div className="panel-title">ACTIVE INCIDENTS</div></div>
                <div>
                  {phase === MONITORING && <div className="blank-state">NONE — ALL SOLDIERS NOMINAL<br/><span style={{fontSize:10, color:'rgba(202,220,252,0.3)'}}>On-device classification active · No transmissions</span></div>}

                  {phase === JAMMED && (
                    <div className="jam-banner">
                      <div className="jam-dot" />
                      ⚠ CRITICAL STATE DETECTED ON-DEVICE — TRANSMISSION QUEUED, AWAITING CONNECTIVITY
                      <div style={{fontSize:10, color:'rgba(202,220,252,0.3)', marginTop: 6}}>
                        Edge classification continues independently. Alert packet queued locally.
                      </div>
                    </div>
                  )}

                  {phase === INCOMING && (
                    <div className="proc-wrap">
                      <div className="proc-lbl">⚠ INCOMING BURST TRANSMISSION — PROCESSING ALERT PACKET...</div>
                      <div className="proc-bar-wrap"><div className="proc-bar-fill" /></div>
                    </div>
                  )}

                  {(phase === DISPATCH || phase === MODAL || phase === ENROUTE) && (
                    <div className="crit-alert">
                      <div className="crit-header">
                        <div className="crit-dot" />
                        <div className="crit-status">● PATIENT STATUS: CRITICAL</div>
                      </div>
                      <div className="vital-row"><span className="vital-lbl">HEART RATE</span><span className="vital-val warn">150 <small style={{ fontSize: 11, fontWeight: 400 }}>BPM</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">SpO₂</span><span className="vital-val warn">85 <small style={{ fontSize: 11, fontWeight: 400 }}>%</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">HRV (RMSSD)</span><span className="vital-val warn">18 <small style={{ fontSize: 11, fontWeight: 400 }}>ms</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">MOTION</span><span className="vital-val amber">0.2 <small style={{ fontSize: 11, fontWeight: 400 }}>g (stillness)</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">TEMP GRADIENT</span><span className="vital-val amber">+2.1 <small style={{ fontSize: 11, fontWeight: 400 }}>°C</small></span></div>
                      <div className="vital-row" style={{ marginBottom: 4 }}><span className="vital-lbl">CONFIDENCE</span><span className="vital-val amber">87 <small style={{ fontSize: 11, fontWeight: 400 }}>%</small></span></div>
                      <div className="loc-box">
                        <div className="loc-lbl">LAST KNOWN POSITION</div>
                        <div className="loc-coords">22.5726° N, 88.3639° E</div>
                        <div className="loc-note">GPS queried only at the moment of CRITICAL escalation — never continuously tracked</div>
                      </div>
                      <div className="data-callout">
                        📋 <strong>DATA RECEIVED: 7 fields only</strong> (timestamp, severity, HR, SpO₂, HRV, confidence, GPS location). Raw sensor stream was <em>never</em> transmitted. Classification happened on-device.
                      </div>
                    </div>
                  )}

                  {(phase === DISPATCH || phase === MODAL) && (
                    <div className="dispatch-card">
                      <h4>🚨 RESPONSE REQUIRED</h4>
                      <p>Critical medical event confirmed by edge inference engine. Impact + physiological deterioration pattern detected. Immediate dispatch authorization required.</p>
                      <button className="btn-dispatch" onClick={() => setPhase(MODAL)}>
                        DISPATCH MEDIC
                      </button>
                    </div>
                  )}

                  {phase === ENROUTE && (
                    <div className="enroute-panel">
                      <div className="enroute-hdr">
                        🚑 MEDICAL RESPONSE ACTIVE <div className="live-dot" /><span style={{ fontSize: 10, color: 'rgba(202,220,252,0.4)' }}>LIVE</span>
                      </div>
                      <div className="enroute-rows">
                        <div className="enroute-row"><span className="enroute-rl">INCIDENT STATUS</span><span className="enroute-rv" style={{ color: '#ff6b6b' }}>CRITICAL</span></div>
                        <div className="enroute-row"><span className="enroute-rl">CLASSIFICATION</span><span className="enroute-rv">Impact + deterioration</span></div>
                        <div className="enroute-row"><span className="enroute-rl">RESPONSE UNIT</span><span className="enroute-rv">MED-01</span></div>
                        <div className="enroute-row"><span className="enroute-rl">DESTINATION</span><span className="enroute-rv">22.5726° N, 88.3639° E</span></div>
                        <div className="enroute-row"><span className="enroute-rl">HR / SpO₂ / HRV</span><span className="enroute-rv">150 BPM · 85% · 18ms</span></div>
                      </div>
                      <div className="enroute-bar-lbl">EN ROUTE</div>
                      <div className="enroute-bar-track">
                        <div
                          className="enroute-bar-fill"
                          style={enrouteAnim ? { animation: 'enroute 8s linear forwards' } : { width: 0 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Telemetry */}
              <div className="panel-box">
                <div className="panel-header"><div className="panel-title">HQ TELEMETRY FEED</div></div>
                {(phase === MONITORING || phase === INCOMING) && (
                  <div className="no-tx-msg">
                    <div className="no-tx-label">NO ACTIVE TRANSMISSION — MONITORING...</div>
                    <div className="no-tx-sub">EdgeVital on-device classification running. Burst transmission only on CRITICAL escalation.</div>
                  </div>
                )}
                {phase === JAMMED && (
                  <div className="no-data-hq">
                    <div className="no-data-lbl">⚠ NO DATA RECEIVED AT HQ</div>
                    <div style={{ fontSize: 10, color: 'rgba(202,220,252,0.2)', marginTop: 6, letterSpacing: 1 }}>
                      EDGE CLASSIFICATION CONTINUES ON-DEVICE · TRANSMISSION PENDING CONNECTIVITY
                    </div>
                  </div>
                )}
                {(phase === DISPATCH || phase === MODAL || phase === ENROUTE) && (
                  <div className="telem-grid">
                    <div className="telem-card" style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.25)' }}>
                      <div className="telem-card-lbl">STATUS</div>
                      <div className="telem-card-val" style={{ fontSize: 16, color: '#ff6b6b', letterSpacing: 1 }}>CRITICAL</div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">CONFIDENCE</div>
                      <div className="telem-card-val" style={{ color: '#ffcc02' }}>87%</div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">HEART RATE</div>
                      <div className="telem-card-val" style={{ color: '#ff6b6b' }}>150 <span style={{ fontSize: 11, fontWeight: 400 }}>BPM</span></div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">SpO₂</div>
                      <div className="telem-card-val" style={{ color: '#ff6b6b' }}>85 <span style={{ fontSize: 11, fontWeight: 400 }}>%</span></div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">HRV (RMSSD)</div>
                      <div className="telem-card-val" style={{ color: '#ff9800' }}>18 <span style={{ fontSize: 11, fontWeight: 400 }}>ms</span></div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">MOTION</div>
                      <div className="telem-card-val" style={{ color: '#ff9800' }}>0.2g</div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">TEMP DELTA</div>
                      <div className="telem-card-val" style={{ color: '#ff9800' }}>+2.1°C</div>
                    </div>
                    <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                      <div className="telem-card-lbl">PATTERN</div>
                      <div className="telem-card-val" style={{ fontSize: 11, color: '#CADCFC' }}>Impact + Stillness</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* EVENT LOG */}
            <div className="log-panel">
              <div className="panel-box" style={{ height: '100%' }}>
                <div className="panel-header"><div className="panel-title">EVENT LOG</div></div>
                <div className="event-log-body" ref={logRef}>
                  {entries.length === 0 && <div className="log-empty">— No events</div>}
                  {entries.map(e => (
                    <div className="log-entry" key={e.id}>
                      <span className="log-ts">{e.time}</span>
                      <span className={`log-tag ${e.tag}`}>{e.tag}</span>
                      {e.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reset */}
            {phase === ENROUTE && (
              <div className="reset-wrap">
                <button className="btn-reset" onClick={resetDemo}>RESET DEMO</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DISPATCH MODAL */}
      <div className={`modal-overlay ${phase === MODAL ? 'active' : ''}`}>
        <div className="modal-box">
          <h3>CONFIRM MEDICAL DISPATCH</h3>
          <div className="modal-sub">Review incident details before authorizing response</div>
          <div className="modal-rows">
            <div className="modal-row"><span className="modal-rl">SEVERITY</span><span className="modal-rv red">CRITICAL</span></div>
            <div className="modal-row"><span className="modal-rl">CLASSIFICATION</span><span className="modal-rv">Impact + deterioration</span></div>
            <div className="modal-row"><span className="modal-rl">HEART RATE</span><span className="modal-rv">150 BPM</span></div>
            <div className="modal-row"><span className="modal-rl">SpO₂</span><span className="modal-rv">85%</span></div>
            <div className="modal-row"><span className="modal-rl">HRV (RMSSD)</span><span className="modal-rv">18ms</span></div>
            <div className="modal-row"><span className="modal-rl">MOTION</span><span className="modal-rv">0.2g (near-stillness)</span></div>
            <div className="modal-row"><span className="modal-rl">LOCATION</span><span className="modal-rv">22.5726°N 88.3639°E</span></div>
            <div className="modal-row"><span className="modal-rl">CONFIDENCE</span><span className="modal-rv">87%</span></div>
            <div className="modal-row"><span className="modal-rl">RESPONSE UNIT</span><span className="modal-rv">MED-01</span></div>
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setPhase(DISPATCH)}>CANCEL</button>
            <button className="btn-confirm" onClick={confirmDispatch}>CONFIRM DISPATCH</button>
          </div>
        </div>
      </div>
    </div>
  )
}
