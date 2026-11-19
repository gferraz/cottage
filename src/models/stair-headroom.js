// Clearance uses the same inclined underside as walls and the 3D stair solids.
const FloorPlanStairHeadroom = {
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
