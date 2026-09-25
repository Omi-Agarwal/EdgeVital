import time
import threading
import numpy as np
from collections import deque
from datetime import datetime
from edge_inference import SensorReading

# Optional hardware imports (available on Raspberry Pi Linux)
try:
    import serial
except ImportError:
    serial = None

try:
    import pynmea2
except ImportError:
    pynmea2 = None

try:
    from smbus2 import SMBus
    I2C_BUS = 1
    try:
        bus = SMBus(I2C_BUS)
    except Exception:
        bus = None
except ImportError:
    SMBus = None
    bus = None

try:
    from w1thermsensor import W1ThermSensor
except ImportError:
    W1ThermSensor = None

# ============================================================
# EDGEVITAL - HARDWARE SENSOR READER (PI & CROSS-PLATFORM)
# ============================================================

class PiHardwareReader:
    def __init__(self):
        self.init_mpu()
        self.init_ds18b20()
        self.init_max30100()
        self.init_gps()
        
        self.baseline_temp = 36.6
        self._sim_step = 0

    def init_mpu(self):
        self.MPU_ADDR = 0x68
        self.mpu_ok = False
        if bus is not None:
            try:
                bus.write_byte_data(self.MPU_ADDR, 0x6B, 0x00) # Wake MPU6050
                self.mpu_ok = True
                print("[Hardware] MPU6050 (IMU) initialized on I2C.")
            except Exception as e:
                print("[Hardware] MPU6050 not detected on I2C bus. Using fallback telemetry.")
        else:
            print("[Hardware] I2C bus not available (Windows/Sim mode). Active fallback telemetry enabled.")

    def init_ds18b20(self):
        self.temp_sensor = None
        if W1ThermSensor is not None:
            try:
                self.temp_sensor = W1ThermSensor()
                print("[Hardware] DS18B20 (Temperature) initialized.")
            except Exception:
                print("[Hardware] DS18B20 sensor not detected.")

    def init_max30100(self):
        self.MAX30100_ADDR = 0x57
        self.MAX30100_OK = False
        self.ir_buffer = deque(maxlen=100)
        self.red_buffer = deque(maxlen=100)
        self._last_hr = 72.0
        self._last_spo2 = 98.0
        self._max_lock = threading.Lock()
        
        if bus is not None:
            try:
                bus.write_byte_data(self.MAX30100_ADDR, 0x06, 0x03) # Mode: SpO2
                bus.write_byte_data(self.MAX30100_ADDR, 0x07, 0x47) # SpO2 config
                bus.write_byte_data(self.MAX30100_ADDR, 0x09, 0x24) # LED config
                self.MAX30100_OK = True
                print("[Hardware] MAX30100 (Pulse Oximeter) initialized on I2C.")
                threading.Thread(target=self._max30100_worker, daemon=True).start()
            except Exception:
                print("[Hardware] MAX30100 not detected on I2C.")

    def init_gps(self):
        self._last_lat = 22.5726
        self._last_lon = 88.3639
        self._gps_lock = threading.Lock()
        self.gps_serial = None
        
        if serial is not None:
            for port in ["/dev/serial0", "/dev/ttyAMA0", "COM3", "COM4"]:
                try:
                    self.gps_serial = serial.Serial(port, 9600, timeout=1)
                    print(f"[Hardware] GPS Serial connected on {port}.")
                    threading.Thread(target=self._gps_worker, daemon=True).start()
                    break
                except Exception:
                    pass

    # --- MPU6050 READ ---
    def read_int16(self, register):
        if bus is None: return 0
        try:
            high = bus.read_byte_data(self.MPU_ADDR, register)
            low = bus.read_byte_data(self.MPU_ADDR, register + 1)
            value = (high << 8) | low
            if value >= 32768:
                value -= 65536
            return value
        except Exception:
            return 0

    def read_motion_g(self):
        if self.mpu_ok and bus is not None:
            ax, ay, az = self.read_int16(0x3B), self.read_int16(0x3D), self.read_int16(0x3F)
            magnitude = np.sqrt(ax * ax + ay * ay + az * az) / 16384.0
            return float(round(magnitude, 2))
        
        # Fallback realistic motion variation
        self._sim_step += 0.1
        return float(round(0.08 + 0.04 * np.sin(self._sim_step), 2))

    # --- DS18B20 READ ---
    def read_temperature(self):
        if self.temp_sensor is not None:
            try:
                return float(round(self.temp_sensor.get_temperature(), 1))
            except Exception:
                pass
        return 36.6

    # --- MAX30100 PROCESSING ---
    def _poll_max30100(self):
        if bus is None: return
        try:
            wr_ptr = bus.read_byte_data(self.MAX30100_ADDR, 0x02)
            rd_ptr = bus.read_byte_data(self.MAX30100_ADDR, 0x04)
            available = (wr_ptr - rd_ptr) % 16
            for _ in range(available):
                data = bus.read_i2c_block_data(self.MAX30100_ADDR, 0x05, 4)
                ir = (data[0] << 8) | data[1]
                red = (data[2] << 8) | data[3]
                if ir < 300: continue
                with self._max_lock:
                    self.ir_buffer.append(ir)
                    self.red_buffer.append(red)
        except Exception:
            pass

    def _estimate_vitals(self):
        with self._max_lock:
            if len(self.ir_buffer) < 30 or len(self.red_buffer) < 30:
                return None, None
            ir_vals = np.array(self.ir_buffer, dtype=float)
            red_vals = np.array(self.red_buffer, dtype=float)

        # SpO2 Estimation
        ir_dc, red_dc = np.mean(ir_vals), np.mean(red_vals)
        ir_ac, red_ac = np.std(ir_vals), np.std(red_vals)
        spo2 = None
        if ir_dc != 0 and red_dc != 0 and ir_ac != 0:
            ratio = (red_ac / red_dc) / (ir_ac / ir_dc)
            spo2 = max(70.0, min(100.0, 110.0 - 25.0 * ratio))

        # Heart Rate BPM Estimation
        baseline = np.convolve(ir_vals, np.ones(8) / 8, mode="same")
        filtered = ir_vals - baseline
        threshold = 0.25 * np.std(filtered)
        peaks = []
        for i in range(1, len(filtered) - 1):
            if filtered[i] > threshold and filtered[i] > filtered[i - 1] and filtered[i] >= filtered[i + 1]:
                if not peaks or (i - peaks[-1]) > 5:
                    peaks.append(i)
        
        hr = None
        if len(peaks) >= 2:
            avg_interval = np.mean(np.diff(peaks))
            if avg_interval > 0:
                bpm = 60.0 / (avg_interval / 100.0)
                if 40 <= bpm <= 200: hr = bpm

        return hr, spo2

    def _max30100_worker(self):
        while True:
            if self.MAX30100_OK:
                self._poll_max30100()
                hr, spo2 = self._estimate_vitals()
                if hr is not None: self._last_hr = hr
                if spo2 is not None: self._last_spo2 = spo2
            time.sleep(0.05)

    # --- GPS WORKER ---
    def _gps_worker(self):
        while True:
            if self.gps_serial:
                try:
                    line = self.gps_serial.readline().decode("ascii", errors="replace").strip()
                    if (line.startswith("$GPGGA") or line.startswith("$GNGGA")) and pynmea2 is not None:
                        msg = pynmea2.parse(line)
                        if msg.latitude and msg.longitude:
                            with self._gps_lock:
                                self._last_lat = float(msg.latitude)
                                self._last_lon = float(msg.longitude)
                except Exception:
                    time.sleep(1)
            else:
                time.sleep(1)

    def read(self) -> SensorReading:
        """Unified 1Hz reading method consumed by the EdgeInferenceEngine."""
        now = datetime.now().isoformat()
        
        motion = self.read_motion_g()
        temp = self.read_temperature()
        
        with self._max_lock:
            hr, spo2 = self._last_hr, self._last_spo2
            
        with self._gps_lock:
            lat, lon = self._last_lat, self._last_lon

        return SensorReading(
            timestamp=now,
            heart_rate=float(round(hr, 1)),
            spo2=float(round(spo2, 1)),
            hrv_rmssd=45.0,
            motion_g=float(round(motion, 2)),
            impact_spike=(motion > 3.5),
            temperature=float(round(temp, 1)),
            temp_gradient=float(round(temp - self.baseline_temp, 2)),
            respiration_rate=16.0,
            respiration_var=0.15,
            gsr=2.0,
            gsr_trend=0.0
        )
