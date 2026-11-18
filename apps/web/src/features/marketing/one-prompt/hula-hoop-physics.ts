/** The hoop's motion, separate from the renderer. */
export type HoopState = {
  /** Orbit angle around the waist, in radians. */
  phase: number;
  /** Swing speed, in radians per second. The sign is the direction. */
  speed: number;
  /** Tilt of the hoop from flat, in radians. */
  tilt: number;
  /** The speed a hoop settles back to when nobody touches it. 0 under reduced motion. */
  idle: number;
};

/** The fastest swing a throw can reach, in radians per second. */
export const MAX_SPEED = 16;
/** Seconds for a thrown hoop to lose ~63% of its extra speed. */
const SETTLE = 1.8;
/** Tilt of a slow hoop and of a hoop at full speed. */
const TILT_SLOW = 0.42;
const TILT_FAST = 0.08;

/**
 * Advances the hoop by `dt` seconds. While dragged it takes the pointer's speed;
 * otherwise it eases back to its idle swing in the direction it turns now. An
 * `impulse` (keys, scroll) adds speed at once. Faster hoops ride flatter.
 */
export function hoopStep(state: HoopState, dt: number, input: { drag: number | null; impulse: number }): void {
  const clamp = (value: number) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, value));
  if (input.drag !== null) state.speed = clamp(input.drag);
  else {
    const direction = state.speed < 0 ? -1 : 1;
    state.speed += (direction * state.idle - state.speed) * (1 - Math.exp(-dt / SETTLE));
  }
  state.speed = clamp(state.speed + input.impulse);

  state.phase += state.speed * dt;

  const fast = Math.min(1, Math.abs(state.speed) / 10);
  const target = TILT_SLOW + (TILT_FAST - TILT_SLOW) * fast;
  state.tilt += (target - state.tilt) * (1 - Math.exp(-dt / 0.35));
}
