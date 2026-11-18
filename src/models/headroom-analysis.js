// Pure height-band analysis. All regions use the supplied physical roof underside.
const FloorPlanHeadroomAnalysis = {
  thresholds: [1.3, 2.1, 2.85, 3.1],

  slabSurfaces(slabs = []) {
    return slabs.map((slab) => ({
      polygons: slab.parts.map((part) => this.rectangle(part)
        .map(([x, y]) => [x, y, slab.z - slab.thickness])),
    }));
  },

  area(polygon) {
    return FloorPlanGeometryOperations.area(polygon);
  },

  rectangle({ x, y, w, l }) {
    return FloorPlanGeometryOperations.rectangle({ x, y, w, l });
  },

  subtract(polygon, cutter) {
    return FloorPlanGeometryOperations.subtract(polygon, cutter);
  },

  union(polygons) {
    return FloorPlanGeometryOperations.union(polygons);
  },

  calculate(parts, surfaces, floorZ, deductions = [], thresholds = this.thresholds) {
    // Use the same intersected underside polygons as the 3D roof. Thickness
    // grows above this reference surface, as in solidSurface(). Retained lower
    // roofs (clip_intersections: false / rake extensions) also limit clearance.
    const overhead = surfaces.flatMap(entry => entry.polygons)
      .map(polygon => FloorPlanGeometryOperations.clipPolygon(polygon, [0, 0, -1, floorZ + 1e-8]))
      .filter(polygon => this.area(polygon) > 1e-10);
    const footprints = this.union(parts.map(part => this.rectangle(part)));
    return thresholds.map(height => {
      const high = overhead.map(polygon => FloorPlanGeometryOperations.clipPolygon(polygon, [0, 0, -1, floorZ + height]));
      const low = overhead.map(polygon => FloorPlanGeometryOperations.clipPolygon(polygon, [0, 0, 1, -floorZ - height]))
        .filter(polygon => polygon.some(point => point[2] < floorZ + height - 1e-8));
      const candidates = high.flatMap(polygon => footprints.flatMap(footprint => {
        let pieces = [polygon];
        for (let i = 0; i < footprint.length; i += 1) {
          const p = footprint[i], q = footprint[(i + 1) % footprint.length];
          const a = q[1] - p[1], b = p[0] - q[0];
          pieces = pieces.map(piece => FloorPlanGeometryOperations.clipPolygon(piece, [a, b, 0, -a*p[0]-b*p[1]]));
        }
        return pieces.filter(piece => this.area(piece) > 1e-10);
      }));
      let polygons = this.union(candidates);
      for (const cutter of [...low, ...deductions.map(part => this.rectangle(part))])
        polygons = polygons.flatMap(polygon => this.subtract(polygon, cutter));
      return { height, polygons, area: polygons.reduce((sum, polygon) => sum + this.area(polygon), 0) };
    });
  },

  analyzeRoom(room, surfaces, deductions, thresholds = this.thresholds) {
    const areas = this.calculate(room.parts, surfaces, room.z0, deductions, thresholds);
    const covered = this.calculate(room.parts, surfaces, room.z0, deductions, [0])[0];
    const cumulative = [covered, ...areas];
    const bands = cumulative.map(({ height, polygons }, index) => {
      let region = polygons;
      for (const cutter of cumulative[index + 1]?.polygons ?? [])
        region = region.flatMap((polygon) => this.subtract(polygon, cutter));
      const largest = region.reduce((best, polygon) =>
        this.area(polygon) > this.area(best) ? polygon : best, []);
      return {
        height,
        polygons: region,
        area: region.reduce((sum, polygon) => sum + this.area(polygon), 0),
        labelPosition: largest.length ? [0, 1].map((axis) =>
          largest.reduce((sum, point) => sum + point[axis], 0) / largest.length) : null,
      };
    });
    return { areas, covered, bands };
  },
};

window.FloorPlanHeadroomAnalysis = FloorPlanHeadroomAnalysis;
