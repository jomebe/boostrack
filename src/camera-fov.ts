// Speed is km/h. Exponential growth stays bounded before perspective distortion becomes extreme.
export function racingFov(speed: number, turbo = false): number {
  const progress = Math.min(1, Math.max(0, speed) / 200);
  return 72 + 46 * Math.expm1(2 * progress) / Math.expm1(2) + (turbo ? 5 : 0);
}
