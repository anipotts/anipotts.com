/** Stage list for the writing card and article choreography.
 *
 * Pure data: the transition script turns each stage into one Web Animation
 * (or, for the wave path morph, a frame clock read from the surface
 * animation), and the tests pin these values to the approved spec so the
 * choreography cannot drift from the code.
 *
 * Geometry stages (clip, transform, path, slide) animate from 0, the source
 * geometry, to 1, the destination geometry. On open the source is the card
 * and the destination is the article header; on close it is the reverse.
 * Opacity stages carry the literal opacity values.
 */

export type Direction = "open" | "close" | "fade" | "exit";
export type Theme = "dark" | "light";
export type Target =
  | "surface"
  | "waves"
  | "morph"
  | "paper"
  | "ghost"
  | "title-out"
  | "title-in"
  | "summary-out"
  | "summary-in"
  | "date-out"
  | "date-in"
  | "back"
  | "hero"
  | "body"
  | "main"
  | "exit-waves";
export type Property =
  "clip" | "transform" | "opacity" | "path" | "rise" | "slide";

export interface Stage {
  target: Target;
  property: Property;
  delay: number;
  duration: number;
  easing: string;
  from: number;
  to: number;
}

export interface TimelineOptions {
  direction: Direction;
  phone: boolean;
  theme: Theme;
  reducedMotion?: boolean;
}

export const OPEN_CURVE = [0.16, 1, 0.3, 1] as const;
export const CLOSE_CURVE = [0.65, 0, 0.35, 1] as const;
const bezier = (c: readonly number[]) => `cubic-bezier(${c.join(", ")})`;
export const OPEN_EASE = bezier(OPEN_CURVE);
export const CLOSE_EASE = bezier(CLOSE_CURVE);
export const EASE_OUT = "ease-out";
export const LINEAR = "linear";

/** Phone is `(max-width: 44rem)`: every delay and duration times 0.85. */
export const PHONE_MEDIA = "(max-width: 44rem)";
export const PHONE_TEMPO = 0.85;
export const OPEN_DURATION = 420;
export const CLOSE_DURATION = 380;
export const EXIT_DURATION = 550;
export const TEXT_STAGGER = 50;
export const TEXT_TRAVEL = 0.76;
export const BODY_RISE = 260;
export const RISE_DISTANCE = 14;
/** Outgoing text is gone by 30 percent of its travel; incoming text fades
 * in between 40 and 60 percent, so two copies never share a frame above
 * 0.3 opacity. */
export const TEXT_OUT_END = 0.3;
export const TEXT_IN_START = 0.4;
export const TEXT_IN_END = 0.6;

/** Resting opacity of the article header waves per theme. */
export const WAVES_RESTING: Record<Theme, number> = { dark: 0.75, light: 0.14 };

const CSS_CURVES: Record<string, readonly number[]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** Control points of a CSS easing keyword or cubic-bezier() string. */
export function curveOf(easing: string): [number, number, number, number] {
  const named = CSS_CURVES[easing.trim()];
  if (named) return [...named] as [number, number, number, number];
  const match = easing.match(/^cubic-bezier\(([^)]+)\)$/);
  const values = match?.[1].split(",").map(Number) ?? [];
  if (values.length !== 4 || values.some((v) => !Number.isFinite(v)))
    return [0, 0, 1, 1];
  return values as [number, number, number, number];
}

/** Total time from the first stage start to the last stage end. */
export function timelineEnd(stages: readonly Stage[]) {
  return stages.reduce((end, s) => Math.max(end, s.delay + s.duration), 0);
}

export function surfaceDuration(direction: Direction, phone: boolean) {
  const base =
    direction === "open"
      ? OPEN_DURATION
      : direction === "exit"
        ? EXIT_DURATION
        : CLOSE_DURATION;
  return direction === "exit"
    ? base
    : Math.round(base * (phone ? PHONE_TEMPO : 1));
}

export function writingTimeline(options: TimelineOptions): Stage[] {
  const { direction, phone, theme } = options;
  if (options.reducedMotion) return [];
  const tempo = direction !== "exit" && phone ? PHONE_TEMPO : 1;
  const ms = (value: number) => Math.round(value * tempo);
  const stages: Stage[] = [];
  const add = (
    target: Target,
    property: Property,
    delay: number,
    duration: number,
    easing: string,
    from: number,
    to: number,
  ) =>
    stages.push({
      target,
      property,
      delay: ms(delay),
      duration: ms(duration),
      easing,
      from,
      to,
    });

  if (direction === "exit") {
    const D = EXIT_DURATION;
    add("ghost", "opacity", 0, D * 0.42, CLOSE_EASE, 1, 0);
    add("main", "opacity", D * 0.18, D * 0.65, CLOSE_EASE, 0, 1);
    add("exit-waves", "slide", 0, D, CLOSE_EASE, 0, 1);
    return stages;
  }
  if (direction === "fade") {
    const D = CLOSE_DURATION;
    add("ghost", "opacity", 0, D * 0.5, EASE_OUT, 1, 0);
    add("main", "opacity", D * 0.18, D * 0.65, EASE_OUT, 0, 1);
    return stages;
  }

  const open = direction === "open";
  const D = open ? OPEN_DURATION : CLOSE_DURATION;
  const ease = open ? OPEN_EASE : CLOSE_EASE;
  const resting = WAVES_RESTING[theme];
  const travel = D * TEXT_TRAVEL;

  add("surface", "clip", 0, D, ease, 0, 1);
  add("waves", "transform", 0, D, ease, 0, 1);
  add("waves", "opacity", 0, D, ease, open ? 1 : resting, open ? resting : 1);
  add("morph", "path", 0, D, ease, 0, 1);
  if (open) add("paper", "opacity", 0, D, ease, 1, 0);
  else add("paper", "opacity", D * 0.4, D * 0.6, EASE_OUT, 0, 1);
  add("ghost", "opacity", 0, D * (open ? 0.55 : 0.5), EASE_OUT, 1, 0);

  // Open: the title leads and the summary follows one beat later. Close:
  // both travel together. The title travels farther down than the summary,
  // so any lag between them lets one layer run into the other, and a late
  // title is still oversized when the card date fades in beside it.
  (["title", "summary"] as const).forEach((text, index) => {
    const start = open ? index * TEXT_STAGGER : 0;
    const out = `${text}-out` as const;
    const incoming = `${text}-in` as const;
    add(out, "transform", start, travel, ease, 0, 1);
    add(incoming, "transform", start, travel, ease, 0, 1);
    add(out, "opacity", start, travel * TEXT_OUT_END, LINEAR, 1, 0);
    add(
      incoming,
      "opacity",
      start + travel * TEXT_IN_START,
      travel * (TEXT_IN_END - TEXT_IN_START),
      LINEAR,
      0,
      1,
    );
  });

  // Dates fade in place and never travel across the title or summary.
  add("date-out", "opacity", 0, 80, EASE_OUT, 1, 0);
  if (open) add("date-in", "opacity", 100, 180, EASE_OUT, 0, 1);
  else add("date-in", "opacity", 250, 130, EASE_OUT, 0, 1);

  if (open) {
    add("back", "opacity", D * 0.3, D * 0.5, EASE_OUT, 0, 1);
    // Body copy rises once the surface has landed.
    add("body", "rise", D, BODY_RISE, OPEN_EASE, RISE_DISTANCE, 0);
  } else {
    // The listing heading stays out from under the moving title.
    add("hero", "opacity", D * 0.6, D * 0.4, EASE_OUT, 0, 1);
  }
  return stages;
}

type Rect = { left: number; top: number; right: number; bottom: number };
const px = (v: number) => `${Math.round(v * 100) / 100}px`;
const ratio = (v: number) => String(Math.round(v * 100000) / 100000);

export const FULL_CLIP = "inset(0px 0px 0px 0px round 0px)";
export const IDENTITY = "translate(0px, 0px) scale(1, 1)";

/** clip-path that shows only `rect` inside a viewport of the given size. */
export function insetClip(
  rect: Rect,
  width: number,
  height: number,
  radius: string,
) {
  return `inset(${px(rect.top)} ${px(width - rect.right)} ${px(height - rect.bottom)} ${px(rect.left)} round ${radius})`;
}

/** Transform (origin 0 0) that moves by dx, dy and scales by sx, sy. */
export function placement(dx: number, dy: number, sx: number, sy = sx) {
  return `translate(${px(dx)}, ${px(dy)}) scale(${ratio(sx)}, ${ratio(sy)})`;
}

/** Stages whose target is live page content: they only hold their first
 * keyframe before starting and leave no style behind once finished. */
export const LIVE_TARGETS: readonly Target[] = ["back", "body", "hero", "main"];

/** Web Animation keyframes for a stage. Geometry stages need the source and
 * destination values for their target; path stages have none. */
export function stageKeyframes(
  stage: Stage,
  geometry?: readonly [string, string],
): Keyframe[] | null {
  const { property, from, to } = stage;
  if (property === "opacity") return [{ opacity: from }, { opacity: to }];
  if (property === "rise")
    return [
      { opacity: 0, transform: `translateY(${from}px)` },
      { opacity: 1, transform: `translateY(${to}px)` },
    ];
  if (property === "path" || !geometry) return null;
  const key = property === "clip" ? "clipPath" : "transform";
  return [{ [key]: geometry[from] }, { [key]: geometry[to] }];
}
