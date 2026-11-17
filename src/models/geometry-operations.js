// DOM-free operations on convex polygons, convex solids and axis-aligned rectangles.
// Preserve operation-specific tolerances; area and volume thresholds differ.
const FloorPlanGeometryOperations = {
  clipPolygon(points, plane) {
    if (!points.length) return [];
    const distances = points.map((point) => plane.slice(0, 3).reduce((sum, value, i) => sum + value * point[i], plane[3]));
    if (distances.every((value) => value <= 1e-8)) return points;
    if (distances.every((value) => value >= -1e-8)) return [];
    const result = [];
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      const a = distances[i], b = distances[(i + 1) % points.length];
      if (a <= 1e-8) result.push(point);
      if ((a < -1e-8 && b > 1e-8) || (a > 1e-8 && b < -1e-8)) {
        result.push(point.map((value, axis) => value + (next[axis] - value) * a / (a - b)));
      }
    });
    return result.length >= 3 ? result : [];
  },

  clipSolid(faces, plane) {
    const distance = (point) => plane.slice(0, 3).reduce((sum, n, i) => sum + n * point[i], plane[3]);
    const distances = faces.flat().map(distance);
    if (distances.every((value) => value <= 1e-9)) return faces;
    if (distances.every((value) => value >= -1e-9)) return [];
    const cuts = [];
    const result = faces.map((face) => {
      const polygon = [];
      face.forEach((point, i) => {
        const next = face[(i + 1) % face.length];
        const a = distance(point);
        const b = distance(next);
        if (a <= 1e-9) polygon.push(point);
        if ((a < -1e-9 && b > 1e-9) || (a > 1e-9 && b < -1e-9)) {
          const cut = point.map((value, axis) => value + (next[axis] - value) * a / (a - b));
          polygon.push(cut);
          cuts.push(cut);
        } else if (Math.abs(a) <= 1e-9) cuts.push(point);
      });
      return polygon;
    }).filter((face) => face.length >= 3);
    const unique = cuts.filter((point, i) => cuts.findIndex((other) =>
      point.every((value, axis) => Math.abs(value - other[axis]) < 1e-8)) === i);
    if (unique.length >= 3) {
      const center = unique[0].map((_, axis) => unique.reduce((sum, point) => sum + point[axis], 0) / unique.length);
      const normal = plane.slice(0, 3);
      const magnitude = Math.hypot(...normal);
      const n = normal.map((value) => value / magnitude);
      const seed = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const u = cross(n, seed);
      const v = cross(n, u);
      const angle = (point) => {
        const delta = point.map((value, axis) => value - center[axis]);
        return Math.atan2(delta.reduce((sum, value, axis) => sum + value * v[axis], 0), delta.reduce((sum, value, axis) => sum + value * u[axis], 0));
      };
      unique.sort((a, b) => angle(a) - angle(b));
      result.push(unique);
    }
    const volume = result.reduce((sum, face) => {
      const a = face[0];
      for (let i = 1; i < face.length - 1; i += 1) {
        const b = face[i], c = face[i + 1];
        sum += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      }
      return sum;
    }, 0);
    return Math.abs(volume) > 1e-10 ? result : [];
  },

  boxFaces(x0, y0, z0, x1, y1, z1) {
    const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y1, z0], d = [x0, y1, z0];
    const e = [x0, y0, z1], f = [x1, y0, z1], g = [x1, y1, z1], h = [x0, y1, z1];
    return [[a, d, c, b], [e, f, g, h], [a, b, f, e], [b, c, g, f], [c, d, h, g], [d, a, e, h]];
  },

  area(polygon) {
    return Math.abs(polygon.reduce((sum, [x, y], i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + x * next[1] - next[0] * y;
    }, 0)) / 2;
  },

  rectangle({ x, y, w, l }) {
    return [[x, y, 0], [x + w, y, 0], [x + w, y + l, 0], [x, y + l, 0]];
  },

  subtract(polygon, cutter) {
    if (!cutter.length || this.area(cutter) < 1e-10) return [polygon];
    const signed = cutter.reduce((sum, p, i) => {
      const q = cutter[(i + 1) % cutter.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0);
    let inside = polygon;
    const outside = [];
    for (let i = 0; i < cutter.length && inside.length; i += 1) {
      const p = cutter[i], q = cutter[(i + 1) % cutter.length];
      const sign = signed > 0 ? 1 : -1;
      const a = sign * (q[1] - p[1]), b = sign * (p[0] - q[0]);
      const plane = [a, b, 0, -a * p[0] - b * p[1]];
      const next = this.clipPolygon(inside, plane);
      const remainder = this.clipPolygon(inside, plane.map(v => -v));
      if (remainder.length && this.area(remainder) > 1e-10 && remainder !== next) outside.push(remainder);
      inside = next;
    }
    return outside;
  },

  union(polygons) {
    const result = [];
    for (const polygon of polygons) {
      let pieces = [polygon];
      for (const previous of result) pieces = pieces.flatMap(piece => this.subtract(piece, previous));
      result.push(...pieces.filter(piece => this.area(piece) > 1e-10));
    }
    return result;
  },

  partitionRectangles(rectangles) {
    const xs = [...new Set(rectangles.flatMap(({ x, w }) => [x, x + w]))].sort((a, b) => a - b);
    const ys = [...new Set(rectangles.flatMap(({ y, l }) => [y, y + l]))].sort((a, b) => a - b);
    const parts = [];
    for (let x = 0; x < xs.length - 1; x += 1) {
      for (let y = 0; y < ys.length - 1; y += 1) {
        if (rectangles.some((r) => r.x <= xs[x] && r.x + r.w >= xs[x + 1]
          && r.y <= ys[y] && r.y + r.l >= ys[y + 1])) {
          parts.push({ x: xs[x], y: ys[y], w: xs[x + 1] - xs[x], l: ys[y + 1] - ys[y] });
        }
      }
    }
    return parts;
  },
};

window.FloorPlanGeometryOperations = FloorPlanGeometryOperations;
