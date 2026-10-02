export function shortestAngleDifference(current: number, target: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current))
}

export function turnTowards(current: number, target: number, maxStep: number): number {
  const difference = shortestAngleDifference(current, target)
  const rotation = current + Math.max(-maxStep, Math.min(maxStep, difference))
  return Math.atan2(Math.sin(rotation), Math.cos(rotation))
}
