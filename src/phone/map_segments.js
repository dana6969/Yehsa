// Pure geometry for the landscape canvas. No React, no I/O.

// Hard cap on drawn pack segments. Each segment is a native View; thousands of them,
// many hundreds of thousands of pixels wide, froze Android ("Yehsa isn't responding").
export const MAX_SEGMENTS = 300;

// Liang-Barsky clip of one segment to the box [0,w]x[0,h] (with margin). Null when outside.
export function clipSegment(a, b, width, height, margin = 8) {
  if (!a || !b) return null;
  const xmin = -margin;
  const ymin = -margin;
  const xmax = width + margin;
  const ymax = height + margin;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges = [[-dx, a.x - xmin], [dx, xmax - a.x], [-dy, a.y - ymin], [dy, ymax - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return {
    from: { x: a.x + t0 * dx, y: a.y + t0 * dy },
    to: { x: a.x + t1 * dx, y: a.y + t1 * dy }
  };
}

// Only the on-screen part of each pack line, clipped, and never more than MAX_SEGMENTS.
export function visibleSegments(features, project, width, height, cap = MAX_SEGMENTS) {
  const out = [];
  for (let index = 0; index < (features || []).length; index += 1) {
    const feature = features[index];
    if (!Array.isArray(feature?.points)) continue;
    let prev = null;
    for (let step = 0; step < feature.points.length && step < 400; step += 1) {
      const xy = project(feature.points[step]);
      if (!xy || !Number.isFinite(xy.x) || !Number.isFinite(xy.y)) {
        prev = null;
        continue;
      }
      if (prev) {
        const clipped = clipSegment(prev, xy, width, height);
        if (clipped && Math.hypot(clipped.to.x - clipped.from.x, clipped.to.y - clipped.from.y) >= 0.5) {
          out.push({ key: `s${index}-${step}`, ...clipped });
          if (out.length >= cap) return out;
        }
      }
      prev = xy;
    }
  }
  return out;
}

