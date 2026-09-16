/**
 * Constant 20px/s movement. The strip travels exactly one cycle per iteration
 * of the CSS keyframe, so the wrap boundary is seamless without a clock in JS.
 */
export function marqueeDuration(cycle: number) {
  return cycle > 0 ? cycle / 20 : 0;
}
export function motionPaused(
  user: boolean,
  visible: boolean,
  hidden: boolean,
  reduced: boolean,
) {
  return user || !visible || hidden || reduced;
}
