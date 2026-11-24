// t01: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
export const DAY_LENGTH_S = 24 * 60;
const MAX_ELEVATION = (68 * Math.PI) / 180;
const DEG = 180 / Math.PI;

export function sunState(t01) {
  const angle = (t01 - 0.25) * 2 * Math.PI;
  const elevation = Math.sin(angle) * MAX_ELEVATION;
  const daylight = Math.min(1, Math.max(0, (elevation * DEG + 6) / 18));
  return { elevation, azimuth: angle, daylight };
}

export function clockText(t01) {
  const mins = Math.floor(t01 * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
