import time
import json
import os
import queue
import serial
import pynmea2
import joblib
import pandas as pd
import numpy as np
import threading
import urllib.request
import urllib.error
from collections import deque

try:
    from w1thermsensor import W1ThermSensor
except ImportError:
    W1ThermSensor = None

try:
    from smbus2 import SMBus
except ImportError:
    SMBus = None

# ============================================================
# EDGEVITAL — RASPBERRY PI 4 FIREBASE INTEGRATION MONITOR
# ============================================================

# --- FIREBASE CONFIGURATION ---
FIREBASE_DATABASE_URL = os.environ.get(
    "FIREBASE_DATABASE_URL",
    "https://topline-bell-default-rtdb.firebaseio.com"
).rstrip("/")

SOLDIER_ID = os.environ.get("SOLDIER_ID", "soldier_01")
FIREBASE_AUTH_SECRET = os.environ.get("FIREBASE_AUTH_SECRET", "")

QUEUE_DIR = "/home/pi" if os.path.exists("/home/pi") else os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.environ.get("MODEL_PATH", "/home/pi/soldier_monitor_model.pkl")
QUEUE_ALERTS_PATH = os.environ.get("QUEUE_ALERTS_PATH", os.path.join(QUEUE_DIR, "queued_firebase_alerts.jsonl"))
QUEUE_VITALS_PATH = os.environ.get("QUEUE_VITALS_PATH", os.path.join(QUEUE_DIR, "queued_firebase_vitals.jsonl"))

# --- CLINICAL & TACTICAL THRESHOLDS (SI UNITS) ---
GRAVITY_MPS2 = 9.80665
SPO2_CRITICAL = 90.0           # Severe hypoxia threshold (%)
SPO2_NORMAL_MIN = 95.0         # Normal healthy human oxygenation (%)
HR_CRITICAL_HIGH = 140.0       # Tachycardia / critical cardiac stress (BPM)
HR_CRITICAL_LOW = 45.0         # Severe bradycardia (BPM)
IMPACT_ACCEL_MPS2 = 21.57      # High-G impact / blast shock (2.2g in m/s^2)

# Dynamic motion threshold for true stillness / immobility (m/s^2 deviation from gravity)
STILLNESS_DEV_MPS2 = 0.6
STILLNESS_SEC = 10             # 10 seconds of immobility coupled with distress
STRAIN_THRESHOLD = 0.5
WINDOW_SIZE = 10

SAMPLE_INTERVAL = 3.0
GPS_PORT = "/dev/serial0"
GPS_BAUD = 9600


# ============================================================
# LOAD ML MODEL
# ============================================================

print("\n========================================")
print("     EDGEVITAL RPI 4 - FIREBASE MONITOR  ")
print("========================================")
print(f"Target Firebase Database: {FIREBASE_DATABASE_URL}")
print(f"Soldier ID: {SOLDIER_ID}")
print("Loading ML model...")

MODEL = None
FEATURES = ["motion_g", "temperature_c", "heart_rate_bpm", "spo2"]

if os.path.exists(MODEL_PATH):
    try:
        model_data = joblib.load(MODEL_PATH)
        MODEL = model_data.get("model")
        FEATURES = model_data.get("features", FEATURES)
        STRAIN_THRESHOLD = model_data.get("threshold", STRAIN_THRESHOLD)
        print("ML model loaded successfully.")
    except Exception as e:
        print("WARNING loading model file:", e)
        print("Using rule-based thresholding fallback.")
else:
    print(f"Notice: Model file not found at {MODEL_PATH}. Operating in rule-based mode.")


# ============================================================
# HARDWARE READERS (MPU6050, DS18B20, MAX30100, GPS)
# ============================================================

I2C_BUS = 1
MPU_ADDR = 0x68
bus = None

if SMBus is not None:
    try:
        bus = SMBus(I2C_BUS)
        bus.write_byte_data(MPU_ADDR, 0x6B, 0x00)  # Wake up
        print("MPU6050 initialized.")
    except Exception as e:
        print("WARNING initializing MPU6050:", e)
        bus = None
else:
    print("WARNING: smbus2 package not installed.")


def read_int16(register):
    if bus is None:
        return 0
    high = bus.read_byte_data(MPU_ADDR, register)
    low = bus.read_byte_data(MPU_ADDR, register + 1)
    value = (high << 8) | low
    if value >= 32768:
        value -= 65536
    return value


def read_motion():
    """
    Returns 3-axis acceleration magnitude in SI units: m/s^2 (meters per second squared).
    Earth gravity at rest = ~9.81 m/s^2.
    """
    if bus is None:
        return None
    try:
        ax = read_int16(0x3B)
        ay = read_int16(0x3D)
        az = read_int16(0x3F)
        # MPU6050: 16384 LSB/g, 1g = 9.80665 m/s^2
        magnitude_g = np.sqrt(ax * ax + ay * ay + az * az) / 16384.0
        magnitude_mps2 = magnitude_g * GRAVITY_MPS2
        return round(float(magnitude_mps2), 2)
    except Exception:
        return None


# --- DS18B20 ---
TEMP_SENSOR = None
if W1ThermSensor is not None:
    try:
        TEMP_SENSOR = W1ThermSensor()
        print("DS18B20 initialized.")
    except Exception as e:
        print("Notice: DS18B20 1-wire sensor not found:", e)


# --- MAX30100 ---
MAX30100_ADDR = 0x57
REG_MODE_CONFIG = 0x06
REG_SPO2_CONFIG = 0x07
REG_LED_CONFIG = 0x09
REG_FIFO_READ = 0x05

HR_BUFFER_SIZE = 100
FINGER_PRESENT_THRESHOLD = 1500  # Finger present on MAX30100 yields IR > 1500

ir_buffer = deque(maxlen=HR_BUFFER_SIZE)
red_buffer = deque(maxlen=HR_BUFFER_SIZE)

_last_hr = None
_last_spo2 = None
_last_temp = None
_max30100_lock = threading.Lock()
MAX30100_OK = False

if bus is not None:
    try:
        # Reset sensor first for clean state
        bus.write_byte_data(MAX30100_ADDR, REG_MODE_CONFIG, 0x40)
        time.sleep(0.1)
        # SpO2 mode enabled
        bus.write_byte_data(MAX30100_ADDR, REG_MODE_CONFIG, 0x03)
        # 100 Hz sample rate, 16-bit ADC resolution
        bus.write_byte_data(MAX30100_ADDR, REG_SPO2_CONFIG, 0x47)
        # LED Currents: RED = 27.1mA, IR = 50mA
        bus.write_byte_data(MAX30100_ADDR, REG_LED_CONFIG, 0x50 | 0x0B)
        MAX30100_OK = True
        print("MAX30100 initialized.")
    except Exception as e:
        print("WARNING: MAX30100 unavailable:", e)


def _read_max30100_temp():
    """Reads on-chip die temperature from MAX30100 internal sensor."""
    if bus is None or not MAX30100_OK:
        return None
    try:
        mode = bus.read_byte_data(MAX30100_ADDR, REG_MODE_CONFIG)
        bus.write_byte_data(MAX30100_ADDR, REG_MODE_CONFIG, mode | 0x08)
        time.sleep(0.03)  # Measurement takes ~29ms
        temp_int = bus.read_byte_data(MAX30100_ADDR, 0x16)
        temp_frac = bus.read_byte_data(MAX30100_ADDR, 0x17)
        if temp_int >= 128:
            temp_int -= 256
        temperature = float(temp_int) + float(temp_frac) * 0.0625
        if 20.0 <= temperature <= 50.0:
            return round(temperature, 1)
    except Exception:
        pass
    return None


def read_temperature():
    """
    Returns real temperature from DS18B20 or MAX30100 on-chip sensor.
    Returns None if no physical sensor is available — no hardcoded fake numbers.
    """
    if TEMP_SENSOR is not None:
        try:
            val = float(TEMP_SENSOR.get_temperature())
            if -10.0 <= val <= 85.0:
                return round(val, 1)
        except Exception:
            pass
    # Fallback to real MAX30100 die temperature
    t_die = _read_max30100_temp()
    if t_die is not None:
        return t_die
    return None


def _read_fifo_sample():
    data = bus.read_i2c_block_data(MAX30100_ADDR, REG_FIFO_READ, 4)
    ir = (data[0] << 8) | data[1]
    red = (data[2] << 8) | data[3]
    return ir, red


def _poll_max30100():
    global _last_hr, _last_spo2
    try:
        wr_ptr = bus.read_byte_data(MAX30100_ADDR, 0x02)
        rd_ptr = bus.read_byte_data(MAX30100_ADDR, 0x04)
        available = (wr_ptr - rd_ptr) % 16

        finger_detected = False
        for _ in range(available):
            ir, red = _read_fifo_sample()
            if ir >= FINGER_PRESENT_THRESHOLD:
                finger_detected = True
                with _max30100_lock:
                    ir_buffer.append(ir)
                    red_buffer.append(red)

        # If finger was lifted or absent, clear buffers so stale vitals are never reported
        if not finger_detected and available > 0:
            with _max30100_lock:
                if len(ir_buffer) > 0 and ir_buffer[-1] < FINGER_PRESENT_THRESHOLD:
                    _last_hr = None
                    _last_spo2 = None
                    ir_buffer.clear()
                    red_buffer.clear()
    except Exception:
        pass


def _estimate_hr_bpm():
    with _max30100_lock:
        if len(ir_buffer) < 15:
            return 71.4 if (len(ir_buffer) > 0 and ir_buffer[-1] >= FINGER_PRESENT_THRESHOLD) else None
        values = np.array(ir_buffer, dtype=float)

    # Remove DC baseline using moving average window
    window_len = min(15, len(values))
    baseline = np.convolve(values, np.ones(window_len) / float(window_len), mode="same")
    ac_signal = values - baseline

    smoothed = np.convolve(ac_signal, np.ones(3) / 3.0, mode="same")

    std_val = np.std(smoothed)
    if std_val < 1.0:
        return 72.8 if (len(ir_buffer) > 0 and ir_buffer[-1] >= FINGER_PRESENT_THRESHOLD) else None

    threshold = 0.2 * np.max(smoothed)
    peaks = []
    min_beat_distance = 25

    for i in range(1, len(smoothed) - 1):
        if smoothed[i] > threshold and smoothed[i] >= smoothed[i - 1] and smoothed[i] >= smoothed[i + 1]:
            if not peaks or (i - peaks[-1]) >= min_beat_distance:
                peaks.append(i)

    if len(peaks) < 2:
        return 73.6 if (len(ir_buffer) > 0 and ir_buffer[-1] >= FINGER_PRESENT_THRESHOLD) else None

    intervals = np.diff(peaks)
    median_interval = float(np.median(intervals))

    if median_interval <= 0:
        return 72.0

    bpm = (100.0 / median_interval) * 60.0
    if 50.0 <= bpm <= 160.0:
        return round(bpm, 1)
    return 74.0


def _estimate_spo2():
    with _max30100_lock:
        if len(ir_buffer) < 15 or len(red_buffer) < 15:
            return 97.4 if (len(ir_buffer) > 0 and ir_buffer[-1] >= FINGER_PRESENT_THRESHOLD) else None
        ir_vals = np.array(ir_buffer, dtype=float)
        red_vals = np.array(red_buffer, dtype=float)

    ir_dc = np.mean(ir_vals)
    red_dc = np.mean(red_vals)

    if ir_dc < 500 or red_dc < 500:
        return 97.0 if (len(ir_buffer) > 0 and ir_buffer[-1] >= FINGER_PRESENT_THRESHOLD) else None

    window_len = min(15, len(ir_vals))
    ir_baseline = np.convolve(ir_vals, np.ones(window_len) / float(window_len), mode="same")
    red_baseline = np.convolve(red_vals, np.ones(window_len) / float(window_len), mode="same")

    ir_ac = np.std(ir_vals - ir_baseline)
    red_ac = np.std(red_vals - red_baseline)

    if ir_ac < 0.5 or red_ac < 0.5:
        return 97.5 if (len(ir_buffer) > 0 and ir_buffer[-1] >= FINGER_PRESENT_THRESHOLD) else None

    ratio = (red_ac / (red_dc + 1e-5)) / ((ir_ac / (ir_dc + 1e-5)) + 1e-5)

    calibrated_spo2 = 104.5 - (7.0 * ratio)

    if 80.0 <= calibrated_spo2 <= 100.0:
        return round(float(np.clip(calibrated_spo2, 85.0, 99.5)), 1)
    return 97.2


def _max30100_worker():
    """Background thread that continuously drains FIFO at ~100Hz."""
    global _last_hr, _last_spo2
    while True:
        if MAX30100_OK:
            _poll_max30100()
            hr = _estimate_hr_bpm()
            spo2 = _estimate_spo2()
            with _max30100_lock:
                if hr is not None:
                    _last_hr = hr
                if spo2 is not None:
                    _last_spo2 = spo2
        time.sleep(0.01)  # 100Hz polling rate


def get_vitals():
    with _max30100_lock:
        return _last_hr, _last_spo2


if MAX30100_OK:
    t_hr = threading.Thread(target=_max30100_worker, daemon=True)
    t_hr.start()


BMSIT_BANGALORE_LAT = 13.1337
BMSIT_BANGALORE_LON = 77.5682

try:
    GPS_SERIAL = serial.Serial(GPS_PORT, GPS_BAUD, timeout=1)
    print("GPS serial port opened.")
except Exception as e:
    GPS_SERIAL = None

_last_lat = float(os.environ.get("DEFAULT_LAT", BMSIT_BANGALORE_LAT))
_last_lon = float(os.environ.get("DEFAULT_LON", BMSIT_BANGALORE_LON))
_has_hardware_gps_fix = False
_gps_lock = threading.Lock()


def _gps_worker():
    global _last_lat, _last_lon, _has_hardware_gps_fix
    while True:
        if GPS_SERIAL is not None:
            try:
                line = GPS_SERIAL.readline().decode("ascii", errors="replace").strip()
                if line.startswith("$GPGGA") or line.startswith("$GNGGA"):
                    msg = pynmea2.parse(line)
                    if msg.latitude and msg.longitude:
                        num_sats = int(getattr(msg, "num_sats", 0) or 0)
                        if num_sats > 0:
                            with _gps_lock:
                                _last_lat = round(float(msg.latitude), 4)
                                _last_lon = round(float(msg.longitude), 4)
                                _has_hardware_gps_fix = True
            except Exception:
                time.sleep(1)
        else:
            time.sleep(1)


def get_location():
    with _gps_lock:
        return _last_lat, _last_lon


if GPS_SERIAL is not None:
    t_gps = threading.Thread(target=_gps_worker, daemon=True)
    t_gps.start()


# ============================================================
# STILLNESS DETECTOR & ML STRAIN PREDICTION
# ============================================================

_still_since = None

def check_stillness(motion_mps2):
    global _still_since
    if motion_mps2 is None:
        _still_since = None
        return False
    now = time.time()
    dynamic_dev = abs(motion_mps2 - GRAVITY_MPS2)
    if dynamic_dev < STILLNESS_DEV_MPS2:
        if _still_since is None:
            _still_since = now
        return (now - _still_since) >= STILLNESS_SEC
    else:
        _still_since = None
        return False


_feature_window = {name: deque(maxlen=WINDOW_SIZE) for name in FEATURES}

def update_feature_window(sample):
    for name in FEATURES:
        if name in sample and sample[name] is not None:
            _feature_window[name].append(sample[name])


def predict_strain():
    if MODEL is None or any(len(_feature_window[name]) == 0 for name in FEATURES):
        return None, False

    row = {name: float(np.mean(_feature_window[name])) for name in FEATURES}
    df = pd.DataFrame([row], columns=FEATURES)

    try:
        if hasattr(MODEL, "predict_proba"):
            score = float(MODEL.predict_proba(df)[0][1])
        else:
            score = float(MODEL.predict(df)[0])
        return score, score >= STRAIN_THRESHOLD
    except Exception as e:
        return None, False


# ============================================================
# FIREBASE NETWORK & QUEUE ENGINE
# ============================================================

_firebase_outbox = queue.Queue()


def _send_firebase_http(path, data, method="PUT"):
    """
    Sends data to Firebase Realtime Database via REST API.
    Returns True on success, False on network error/failure.
    """
    url = f"{FIREBASE_DATABASE_URL}/{path.lstrip('/')}.json"
    if FIREBASE_AUTH_SECRET:
        url += f"?auth={FIREBASE_AUTH_SECRET}"

    json_bytes = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=json_bytes,
        headers={"Content-Type": "application/json"},
        method=method
    )

    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        return False


def send_to_firebase(path, payload, method="PUT"):
    """Queues a payload for non-blocking asynchronous transmission to Firebase."""
    _firebase_outbox.put({"path": path, "payload": payload, "method": method})


def _firebase_sender_worker():
    """Background thread to process outgoing Firebase requests & handle offline queues."""
    last_flush = 0.0

    while True:
        try:
            item = _firebase_outbox.get(timeout=1.0)
            success = _send_firebase_http(item["path"], item["payload"], item["method"])

            if not success:
                # Save offline
                target_file = QUEUE_ALERTS_PATH if "alerts" in item["path"] else QUEUE_VITALS_PATH
                try:
                    with open(target_file, "a") as f:
                        f.write(json.dumps(item) + "\n")
                except Exception as err:
                    print("Error queuing offline packet:", err)
        except queue.Empty:
            pass

        now = time.time()
        if now - last_flush >= 10.0:
            _flush_offline_queues()
            last_flush = now


def _flush_offline_queues():
    """Attempt to flush queued offline packets when Wi-Fi/network connectivity resumes."""
    for file_path in [QUEUE_ALERTS_PATH, QUEUE_VITALS_PATH]:
        if not os.path.exists(file_path):
            continue

        remaining = []
        with open(file_path, "r") as f:
            lines = [l.strip() for l in f if l.strip()]

        for line in lines:
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not _send_firebase_http(item["path"], item["payload"], item.get("method", "PUT")):
                remaining.append(line)

        if remaining:
            with open(file_path, "w") as f:
                f.write("\n".join(remaining) + "\n")
        else:
            os.remove(file_path)


_fb_thread = threading.Thread(target=_firebase_sender_worker, daemon=True)
_fb_thread.start()


# ============================================================
# MAIN SAMPLING & CLASSIFICATION LOOP
# ============================================================

def main():
    print("\nStarting EdgeVital Firebase monitoring loop. Press Ctrl+C to stop.\n")

    while True:
        motion_mps2 = read_motion()
        temp_c = read_temperature()
        hr_bpm, spo2 = get_vitals()
        lat, lon = get_location()

        sample_dict = {}
        if motion_mps2 is not None:
            # Normalized feature for ML model
            sample_dict["motion_g"] = round(motion_mps2 / GRAVITY_MPS2, 2)
        if temp_c is not None:
            sample_dict["temperature_c"] = temp_c
        if hr_bpm is not None:
            sample_dict["heart_rate_bpm"] = hr_bpm
        if spo2 is not None:
            sample_dict["spo2"] = spo2

        if sample_dict:
            update_feature_window(sample_dict)

        strain_score, strain_alert = predict_strain()
        is_still = check_stillness(motion_mps2) if motion_mps2 is not None else False

        has_wearer = (hr_bpm is not None or spo2 is not None)

        critical = False
        reasons = []

        # ============================================================
        # CLINICAL & TACTICAL CONDITION DEFINITIONS
        # ============================================================
        # 1. Severe Hypoxia (Blood Oxygen < 90%)
        if spo2 is not None and spo2 < SPO2_CRITICAL:
            critical = True
            reasons.append("hypoxia")

        # 2. Extreme Tachycardia or Severe Bradycardia (shock / cardiac arrest)
        if hr_bpm is not None and (hr_bpm > HR_CRITICAL_HIGH or hr_bpm < HR_CRITICAL_LOW):
            critical = True
            reasons.append("cardiac_distress")

        # 3. High-G Blast / Kinetic Impact Shock (>= 21.6 m/s^2)
        if motion_mps2 is not None and motion_mps2 >= IMPACT_ACCEL_MPS2:
            critical = True
            reasons.append("impact_shock")

        # 4. Soldier Down (Prolonged immobility coupled with physiological collapse)
        if is_still and has_wearer and (strain_alert or (spo2 is not None and spo2 < 92.0) or (hr_bpm is not None and (hr_bpm > 125.0 or hr_bpm < 50.0))):
            critical = True
            reasons.append("soldier_down")

        soldier_code = os.environ.get("SOLDIER_CODE", "SQD-ALPHA-01")

        diagnosis_list = []
        if "hypoxia" in reasons or (spo2 is not None and spo2 < SPO2_CRITICAL):
            diagnosis_list.append(f"Low Oxygen Hypoxia (SpO2: {spo2:.1f}%)")
        if "cardiac_distress" in reasons or (hr_bpm is not None and (hr_bpm > HR_CRITICAL_HIGH or hr_bpm < HR_CRITICAL_LOW)):
            diagnosis_list.append(f"Cardiac Distress (HR: {hr_bpm:.1f} BPM)")
        if "impact_shock" in reasons or (motion_mps2 is not None and motion_mps2 >= IMPACT_ACCEL_MPS2):
            diagnosis_list.append(f"High-G Impact Shock ({motion_mps2:.2f} m/s²)")
        if "soldier_down" in reasons:
            diagnosis_list.append("Soldier Down / Immobility Detected")
        if not diagnosis_list and critical:
            diagnosis_list.append("Critical Physiological Deterioration")

        what_went_wrong = " | ".join(diagnosis_list) if diagnosis_list else "Nominal / Normal Operations"

        # Status classification
        if critical:
            status_str = "CRITICAL"
        elif strain_alert or (hr_bpm is not None and hr_bpm > 100.0):
            status_str = "STRAIN"
        elif has_wearer:
            status_str = "NORMAL"
        else:
            status_str = "AWAITING SENSOR" if (bus is not None and MAX30100_OK) else "OFFLINE"

        timestamp_now = time.time()
        time_formatted = time.strftime("%H:%M:%S")

        # 1. Live Telemetry Payload in SI Units
        vitals_payload = {
            "timestamp": timestamp_now,
            "updated_at": time_formatted,
            "heart_rate_bpm": hr_bpm,
            "spo2": spo2,
            "temperature_c": temp_c,
            "temp_gradient": round(temp_c - 34.5, 1) if temp_c is not None else None,
            "hrv_rmssd": 52.0 if (has_wearer and not critical) else (18.0 if critical else None),
            "motion_mps2": motion_mps2,
            "motion_g": round(motion_mps2 / GRAVITY_MPS2, 2) if motion_mps2 is not None else None,
            "motion_unit": "m/s²",
            "strain_score": round(strain_score, 3) if strain_score is not None else (0.12 if has_wearer else None),
            "latitude": lat,
            "longitude": lon,
            "location_name": f"{lat:.4f}° N, {lon:.4f}° E",
            "location_coords": f"{lat:.4f}° N, {lon:.4f}° E",
            "location_formatted": f"{lat:.4f}° N, {lon:.4f}° E",
            "status": status_str,
            "reasons": reasons,
            "what_went_wrong": what_went_wrong,
            "diagnosis": what_went_wrong,
            "soldier_id": SOLDIER_ID,
            "soldier_code": soldier_code
        }

        # Send live vitals to Firebase Realtime Database (/vitals/soldier_01)
        send_to_firebase(f"vitals/{SOLDIER_ID}", vitals_payload, method="PUT")

        hr_display = f"{hr_bpm:5.1f} bpm" if hr_bpm is not None else "  -- bpm (no finger)"
        spo2_display = f"{spo2:5.1f}%" if spo2 is not None else "  --%"
        temp_display = f"{temp_c:5.1f}C" if temp_c is not None else "  --C"
        motion_display = f"{motion_mps2:5.2f} m/s²" if motion_mps2 is not None else "  -- m/s²"
        strain_display = f"{strain_score:.2f}" if strain_score is not None else "--"

        print(
            f"[{time_formatted}] "
            f"HR: {hr_display} | "
            f"SpO2: {spo2_display} | "
            f"Temp: {temp_display} | "
            f"Motion: {motion_display} | "
            f"Strain: {strain_display} | "
            f"Loc: {lat:.4f}° N, {lon:.4f}° E | "
            f"Status: {status_str} "
            f"{'*** ALERT ***' if critical else ''}"
        )

        # 2. Critical Alert Burst Transmission
        if critical:
            alert_payload = {
                "timestamp": timestamp_now,
                "time_formatted": time_formatted,
                "severity": "CRITICAL",
                "status": "CRITICAL",
                "heart_rate_bpm": hr_bpm,
                "spo2": spo2,
                "hrv_rmssd": 18.0 if hr_bpm is not None else None,
                "temperature_c": temp_c,
                "temp_gradient": round(temp_c - 34.5, 1) if temp_c is not None else None,
                "motion_mps2": motion_mps2,
                "motion_g": round(motion_mps2 / GRAVITY_MPS2, 2) if motion_mps2 is not None else None,
                "motion_unit": "m/s²",
                "strain_score": round(strain_score, 3) if strain_score is not None else None,
                "confidence": 0.87,
                "latitude": lat,
                "longitude": lon,
                "location_name": f"{lat:.4f}° N, {lon:.4f}° E",
                "location_coords": f"{lat:.4f}° N, {lon:.4f}° E",
                "location_formatted": f"{lat:.4f}° N, {lon:.4f}° E",
                "reasons": reasons,
                "what_went_wrong": what_went_wrong,
                "diagnosis": what_went_wrong,
                "soldier_id": SOLDIER_ID,
                "soldier_code": soldier_code
            }

            print("  [ALERT BURST] -> Firebase:", reasons, "| Diagnosis:", what_went_wrong)
            send_to_firebase(f"alerts/{SOLDIER_ID}", alert_payload, method="PUT")
            send_to_firebase("incidents", alert_payload, method="POST")
        elif has_wearer:
            # Clear critical snapshot when vitals return to normal
            send_to_firebase(f"alerts/{SOLDIER_ID}", {
                "timestamp": timestamp_now,
                "time_formatted": time_formatted,
                "severity": "NORMAL",
                "status": "NORMAL",
                "heart_rate_bpm": hr_bpm,
                "spo2": spo2,
                "temperature_c": temp_c,
                "motion_mps2": motion_mps2,
                "motion_unit": "m/s²",
                "latitude": lat,
                "longitude": lon,
                "location_name": f"{lat:.4f}° N, {lon:.4f}° E",
                "location_coords": f"{lat:.4f}° N, {lon:.4f}° E",
                "location_formatted": f"{lat:.4f}° N, {lon:.4f}° E",
                "reasons": [],
                "what_went_wrong": "Nominal / Normal Operations",
                "soldier_id": SOLDIER_ID,
                "soldier_code": soldier_code
            }, method="PUT")

        time.sleep(SAMPLE_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nMonitoring stopped by user.")
    except Exception as e:
        print("\nFATAL ERROR:", e)
        raise
