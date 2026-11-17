const FloorPlanHeadroom = {
  thresholds: [1.3, 2.1, 3],

  enabled(plan, roomId) {
    return plan.roomDefinitions.get(roomId)?.comfort_zones
      ?? plan.roomFloorConfigs.get(roomId)?.comfort_zones
      ?? plan.currentConfig?.comfort_zones ?? true;
  },
  colors: ["rgba(240, 140, 35, 0.14)", "rgba(245, 215, 75, 0.14)", "rgba(255, 255, 255, 0.35)"],

  area(polygon) {
    return FloorPlanGeometryOperations.area(polygon);
  },

  rectangle({ x, y, w, l }) {
    return FloorPlanGeometryOperations.rectangle({ x, y, w, l });
  },

  // Subtract a convex footprint, preserving disjoint convex pieces.
  subtract(polygon, cutter) {
    return FloorPlanGeometryOperations.subtract(polygon, cutter);
  },

  union(polygons) {
    return FloorPlanGeometryOperations.union(polygons);
  },

  calculate(parts, surfaces, floorZ, deductions = [], thresholds = this.thresholds) {
    return FloorPlanHeadroomAnalysis.calculate(parts, surfaces, floorZ, deductions, thresholds);
  },

  prepare(plan) {
    const rooms = [...plan.roomDefinitions.entries()]
      .filter(([id]) => !plan.invalidRoomIds?.has(id))
      .map(([id, definition]) => {
        const reference = plan.getRoomGeometry(id);
        return {
          id,
          floorId: plan.roomFloorConfigs.get(id)?.id,
          z0: reference.z0(),
          overlapTargets: plan.normalizeOverlapTargets(definition.overlaps),
          parts: reference.normalizedParts.map((part) => ({
            ...part,
            overlapTargets: plan.normalizeOverlapTargets(part.overlaps ?? definition.overlaps),
          })),
        };
      });
    const items = plan.allItems.map((item) => ({
      x: item.x, y: item.y, w: item.w, l: item.l, floorId: item.floorId,
      overlapTargets: plan.normalizeOverlapTargets(item.overlaps),
    }));
    const surfaces = FloorPlanRoofGeometry.intersectingSurfaces(plan);
    plan.headroomResults = new Map(rooms.map((room) => {
      const deductions = FloorPlanRoomArea.deductionsFor(room, rooms, items, { sameFloor: true });
      return [room.id, FloorPlanHeadroomAnalysis.analyzeRoom(room, surfaces, deductions, this.thresholds)];
    }));
    return plan.headroomResults;
  },

  render(plan) {
    return FloorPlanHeadroomView.render(plan, {
      results: plan.headroomResults,
      enabled: (id) => this.enabled(plan, id),
      colors: this.colors,
    });
  },
};
window.FloorPlanHeadroom = FloorPlanHeadroom;
