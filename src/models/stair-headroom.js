// Clearance uses the same inclined underside as walls and the 3D stair solids.
const FloorPlanStairHeadroom = {
  // One conservative minimum for the entire walking surface of each tread.
  above(parts, surfaces) {
    const results = new Map();
    const overhead = parts.map((part) => {
      const flight = /\bstair-flight\b/.test(part.classes ?? "");
      if (!flight && !/\bstair-landing\b/.test(part.classes ?? "")) return null;
      if ((part.rotation ?? 0) !== 0 || !(part.w > 0 && part.l > 0)
        || ![part.x, part.y, part.z0, part.z1].every(Number.isFinite)
        || (flight && (!(part.h > 0) || !["horizontal", "vertical"].includes(part.stairAxis)))) return null;
      let plane;
      try {
        plane = flight ? FloorPlanWalls.stairUndersidePlane(part) : [0, 0, 1, -part.z0];
      } catch {
        return null;
      }
      return { part, polygon: FloorPlanHeadroomAnalysis.rectangle(part).map(([x, y]) =>
        [x, y, -(plane[0] * x + plane[1] * y + plane[3]) / plane[2]]) };
    }).filter(Boolean);
    for (const { part } of overhead) {
      const flight = /\bstair-flight\b/.test(part.classes ?? "");
      const boxes = flight ? FloorPlanGeometry.stairBoxes(part) : [{ ...part, z1: part.z0 }];
      const polygons = [...surfaces.flatMap((surface) => surface.polygons),
        ...overhead.filter((entry) => entry.part !== part).map((entry) => entry.polygon)];
      const steps = boxes.map((box, index) => {
        const rectangle = FloorPlanHeadroomAnalysis.rectangle(box);
        // Flared tiers overlap as solids; only the exposed top is walkable.
        const footprints = part.type === "solid-flared" && boxes[index + 1]
          ? FloorPlanGeometryOperations.subtract(rectangle, FloorPlanHeadroomAnalysis.rectangle(boxes[index + 1]))
          : [rectangle];
        let minimum = Infinity;
        for (const polygon of polygons) for (const footprint of footprints) {
          let clipped = polygon;
          for (let i = 0; i < footprint.length && clipped.length; i++) {
            const a = footprint[i], b = footprint[(i + 1) % footprint.length];
            const nx = b[1] - a[1], ny = a[0] - b[0];
            clipped = FloorPlanGeometryOperations.clipPolygon(clipped, [nx, ny, 0, -nx * a[0] - ny * a[1]]);
          }
          if (FloorPlanHeadroomAnalysis.area(clipped) <= 1e-10) continue;
          const heights = clipped.map((point) => point[2] - box.z1);
          // Ignore floors wholly below this tread, but include surfaces crossing it.
          if (Math.max(...heights) < -1e-8) continue;
          minimum = Math.min(minimum, Math.max(0, Math.min(...heights)));
        }
        return { ...box, minimum };
      });
      const ownerId = part.ownerId;
      if (!results.has(ownerId)) results.set(ownerId, { active: false, parts: new Map() });
      const result = results.get(ownerId);
      result.parts.set(part.id, { steps });
      result.active ||= steps.some((step) => step.minimum < 2.7 - 1e-8);
    }
    return results;
  },

  aboveColor(minimum) {
    if (!Number.isFinite(minimum)) return "#e6e3da";
    if (minimum < 1.3 - 1e-8) return "#e6b484";
    if (minimum < 2.1 - 1e-8) return "#f3cea3";
    if (minimum < 2.3 - 1e-8) return "#d6d9a2";
    if (minimum < 2.85 - 1e-8) return "#bfd4b4";
    if (minimum < 3.1 - 1e-8) return "#f7f5ef";
    return "#b9d2eb";
  },

  analyze(parts, floors, roofs = []) {
    const groups = new Map();
    for (const part of parts) {
      const classes = (part.classes ?? "").split(/\s+/);
      const flight = classes.includes("stair-flight");
      if (!flight && !classes.includes("stair-landing")) continue;
      if ((part.rotation ?? 0) !== 0 || !(part.w > 0 && part.l > 0)
        || ![part.x, part.y, part.z0, part.z1].every(Number.isFinite)) continue;
      if (flight && (!(part.h > 0) || !["horizontal", "vertical"].includes(part.stairAxis))) continue;
      if (!flight && Math.abs(part.z1 - part.z0) > 1e-7) continue;
      let plane;
      try {
        plane = flight ? FloorPlanWalls.stairUndersidePlane(part) : [0, 0, 1, -part.z0];
      } catch {
        // Invalid risers are reported by the existing stair validation path.
        continue;
      }
      if (!plane.every(Number.isFinite)) continue;
      const polygon = FloorPlanHeadroomAnalysis.rectangle(part).map(([x, y]) =>
        [x, y, -(plane[0] * x + plane[1] * y + plane[3]) / plane[2]]);
      if (!groups.has(part.ownerId)) groups.set(part.ownerId, []);
      groups.get(part.ownerId).push({ part, polygon });
    }
    const results = [];
    for (const [ownerId, entries] of groups) for (const floor of floors) {
      const z0 = Number(floor.z0 ?? 0);
      const overhead = entries.filter(({ polygon }) => polygon.some((point) => point[2] > z0 + 1e-8));
      if (!overhead.length) continue;
      const analysis = FloorPlanHeadroomAnalysis.analyzeRoom({ z0,
        parts: overhead.map(({ part }) => part) },
      [...overhead.map(({ polygon }) => ({ polygons: [polygon] })), ...roofs], []);
      if (analysis.covered.area <= 1e-10) continue;
      results.push({ ownerId, floorId: floor.id ?? null, floorZ: z0,
        parts: overhead.map(({ part }) => part), ...analysis });
    }
    return results;
  },

  sourceLayers(plan) {
    const targets = (value) => plan.normalizeOverlapTargets(value);
    const rooms = [...plan.allRooms, ...(plan.allStairs ?? [])].filter((room) => !plan.invalidRoomIds.has(room.id)).map((room) => {
      const definition = plan.roomDefinitions.get(room.id);
      return { id: room.id, floorId: room.floorId,
        parts: plan.getRoomGeometry(room.id).normalizedParts.map((part) => ({ ...part,
          overlapTargets: targets(part.overlaps ?? definition.overlaps),
          overlayTargets: targets(part.overlays ?? definition.overlays) })) };
    });
    return FloorPlanOverlapAnalysis.analyze({ rooms,
      items: plan.allItems.map((item) => ({ id: item.id, overlayTargets: targets(item.overlays) })) }).layers;
  },
};
window.FloorPlanStairHeadroom = FloorPlanStairHeadroom;
