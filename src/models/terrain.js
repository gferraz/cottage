const FloorPlanTerrainGeometry = {
  // Coordinates are local to the cadastral front-start, before display padding.
  profile(grading) {
    if (grading === undefined) return null;
    const points = grading?.profile;
    const fail = () => { throw new Error("terrain.grading.profile precisa de ao menos dois pontos numéricos, todos com x ou todos com y, em ordem estritamente crescente, e z"); };
    if (!grading || Object.keys(grading).some((key) => key !== "profile") ||
      !Array.isArray(points) || points.length < 2) fail();
    const axis = Object.hasOwn(points[0] ?? {}, "x") ? "x" : "y";
    const ids = new Set();
    points.forEach((point, index) => {
      if (!point || typeof point !== "object" ||
        Object.keys(point).some((key) => ![axis, "z", "id"].includes(key)) ||
        !Number.isFinite(point[axis]) || !Number.isFinite(point.z) ||
        (index > 0 && point[axis] <= points[index - 1][axis])) fail();
      if (point.id !== undefined) {
        if (typeof point.id !== "string" || !point.id.trim() || ids.has(point.id)) {
          throw new Error("Os IDs de terrain.grading.profile precisam ser textos não vazios e únicos no perfil");
        }
        ids.add(point.id);
      }
    });
    return { axis, points: points.map((point) => ({ ...point })) };
  },

  interpolate(points, axis, coordinate) {
    if (coordinate <= points[0][axis]) return points[0].z;
    for (let index = 1; index < points.length; index += 1) {
      const before = points[index - 1], after = points[index];
      if (coordinate <= after[axis]) {
        const progress = (coordinate - before[axis]) / (after[axis] - before[axis]);
        return before.z + progress * (after.z - before.z);
      }
    }
    return points.at(-1).z;
  },

  elevationAt(reference, x, y) {
    if (!reference) return null;
    if (reference.grading) {
      const { axis, points } = reference.grading;
      const coordinate = axis === "x" ? x - reference.frontStart.x : y - reference.frontStart.y;
      return this.interpolate(points, axis, coordinate);
    }
    const { frontY, rearY, frontZ, rearZ } = reference;
    if (![frontY, rearY, frontZ, rearZ].every(Number.isFinite) || frontY === rearY) return null;
    const progress = Math.max(0, Math.min(1, (y - frontY) / (rearY - frontY)));
    return frontZ + progress * (rearZ - frontZ);
  },

  // Exact mesh/polyline breaks, including the clamped ends of the legacy ramp.
  breaks(reference, axis) {
    if (!reference) return [];
    if (reference.grading) {
      if (reference.grading.axis !== axis) return [];
      return reference.grading.points.map((point) => point[axis] + reference.frontStart[axis]);
    }
    return axis === "y" ? [reference.frontY, reference.rearY].filter(Number.isFinite) : [];
  },

  surface(reference, bounds, offset = { x: 0, y: 0 }) {
    const coordinates = (axis, low, high) => [low,
      ...this.breaks(reference, axis).map((value) => value - offset[axis])
        .filter((value) => value > low && value < high), high];
    const xs = coordinates("x", bounds.x0, bounds.x1);
    const ys = coordinates("y", bounds.y0, bounds.y1);
    const vertices = [], indices = [];
    ys.forEach((y) => xs.forEach((x) => {
      vertices.push(x, y, this.elevationAt(reference, x + offset.x, y + offset.y) ?? 0);
    }));
    for (let row = 0; row < ys.length - 1; row += 1) {
      for (let column = 0; column < xs.length - 1; column += 1) {
        const a = row * xs.length + column, b = a + 1, c = a + xs.length, d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    }
    return { vertices, indices };
  },

};

window.FloorPlanTerrainGeometry = FloorPlanTerrainGeometry;
