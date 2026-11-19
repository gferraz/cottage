// Declarative XY deductions, independent of element visibility and rendering.
const FloorPlanRoomArea = {
  prepareNetAreas(plan) {
    const rooms = [...plan.roomDefinitions.entries()]
      .filter(([id]) => !plan.invalidRoomIds?.has(id))
      .map(([id, definition]) => ({
        id,
        unused: definition.unused === true,
        overlapTargets: plan.normalizeOverlapTargets(definition.overlaps),
        parts: plan.getRoomGeometry(id).normalizedParts.map((part) => ({
          ...part,
          overlapTargets: plan.normalizeOverlapTargets(part.overlaps ?? definition.overlaps),
        })),
      }));
    const items = plan.allItems.map((item) => ({
      x: item.x, y: item.y, w: item.w, l: item.l,
      overlapTargets: plan.normalizeOverlapTargets(item.overlaps),
    }));
    plan.netRoomAreas = new Map(rooms.map((room) => [room.id,
      FloorPlanRoomArea.netArea(room, FloorPlanRoomArea.deductionsFor(room, rooms, items)),
    ]));
    return plan.netRoomAreas;
  },
  deductionsFor(room, rooms, items, { sameFloor = false } = {}) {
    const targets = new Set([room.id]);
    room.parts.forEach((part) => {
      if (part.id) targets.add(`${room.id}.${part.id}`);
    });
    const eligible = (other) => !sameFloor || other.floorId === room.floorId;
    const matches = (values) => (values ?? []).some((id) => targets.has(id));
    return [
      ...rooms.filter((other) => other !== room && eligible(other)).flatMap((other) =>
        other.parts.filter((part) => matches(part.overlapTargets ?? other.overlapTargets))),
      ...items.filter((item) => eligible(item) && matches(item.overlapTargets)),
    ];
  },

  netArea(room, deductions) {
    if (room.unused === true) return 0;
    const intersections = room.parts.flatMap((part) => deductions.flatMap((other) => {
      const x = Math.max(part.x, other.x), y = Math.max(part.y, other.y);
      const x1 = Math.min(part.x + part.w, other.x + other.w);
      const y1 = Math.min(part.y + part.l, other.y + other.l);
      return x1 > x && y1 > y ? [{ x, y, w: x1 - x, l: y1 - y }] : [];
    }));
    // Preserve the existing summed gross area, even for overlapping parts.
    const gross = room.parts.reduce((sum, part) => sum + part.w * part.l, 0);
    const deducted = FloorPlanGeometryOperations.partitionRectangles(intersections)
      .reduce((sum, part) => sum + part.w * part.l, 0);
    return gross - deducted;
  },
};

window.FloorPlanRoomArea = FloorPlanRoomArea;
