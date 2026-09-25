import { initializeApp, getApps, deleteApp } from 'firebase/app'
import { getDatabase, ref, onValue, off, set } from 'firebase/database'

const getSavedDbUrl = () => {
  return localStorage.getItem('FIREBASE_DATABASE_URL') ||
         import.meta.env.VITE_FIREBASE_DATABASE_URL ||
         "https://topline-bell-default-rtdb.firebaseio.com"
}

let firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoKeyForEdgeVitalApp123456",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "topline-bell.firebaseapp.com",
  databaseURL: getSavedDbUrl(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "topline-bell",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "topline-bell.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456"
}

let app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export let db = getDatabase(app)

export function updateFirebaseUrl(newUrl) {
  if (!newUrl) return
  const formattedUrl = newUrl.trim().replace(/\/$/, '')
  localStorage.setItem('FIREBASE_DATABASE_URL', formattedUrl)
  
  try {
    firebaseConfig.databaseURL = formattedUrl
    db = getDatabase(app, formattedUrl)
    console.log('[Firebase] Realtime Database URL updated to:', formattedUrl)
  } catch (err) {
    console.warn('[Firebase] Re-initializing app for new URL:', err)
  }
}

export function getCurrentFirebaseUrl() {
  return getSavedDbUrl()
}

/**
 * Subscribe to live telemetry/vitals stream for a specific soldier
 */
export function subscribeToVitals(soldierId = 'soldier_01', callback) {
  try {
    const vitalsRef = ref(db, `vitals/${soldierId}`)
    onValue(vitalsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        callback(data)
      }
    }, (error) => {
      console.warn('[Firebase] Error reading vitals:', error)
    })
    return () => off(vitalsRef)
  } catch (err) {
    console.error('[Firebase] Subscription error:', err)
    return () => {}
  }
}

/**
 * Subscribe to active alerts stream for a specific soldier
 */
export function subscribeToAlerts(soldierId = 'soldier_01', callback) {
  try {
    const alertRef = ref(db, `alerts/${soldierId}`)
    onValue(alertRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        callback(data)
      }
    }, (error) => {
      console.warn('[Firebase] Error reading alerts:', error)
    })
    return () => off(alertRef)
  } catch (err) {
    console.error('[Firebase] Subscription error:', err)
    return () => {}
  }
}

export async function clearAlert(soldierId = 'soldier_01') {
  try {
    const alertRef = ref(db, `alerts/${soldierId}`)
    await set(alertRef, null)
  } catch (err) {
    console.error('[Firebase] Error clearing alert:', err)
  }
}

export async function resolveMedicDispatch(soldierId = 'soldier_01') {
  try {
    const alertRef = ref(db, `alerts/${soldierId}`)
    await set(alertRef, null)
    const statusRef = ref(db, `vitals/${soldierId}/status`)
    await set(statusRef, 'NORMAL')
    const diagRef = ref(db, `vitals/${soldierId}/what_went_wrong`)
    await set(diagRef, null)
    const diagRef2 = ref(db, `vitals/${soldierId}/diagnosis`)
    await set(diagRef2, null)
    const reasonsRef = ref(db, `vitals/${soldierId}/reasons`)
    await set(reasonsRef, null)
  } catch (err) {
    console.error('[Firebase] Error resolving medic dispatch:', err)
  }
}

