"""
EdgeVital Backend — REST API Server
====================================
Flask API that serves real-time sensor data and alert state to the
medic-facing frontend dashboard. Bridges the edge inference engine
with the Command Center web UI.

In production, this runs on the Raspberry Pi 4 body-worn core module.
For the hackathon demo, it serves the frontend dashboard.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from edge_inference import (
    EdgeInferenceEngine, SensorSimulator, PersonalBaseline,
    DataLogger, GPSModule, AlertPacket, State
)
from dataclasses import asdict
from datetime import datetime
import threading
import time
import json

app = Flask(__name__)
CORS(app)

# Global state
baseline = PersonalBaseline()
engine = EdgeInferenceEngine(baseline)
simulator = SensorSimulator(baseline)
logger = DataLogger()
gps = GPSModule()

# Current state shared between threads
current_state = {
    "state": "NORMAL",
    "confidence": 0.95,
    "classification": "within-baseline",
    "reading": None,
    "alert": None,
    "history": [],
    "scenario": "normal",
    "comms_available": True,
    "queued_alert": None,
}
state_lock = threading.Lock()


def sensor_loop():
    """Background thread: continuously reads sensors and classifies."""
    while True:
        reading = simulator.read()
        state, confidence, classification = engine.classify(reading)
        logger.log_reading(reading, state, confidence, classification)

        with state_lock:
            current_state["state"] = state.name
            current_state["confidence"] = round(confidence, 3)
            current_state["classification"] = classification
            current_state["reading"] = asdict(reading)

            event = {
                "timestamp": reading.timestamp,
                "state": state.name,
                "confidence": round(confidence, 3),
                "classification": classification,
                "hr": round(reading.heart_rate, 1),
                "spo2": round(reading.spo2, 1),
                "hrv": round(reading.hrv_rmssd, 1),
                "motion": round(reading.motion_g, 2),
            }
            current_state["history"].append(event)
            if len(current_state["history"]) > 100:
                current_state["history"].pop(0)

            # Handle CRITICAL escalation
            if state == State.CRITICAL:
                lat, lon = gps.query_position()
                alert = AlertPacket(
                    timestamp=reading.timestamp,
                    severity="CRITICAL",
                    heart_rate=round(reading.heart_rate, 1),
                    spo2=round(reading.spo2, 1),
                    hrv_rmssd=round(reading.hrv_rmssd, 1),
                    confidence=round(confidence, 3),
                    latitude=lat,
                    longitude=lon,
                    classification=classification,
                )
                logger.log_alert(alert)

                if current_state["comms_available"]:
                    current_state["alert"] = asdict(alert)
                else:
                    current_state["queued_alert"] = asdict(alert)

        time.sleep(1)  # 1Hz sensor sampling rate


# === API ENDPOINTS ===

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


@app.route("/api/scenario", methods=["POST"])
def set_scenario():
    """Set simulation scenario for demo purposes."""
    data = request.get_json()
    scenario = data.get("scenario", "normal")
    valid = ["normal", "exertion", "impact", "hypoxia", "heat_strain"]
    if scenario not in valid:
        return jsonify({"error": f"Invalid scenario. Use: {valid}"}), 400

    simulator.set_scenario(scenario)
    with state_lock:
        current_state["scenario"] = scenario
        current_state["alert"] = None
        current_state["queued_alert"] = None

    return jsonify({"scenario": scenario, "message": f"Scenario set to {scenario}"})


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


@app.route("/api/baseline", methods=["GET"])
def get_baseline():
    """Get the current personal baseline."""
    return jsonify(asdict(engine.baseline))


@app.route("/api/baseline", methods=["POST"])
def set_baseline():
    """Update personal baseline values."""
    data = request.get_json()
    for key, val in data.items():
        if hasattr(engine.baseline, key):
            setattr(engine.baseline, key, float(val))
    return jsonify({"baseline": asdict(engine.baseline), "message": "Baseline updated"})


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
    # Start sensor reading loop in background thread
    sensor_thread = threading.Thread(target=sensor_loop, daemon=True)
    sensor_thread.start()
    print("EdgeVital API Server running on http://localhost:5000")
    print("Endpoints: /api/status, /api/history, /api/alert, /api/scenario, /api/comms")
    app.run(host="0.0.0.0", port=5000, debug=False)
