"""
EdgeVital Backend — REST API Server
====================================
Flask API that serves real-time sensor data and alert state to the
medic-facing frontend dashboard.  Reads hardware directly through the
bla.py sensor/ML module.

In production, this runs on the Raspberry Pi 4 body-worn core module.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import threading
import time

import bla

app = Flask(__name__)
CORS(app)

# Current state shared between the sensor thread and API handlers
current_state = {
    "state": "NORMAL",
    "confidence": 0.95,
    "classification": "within-baseline",
    "reading": None,
    "alert": None,
    "history": [],
    "comms_available": True,
    "queued_alert": None,
}
state_lock = threading.Lock()


def _classify(reading):
    """
    Map bla.py's alert flags to a (state, confidence, classification) tuple
    that matches what the frontend dashboard expects.

    States:
        NORMAL   — all vitals within acceptable range
        WARNING  — strain score is non-zero but below threshold, or
                   sensors returning edge-case values
        CRITICAL — any hard alert condition triggered
    """
    critical_reasons = []

    if reading["strain_alert"]:
        critical_reasons.append("high_strain")
    if reading["spo2"] < bla.SPO2_CRITICAL:
        critical_reasons.append("low_spo2")
    if reading["motion_g"] >= bla.IMPACT_ACCEL_G:
        critical_reasons.append("impact_detected")
    if reading["is_still"]:
        critical_reasons.append("possible_down")

    if critical_reasons:
        classification = ", ".join(critical_reasons)
        # Confidence scales with how many independent signals agree.
        confidence = min(0.99, 0.80 + 0.05 * len(critical_reasons))
        return "CRITICAL", confidence, classification

    # Elevated strain but below threshold → WARNING
    strain = reading["strain_score"]
    if strain is not None and strain > bla.STRAIN_THRESHOLD * 0.6:
        confidence = 0.70 + strain
        return "WARNING", round(min(confidence, 0.95), 3), "elevated-strain"

    return "NORMAL", 0.95, "within-baseline"


def sensor_loop():
    """Background thread: continuously reads sensors and classifies."""
    while True:
        reading = bla.read_all_sensors()
        state, confidence, classification = _classify(reading)

        with state_lock:
            current_state["state"] = state
            current_state["confidence"] = round(confidence, 3)
            current_state["classification"] = classification
            current_state["reading"] = reading

            event = {
                "timestamp": reading["timestamp"],
                "state": state,
                "confidence": round(confidence, 3),
                "classification": classification,
                "hr": reading["heart_rate_bpm"],
                "spo2": reading["spo2"],
                "motion": reading["motion_g"],
                "temp": reading["temperature_c"],
                "strain": reading["strain_score"],
            }
            current_state["history"].append(event)
            if len(current_state["history"]) > 100:
                current_state["history"].pop(0)

            # Handle CRITICAL escalation
            if state == "CRITICAL":
                alert_payload = {
                    "timestamp": reading["timestamp"],
                    "severity": "CRITICAL",
                    "heart_rate_bpm": reading["heart_rate_bpm"],
                    "spo2": reading["spo2"],
                    "temperature_c": reading["temperature_c"],
                    "motion_g": reading["motion_g"],
                    "strain_score": reading["strain_score"],
                    "latitude": reading["latitude"],
                    "longitude": reading["longitude"],
                    "confidence": round(confidence, 3),
                    "classification": classification,
                }

                if current_state["comms_available"]:
                    current_state["alert"] = alert_payload
                else:
                    current_state["queued_alert"] = alert_payload

                # Also forward to the base station via TCP (bla.py's
                # background socket sender).
                bla.send_alert(alert_payload)

        time.sleep(1)  # 1 Hz sensor sampling rate


# === API ENDPOINTS ===

@app.route("/", methods=["GET"])
def index():
    """Root health check confirmation."""
    return jsonify({
        "status": "online",
        "system": "EdgeVital Telemetry Server",
        "endpoints": ["/api/status", "/api/history", "/api/alert", "/api/login"]
    })

@app.route("/api/login", methods=["POST"])
def admin_login():
    """Authenticate Admin or Medic operators."""
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    valid_users = {
        "admin": "edgevital2026",
        "medic": "medic123",
        "omi": "nirmaan2026",
        "harshita": "nirmaan2026",
        "vaibhav": "nirmaan2026",
        "abhishek": "nirmaan2026",
    }

    if username.lower() in valid_users and valid_users[username.lower()] == password:
        return jsonify({
            "status": "success",
            "username": username.upper(),
            "role": "TACTICAL_MEDIC" if username.lower() == "medic" else "COMMAND_ADMIN",
            "token": f"edgevital-token-{username.lower()}-{int(time.time())}",
            "message": "Access Granted",
        }), 200

    return jsonify({"error": "Invalid Security Credentials. Access Denied."}), 401


@app.route("/api/status", methods=["GET"])
def get_status():
    """Get current system status and latest sensor reading."""
    with state_lock:
        return jsonify({
            "state": current_state["state"],
            "confidence": current_state["confidence"],
            "classification": current_state["classification"],
            "reading": current_state["reading"],
            "alert": current_state["alert"],
            "comms_available": current_state["comms_available"],
            "queued_alert": current_state["queued_alert"],
            "timestamp": datetime.now().isoformat(),
        })


@app.route("/api/history", methods=["GET"])
def get_history():
    """Get recent classification history."""
    with state_lock:
        return jsonify({"history": current_state["history"]})


@app.route("/api/alert", methods=["GET"])
def get_alert():
    """Get current active alert (if any)."""
    with state_lock:
        return jsonify({"alert": current_state["alert"]})


@app.route("/api/comms", methods=["POST"])
def toggle_comms():
    """Toggle communications availability (simulate jammed state)."""
    data = request.get_json()
    available = data.get("available", True)

    with state_lock:
        current_state["comms_available"] = available
        # If comms restored and there's a queued alert, deliver it
        if available and current_state["queued_alert"]:
            current_state["alert"] = current_state["queued_alert"]
            current_state["queued_alert"] = None

    return jsonify({
        "comms_available": available,
        "message": "AVAILABLE" if available else "JAMMED",
        "queued_delivered": not available,
    })


@app.route("/api/system", methods=["GET"])
def system_info():
    """Get system information."""
    return jsonify({
        "project": "EdgeVital",
        "version": "1.0.0-nirmaan",
        "team": "Team EdgeVital",
        "hackathon": "NIRMAAN 2026",
        "track": "HealthTech & Bio-Wearables",
        "hardware": {
            "helmet_hub": "nRF52840",
            "core_module": "Raspberry Pi 4 (prototype)",
            "production_target": "STM32U5 / nRF5340",
            "link": "UART/I2C (wired)",
        },
        "sensors": [
            "MAX30102 (HR/SpO2)",
            "MPU6050 (IMU/Motion/Impact)",
            "MLX90614 (Temperature)",
            "GSR Sensor",
            "Respiration Sensor",
            "GPS (on-demand)",
        ],
        "team_members": [
            {"name": "Harshita Shakya", "role": "Team Leader", "id": "1MS24EE021"},
            {"name": "Vaibhav Chindalia", "role": "Member"},
            {"name": "Omi Agarwal", "role": "Member"},
            {"name": "Abhishek Iyer", "role": "Member"},
        ],
    })


if __name__ == "__main__":
    # Initialize all hardware and ML via bla.py
    bla.init()

    # Start sensor reading loop in background thread
    sensor_thread = threading.Thread(target=sensor_loop, daemon=True)
    sensor_thread.start()

    print("EdgeVital API Server running on http://localhost:5000")
    print("Endpoints: /api/status, /api/history, /api/alert, /api/comms")
    app.run(host="0.0.0.0", port=5000, debug=False)
