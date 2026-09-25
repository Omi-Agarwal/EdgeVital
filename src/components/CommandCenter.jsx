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
  const [phase, setPhase]                 = useState(OFFLINE)
  const [progress, setProgress]           = useState(0)
  const [checks, setChecks]               = useState([false, false, false, false, false, false])
  const [checksDone, setChecksDone]       = useState([false, false, false, false, false, false])
  const [showStatus, setShowStatus]       = useState(false)
  const [commsAvail, setCommsAvail]       = useState(true)
  const [simDisabled, setSimDisabled]     = useState(false)
  const [enrouteAnim, setEnrouteAnim]     = useState(false)
  const [resetKey, setResetKey]           = useState(0)
  
  // Hardware Link States
  const [sourceMode, setSourceMode]       = useState('LIVE') // 'LIVE' or 'SIM'
  const [apiEndpoint, setApiEndpoint]     = useState(() => localStorage.getItem('edgevital-api-url') || '')
  const [hwConnected, setHwConnected]     = useState(false)
  const [liveVitals, setLiveVitals]       = useState({
    hr: 72,
    spo2: 98,
    temp: 36.6,
    motion: 0.08,
    hrv: 45,
    state: 'NORMAL',
    confidence: 0.95,
    classification: 'within-baseline',
    lat: 22.5726,
    lon: 88.3639,
  })

  const { entries, addLog, logRef } = useEventLog()

  const checkLabels = [
    'COMMAND LINK (HQ-01)',
    'nRF52840 SENSOR BUS',
    'I2C / UART TELEMETRY BRIDGE',
    'MPU6050 & MAX30100 DRIVERS',
    'GPS SATELLITE FIX',
    'EDGE INFERENCE ENGINE',
  ]

  // Persist API Endpoint
  const handleEndpointChange = (val) => {
    setApiEndpoint(val)
    localStorage.setItem('edgevital-api-url', val)
  }

  // Polling loop for live hardware
  useEffect(() => {
    if (phase < MONITORING || sourceMode !== 'LIVE') return

    const baseUrl = apiEndpoint.trim() || ''
    const statusUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/status` : '/api/status'

    const interval = setInterval(async () => {
      try {
        const res = await fetch(statusUrl, { mode: 'cors' })
        if (!res.ok) throw new Error('Bad status')
        const data = await res.json()
        
        setHwConnected(true)
        if (data.reading) {
          setLiveVitals({
            hr: data.reading.heart_rate ?? 72,
            spo2: data.reading.spo2 ?? 98,
            temp: data.reading.temperature ?? 36.6,
            motion: data.reading.motion_g ?? 0.08,
            hrv: data.reading.hrv_rmssd ?? 45,
            state: data.state || 'NORMAL',
            confidence: data.confidence || 0.95,
            classification: data.classification || 'nominal',
            lat: data.alert?.latitude || 22.5726,
            lon: data.alert?.longitude || 88.3639,
          })

          // Automatic escalation if hardware reports CRITICAL state
          if (data.state === 'CRITICAL' && phase === MONITORING) {
            if (data.comms_available === false) {
              setPhase(JAMMED)
              addLog('ALERT', 'CRITICAL event detected on-device — transmission queued (jammed spectrum)')
            } else {
              setPhase(DISPATCH)
              addLog('ALERT', `🚨 REAL-TIME CASUALTY ESCALATION: ${data.classification.toUpperCase()}`)
              addLog('TELEMETRY', `Live Vitals: HR ${data.reading.heart_rate} BPM | SpO₂ ${data.reading.spo2}% | Temp ${data.reading.temperature}°C | Motion ${data.reading.motion_g}g`)
              if (data.alert?.latitude) {
                addLog('LOCATION', `Target GPS Coordinates: ${data.alert.latitude}°N, ${data.alert.longitude}°E`)
              }
            }
          }
        }
      } catch {
        setHwConnected(false)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [phase, sourceMode, apiEndpoint, addLog])

  // System Activation
  function systemOn() {
    setPhase(INIT)
    const totalMs = 2800
    const start = Date.now()
    const barIv = setInterval(() => {
      const p = Math.min(100, Math.round(((Date.now() - start) / totalMs) * 100))
      setProgress(p)
      if (p >= 100) clearInterval(barIv)
    }, 30)

    checkLabels.forEach((_, i) => {
      const d = 300 + i * 350
      setTimeout(() => setChecks(prev => { const n = [...prev]; n[i] = true; return n }), d)
      setTimeout(() => setChecksDone(prev => { const n = [...prev]; n[i] = true; return n }), d + 260)
    })
    setTimeout(() => setShowStatus(true), 300 + 6 * 350 + 100)
    setTimeout(() => {
      setPhase(MONITORING)
      addLog('SYSTEM', 'EdgeVital Command Bridge Activated — Hardware Link Online')
      setTimeout(() => addLog('SYSTEM', 'Zero-cloud edge classification pipeline streaming'), 300)
      setTimeout(() => addLog('HARDWARE', 'Sensors: MPU6050 (IMU), MAX30100 (PPG), DS18B20 (Temp), GPS (NMEA)'), 600)
    }, totalMs + 200)
  }

  // Simulation Trigger
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

  // Toggle Comms
  async function handleCommsToggle(val) {
    setCommsAvail(val)
    
    // Sync to backend if available
    const baseUrl = apiEndpoint.trim() || ''
    const commsUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/comms` : '/api/comms'
    try {
      await fetch(commsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: val }),
      })
    } catch {}

    if (!val && phase === MONITORING) return
    if (val && phase === JAMMED) {
      addLog('SYSTEM', 'RF Spectrum Restored — queued alert packet received')
      setTimeout(() => goIncoming(), 300)
    }
  }

  function goIncoming() {
    setPhase(INCOMING)
    addLog('ALERT', 'Incoming compact burst transmission detected (<2s payload)')
    setTimeout(() => {
      setPhase(DISPATCH)
      addLog('TELEMETRY', 'HR: 148 BPM (elevated tachypnea)')
      setTimeout(() => addLog('TELEMETRY', 'SpO₂: 84.5% (acute hypoxic signature)'), 200)
      setTimeout(() => addLog('TELEMETRY', 'HRV: 16.2ms RMSSD (autonomic suppression)'), 350)
      setTimeout(() => addLog('TELEMETRY', 'Motion: 0.12g (post-impact sustained stillness)'), 500)
      setTimeout(() => addLog('TELEMETRY', 'Temperature: 37.8°C (+2.2°C delta)'), 650)
      setTimeout(() => addLog('TELEMETRY', 'Inference Confidence: 98% (pattern: impact-hypoxia)'), 800)
      setTimeout(() => addLog('LOCATION', 'GPS queried at escalation: 22.5726°N 88.3639°E'), 1000)
      setTimeout(() => addLog('ALERT', 'Severity: CRITICAL — Field Medic intervention required'), 1200)
    }, 700)
  }

  // Action: Authorize Dispatch
  function confirmDispatch() {
    setPhase(ENROUTE)
    setEnrouteAnim(false)
    setTimeout(() => setEnrouteAnim(true), 50)
    addLog('ACTION', '🚨 Medic Response Authorized by Command Operator')
    setTimeout(() => addLog('ACTION', 'TACTICAL MED-01 assigned with GPS waypoint lock'), 350)
    setTimeout(() => addLog('ACTION', `Unit Status: EN ROUTE to [${liveVitals.lat}°N, ${liveVitals.lon}°E]`), 700)
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
          
          {/* Source Mode Toggle */}
          <div className="source-mode-pill">
            <button
              className={`mode-btn ${sourceMode === 'LIVE' ? 'active' : ''}`}
              onClick={() => setSourceMode('LIVE')}
              title="Read real sensors from Raspberry Pi / Localhost"
            >
              📡 LIVE HARDWARE
            </button>
            <button
              className={`mode-btn ${sourceMode === 'SIM' ? 'active' : ''}`}
              onClick={() => setSourceMode('SIM')}
              title="Interactive Presentation Simulator"
            >
              🎮 SIMULATOR
            </button>
          </div>
        </div>

        <div className="cc-header-right">
          {isOnline && (
            <div className="cc-controls">
              {sourceMode === 'SIM' && (
                <button
                  className="btn-sim"
                  disabled={simDisabled}
                  onClick={simulateCritical}
                >
                  SIMULATE CRITICAL EVENT
                </button>
              )}
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

      {/* Live Hardware Connection Bar */}
      {isOnline && sourceMode === 'LIVE' && (
        <div className="hw-bridge-bar">
          <div className="hw-bridge-left">
            <span className={`hw-status-dot ${hwConnected ? 'online' : 'searching'}`}></span>
            <span className="hw-bridge-label">
              {hwConnected ? 'HARDWARE BRIDGE: STREAMING LIVE (1Hz)' : 'SEARCHING FOR RASPBERRY PI / SENSOR HUB...'}
            </span>
          </div>
          <div className="hw-bridge-right">
            <label className="endpoint-lbl">PI / API URL:</label>
            <input
              type="text"
              className="endpoint-input"
              placeholder="e.g. http://192.168.1.50:5000 or http://localhost:5000"
              value={apiEndpoint}
              onChange={e => handleEndpointChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {phase === OFFLINE && (
          <div className="state-offline">
            <div className="offline-icon">⬛</div>
            <div className="offline-text">NO ACTIVE SESSIONS · SYSTEM STANDBY</div>
            <div className="offline-sub">EdgeVital hardware telemetry bridge &amp; edge inference ready for activation</div>
            <button className="btn-system-on" onClick={systemOn}>SYSTEM ON</button>
          </div>
        )}

        {phase === INIT && (
          <div className="state-init">
            <div className="init-title">INITIALIZING EDGEVITAL HARDWARE &amp; COMMAND LINK...</div>
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
              <div className="init-status-line">ESTABLISHING CONTINUOUS ON-DEVICE MONITORING LINK...</div>
            )}
          </div>
        )}

        {showMonitoringLayout && (
          <div className="cc-body">
            {/* MAIN PANEL */}
            <div className="main-panel">
              {/* Incidents */}
              <div className="panel-box">
                <div className="panel-header">
                  <div className="panel-title">ACTIVE INCIDENTS &amp; ACTION DESK</div>
                </div>
                <div>
                  {phase === MONITORING && (
                    <div className="blank-state">
                      NONE — ALL SOLDIERS NOMINAL (STATE: {liveVitals.state})<br />
                      <span style={{ fontSize: 10, color: 'rgba(202,220,252,0.4)' }}>
                        On-device edge inference classifying vitals locally · Zero RF footprint until exception
                      </span>
                    </div>
                  )}

                  {phase === JAMMED && (
                    <div className="jam-banner">
                      <div className="jam-dot" />
                      ⚠ CRITICAL EVENT DETECTED ON-DEVICE — BURST TRANSMISSION QUEUED, AWAITING RF LINK
                      <div style={{ fontSize: 10, color: 'rgba(202,220,252,0.4)', marginTop: 6 }}>
                        Edge classification engine operates autonomously. Alert packet held in SQLite queue.
                      </div>
                    </div>
                  )}

                  {phase === INCOMING && (
                    <div className="proc-wrap">
                      <div className="proc-lbl">⚠ INCOMING BURST TRANSMISSION — PROCESSING COMPACT ALERT PACKET...</div>
                      <div className="proc-bar-wrap"><div className="proc-bar-fill" /></div>
                    </div>
                  )}

                  {(phase === DISPATCH || phase === MODAL || phase === ENROUTE) && (
                    <div className="crit-alert">
                      <div className="crit-header">
                        <div className="crit-dot" />
                        <div className="crit-status">● CASUALTY STATUS: CRITICAL INTERVENTION REQUIRED</div>
                      </div>
                      <div className="vital-row">
                        <span className="vital-lbl">HEART RATE</span>
                        <span className="vital-val warn">{liveVitals.hr} <small style={{ fontSize: 11, fontWeight: 400 }}>BPM</small></span>
                      </div>
                      <div className="vital-row">
                        <span className="vital-lbl">SpO₂</span>
                        <span className="vital-val warn">{liveVitals.spo2} <small style={{ fontSize: 11, fontWeight: 400 }}>%</small></span>
                      </div>
                      <div className="vital-row">
                        <span className="vital-lbl">TEMPERATURE</span>
                        <span className="vital-val amber">{liveVitals.temp} <small style={{ fontSize: 11, fontWeight: 400 }}>°C</small></span>
                      </div>
                      <div className="vital-row">
                        <span className="vital-lbl">MOTION / G-FORCE</span>
                        <span className="vital-val amber">{liveVitals.motion} <small style={{ fontSize: 11, fontWeight: 400 }}>g</small></span>
                      </div>
                      <div className="vital-row" style={{ marginBottom: 4 }}>
                        <span className="vital-lbl">INFERENCE CONFIDENCE</span>
                        <span className="vital-val amber">{Math.round(liveVitals.confidence * 100)} <small style={{ fontSize: 11, fontWeight: 400 }}>%</small></span>
                      </div>
                      <div className="loc-box">
                        <div className="loc-lbl">LAST KNOWN CASUALTY POSITION</div>
                        <div className="loc-coords">{liveVitals.lat}° N, {liveVitals.lon}° E</div>
                        <div className="loc-note">GPS activated on-demand at CRITICAL escalation to preserve battery and stealth</div>
                      </div>
                      <div className="data-callout">
                        📋 <strong>BURST TRANSMISSION RECEIVED:</strong> Compact payload delivered. Raw biometric data was processed on the wearer's edge device.
                      </div>
                    </div>
                  )}

                  {(phase === DISPATCH || phase === MODAL) && (
                    <div className="dispatch-card">
                      <h4>🚨 ACTION REQUIRED: AUTHORIZE MEDIC DISPATCH</h4>
                      <p>Critical physiological deterioration pattern verified by edge inference. Authorize tactical field response team deployment.</p>
                      <button className="btn-dispatch" onClick={() => setPhase(MODAL)}>
                        AUTHORIZE DISPATCH NOW
                      </button>
                    </div>
                  )}

                  {phase === ENROUTE && (
                    <div className="enroute-panel">
                      <div className="enroute-hdr">
                        🚑 TACTICAL MEDICAL RESPONSE ACTIVE <div className="live-dot" /><span style={{ fontSize: 10, color: 'rgba(202,220,252,0.4)' }}>LIVE TRACKING</span>
                      </div>
                      <div className="enroute-rows">
                        <div className="enroute-row"><span className="enroute-rl">INCIDENT STATUS</span><span className="enroute-rv" style={{ color: '#ff6b6b' }}>CRITICAL</span></div>
                        <div className="enroute-row"><span className="enroute-rl">CLASSIFICATION</span><span className="enroute-rv">{liveVitals.classification}</span></div>
                        <div className="enroute-row"><span className="enroute-rl">ASSIGNED UNIT</span><span className="enroute-rv">TACTICAL MED-01</span></div>
                        <div className="enroute-row"><span className="enroute-rl">COORDINATES</span><span className="enroute-rv">{liveVitals.lat}° N, {liveVitals.lon}° E</span></div>
                        <div className="enroute-row"><span className="enroute-rl">TELEMETRY</span><span className="enroute-rv">{liveVitals.hr} BPM · {liveVitals.spo2}% · {liveVitals.temp}°C</span></div>
                      </div>
                      <div className="enroute-bar-lbl">EN ROUTE TO CASUALTY</div>
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

              {/* Telemetry Grid */}
              <div className="panel-box">
                <div className="panel-header">
                  <div className="panel-title">TELEMETRY FEED &amp; SENSOR BUS</div>
                </div>
                
                {/* Live or Escalated Grid */}
                <div className="telem-grid">
                  <div className="telem-card" style={{ background: liveVitals.state === 'CRITICAL' ? 'rgba(192,57,43,0.15)' : 'rgba(46,204,113,0.08)', border: liveVitals.state === 'CRITICAL' ? '1px solid rgba(192,57,43,0.4)' : '1px solid rgba(46,204,113,0.25)' }}>
                    <div className="telem-card-lbl">DEVICE STATE</div>
                    <div className="telem-card-val" style={{ fontSize: 16, color: liveVitals.state === 'CRITICAL' ? '#ff6b6b' : '#2ECC71', letterSpacing: 1 }}>
                      {liveVitals.state}
                    </div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">CONFIDENCE</div>
                    <div className="telem-card-val" style={{ color: '#ffcc02' }}>{Math.round(liveVitals.confidence * 100)}%</div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">HEART RATE (MAX30100)</div>
                    <div className="telem-card-val" style={{ color: liveVitals.hr > 120 || liveVitals.hr < 50 ? '#ff6b6b' : '#CADCFC' }}>
                      {liveVitals.hr} <span style={{ fontSize: 11, fontWeight: 400 }}>BPM</span>
                    </div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">SpO₂ (MAX30100)</div>
                    <div className="telem-card-val" style={{ color: liveVitals.spo2 < 90 ? '#ff6b6b' : '#CADCFC' }}>
                      {liveVitals.spo2} <span style={{ fontSize: 11, fontWeight: 400 }}>%</span>
                    </div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">BODY TEMP (DS18B20)</div>
                    <div className="telem-card-val" style={{ color: liveVitals.temp > 38.0 ? '#ff9800' : '#CADCFC' }}>
                      {liveVitals.temp} <span style={{ fontSize: 11, fontWeight: 400 }}>°C</span>
                    </div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">MOTION (MPU6050)</div>
                    <div className="telem-card-val" style={{ color: liveVitals.motion > 2.5 ? '#ff9800' : '#CADCFC' }}>
                      {liveVitals.motion}g
                    </div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">GPS FIX</div>
                    <div className="telem-card-val" style={{ fontSize: 11, color: '#CADCFC' }}>
                      {liveVitals.lat.toFixed(4)}°, {liveVitals.lon.toFixed(4)}°
                    </div>
                  </div>

                  <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                    <div className="telem-card-lbl">CLASSIFICATION PATTERN</div>
                    <div className="telem-card-val" style={{ fontSize: 11, color: '#CADCFC' }}>
                      {liveVitals.classification}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* EVENT LOG */}
            <div className="log-panel">
              <div className="panel-box" style={{ height: '100%' }}>
                <div className="panel-header">
                  <div className="panel-title">MISSION AUDIT &amp; EVENT LOG</div>
                </div>
                <div className="event-log-body" ref={logRef}>
                  {entries.length === 0 && <div className="log-empty">— System standing by. No events recorded.</div>}
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

            {/* Reset / Clear */}
            {phase === ENROUTE && (
              <div className="reset-wrap">
                <button className="btn-reset" onClick={resetDemo}>RESET SESSION</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DISPATCH CONFIRMATION MODAL */}
      <div className={`modal-overlay ${phase === MODAL ? 'active' : ''}`}>
        <div className="modal-box">
          <h3>AUTHORIZE TACTICAL CASUALTY RESPONSE</h3>
          <div className="modal-sub">Confirm incident details and lock casualty waypoint</div>
          <div className="modal-rows">
            <div className="modal-row"><span className="modal-rl">SEVERITY LEVEL</span><span className="modal-rv red">CRITICAL (LEVEL 1)</span></div>
            <div className="modal-row"><span className="modal-rl">CLASSIFICATION</span><span className="modal-rv">{liveVitals.classification}</span></div>
            <div className="modal-row"><span className="modal-rl">HEART RATE</span><span className="modal-rv">{liveVitals.hr} BPM</span></div>
            <div className="modal-row"><span className="modal-rl">SpO₂ LEVEL</span><span className="modal-rv">{liveVitals.spo2}%</span></div>
            <div className="modal-row"><span className="modal-rl">TEMPERATURE</span><span className="modal-rv">{liveVitals.temp}°C</span></div>
            <div className="modal-row"><span className="modal-rl">WAYPOINT COORDINATES</span><span className="modal-rv">{liveVitals.lat}°N, {liveVitals.lon}°E</span></div>
            <div className="modal-row"><span className="modal-rl">CONFIDENCE SCORE</span><span className="modal-rv">{Math.round(liveVitals.confidence * 100)}%</span></div>
            <div className="modal-row"><span className="modal-rl">DISPATCH UNIT</span><span className="modal-rv">TACTICAL MED-01</span></div>
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setPhase(DISPATCH)}>CANCEL</button>
            <button className="btn-confirm" onClick={confirmDispatch}>AUTHORIZE DISPATCH</button>
          </div>
        </div>
      </div>
    </div>
  )
}
