import { useState, useEffect, useRef, useCallback } from 'react'
import { subscribeToVitals, subscribeToAlerts, clearAlert, resolveMedicDispatch, FIREBASE_DATABASE_URL } from '../firebase'

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
  const [dispatchProgress, setDispatchProgress] = useState(0)
  const [resetKey, setResetKey]   = useState(0)
  const [liveVitals, setLiveVitals] = useState(null)
  const [firebaseActive, setFirebaseActive] = useState(false)

  // Army Personnel Profile Management
  const [soldierProfile, setSoldierProfile] = useState(() => {
    const saved = localStorage.getItem('edgevital_soldier_profile')
    return saved ? JSON.parse(saved) : {
      code: 'SQD-ALPHA-01',
      id: 'soldier_01',
      unit: '1st Parachute Regiment',
      bloodGroup: 'O+',
      contact: '+91 98765 43210'
    }
  })
  const [showPersonnelModal, setShowPersonnelModal] = useState(false)
  const [personnelInput, setPersonnelInput] = useState(soldierProfile)

  const savePersonnelProfile = () => {
    setSoldierProfile(personnelInput)
    localStorage.setItem('edgevital_soldier_profile', JSON.stringify(personnelInput))
    setShowPersonnelModal(false)
    addLog('SYSTEM', `Army Personnel updated: ${personnelInput.code}`)
    // Sync soldier profile to Firebase
    try {
      fetch(`${FIREBASE_DATABASE_URL}/soldiers/${personnelInput.id}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personnelInput)
      }).catch(() => {})
    } catch (e) {}
  }

  const { entries, addLog, logRef } = useEventLog()

  // Subscribe to live telemetry and alerts from Raspberry Pi via Firebase
  useEffect(() => {
    const unsubVitals = subscribeToVitals('soldier_01', (data) => {
      if (data) {
        setLiveVitals(data)
        setFirebaseActive(true)
        // Latch critical state: do NOT auto-dismiss DISPATCH/MODAL/ENROUTE screen even if status returns to NORMAL
        setPhase(prev => (prev === OFFLINE ? MONITORING : prev))
      }
    })

    const unsubAlerts = subscribeToAlerts('soldier_01', (alertData) => {
      if (alertData && alertData.severity === 'CRITICAL') {
        setLiveVitals(prev => ({ ...prev, ...alertData }))
        addLog('FIREBASE', 'CRITICAL alert received from Raspberry Pi via Firebase')
        setPhase(prev => (prev === ENROUTE ? ENROUTE : INCOMING))
        setTimeout(() => {
          setPhase(prev => (prev === ENROUTE ? ENROUTE : DISPATCH))
        }, 800)
      } else if (alertData && (alertData.severity === 'NORMAL' || alertData.status === 'NORMAL')) {
        setLiveVitals(prev => (prev ? { ...prev, status: 'NORMAL', reasons: [] } : prev))
        // Latch critical screen: DO NOT auto-set MONITORING away from active DISPATCH / MODAL / ENROUTE until medic help is sent or user resets
      }
    })

    return () => {
      unsubVitals()
      unsubAlerts()
    }
  }, [addLog])

  // Browser Geolocation: get exact device coordinates with fallback to BMSIT Bangalore
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4))
          const lon = Number(pos.coords.longitude.toFixed(4))
          setLiveVitals(prev => (prev ? { ...prev, latitude: prev.latitude ?? lat, longitude: prev.longitude ?? lon } : { latitude: lat, longitude: lon }))
          addLog('GPS', `HQ Geolocation active: ${lat}° N, ${lon}° E`)
        },
        () => {
          setLiveVitals(prev => (prev ? { ...prev, latitude: prev.latitude ?? 13.1337, longitude: prev.longitude ?? 77.5682 } : { latitude: 13.1337, longitude: 77.5682 }))
        },
        { enableHighAccuracy: true, timeout: 8000 }
      )
    }
  }, [addLog])

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

  const getCoordsFormatted = useCallback(() => {
    return liveVitals?.latitude && liveVitals?.longitude
      ? `${Number(liveVitals.latitude).toFixed(4)}° N, ${Number(liveVitals.longitude).toFixed(4)}° E`
      : '13.1337° N, 77.5682° E'
  }, [liveVitals?.latitude, liveVitals?.longitude])

  function goIncoming() {
    setPhase(INCOMING)
    addLog('ALERT', 'Incoming burst transmission detected')
    const coords = getCoordsFormatted()
    setTimeout(() => {
      setPhase(DISPATCH)
      addLog('TELEMETRY', 'HR: 150 BPM (elevated)')
      setTimeout(() => addLog('TELEMETRY', 'SpO₂: 85% (below threshold)'), 200)
      setTimeout(() => addLog('TELEMETRY', 'HRV: 18ms RMSSD (suppressed)'), 350)
      setTimeout(() => addLog('TELEMETRY', 'Motion: 0.2g (near-stillness post impact)'), 500)
      setTimeout(() => addLog('TELEMETRY', 'Temp gradient: +2.1°C from baseline'), 650)
      setTimeout(() => addLog('TELEMETRY', 'Confidence: 87% (rule + statistical core)'), 800)
      setTimeout(() => addLog('LOCATION', coords), 1000)
      setTimeout(() => addLog('ALERT', 'Severity classified: CRITICAL — impact + physiological deterioration pattern'), 1200)
    }, 800)
  }

  // Complete medic dispatch, stabilize soldier, and return cleanly to soldier monitoring
  const completeDispatchNow = useCallback(() => {
    const coords = getCoordsFormatted()
    addLog('RESPONSE', `MED-01 arrived at ${coords} — patient stabilized`)
    addLog('SYSTEM', 'Medic response complete. Incident resolved — returning to soldier monitoring.')
    resolveMedicDispatch(soldierProfile?.id || 'soldier_01')
    clearAlert(soldierProfile?.id || 'soldier_01')
    setLiveVitals(prev => (prev ? {
      ...prev,
      status: 'NORMAL',
      severity: 'NORMAL',
      reasons: [],
      what_went_wrong: null,
      diagnosis: null
    } : prev))
    setSimDisabled(false)
    setPhase(MONITORING)
  }, [addLog, soldierProfile?.id, getCoordsFormatted])

  // Dispatch confirm
  function confirmDispatch() {
    setPhase(ENROUTE)
    setDispatchProgress(0)
    setEnrouteAnim(false)
    setTimeout(() => setEnrouteAnim(true), 50)
    addLog('RESPONSE', 'Medic dispatch authorized — MED-01 assigned')
    const coords = getCoordsFormatted()
    setTimeout(() => addLog('RESPONSE', `Unit status: EN ROUTE to ${coords}`), 400)
  }

  // Automatically advance ENROUTE dispatch progress to 100% and return to monitoring
  useEffect(() => {
    if (phase !== ENROUTE) return

    let cancelled = false
    const totalMs = 4500
    const start = Date.now()

    const iv = setInterval(() => {
      const elapsed = Date.now() - start
      const p = Math.min(100, Math.round((elapsed / totalMs) * 100))
      setDispatchProgress(p)
      if (p >= 100) {
        clearInterval(iv)
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) {
              completeDispatchNow()
            }
          }, 600)
        }
      }
    }, 40)

    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [phase, completeDispatchNow])

  function resetDemo() {
    setPhase(OFFLINE)
    setProgress(0)
    setChecks([false, false, false, false, false, false])
    setChecksDone([false, false, false, false, false, false])
    setShowStatus(false)
    setCommsAvail(true)
    setSimDisabled(false)
    setEnrouteAnim(false)
    setDispatchProgress(0)
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
                style={{ marginRight: 8, background: 'rgba(241, 196, 15, 0.15)', borderColor: '#f1c40f', color: '#f1c40f' }}
                onClick={() => { setPersonnelInput(soldierProfile); setShowPersonnelModal(true) }}
              >
                🪖 ARMY PERSONNEL DATA
              </button>
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
          {firebaseActive && (
            <div className="cc-status-badge online" style={{ marginRight: 8, background: 'rgba(46, 204, 113, 0.15)', borderColor: '#2ecc71', color: '#2ecc71' }}>
              FIREBASE LIVE
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

                      {/* Unique Soldier Code & What Went Wrong Banner */}
                      <div className="crit-soldier-box" style={{ margin: '8px 0 12px 0', padding: '10px 12px', background: 'rgba(192, 57, 43, 0.25)', border: '1px solid rgba(231, 76, 60, 0.5)', borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ff8a80', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>🪖 SOLDIER UNIQUE CODE: <strong style={{ color: '#fff', fontSize: 13 }}>{soldierProfile?.code || liveVitals?.soldier_code || 'SQD-ALPHA-01'}</strong></span>
                          <span style={{ color: '#f1c40f', fontSize: 11 }}>BLOOD GROUP: {soldierProfile?.bloodGroup || 'O+'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                          UNIT: <strong>{soldierProfile?.unit || '1st Parachute Regiment'}</strong>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#ff6b6b', marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          🚨 WHAT WENT WRONG (DIAGNOSIS):
                        </div>
                        <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 600, marginTop: 2 }}>
                          {liveVitals?.what_went_wrong || liveVitals?.diagnosis || (liveVitals?.reasons?.length ? liveVitals.reasons.join(' + ') : 'Low Oxygen Hypoxia & Physiological Deterioration')}
                        </div>
                      </div>

                      <div className="vital-row"><span className="vital-lbl">HEART RATE</span><span className="vital-val warn">{liveVitals?.heart_rate_bpm ?? liveVitals?.heart_rate ?? '—'} <small style={{ fontSize: 11, fontWeight: 400 }}>BPM</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">SpO₂</span><span className="vital-val warn">{liveVitals?.spo2 != null ? `${liveVitals.spo2}` : '—'} <small style={{ fontSize: 11, fontWeight: 400 }}>%</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">TEMPERATURE</span><span className="vital-val" style={{ color: '#4caf50' }}>{liveVitals?.temperature_c != null ? Number(liveVitals.temperature_c).toFixed(1) : (liveVitals?.temperature != null ? Number(liveVitals.temperature).toFixed(1) : '—')} <small style={{ fontSize: 11, fontWeight: 400 }}>°C</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">TEMP GRADIENT</span><span className="vital-val amber">{liveVitals?.temp_gradient != null ? `${liveVitals.temp_gradient >= 0 ? '+' : ''}${Number(liveVitals.temp_gradient).toFixed(1)}` : '0.0'} <small style={{ fontSize: 11, fontWeight: 400 }}>°C</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">HRV (RMSSD)</span><span className="vital-val warn">{liveVitals?.hrv_rmssd ?? '—'} <small style={{ fontSize: 11, fontWeight: 400 }}>ms</small></span></div>
                      <div className="vital-row"><span className="vital-lbl">MOTION</span><span className="vital-val amber">{liveVitals?.motion_mps2 != null ? `${Number(liveVitals.motion_mps2).toFixed(2)} m/s²` : (liveVitals?.motion_g != null ? `${(Number(liveVitals.motion_g) * 9.81).toFixed(2)} m/s²` : '—')}</span></div>
                      <div className="vital-row" style={{ marginBottom: 4 }}><span className="vital-lbl">CONFIDENCE</span><span className="vital-val amber">{liveVitals?.confidence ? Math.round(liveVitals.confidence * (liveVitals.confidence <= 1 ? 100 : 1)) : 87} <small style={{ fontSize: 11, fontWeight: 400 }}>%</small></span></div>
                      <div className="loc-box">
                        <div className="loc-coords">{liveVitals?.latitude && liveVitals?.longitude ? `${Number(liveVitals.latitude).toFixed(4)}° N, ${Number(liveVitals.longitude).toFixed(4)}° E` : '13.1337° N, 77.5682° E'}</div>
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
                        <div className="enroute-row"><span className="enroute-rl">DESTINATION</span><span className="enroute-rv">{liveVitals?.latitude && liveVitals?.longitude ? `${Number(liveVitals.latitude).toFixed(4)}° N, ${Number(liveVitals.longitude).toFixed(4)}° E` : '13.1337° N, 77.5682° E'}</span></div>
                        <div className="enroute-row"><span className="enroute-rl">HR / SpO₂ / HRV</span><span className="enroute-rv">{liveVitals?.heart_rate_bpm ?? liveVitals?.heart_rate ?? '—'} BPM · {liveVitals?.spo2 ?? '—'}% · {liveVitals?.hrv_rmssd ?? '—'}ms</span></div>
                      </div>
                      <div className="enroute-bar-lbl">EN ROUTE · {dispatchProgress}%</div>
                      <div className="enroute-bar-track">
                        <div
                          className="enroute-bar-fill"
                          style={{ width: `${dispatchProgress}%`, transition: 'width 0.1s linear' }}
                        />
                      </div>
                      {dispatchProgress >= 100 ? (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(46, 204, 113, 0.2)', border: '1px solid #2ecc71', borderRadius: 4, color: '#2ecc71', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                          ✓ MEDIC ARRIVED · PATIENT STABILIZED · RETURNING TO MONITORING...
                        </div>
                      ) : (
                        <button
                          className="btn-dispatch"
                          style={{ marginTop: 14, width: '100%', background: 'rgba(46, 204, 113, 0.15)', borderColor: '#2ecc71', color: '#2ecc71', fontSize: 11, cursor: 'pointer' }}
                          onClick={completeDispatchNow}
                        >
                          COMPLETE DISPATCH &amp; RETURN TO MONITORING
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Telemetry */}
              <div className="panel-box">
                <div className="panel-header"><div className="panel-title">HQ TELEMETRY FEED</div></div>
                {(phase === MONITORING || phase === INCOMING) && !liveVitals && (
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
                {(phase === DISPATCH || phase === MODAL || phase === ENROUTE || liveVitals !== null) && (
                  <div>
                    <div className="telem-grid">
                      <div className="telem-card" style={{ background: liveVitals?.status === 'CRITICAL' ? 'rgba(192,57,43,0.1)' : 'rgba(46,204,113,0.1)', border: liveVitals?.status === 'CRITICAL' ? '1px solid rgba(192,57,43,0.25)' : '1px solid rgba(46,204,113,0.25)' }}>
                        <div className="telem-card-lbl">STATUS</div>
                        <div className="telem-card-val" style={{ fontSize: 16, color: liveVitals?.status === 'CRITICAL' ? '#ff6b6b' : '#2ecc71', letterSpacing: 1 }}>{liveVitals?.status || 'NORMAL'}</div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">SOLDIER UNIQUE CODE</div>
                        <div className="telem-card-val" style={{ color: '#ffcc02', fontSize: 13 }}>{liveVitals?.soldier_code || 'SQD-ALPHA-01'}</div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(52, 152, 219, 0.08)', border: '1px solid rgba(52, 152, 219, 0.25)' }}>
                        <div className="telem-card-lbl">COORDINATES</div>
                        <div className="telem-card-val" style={{ fontSize: 11, color: '#3498db' }}>
                          {liveVitals?.latitude && liveVitals?.longitude ? `${Number(liveVitals.latitude).toFixed(4)}° N, ${Number(liveVitals.longitude).toFixed(4)}° E` : '13.1337° N, 77.5682° E'}
                        </div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">HEART RATE</div>
                        <div className="telem-card-val" style={{ color: liveVitals?.status === 'CRITICAL' ? '#ff6b6b' : '#4caf50' }}>{liveVitals?.heart_rate_bpm ?? liveVitals?.heart_rate ?? '—'} <span style={{ fontSize: 11, fontWeight: 400 }}>BPM</span></div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">SpO₂</div>
                        <div className="telem-card-val" style={{ color: liveVitals?.spo2 != null && liveVitals.spo2 < 90 ? '#ff6b6b' : '#4caf50' }}>{liveVitals?.spo2 != null ? `${liveVitals.spo2}%` : '—'}</div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">MOTION (ACCEL)</div>
                        <div className="telem-card-val" style={{ color: '#ff9800' }}>{liveVitals?.motion_mps2 != null ? `${Number(liveVitals.motion_mps2).toFixed(2)} m/s²` : (liveVitals?.motion_g != null ? `${(Number(liveVitals.motion_g) * 9.81).toFixed(2)} m/s²` : '—')}</div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">TEMPERATURE</div>
                        <div className="telem-card-val" style={{ color: '#4caf50' }}>{liveVitals?.temperature_c != null ? `${Number(liveVitals.temperature_c).toFixed(1)}°C` : (liveVitals?.temperature != null ? `${Number(liveVitals.temperature).toFixed(1)}°C` : '—')}</div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">TEMP DELTA</div>
                        <div className="telem-card-val" style={{ color: '#ff9800' }}>{liveVitals?.temp_gradient != null ? `${liveVitals.temp_gradient >= 0 ? '+' : ''}${Number(liveVitals.temp_gradient).toFixed(1)}°C` : '—'}</div>
                      </div>
                      <div className="telem-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(202,220,252,0.08)' }}>
                        <div className="telem-card-lbl">PATTERN</div>
                        <div className="telem-card-val" style={{ fontSize: 11, color: '#CADCFC' }}>{liveVitals?.reasons?.length ? liveVitals.reasons.join(' + ') : (liveVitals?.status || 'Active Monitoring')}</div>
                      </div>
                    </div>

                    {liveVitals?.status === 'CRITICAL' && (
                      <div style={{ marginTop: 12, padding: 12, background: 'rgba(192, 57, 43, 0.2)', border: '1px solid rgba(231, 76, 60, 0.4)', borderRadius: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ff6b6b', textTransform: 'uppercase', letterSpacing: 1 }}>
                          🚨 CRITICAL DIAGNOSIS (WHAT WENT WRONG):
                        </div>
                        <div style={{ fontSize: 13, color: '#ffffff', fontWeight: 600, marginTop: 4 }}>
                          {liveVitals?.what_went_wrong || liveVitals?.diagnosis || 'Low Oxygen Hypoxia & Physiological Deterioration'}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(202,220,252,0.8)', marginTop: 4 }}>
                          SOLDIER: <strong>{liveVitals?.soldier_code || 'SQD-ALPHA-01'}</strong> | <strong>{liveVitals?.latitude && liveVitals?.longitude ? `${Number(liveVitals.latitude).toFixed(4)}° N, ${Number(liveVitals.longitude).toFixed(4)}° E` : '13.1337° N, 77.5682° E'}</strong>
                        </div>
                      </div>
                    )}
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
                <button className="btn-reset" onClick={completeDispatchNow}>COMPLETE &amp; RETURN TO MONITORING</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DISPATCH MODAL */}
      <div className={`modal-overlay ${phase === MODAL ? 'active' : ''}`}>
        <div className="modal-box">
          <h3>CONFIRM MEDICAL DISPATCH</h3>
          <div className="modal-sub">Review incident &amp; soldier details before authorizing response</div>
          <div className="modal-rows">
            <div className="modal-row"><span className="modal-rl">SOLDIER UNIQUE CODE</span><span className="modal-rv yellow" style={{ color: '#ffcc02', fontWeight: 'bold' }}>{soldierProfile?.code || 'SQD-ALPHA-01'}</span></div>

            <div className="modal-row"><span className="modal-rl">MILITARY UNIT</span><span className="modal-rv">{soldierProfile?.unit || '1st Parachute Regiment'}</span></div>
            <div className="modal-row"><span className="modal-rl">BLOOD GROUP</span><span className="modal-rv amber" style={{ color: '#f1c40f' }}>{soldierProfile?.bloodGroup || 'O+'}</span></div>
            <div className="modal-row"><span className="modal-rl">SEVERITY</span><span className="modal-rv red">{liveVitals?.status || 'CRITICAL'}</span></div>
            <div className="modal-row"><span className="modal-rl">WHAT WENT WRONG</span><span className="modal-rv red" style={{ color: '#ff6b6b' }}>{liveVitals?.what_went_wrong || liveVitals?.diagnosis || 'Low Oxygen Hypoxia + Impact Shock'}</span></div>
            <div className="modal-row"><span className="modal-rl">COORDINATES</span><span className="modal-rv" style={{ color: '#3498db' }}>{liveVitals?.latitude && liveVitals?.longitude ? `${Number(liveVitals.latitude).toFixed(4)}° N, ${Number(liveVitals.longitude).toFixed(4)}° E` : '13.1337° N, 77.5682° E'}</span></div>
            <div className="modal-row"><span className="modal-rl">HEART RATE / SpO₂</span><span className="modal-rv">{liveVitals?.heart_rate_bpm ?? liveVitals?.heart_rate ?? '—'} BPM · {liveVitals?.spo2 != null ? `${liveVitals.spo2}%` : '—'}</span></div>
            <div className="modal-row"><span className="modal-rl">RESPONSE UNIT</span><span className="modal-rv">MED-01</span></div>
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setPhase(DISPATCH)}>CANCEL</button>
            <button className="btn-confirm" onClick={confirmDispatch}>CONFIRM DISPATCH</button>
          </div>
        </div>
      </div>

      {/* ARMY PERSONNEL DATA MODAL */}
      <div className={`modal-overlay ${showPersonnelModal ? 'active' : ''}`}>
        <div className="modal-box" style={{ maxWidth: 520 }}>
          <h3>🪖 ARMY PERSONNEL REGISTRY &amp; UNIQUE CODE</h3>
          <div className="modal-sub">Manage military personnel profile and unique identifier code</div>
          <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#CADCFC', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                Soldier Unique Code (Identifier):
              </label>
              <input
                type="text"
                value={personnelInput.code}
                onChange={e => setPersonnelInput({ ...personnelInput, code: e.target.value })}
                placeholder="e.g. SQD-ALPHA-01"
                style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(241, 196, 15, 0.4)', borderRadius: 6, color: '#f1c40f', fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#CADCFC', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Military Unit / Battalion:
                </label>
                <input
                  type="text"
                  value={personnelInput.unit}
                  onChange={e => setPersonnelInput({ ...personnelInput, unit: e.target.value })}
                  placeholder="e.g. 1st Parachute Regiment"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(202,220,252,0.2)', borderRadius: 6, color: '#fff', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#CADCFC', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Blood Group:
                </label>
                <input
                  type="text"
                  value={personnelInput.bloodGroup}
                  onChange={e => setPersonnelInput({ ...personnelInput, bloodGroup: e.target.value })}
                  placeholder="e.g. O+"
                  style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(202,220,252,0.2)', borderRadius: 6, color: '#fff', fontSize: 13 }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#CADCFC', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                Emergency Contact:
              </label>
              <input
                type="text"
                value={personnelInput.contact}
                onChange={e => setPersonnelInput({ ...personnelInput, contact: e.target.value })}
                placeholder="e.g. +91 98765 43210"
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(202,220,252,0.2)', borderRadius: 6, color: '#fff', fontSize: 13 }}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-cancel" onClick={() => setShowPersonnelModal(false)}>CANCEL</button>
            <button className="btn-confirm" style={{ background: '#f1c40f', color: '#000' }} onClick={savePersonnelProfile}>SAVE PERSONNEL PROFILE</button>
          </div>
        </div>
      </div>
    </div>
  )
}
