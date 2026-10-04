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
  button: Rect;
  viewport: Rect;
  main: Rect;
  cardRadii: CornerRadii;
  buttonRadii: CornerRadii;
  mainRadii: CornerRadii;
}
export interface SurfaceSample {
  rect: Rect;
  radii: CornerRadii;
  panel: Rect;
  panelRadii: CornerRadii;
  expansion: number;
  panelExpansion: number;
  edge: Rect;
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
const open = bezier(0.42, 0, 0.2, 1);
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

/** Two nested opaque surfaces. Every edge shares its surface's single clock. */
export function sampleSurface(
  t: number,
  geometry: SurfaceGeometry,
  direction: Direction = 1,
): SurfaceSample {
  t = clamp(t);
  // Use the same acceleration and settling in both directions, rather than
  // reversing the asymmetric curve (which would give the return a hard stop).
  const phase = (start: number, end: number) =>
    direction === 1
      ? segment(t, start, end, open)
      : 1 - segment(1 - t, 1 - end, 1 - start, open);
  const expansion = phase(0.025, 0.475);
  const panelExpansion = phase(0.07, 0.475);
  const edge = {
    top: expansion,
    left: expansion,
    right: expansion,
    bottom: expansion,
  };
  const rectangle = (from: Rect, to: Rect, progress: number): Rect => ({
    left: mix(from.left, to.left, progress),
    top: mix(from.top, to.top, progress),
    right: mix(from.right, to.right, progress),
    bottom: mix(from.bottom, to.bottom, progress),
  });
  const rect = rectangle(geometry.card, geometry.viewport, expansion);
  const panel = rectangle(geometry.button, geometry.main, panelExpansion);
  const radii = geometry.cardRadii.map((radius) =>
    mix(radius, 0, expansion),
  ) as [number, number, number, number];
  const panelRadii = geometry.buttonRadii.map((radius, i) =>
    mix(radius, geometry.mainRadii[i], panelExpansion),
  ) as [number, number, number, number];
  return {
    rect,
    radii,
    panel,
    panelRadii,
    expansion,
    panelExpansion,
    edge,
    wave: 1,
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
export function surfaceInsetEdge(rect: Rect, radii: CornerRadii): string {
  const { left: l, top: t, right: r, bottom: b } = rect;
  const limit = Math.max(0, Math.min(r - l, b - t) / 2);
  const [tl, tr, , bl] = radii.map((radius) =>
    Math.min(limit, Math.max(0, radius)),
  );
  const k = 0.5522847498307936;
  // The inset panel meets the viewport on its right and bottom. Its visible
  // outline follows only the left edge, rounded top-left corner and top edge.
  return `M ${l} ${b - bl} V ${t + tl} C ${l} ${t + tl - k * tl} ${l + tl - k * tl} ${t} ${l + tl} ${t} H ${r - tr}`;
}

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
