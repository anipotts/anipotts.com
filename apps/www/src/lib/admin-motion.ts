/** Normalized, reversible choreography shared by the public admin entry surface. */
export const duration = 2000;
export const reducedDuration = 160;
export type Direction = 1 | -1;
export type Curve = (progress: number) => number;
export interface Pose {
  x: number;
  y: number;
  scale: number;
}
/** Center of the native AP artwork and its SVG units-to-CSS-pixels ratio. */
export interface LogoAnchor extends Pose {}
export interface IdentityGeometry {
  header: LogoAnchor;
  footer: LogoAnchor;
  origin: number;
  baseline: number;
  targetLetters: readonly number[];
}
export interface MotionRoute {
  start: number;
  end: number;
  from: Pose;
}
export interface IdentitySample {
  pose: Pose;
  spread: number;
  rotation: number;
  min: number[];
  bracket: number;
  native: number;
  pX: number;
  blur: number;
  context: number;
  plane: number;
  sidebar: number;
  controls: number;
  main: number;
  surface: number;
  word: number;
  header: number;
  footer: number;
  ink: number;
}
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export type CornerRadii = readonly [number, number, number, number];
export interface SurfaceGeometry {
  card: Rect;
  main: Rect;
  cardRadii: CornerRadii;
  mainRadii: CornerRadii;
}
export interface SurfaceSample {
  rect: Rect;
  radii: CornerRadii;
  edge: Rect;
  field: number;
  rail: number;
  wave: number;
  editorial: number;
  nav: number;
  footer: number;
  sidebar: number;
  controls: number;
  heading: number;
  body: number;
  action: number;
  account: number;
}

export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

function bezier(x1: number, y1: number, x2: number, y2: number): Curve {
  return (progress) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    let lo = 0,
      hi = 1,
      t = progress;
    for (let i = 0; i < 18; i++) {
      const inv = 1 - t;
      const value = 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t;
      if (value < progress) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return (
      3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
    );
  };
}

const travel = bezier(0.45, 0, 0.55, 1);
const crisp = bezier(0.2, 0, 0.14, 1);
const turn = bezier(0.42, 0, 0.18, 1);
const reveal = bezier(0.2, 0.65, 0.18, 1);
const open = bezier(0.38, 0, 0.18, 1);
const settle = bezier(0.25, 0.65, 0.22, 1);

export const segment = (
  t: number,
  start: number,
  end: number,
  curve: Curve = crisp,
) => (t <= start ? 0 : t >= end ? 1 : curve((t - start) / (end - start)));

export const sourcePose = (source: LogoAnchor): Pose => ({
  x: source.x - 107.3 * source.scale,
  y: source.y - 51 * source.scale,
  scale: source.scale,
});
export const endPose = (geometry: IdentityGeometry): Pose => ({
  x: geometry.origin,
  y: geometry.baseline - 100 * geometry.header.scale,
  scale: geometry.header.scale,
});

/** Reverse playback samples t from 1 to 0 and lands in the public header. */
export function logoPose(
  t: number,
  geometry: IdentityGeometry,
  direction: Direction,
): Pose {
  const start = sourcePose(
    direction === -1 ? geometry.header : geometry.footer,
  );
  const end = endPose(geometry);
  return {
    x: mix(start.x, end.x, segment(t, 0.285, 0.35, travel)),
    y: mix(start.y, end.y, segment(t, 0, 0.285, travel)),
    scale: start.scale,
  };
}

function reroutedPose(
  t: number,
  geometry: IdentityGeometry,
  direction: Direction,
  route?: MotionRoute | null,
): Pose {
  if (!route) return logoPose(t, geometry, direction);
  const u = clamp((t - route.start) / (route.end - route.start));
  const end = direction === 1 ? endPose(geometry) : sourcePose(geometry.header);
  const x =
    direction === 1 ? segment(u, 0.7, 1, travel) : segment(u, 0, 0.3, travel);
  const y =
    direction === 1 ? segment(u, 0, 0.7, travel) : segment(u, 0.3, 1, travel);
  if (direction === 1 && t >= route.end) return endPose(geometry);
  return {
    x: mix(route.from.x, end.x, x),
    y: mix(route.from.y, end.y, y),
    scale: geometry.header.scale,
  };
}

export function sampleIdentity(
  t: number,
  geometry: IdentityGeometry,
  direction: Direction = 1,
  route?: MotionRoute | null,
): IdentitySample {
  t = clamp(t);
  const pose = reroutedPose(t, geometry, direction, route);
  const spread = segment(t, 0.35, 0.4);
  const rotation = segment(t, 0.4, 0.575, turn);
  const dock = segment(t, 0.4, 0.565);
  const min = [0, 1, 2].map((i) =>
    segment(t, 0.525 + i * 0.03, 0.64 + i * 0.03, reveal),
  );
  const bracket = segment(t, 0.675, 0.8);
  const native = segment(t, 0.805, 0.845);
  const handoff = direction === -1 ? segment(t, 0, 0.018) : 1;
  const angularVelocity =
    Math.abs(
      segment(t + 0.0005, 0.4, 0.575, turn) -
        segment(t - 0.0005, 0.4, 0.575, turn),
    ) / 0.001;
  return {
    pose,
    spread,
    rotation,
    min,
    bracket,
    native,
    pX: mix(106.8 + 18 * spread, geometry.targetLetters[1], dock),
    blur: Math.min(4, angularVelocity * 0.35),
    context: 1 - segment(t, 0.025, 0.235),
    plane: segment(t, 0.015, 0.38, travel),
    sidebar: segment(t, 0.71, 0.86, reveal),
    controls: segment(t, 0.755, 0.91, reveal),
    main: segment(t, 0.745, 0.985, reveal),
    surface: segment(t, 0.27, 0.67, travel),
    word: (1 - native) * handoff,
    header: direction === -1 ? 1 - handoff : 1,
    footer: direction === -1 ? 1 : 0,
    ink: segment(t, 0.1, 0.34),
  };
}

/** Surface edges move independently; typography never inherits a scale. */
export function sampleSurface(
  t: number,
  geometry: SurfaceGeometry,
): SurfaceSample {
  t = clamp(t);
  const from = geometry.card,
    to = geometry.main;
  const edge = {
    top: segment(t, 0.025, 0.43, open),
    left: segment(t, 0.055, 0.47, open),
    right: segment(t, 0.075, 0.48, open),
    bottom: segment(t, 0.085, 0.52, open),
  };
  const rect = {
    left: mix(from.left, to.left, edge.left),
    top: mix(from.top, to.top, edge.top),
    right: mix(from.right, to.right, edge.right),
    bottom: mix(from.bottom, to.bottom, edge.bottom),
  };
  const round = segment(t, 0.12, 0.52, open);
  const radii = geometry.cardRadii.map((radius, i) =>
    mix(radius, geometry.mainRadii[i], round),
  ) as [number, number, number, number];
  return {
    rect,
    radii,
    edge,
    field: segment(t, 0.07, 0.6, travel),
    rail: segment(t, 0.4, 0.6, travel),
    wave: 1 - segment(t, 0.025, 0.27, open),
    editorial: 1 - segment(t, 0.035, 0.22, settle),
    nav: 1 - segment(t, 0.045, 0.245, settle),
    footer: 1 - segment(t, 0.01, 0.185, settle),
    sidebar: segment(t, 0.56, 0.81, settle),
    controls: segment(t, 0.6, 0.84, settle),
    heading: segment(t, 0.57, 0.8, settle),
    body: segment(t, 0.63, 0.875, settle),
    action: segment(t, 0.7, 0.93, settle),
    account: segment(t, 0.75, 0.985, settle),
  };
}

/** Constant SVG topology permits rounded corners to settle exactly to zero. */
export function surfacePath(rect: Rect, radii: CornerRadii): string {
  const { left: l, top: t, right: r, bottom: b } = rect;
  const limit = Math.max(0, Math.min(r - l, b - t) / 2);
  const [tl, tr, br, bl] = radii.map((radius) =>
    Math.min(limit, Math.max(0, radius)),
  );
  const k = 0.5522847498307936;
  return (
    `M ${l + tl} ${t} H ${r - tr} C ${r - tr + k * tr} ${t} ${r} ${t + tr - k * tr} ${r} ${t + tr}` +
    ` V ${b - br} C ${r} ${b - br + k * br} ${r - br + k * br} ${b} ${r - br} ${b}` +
    ` H ${l + bl} C ${l + bl - k * bl} ${b} ${l} ${b - bl + k * bl} ${l} ${b - bl}` +
    ` V ${t + tl} C ${l} ${t + tl - k * tl} ${l + tl - k * tl} ${t} ${l + tl} ${t} Z`
  );
}

export { sampleIdentity as sample, surfacePath as path };
