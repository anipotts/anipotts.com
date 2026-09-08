/** Stable, bounded variation: identical content always gets identical artwork. */
export function staticCurrents(seed: string) {
  let state = 2166136261;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const colors = [0, 1, 2];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  const phase = random() * Math.PI * 2;
  const frequency = 0.7 + random() * 0.65;
  const amplitude = 48 + random() * 35;
  const slope = (random() - 0.5) * 100;
  const base = 170 + random() * 22;
  const points = Array.from({ length: 7 }, (_, i) => ({
    x: -100 + i * 130,
    y:
      base +
      Math.sin(phase + i * frequency) * amplitude +
      (i / 6 - 0.5) * slope,
  }));
  const round = (value: number) => Math.round(value * 10) / 10;
  return colors.map((color, layer) => {
    const shifted = points.map((p, i) => ({
      x: p.x,
      y: p.y + layer * (30 + 12 * Math.sin(i * 0.7 + phase + layer)),
    }));
    let d = `M${shifted[0].x} ${round(shifted[0].y)}`;
    for (let i = 0; i < shifted.length - 1; i++) {
      const p0 = shifted[Math.max(0, i - 1)];
      const p1 = shifted[i];
      const p2 = shifted[i + 1];
      const p3 = shifted[Math.min(shifted.length - 1, i + 2)];
      d += `C${round(p1.x + (p2.x - p0.x) / 6)} ${round(p1.y + (p2.y - p0.y) / 6)} ${round(p2.x - (p3.x - p1.x) / 6)} ${round(p2.y - (p3.y - p1.y) / 6)} ${p2.x} ${round(p2.y)}`;
    }
    return { color, d: `${d}V360H-100Z` };
  });
}
