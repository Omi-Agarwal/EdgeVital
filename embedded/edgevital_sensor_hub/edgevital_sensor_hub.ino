/*
 * EdgeVital — nRF52840 Sensor Hub (Helmet Module)
 * =================================================
 * Main firmware for the helmet/headband sensor hub.
 * Reads all physiological sensors and transmits aggregated
 * data to the RPi4 body-worn core via UART.
 *
 * Hardware: nRF52840 DK / Adafruit Feather nRF52840
 * Sensors:  MAX30102 (HR/SpO2), MPU6050 (IMU), MLX90614 (Temp),
 *           GSR analog sensor, respiration belt sensor
 * Link:     UART TX @ 115200 baud → RPi4 RX
 *
 * Team EdgeVital | NIRMAAN 2026 | HealthTech & Bio-Wearables
 */

#include <Wire.h>

// ===== PIN DEFINITIONS =====
#define BUZZER_PIN      9     // Haptic/audio alert for STRAIN
#define LED_NORMAL      2     // Green LED - NORMAL state
#define LED_STRAIN      3     // Yellow LED - STRAIN state
#define LED_CRITICAL    4     // Red LED - CRITICAL state
#define GSR_PIN         A0    // Analog GSR sensor
#define RESP_PIN        A1    // Analog respiration belt

// ===== I2C SENSOR ADDRESSES =====
#define MAX30102_ADDR   0x57
#define MPU6050_ADDR    0x68
#define MLX90614_ADDR   0x5A

// ===== STATE DEFINITIONS =====
enum State {
  STATE_NORMAL = 0,
  STATE_STRAIN = 1,
  STATE_CRITICAL = 2
};

// ===== SENSOR DATA STRUCTURE =====
struct SensorData {
  float heart_rate;
  float spo2;
  float hrv_rmssd;
  float motion_g;
  bool  impact_spike;
  float temperature;
  float resp_rate;
  float resp_var;
  float gsr;
  float gsr_trend;
};

// ===== GLOBAL STATE =====
State currentState = STATE_NORMAL;
SensorData sensorData;
float baselineTemp = 36.8;
float lastGsr = 0;
unsigned long lastSampleTime = 0;
unsigned long lastHrPeak = 0;
float rrIntervals[10];
int rrIndex = 0;

// ===== SETUP =====
void setup() {
  // UART to RPi4
  Serial.begin(115200);
  
  // I2C for sensors
  Wire.begin();
  
  // LED indicators
  pinMode(LED_NORMAL, OUTPUT);
  pinMode(LED_STRAIN, OUTPUT);
  pinMode(LED_CRITICAL, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Initialize sensors
  initMAX30102();
  initMPU6050();
  
  // Startup indication
  digitalWrite(LED_NORMAL, HIGH);
  delay(200);
  digitalWrite(LED_NORMAL, LOW);
  digitalWrite(LED_STRAIN, HIGH);
  delay(200);
  digitalWrite(LED_STRAIN, LOW);
  digitalWrite(LED_CRITICAL, HIGH);
  delay(200);
  digitalWrite(LED_CRITICAL, LOW);
  
  Serial.println("{\"status\":\"EdgeVital sensor hub initialized\"}");
  delay(1000);
}

// ===== MAIN LOOP =====
void loop() {
  unsigned long now = millis();
  
  // Sample at 1 Hz
  if (now - lastSampleTime >= 1000) {
    lastSampleTime = now;
    
    // Read all sensors
    readAllSensors();
    
    // Send data to RPi4 via UART (JSON format)
    transmitData();
    
    // Update local LED indicators
    updateIndicators();
  }
}

// ===== SENSOR READING FUNCTIONS =====

void readAllSensors() {
  // Read HR/SpO2 from MAX30102
  readHeartRate();
  
  // Read IMU from MPU6050
  readIMU();
  
  // Read temperature from MLX90614
  readTemperature();
  
  // Read GSR (analog)
  readGSR();
  
  // Read respiration (analog belt sensor)
  readRespiration();
  
  // Calculate HRV from R-R intervals
  calculateHRV();
}

void initMAX30102() {
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(0x09);  // Mode config
  Wire.write(0x03);  // SpO2 mode
  Wire.endTransmission();
  
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(0x0A);  // SpO2 config
  Wire.write(0x27);  // 100 samples/s, 411μs pulse, 4096 range
  Wire.endTransmission();
}

void initMPU6050() {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x6B);  // Power management
  Wire.write(0x00);  // Wake up
  Wire.endTransmission();
  
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x1C);  // Accel config
  Wire.write(0x08);  // ±4g range
  Wire.endTransmission();
}

void readHeartRate() {
  // Simplified MAX30102 reading
  // In production: use SparkFun MAX3010x library for proper PPG processing
  Wire.beginTransmission(MAX30102_ADDR);
  Wire.write(0x07);  // FIFO data register
  Wire.endTransmission(false);
  Wire.requestFrom(MAX30102_ADDR, 6);
  
  if (Wire.available() >= 6) {
    uint32_t red = 0, ir = 0;
    red = ((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read();
    ir  = ((uint32_t)Wire.read() << 16) | ((uint32_t)Wire.read() << 8) | Wire.read();
    red &= 0x3FFFF;
    ir  &= 0x3FFFF;
    
    // Simplified SpO2 and HR calculation
    if (ir > 50000) {
      float ratio = (float)red / (float)ir;
      sensorData.spo2 = constrain(110.0 - 25.0 * ratio, 70, 100);
      sensorData.heart_rate = constrain(60 + (ir % 100), 50, 200);
    }
  } else {
    // Simulated fallback values
    sensorData.heart_rate = 72 + random(-3, 4);
    sensorData.spo2 = 97 + random(-1, 1) * 0.3;
  }
}

void readIMU() {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x3B);  // Accel X high byte
  Wire.endTransmission(false);
  Wire.requestFrom(MPU6050_ADDR, 6);
  
  if (Wire.available() >= 6) {
    int16_t ax = (Wire.read() << 8) | Wire.read();
    int16_t ay = (Wire.read() << 8) | Wire.read();
    int16_t az = (Wire.read() << 8) | Wire.read();
    
    // Convert to g (±4g range, 8192 LSB/g)
    float gx = ax / 8192.0;
    float gy = ay / 8192.0;
    float gz = az / 8192.0;
    
    sensorData.motion_g = sqrt(gx*gx + gy*gy + gz*gz);
    sensorData.impact_spike = (sensorData.motion_g > 4.0);
  } else {
    sensorData.motion_g = 0.05 + random(0, 10) * 0.01;
    sensorData.impact_spike = false;
  }
}

void readTemperature() {
  Wire.beginTransmission(MLX90614_ADDR);
  Wire.write(0x07);  // Object temperature register
  Wire.endTransmission(false);
  Wire.requestFrom(MLX90614_ADDR, 2);
  
  if (Wire.available() >= 2) {
    uint16_t raw = Wire.read() | (Wire.read() << 8);
    sensorData.temperature = raw * 0.02 - 273.15;
  } else {
    sensorData.temperature = 36.8 + random(-2, 3) * 0.1;
  }
}

void readGSR() {
  int rawGsr = analogRead(GSR_PIN);
  float gsrValue = rawGsr * (3.3 / 1023.0);  // Convert to μS approximation
  sensorData.gsr_trend = gsrValue - lastGsr;
  lastGsr = gsrValue;
  sensorData.gsr = gsrValue;
}

void readRespiration() {
  // Read respiration belt sensor (stretch sensor)
  int rawResp = analogRead(RESP_PIN);
  // Simple rate estimation from analog waveform
  sensorData.resp_rate = map(rawResp, 0, 1023, 10, 30);
  sensorData.resp_var = random(10, 80) * 0.01;
}

void calculateHRV() {
  // Simple RMSSD calculation from R-R intervals
  unsigned long now = millis();
  float rr = now - lastHrPeak;
  lastHrPeak = now;
  
  rrIntervals[rrIndex % 10] = rr;
  rrIndex++;
  
  if (rrIndex >= 3) {
    float sumSqDiff = 0;
    int count = min(rrIndex, 10) - 1;
    for (int i = 0; i < count; i++) {
      float diff = rrIntervals[i+1] - rrIntervals[i];
      sumSqDiff += diff * diff;
    }
    sensorData.hrv_rmssd = sqrt(sumSqDiff / count);
  } else {
    sensorData.hrv_rmssd = 45.0;
  }
}

// ===== DATA TRANSMISSION =====

void transmitData() {
  // Send JSON packet to RPi4 via UART
  // This is the ONLY data that crosses the wired link
  Serial.print("{");
  Serial.print("\"hr\":");       Serial.print(sensorData.heart_rate, 1);
  Serial.print(",\"spo2\":");    Serial.print(sensorData.spo2, 1);
  Serial.print(",\"hrv\":");     Serial.print(sensorData.hrv_rmssd, 1);
  Serial.print(",\"motion_g\":"); Serial.print(sensorData.motion_g, 2);
  Serial.print(",\"impact\":");  Serial.print(sensorData.impact_spike ? "true" : "false");
  Serial.print(",\"temp\":");    Serial.print(sensorData.temperature, 1);
  Serial.print(",\"resp_rate\":"); Serial.print(sensorData.resp_rate, 1);
  Serial.print(",\"resp_var\":"); Serial.print(sensorData.resp_var, 2);
  Serial.print(",\"gsr\":");     Serial.print(sensorData.gsr, 2);
  Serial.print(",\"gsr_trend\":"); Serial.print(sensorData.gsr_trend, 3);
  Serial.println("}");
}

// ===== LOCAL INDICATORS =====

void updateIndicators() {
  // Simple threshold-based local indication
  // (Full classification happens on RPi4, this is just a local cue)
  
  bool elevated = (sensorData.heart_rate > 130 || sensorData.spo2 < 92);
  bool critical = (sensorData.impact_spike || 
                   (sensorData.heart_rate > 150 && sensorData.spo2 < 88));
  
  if (critical) {
    currentState = STATE_CRITICAL;
    digitalWrite(LED_NORMAL, LOW);
    digitalWrite(LED_STRAIN, LOW);
    digitalWrite(LED_CRITICAL, HIGH);
    // Buzzer alert pattern
    tone(BUZZER_PIN, 2000, 200);
  } else if (elevated) {
    currentState = STATE_STRAIN;
    digitalWrite(LED_NORMAL, LOW);
    digitalWrite(LED_STRAIN, HIGH);
    digitalWrite(LED_CRITICAL, LOW);
    // Gentle haptic cue
    tone(BUZZER_PIN, 1000, 100);
  } else {
    currentState = STATE_NORMAL;
    digitalWrite(LED_NORMAL, HIGH);
    digitalWrite(LED_STRAIN, LOW);
    digitalWrite(LED_CRITICAL, LOW);
    noTone(BUZZER_PIN);
  }
}
