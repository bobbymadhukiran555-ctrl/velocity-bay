// Gear 0 = reverse, 1 = neutral, 2..7 = forward gears.
export const GEARS = [-3.2, 0, 3.6, 2.3, 1.7, 1.3, 1.05, 0.85];
export const FINAL_DRIVE = 3.7;
export const REDLINE = 7200;
export const IDLE = 900;
const EFFICIENCY = 0.85;
const TO_RPM = 60 / (2 * Math.PI);

export const gearLabel = g => (g === 0 ? 'R' : g === 1 ? 'N' : String(g - 1));

export function rpmFromSpeed(speedMs, gearIdx, wheelRadius) {
  const wheelRpm = (Math.abs(speedMs) / wheelRadius) * TO_RPM;
  return Math.max(IDLE, wheelRpm * Math.abs(GEARS[gearIdx]) * FINAL_DRIVE);
}

// Simple bell-shaped torque curve peaking at 420 Nm @ 4800 rpm; rev limiter cuts it past the redline.
export function torqueAt(rpm) {
  if (rpm > REDLINE) return 0;
  const k = (rpm - 4800) / 3600;
  return Math.max(180, 260 + 160 * (1 - k * k));
}

export function driveForce(rpm, gearIdx, throttle, wheelRadius) {
  if (gearIdx === 1) return 0;
  return (torqueAt(rpm) * GEARS[gearIdx] * FINAL_DRIVE * EFFICIENCY * throttle) / wheelRadius;
}

export function autoShift(gearIdx, rpm, throttle, speedMs) {
  if (gearIdx < 2) return gearIdx;
  const top = GEARS.length - 1;
  if (rpm > 6600 && gearIdx < top) return gearIdx + 1;
  if (gearIdx > 2 && (rpm < 2600 || (throttle > 0.9 && rpm < 3200 && speedMs > 3))) return gearIdx - 1;
  return gearIdx;
}
