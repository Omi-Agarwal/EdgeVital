import time
import json
import os
import queue
import socket
import serial
import pynmea2
import joblib
import pandas as pd
import numpy as np
import threading
from collections import deque
from smbus2 import SMBus


# ============================================================
# EDGEVITAL - IMPORTABLE SENSOR / ML MODULE
# ============================================================
# Can be used in two ways:
#   1. Standalone:  python bla.py   (runs terminal-only monitor)
#   2. As a module:  import bla; bla.init(); data = bla.read_all_sensors()

MODEL_PATH = "/home/pi/soldier_monitor_model.pkl"
QUEUE_PATH = "/home/pi/queued_alerts.jsonl"

WINDOW_SIZE = 30
STRAIN_THRESHOLD = 0.30

SPO2_CRITICAL = 90.0
IMPACT_ACCEL_G = 2.2

# At rest, accelerometer magnitude is approximately 1g
STILLNESS_MOTION_G = 0.15
STILLNESS_SEC = 3

SAMPLE_INTERVAL = 5.0

# --- ASSUMPTION: server destination for alerts. Replace with your
# actual base-station IP/port before running. ---
SERVER_HOST = "192.168.1.100"
SERVER_PORT = 9000
SOCKET_TIMEOUT = 2.0

# --- ASSUMPTION: GPS serial port. Adjust to match your wiring
# (common values: /dev/ttyAMA0, /dev/ttyS0, /dev/serial0). ---
GPS_PORT = "/dev/serial0"
GPS_BAUD = 9600

# How often the background thread retries anything sitting in the
# on-disk queue.
FLUSH_INTERVAL = 10.0


# ============================================================
# MODULE-LEVEL STATE (populated by init())
# ============================================================

_initialized = False

MODEL = None
FEATURES = None

I2C_BUS = 1
MPU_ADDR = 0x68
bus = None

TEMP_SENSOR = None

MAX30100_ADDR = 0x57

REG_FIFO_WR_PTR = 0x02
REG_FIFO_RD_PTR = 0x04
REG_FIFO_DATA = 0x05
REG_MODE_CONFIG = 0x06
REG_SPO2_CONFIG = 0x07
REG_LED_CONFIG = 0x09

HR_BUFFER_SIZE = 100
FINGER_PRESENT_THRESHOLD = 300

ir_buffer = deque(maxlen=HR_BUFFER_SIZE)
red_buffer = deque(maxlen=HR_BUFFER_SIZE)

_last_hr = 75.0
_last_spo2 = 97.0
_max30100_lock = threading.Lock()
MAX30100_OK = False

GPS_SERIAL = None
_last_lat = None
_last_lon = None
_gps_lock = threading.Lock()

_still_since = None
_feature_window = None

_outbox = queue.Queue()


# ============================================================
# INIT — call once before using any sensor functions
# ============================================================

def init():
    """
    Initialize all hardware (MPU6050, DS18B20, MAX30100, GPS),
    load the ML model, and start background worker threads.

    Safe to call multiple times; subsequent calls are no-ops.
    """
    global _initialized
    global MODEL, FEATURES, STRAIN_THRESHOLD
    global bus, TEMP_SENSOR, MAX30100_OK, GPS_SERIAL
    global _feature_window

    if _initialized:
        return

    print("\n========================================")
    print("          EDGEVITAL MONITOR")
    print("========================================")

    # ---- ML model ----
    print("Loading ML model...")
    try:
        model_data = joblib.load(MODEL_PATH)
        MODEL = model_data["model"]
        FEATURES = model_data["features"]
        STRAIN_THRESHOLD = model_data.get("threshold", STRAIN_THRESHOLD)
        print("ML model loaded successfully.")
    except Exception as e:
        print("ERROR loading model:", e)
        raise SystemExit

    # ---- MPU6050 ----
    try:
        bus = SMBus(I2C_BUS)
        # Wake MPU6050
        bus.write_byte_data(MPU_ADDR, 0x6B, 0x00)
        print("MPU6050 initialized.")
    except Exception as e:
        print("ERROR initializing MPU6050:", e)
        raise SystemExit

    # ---- DS18B20 ----
    try:
        from w1thermsensor import W1ThermSensor
        TEMP_SENSOR = W1ThermSensor()
        print("DS18B20 initialized.")
    except Exception as e:
        print("WARNING: DS18B20 unavailable.")
        print("Using fallback temperature.")
        TEMP_SENSOR = None

    # ---- MAX30100 ----
    try:
        bus.write_byte_data(MAX30100_ADDR, REG_MODE_CONFIG, 0x03)
        bus.write_byte_data(MAX30100_ADDR, REG_SPO2_CONFIG, 0x47)
        bus.write_byte_data(MAX30100_ADDR, REG_LED_CONFIG, 0x24)
        MAX30100_OK = True
        print("MAX30100 initialized.")
    except Exception as e:
        print("WARNING: MAX30100 unavailable.")
        print("Using fallback HR/SpO2 values.")
        print(e)
        MAX30100_OK = False

    if MAX30100_OK:
        _hr_thread = threading.Thread(target=_max30100_worker, daemon=True)
        _hr_thread.start()

    # ---- GPS ----
    try:
        GPS_SERIAL = serial.Serial(GPS_PORT, GPS_BAUD, timeout=1)
        print("GPS initialized.")
    except Exception as e:
        print("WARNING: GPS unavailable.")
        print(e)
        GPS_SERIAL = None

    if GPS_SERIAL is not None:
        _gps_thread = threading.Thread(target=_gps_worker, daemon=True)
        _gps_thread.start()

    # ---- Feature window (depends on FEATURES being loaded) ----
    _feature_window = {name: deque(maxlen=WINDOW_SIZE) for name in FEATURES}

    # ---- Alert sender thread ----
    _alert_thread = threading.Thread(target=_alert_sender_worker, daemon=True)
    _alert_thread.start()

    _initialized = True
    print("All subsystems ready.\n")


# ============================================================
# MPU6050
# ============================================================

def read_int16(register):
    high = bus.read_byte_data(MPU_ADDR, register)
    low = bus.read_byte_data(MPU_ADDR, register + 1)

    value = (high << 8) | low

    if value >= 32768:
        value -= 65536

    return value


def read_motion_g():
    ax = read_int16(0x3B)
    ay = read_int16(0x3D)
    az = read_int16(0x3F)

    magnitude = np.sqrt(
        ax * ax +
        ay * ay +
        az * az
    )

    # ±2g scale
    return magnitude / 16384.0


# ============================================================
# DS18B20
# ============================================================

def read_temperature():
    if TEMP_SENSOR is None:
        return 34.6

    try:
        return TEMP_SENSOR.get_temperature()
    except Exception:
        return 34.6


# ============================================================
# MAX30100 - REAL-TIME SPO2 & DYNAMIC HR (BACKGROUND THREAD)
# ============================================================

def _read_fifo_sample():
    data = bus.read_i2c_block_data(
        MAX30100_ADDR,
        REG_FIFO_DATA,
        4
    )

    ir = (data[0] << 8) | data[1]
    red = (data[2] << 8) | data[3]

    return ir, red


def _poll_max30100():
    """Drain whatever samples are currently sitting in the hardware FIFO."""
    try:
        wr_ptr = bus.read_byte_data(MAX30100_ADDR, REG_FIFO_WR_PTR)
        rd_ptr = bus.read_byte_data(MAX30100_ADDR, REG_FIFO_RD_PTR)

        available = (wr_ptr - rd_ptr) % 16

        for _ in range(available):
            ir, red = _read_fifo_sample()

            if ir < FINGER_PRESENT_THRESHOLD:
                continue

            with _max30100_lock:
                ir_buffer.append(ir)
                red_buffer.append(red)

    except Exception:
        pass


def _estimate_hr_bpm():
    """Peak-detect the IR waveform in the buffer to estimate BPM."""
    with _max30100_lock:
        if len(ir_buffer) < 30:
            return None
        values = np.array(ir_buffer, dtype=float)

    # Remove slow baseline drift using moving average
    baseline = np.convolve(
        values,
        np.ones(8) / 8,
        mode="same"
    )

    filtered = values - baseline

    threshold = 0.25 * np.std(filtered)

    peaks = []
    for i in range(1, len(filtered) - 1):
        if (
            filtered[i] > threshold
            and filtered[i] > filtered[i - 1]
            and filtered[i] >= filtered[i + 1]
        ):
            # Reject peaks that are too close together (debounce), which
            # avoids counting noise ripples as separate beats.
            # ASSUMPTION: FIFO is polled roughly once per SAMPLE_INTERVAL
            # loop, so we treat buffer index spacing as a proxy for time
            # and require at least 5 samples between accepted peaks.
            if not peaks or (i - peaks[-1]) > 5:
                peaks.append(i)

    if len(peaks) < 2:
        return None

    # Average sample-index distance between consecutive peaks, converted
    # to seconds using the MAX30100's ~100 samples/sec output rate, then
    # to beats per minute.
    intervals = np.diff(peaks)
    avg_interval_samples = np.mean(intervals)

    if avg_interval_samples <= 0:
        return None

    seconds_per_beat = avg_interval_samples / 100.0
    bpm = 60.0 / seconds_per_beat

    # Clamp to a physiologically plausible range to reject spurious spikes.
    if bpm < 40 or bpm > 200:
        return None

    return bpm


def _estimate_spo2():
    """
    Estimate SpO2 from the AC/DC ratio-of-ratios of the red and IR
    channels — the standard pulse-oximetry approach.

    ASSUMPTION: the calibration curve SpO2 = 110 - 25*R is a commonly
    published approximation, not a lab-calibrated coefficient for this
    exact sensor placement. Treat readings as indicative, not medical
    grade, and recalibrate against a reference oximeter if accuracy
    matters.
    """
    with _max30100_lock:
        if len(ir_buffer) < 30 or len(red_buffer) < 30:
            return None
        ir_vals = np.array(ir_buffer, dtype=float)
        red_vals = np.array(red_buffer, dtype=float)

    ir_dc = np.mean(ir_vals)
    red_dc = np.mean(red_vals)

    ir_ac = np.std(ir_vals)
    red_ac = np.std(red_vals)

    if ir_dc == 0 or red_dc == 0 or ir_ac == 0:
        return None

    ratio = (red_ac / red_dc) / (ir_ac / ir_dc)

    spo2 = 110.0 - 25.0 * ratio

    # Clamp to a physiologically plausible range.
    spo2 = max(70.0, min(100.0, spo2))

    return spo2


def _max30100_worker():
    """Background thread: continuously poll the FIFO and refresh HR/SpO2."""
    global _last_hr, _last_spo2

    while True:
        if MAX30100_OK:
            _poll_max30100()

            hr = _estimate_hr_bpm()
            spo2 = _estimate_spo2()

            if hr is not None:
                _last_hr = hr

            if spo2 is not None:
                _last_spo2 = spo2

        time.sleep(0.05)


def get_vitals():
    """Thread-safe snapshot of the latest HR/SpO2 estimates."""
    with _max30100_lock:
        return _last_hr, _last_spo2


# ============================================================
# GPS (NMEA over serial)
# ============================================================

def _gps_worker():
    """Background thread: parse NMEA sentences and cache the last fix."""
    global _last_lat, _last_lon

    while True:
        if GPS_SERIAL is not None:
            try:
                line = GPS_SERIAL.readline().decode("ascii", errors="replace").strip()

                if line.startswith("$GPGGA") or line.startswith("$GNGGA"):
                    msg = pynmea2.parse(line)

                    if msg.latitude and msg.longitude:
                        with _gps_lock:
                            _last_lat = msg.latitude
                            _last_lon = msg.longitude

            except (pynmea2.ParseError, UnicodeDecodeError):
                pass
            except Exception:
                time.sleep(1)
        else:
            time.sleep(1)


def get_location():
    with _gps_lock:
        return _last_lat, _last_lon


# ============================================================
# STILLNESS DETECTOR (possible soldier-down condition)
# ============================================================

def check_stillness(motion_g):
    """
    Returns True once the wearer has been below STILLNESS_MOTION_G
    continuously for STILLNESS_SEC seconds.
    """
    global _still_since

    now = time.time()

    if abs(motion_g - 1.0) < STILLNESS_MOTION_G:
        if _still_since is None:
            _still_since = now
        elapsed = now - _still_since
        return elapsed >= STILLNESS_SEC
    else:
        _still_since = None
        return False


# ============================================================
# ML STRAIN MODEL
# ============================================================

def update_feature_window(sample):
    """
    sample: dict of {feature_name: value}. Only keys present in FEATURES
    are stored; unrecognized keys are ignored.
    """
    for name in FEATURES:
        if name in sample:
            _feature_window[name].append(sample[name])


def predict_strain():
    """
    Builds one feature row from the current window (mean of each
    buffered feature) and returns (strain_score, is_over_threshold).

    ASSUMPTION: the model expects mean-of-window features in the same
    order as FEATURES. If your training pipeline used a different
    aggregation (e.g. std, min/max, raw last-N), swap the aggregation
    below to match how soldier_monitor_model.pkl was trained.
    """
    if any(len(_feature_window[name]) == 0 for name in FEATURES):
        return None, False

    row = {
        name: float(np.mean(_feature_window[name]))
        for name in FEATURES
    }

    df = pd.DataFrame([row], columns=FEATURES)

    try:
        if hasattr(MODEL, "predict_proba"):
            score = float(MODEL.predict_proba(df)[0][1])
        else:
            score = float(MODEL.predict(df)[0])
    except Exception as e:
        print("WARNING: model prediction failed:", e)
        return None, False

    return score, score >= STRAIN_THRESHOLD


# ============================================================
# ALERT QUEUE / TRANSMISSION
# ============================================================

def _send_json(payload):
    """Try to deliver payload to the base station. Returns True on success."""
    try:
        with socket.create_connection(
            (SERVER_HOST, SERVER_PORT), timeout=SOCKET_TIMEOUT
        ) as sock:
            sock.sendall((json.dumps(payload) + "\n").encode("utf-8"))
        return True
    except Exception:
        return False


def _queue_alert(payload):
    try:
        with open(QUEUE_PATH, "a") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as e:
        print("ERROR: could not write to queue file:", e)


def flush_queue():
    """Attempt to resend anything queued while the link was down."""
    if not os.path.exists(QUEUE_PATH):
        return

    remaining = []

    with open(QUEUE_PATH, "r") as f:
        lines = [l.strip() for l in f if l.strip()]

    for line in lines:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue

        if not _send_json(payload):
            remaining.append(line)

    if remaining:
        with open(QUEUE_PATH, "w") as f:
            f.write("\n".join(remaining) + "\n")
    else:
        os.remove(QUEUE_PATH)


def send_alert(payload):
    """
    Non-blocking: hand the payload off to the background sender thread
    instead of doing the socket I/O here.
    """
    _outbox.put(payload)


def _alert_sender_worker():
    """
    Background thread: owns all network I/O for alerts. Drains fresh
    alerts as they arrive, and periodically retries anything persisted
    to QUEUE_PATH. Runs independently of the sampling loop's cadence.
    """
    last_flush = 0.0

    while True:
        try:
            payload = _outbox.get(timeout=1.0)
            if not _send_json(payload):
                _queue_alert(payload)
        except queue.Empty:
            pass

        now = time.time()
        if now - last_flush >= FLUSH_INTERVAL:
            flush_queue()
            last_flush = now


# ============================================================
# CONVENIENCE: read everything in one call
# ============================================================

def read_all_sensors():
    """
    Read all sensors, run ML inference, and return a complete snapshot.

    Returns a dict with keys:
        heart_rate_bpm, spo2, temperature_c, motion_g,
        latitude, longitude, strain_score, strain_alert,
        is_still, timestamp
    """
    motion_g = read_motion_g()
    temp_c = read_temperature()
    hr_bpm, spo2 = get_vitals()
    lat, lon = get_location()

    update_feature_window({
        "motion_g": motion_g,
        "temperature_c": temp_c,
        "heart_rate_bpm": hr_bpm,
        "spo2": spo2,
    })

    strain_score, strain_alert = predict_strain()
    is_still = check_stillness(motion_g)

    return {
        "heart_rate_bpm": round(hr_bpm, 1),
        "spo2": round(spo2, 1),
        "temperature_c": round(temp_c, 1),
        "motion_g": round(motion_g, 2),
        "latitude": lat,
        "longitude": lon,
        "strain_score": round(strain_score, 3) if strain_score is not None else None,
        "strain_alert": strain_alert,
        "is_still": is_still,
        "timestamp": time.time(),
    }


# ============================================================
# MAIN LOOP (standalone terminal-only mode)
# ============================================================

def main():
    init()

    print("\nStarting monitoring loop. Press Ctrl+C to stop.\n")

    while True:
        reading = read_all_sensors()

        critical = (
            reading["strain_alert"]
            or reading["spo2"] < SPO2_CRITICAL
            or reading["motion_g"] >= IMPACT_ACCEL_G
            or reading["is_still"]
        )

        strain_display = (
            f"{reading['strain_score']:.2f}"
            if reading["strain_score"] is not None
            else "warming up"
        )

        print(
            f"[{time.strftime('%H:%M:%S')}] "
            f"HR: {reading['heart_rate_bpm']:5.1f} bpm | "
            f"SpO2: {reading['spo2']:5.1f}% | "
            f"Temp: {reading['temperature_c']:5.1f}C | "
            f"Motion: {reading['motion_g']:5.2f}g | "
            f"Strain: {strain_display} "
            f"{'*** ALERT ***' if critical else ''}"
        )

        if critical:
            reasons = []
            if reading["strain_alert"]:
                reasons.append("high_strain")
            if reading["spo2"] < SPO2_CRITICAL:
                reasons.append("low_spo2")
            if reading["motion_g"] >= IMPACT_ACCEL_G:
                reasons.append("impact_detected")
            if reading["is_still"]:
                reasons.append("possible_down")

            payload = {
                "timestamp": reading["timestamp"],
                "heart_rate_bpm": reading["heart_rate_bpm"],
                "spo2": reading["spo2"],
                "temperature_c": reading["temperature_c"],
                "motion_g": reading["motion_g"],
                "strain_score": reading["strain_score"],
                "latitude": reading["latitude"],
                "longitude": reading["longitude"],
                "reasons": reasons,
            }

            print("  -> Sending alert:", reasons)
            send_alert(payload)

        time.sleep(SAMPLE_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by user.")
    except Exception as e:
        print("\nFATAL ERROR:", e)
        raise
