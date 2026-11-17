// Declarative XY deductions, independent of element visibility and rendering.
const FloorPlanRoomArea = {
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
