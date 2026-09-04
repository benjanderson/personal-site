export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  nextFloat(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0
    return this.state / 0x100000000
  }

  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError('SeededRandom.nextInt requires an inclusive integer range')
    }

    return min + Math.floor(this.nextFloat() * (max - min + 1))
  }
}
