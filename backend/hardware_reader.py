import time
import threading
import serial
import pynmea2
import numpy as np
from collections import deque
from w1thermsensor import W1ThermSensor
from smbus2 import SMBus
from edge_inference import SensorReading
from datetime import datetime

# ============================================================
# EDGEVITAL - RASPBERRY PI HARDWARE READER
# (Integrated from bla.py)
# ============================================================

I2C_BUS = 1
bus = SMBus(I2C_BUS)

class PiHardwareReader:
    def __init__(self):
        self.init_mpu()
        self.init_ds18b20()
        self.init_max30100()
        self.init_gps()
        
        self.baseline_temp = 34.6

    def init_mpu(self):
        self.MPU_ADDR = 0x68
        try:
            bus.write_byte_data(self.MPU_ADDR, 0x6B, 0x00) # Wake MPU6050
            print("[Hardware] MPU6050 initialized.")
        except Exception as e:
            print("[Hardware] ERROR initializing MPU6050:", e)

    def init_ds18b20(self):
        try:
            self.temp_sensor = W1ThermSensor()
            print("[Hardware] DS18B20 initialized.")
        except Exception as e:
            print("[Hardware] WARNING: DS18B20 unavailable.")
            self.temp_sensor = None

    def init_max30100(self):
        self.MAX30100_ADDR = 0x57
        self.MAX30100_OK = False
        self.ir_buffer = deque(maxlen=100)
        self.red_buffer = deque(maxlen=100)
        self._last_hr = 75.0
        self._last_spo2 = 97.0
        self._max_lock = threading.Lock()
        
        try:
            bus.write_byte_data(self.MAX30100_ADDR, 0x06, 0x03) # Mode
            bus.write_byte_data(self.MAX30100_ADDR, 0x07, 0x47) # SpO2 config
            bus.write_byte_data(self.MAX30100_ADDR, 0x09, 0x24) # LED config
            self.MAX30100_OK = True
            print("[Hardware] MAX30100 initialized.")
            
            # Start background polling thread
            threading.Thread(target=self._max30100_worker, daemon=True).start()
        except Exception as e:
            print("[Hardware] WARNING: MAX30100 unavailable.")

    def init_gps(self):
        self._last_lat = None
        self._last_lon = None
        self._gps_lock = threading.Lock()
        try:
            self.gps_serial = serial.Serial("/dev/serial0", 9600, timeout=1)
            print("[Hardware] GPS initialized.")
            threading.Thread(target=self._gps_worker, daemon=True).start()
        except Exception as e:
            print("[Hardware] WARNING: GPS unavailable.")
            self.gps_serial = None

    # --- MPU6050 ---
    def read_int16(self, register):
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
        ax, ay, az = self.read_int16(0x3B), self.read_int16(0x3D), self.read_int16(0x3F)
        if ax == 0 and ay == 0 and az == 0: return 0.05
        magnitude = np.sqrt(ax * ax + ay * ay + az * az)
        return magnitude / 16384.0

    # --- DS18B20 ---
    def read_temperature(self):
        if self.temp_sensor is None:
            return 34.6
        try:
            return self.temp_sensor.get_temperature()
        except Exception:
            return 34.6

    # --- MAX30100 Worker ---
    def _poll_max30100(self):
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

        # SpO2
        ir_dc, red_dc = np.mean(ir_vals), np.mean(red_vals)
        ir_ac, red_ac = np.std(ir_vals), np.std(red_vals)
        spo2 = None
        if ir_dc != 0 and red_dc != 0 and ir_ac != 0:
            ratio = (red_ac / red_dc) / (ir_ac / ir_dc)
            spo2 = max(70.0, min(100.0, 110.0 - 25.0 * ratio))

        # HR
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

    # --- GPS Worker ---
    def _gps_worker(self):
        while True:
            if self.gps_serial:
                try:
                    line = self.gps_serial.readline().decode("ascii", errors="replace").strip()
                    if line.startswith("$GPGGA") or line.startswith("$GNGGA"):
                        msg = pynmea2.parse(line)
                        if msg.latitude and msg.longitude:
                            with self._gps_lock:
                                self._last_lat = msg.latitude
                                self._last_lon = msg.longitude
                except Exception:
                    time.sleep(1)
            else:
                time.sleep(1)

    def read(self) -> SensorReading:
        """Read all sensors and return a unified SensorReading object for the EdgeInferenceEngine."""
        now = datetime.now().isoformat()
        
        motion = self.read_motion_g()
        temp = self.read_temperature()
        
        with self._max_lock:
            hr, spo2 = self._last_hr, self._last_spo2
            
        with self._gps_lock:
            lat, lon = self._last_lat, self._last_lon

        # Return standardized packet for the Dashboard
        return SensorReading(
            timestamp=now,
            heart_rate=round(float(hr), 1),
            spo2=round(float(spo2), 1),
            hrv_rmssd=45.0, # Placeholder if not calculated
            motion_g=round(float(motion), 2),
            impact_spike=(motion > 4.0),
            temperature=round(float(temp), 1),
            temp_gradient=round(float(temp) - self.baseline_temp, 2),
            respiration_rate=16.0,
            respiration_var=0.15,
            gsr=2.0,
            gsr_trend=0.0
        )
