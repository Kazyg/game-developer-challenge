// Active-time backlog is retained when a frame exceeds the work budget.
export class FixedStep {
  private accumulator = 0
  readonly step: number
  readonly maxSteps: number
  constructor(step = 1 / 60, maxSteps = 12) { this.step = step; this.maxSteps = maxSteps }
  advance(delta: number, update: (dt: number) => boolean | void) {
    if (!Number.isFinite(delta) || delta < 0) return
    this.accumulator += delta
    for (let count = 0; this.accumulator + 1e-12 >= this.step && count < this.maxSteps; count++) {
      this.accumulator -= this.step
      if (update(this.step) === false) break
    }
  }
}
