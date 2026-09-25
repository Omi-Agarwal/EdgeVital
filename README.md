# EdgeVital — Edge-AI Physiological Monitoring Layer for Soldiers

> **Continuous sensing without continuous transmitting.**

[![Track](https://img.shields.io/badge/Track-HealthTech%20%26%20Bio--Wearables-blue)]()
[![Event](https://img.shields.io/badge/Event-NIRMAAN%202026-green)]()
[![Team](https://img.shields.io/badge/Team-EdgeVital-red)]()
[![Wokwi](https://img.shields.io/badge/Wokwi-Live%20Simulation-purple)](https://wokwi.com/projects/472486308627080193)

---

## 🎯 Problem Statement

**Mission-critical physiological state monitoring for soldiers.**

In the field, the problem is not a lack of data — it is a lack of timely, trusted detection. A casualty can be unable to signal long before a medic knows there is a problem:

- **Always-on telemetry** burdens bandwidth
- **Continuous RF** increases tactical footprint
- **Connectivity** is least dependable exactly where remote detection matters most
- **An injured or unconscious soldier** may never be able to raise an alert

Existing systems rely on continuous transmission or cloud-dependent decisions, which fail exactly when the network is degraded.

### Target Audience

Soldiers and field personnel in contested, low-connectivity environments, plus medics who need justified, actionable alerts rather than raw biometric feeds. The same architecture extends to:
- Remote/rural healthcare workers
- Disaster-response field teams
- High-risk industrial workers

---

## 💡 Proposed Solution

**EdgeVital** is an edge-AI physiological monitoring layer that makes a medical decision at the edge and communicates only the exception — staying silent in NORMAL, nudging locally in STRAIN, and escalating once with a compact alert burst in CRITICAL.

### Core Promise: Continuous sensing without continuous transmitting.

### Three States

| State | Action | Network Impact |
|-------|--------|----------------|
| 🟢 **NORMAL** | On-device classification only | **Nothing sent** |
| 🟡 **STRAIN** | Local haptic/audio alert to soldier | **Local alert only** |
| 🔴 **CRITICAL** | Single compact burst: timestamp, severity, HR, SpO₂, HRV, confidence, GPS | **Single burst · <2s** |

### Innovation Factor

Instead of reacting to a single threshold, EdgeVital separates exertion from danger by reading **combinations, sequence, and trend** (HR, motion, SpO₂, HRV, impact/pressure spikes). It achieved **94% simulated exertion-vs-impact separation** — the discriminator is the pattern, not a single number, and it never claims to diagnose an injury.

---

## 🏗️ System Architecture

### Two-Module Design

```
┌─────────────────────────────┐    UART/I2C     ┌──────────────────────────────┐
│   HELMET / HEADBAND MODULE  │   Wired Link    │    BODY-WORN CORE MODULE     │
│                             │ ──────────────► │                              │
│  • nRF52840 sensor hub      │   (No Radio)    │  • Raspberry Pi 4 (prototype)│
│  • MAX30102 (HR/SpO₂)       │                 │  • Edge inference engine     │
│  • MPU6050 (IMU/Impact)     │                 │  • Explainable rule core     │
│  • MLX90614 (Temperature)   │                 │  • Local SQLite logging      │
│  • GSR sensor               │                 │  • GPS (on-demand only)      │
│  • Respiration sensor       │                 │  • Wi-Fi (alert burst only)  │
│  • Buzzer/Haptic module     │                 │                              │
│  • OLED display             │                 │  Production: STM32U5/nRF5340 │
│                             │                 │                              │
│  Target: <150g weight       │                 │  Target: multi-day battery   │
└─────────────────────────────┘                 └──────────────────────────────┘
```

### Decision Flow

1. **Sensors sample continuously** on the helmet module
2. **nRF52840 aggregates** sensor data and sends via UART
3. **RPi4 runs the classification engine** (explainable rule/statistical core)
4. **State output**: NORMAL → silent · STRAIN → local cue · CRITICAL → burst alert

---

## 🛠️ Tech Stack

### Hardware
| Component | Purpose |
|-----------|---------|
| nRF52840 | Sensor hub (helmet module) |
| Raspberry Pi 4 | Core compute (body-worn prototype) |
| STM32U5 / nRF5340 | Production target MCU |
| MAX30102 | Heart rate & SpO₂ |
| MPU6050 | IMU (motion, impact detection) |
| MLX90614 | Non-contact temperature |
| GSR Sensor | Galvanic skin response (stress) |
| Respiration Sensor | Breathing rate & variability |
| OLED Display | Local status display |
| Buzzer/Haptic | Local alert for STRAIN/CRITICAL |
| GPS Module | On-demand position (CRITICAL only) |

### Software
| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite (medic-facing dashboard) |
| **Backend** | Python 3 + Flask (edge inference API) |
| **Inference** | Explainable rule/statistical decision core |
| **Database** | Local SQLite (on-device, no cloud) |
| **Embedded** | Arduino/C++ (nRF52840 firmware) |
| **Simulation** | Wokwi circuit simulator |
| **Planned** | Quantized 1D-CNN for learned classification |

### Sensor Inputs Driving Classification
- HR / SpO₂ (MAX30102)
- HRV (R-R interval analysis)
- Motion energy (MPU6050 IMU)
- Impact / pressure spikes
- Temperature gradient (MLX90614)
- Respiration variability
- Sweat / GSR trend

---

## 📂 Project Structure

```
Edge Vital/
├── index.html                     # App entry point
├── package.json                   # Node.js config
├── vite.config.js                 # Vite build config
├── public/
│   ├── favicon.svg                # EdgeVital favicon
│   └── icons.svg                  # Icon sprites
├── src/
│   ├── main.jsx                   # React entry
│   ├── App.jsx                    # Router + theme
│   ├── index.css                  # Full stylesheet
│   ├── components/
│   │   ├── Navbar.jsx             # Navigation bar
│   │   ├── Hero.jsx               # Hero section with stats
│   │   ├── Problem.jsx            # Problem statement
│   │   ├── Solution.jsx           # 3-state solution + sensors
│   │   ├── Architecture.jsx       # Two-module hardware design
│   │   ├── Features.jsx           # Features + tech stack
│   │   ├── Roadmap.jsx            # Future roadmap timeline
│   │   ├── CommandCenter.jsx      # Interactive command center
│   │   └── Footer.jsx             # Footer with team info
│   └── pages/
│       ├── LandingPage.jsx        # Full landing page
│       └── CommandCenterPage.jsx  # Command center view
├── backend/
│   ├── edge_inference.py          # Core classification engine
│   ├── api_server.py              # Flask REST API
│   ├── hardware_reader.py         # UART/I2C sensor reader
│   └── requirements.txt          # Python dependencies
└── embedded/
    └── edgevital_sensor_hub/
        ├── edgevital_sensor_hub.ino  # nRF52840 firmware
        └── diagram.json              # Wokwi circuit diagram
```

---

## 🚀 Getting Started

### Frontend (Medic Dashboard)

```bash
cd "Edge Vital"
npm install
npm run dev
```

Open `http://localhost:5173` to view the landing page and command center.

### Backend (Edge Inference API)

```bash
cd backend
pip install -r requirements.txt

# Run the standalone inference demo
python edge_inference.py

# Run the API server
python api_server.py
```

API available at `http://localhost:5000/api/status`

### Embedded (Wokwi Simulation)

Visit the live simulation: [https://wokwi.com/projects/472486308627080193](https://wokwi.com/projects/472486308627080193)

Or upload `embedded/edgevital_sensor_hub/` to Wokwi or Arduino IDE.

---

## 🎮 Live Demo Strategy

Walk through all four states live on the Wokwi prototype:

1. **NORMAL** — System stays silent, on-device classification only
2. **STRAIN** — Local haptic/audio cue without transmitting
3. **CRITICAL** — Compact alert packet on impact + physiological deterioration
4. **NETWORK DOWN** — Local decision holds, alert queues instead of blocking detection

### Command Center Demo

The web-based Command Center simulates the HQ/medic receiving end:
- System initialization with hardware checklist
- Real-time monitoring (no transmission in NORMAL/STRAIN)
- Incoming burst processing with full telemetry display
- Dispatch authorization with incident review
- En-route tracking

---

## 🗺️ Roadmap

| Phase | Goal |
|-------|------|
| **NOW** | Wire sensors to nRF52840 + RPi4, implement state machine, demo on Wokwi |
| **Short Term** | Validate quantized 1D-CNN with proxy data (exertion, impact, hypoxia, heat-strain) |
| **Mid Term** | Move inference to STM32U5/nRF5340, duty-cycled sensing, sub-100mW idle |
| **Long Term** | Medic-workflow trials with defense-health units, second sensor node, broader deployment |

---

## 👥 Team EdgeVital

| Name | Role | Student ID |
|------|------|-----------|
| **Harshita Shakya** | Team Leader | 1MS24EE021 |
| **Vaibhav Chindalia** | Member | — |
| **Omi Agarwal** | Member | — |
| **Abhishek Iyer** | Member | — |

**Event:** NIRMAAN 2026 — Coding Club BMSIT × Alterino Club BMSIT  
**Track:** HealthTech & Bio-Wearables  
**Contact:** shakyaharshita71@gmail.com

---

## ⚠️ Disclaimer

This dashboard is a scripted simulation of the command-center receiving end. The physiological state classification itself runs on the physical/simulated device. **EdgeVital does not diagnose injuries** — it detects deviations from personalised baselines and escalates proportionally.

---

*Build. Innovate. Impact.*
