"""
EdgeVital — Hardware Serial Reader
====================================
Reads real sensor data from the nRF52840 helmet hub via UART.
Used when running on actual Raspberry Pi 4 hardware instead of simulation.

Connection: nRF52840 TX → RPi4 RX (UART, 115200 baud)
Protocol: JSON packets over serial, newline-delimited

Expected packet format from nRF52840:
{
    "hr": 72.3,
    "spo2": 97.1,
    "hrv": 45.2,
    "motion_g": 0.08,
    "impact": false,
    "temp": 36.8,
    "resp_rate": 16.0,
    "resp_var": 0.15,
    "gsr": 2.1,
    "gsr_trend": 0.02
}
"""

import serial
import json
import time
from datetime import datetime
from edge_inference import SensorReading


class HardwareSerialReader:
    """Reads sensor data from nRF52840 via UART serial connection."""

    def __init__(self, port: str = "/dev/ttyS0", baud: int = 115200, timeout: float = 2.0):
        """
        Initialize UART connection to nRF52840 helmet hub.
        
        Args:
            port: Serial port (RPi4 default: /dev/ttyS0 or /dev/ttyAMA0)
            baud: Baud rate (default: 115200)
            timeout: Read timeout in seconds
        """
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.serial_conn = None
        self.baseline_temp = 36.8

    def connect(self):
        """Establish UART connection."""
        try:
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baud,
                timeout=self.timeout,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                bytesize=serial.EIGHTBITS,
            )
            print(f"[UART] Connected to nRF52840 on {self.port} @ {self.baud} baud")
            return True
        except serial.SerialException as e:
            print(f"[UART] Connection failed: {e}")
            return False

    def read(self) -> SensorReading | None:
        """
        Read one sensor packet from the nRF52840 hub.
        Returns SensorReading or None if read fails.
        """
        if not self.serial_conn or not self.serial_conn.is_open:
            return None

        try:
            line = self.serial_conn.readline().decode('utf-8').strip()
            if not line:
                return None

            data = json.loads(line)
            now = datetime.now().isoformat()

            return SensorReading(
                timestamp=now,
                heart_rate=float(data.get("hr", 72)),
                spo2=float(data.get("spo2", 97)),
                hrv_rmssd=float(data.get("hrv", 45)),
                motion_g=float(data.get("motion_g", 0.05)),
                impact_spike=bool(data.get("impact", False)),
                temperature=float(data.get("temp", 36.8)),
                temp_gradient=float(data.get("temp", 36.8)) - self.baseline_temp,
                respiration_rate=float(data.get("resp_rate", 16)),
                respiration_var=float(data.get("resp_var", 0.15)),
                gsr=float(data.get("gsr", 2.0)),
                gsr_trend=float(data.get("gsr_trend", 0.0)),
            )
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
            print(f"[UART] Parse error: {e}")
            return None

    def close(self):
        """Close UART connection."""
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
            print("[UART] Connection closed")


class I2CSensorReader:
    """
    Reads sensors directly via I2C (for integrated body-worn sensors).
    Used for sensors connected directly to RPi4 rather than through nRF52840.
    
    Requires: smbus2 library and RPi hardware.
    """

    # I2C addresses for common sensors
    MAX30102_ADDR = 0x57  # HR/SpO2
    MPU6050_ADDR = 0x68   # IMU
    MLX90614_ADDR = 0x5A  # Temperature

    def __init__(self, bus: int = 1):
        self.bus_num = bus
        self.bus = None

    def connect(self):
        """Initialize I2C bus."""
        try:
            import smbus2
            self.bus = smbus2.SMBus(self.bus_num)
            print(f"[I2C] Bus {self.bus_num} initialized")
            return True
        except Exception as e:
            print(f"[I2C] Init failed: {e}")
            return False

    def read_temperature(self) -> float | None:
        """Read temperature from MLX90614 via I2C."""
        if not self.bus:
            return None
        try:
            raw = self.bus.read_word_data(self.MLX90614_ADDR, 0x07)
            temp_c = raw * 0.02 - 273.15
            return round(temp_c, 1)
        except Exception:
            return None

    def read_imu(self) -> tuple[float, bool] | None:
        """Read acceleration from MPU6050 via I2C. Returns (g_force, impact_detected)."""
        if not self.bus:
            return None
        try:
            # Read accelerometer data (registers 0x3B-0x40)
            data = self.bus.read_i2c_block_data(self.MPU6050_ADDR, 0x3B, 6)
            ax = (data[0] << 8 | data[1])
            ay = (data[2] << 8 | data[3])
            az = (data[4] << 8 | data[5])

            # Convert to signed
            for val in [ax, ay, az]:
                if val > 32767:
                    val -= 65536

            # Calculate total g-force
            g = ((ax**2 + ay**2 + az**2) ** 0.5) / 16384.0
            impact = g > 4.0  # Impact threshold: 4g

            return round(g, 2), impact
        except Exception:
            return None

    def close(self):
        if self.bus:
            self.bus.close()
            print("[I2C] Bus closed")


if __name__ == "__main__":
    # Test with simulated serial data
    print("EdgeVital Hardware Reader — Test Mode")
    print("In production, connect nRF52840 via UART to /dev/ttyS0")

    reader = HardwareSerialReader()
    if reader.connect():
        print("Reading sensor data...")
        for _ in range(10):
            reading = reader.read()
            if reading:
                print(f"  HR:{reading.heart_rate} SpO2:{reading.spo2} Temp:{reading.temperature}")
            time.sleep(1)
        reader.close()
    else:
        print("No hardware connected. Use SensorSimulator for demo.")
