const FloorPlanModel = {
  fromText(sourceText) {
    return FloorPlanModel.fromConfig(FloorPlanParser.parse(sourceText));
  },

  fromConfig(config) {
    const floors = config.floors ?? [config];
    const viewport = config.viewport ?? {
      size: [20, 20],
      origin: [-4.25, -4.25],
    };
    return {
      config,
      floors,
      viewport,
      rooms: floors.flatMap((floor) =>
        (floor.rooms ?? []).map((room) => ({
          room,
          floorId: floor.id ?? null,
          floorLabel: floor.label ?? null,
        })),
      ),
    };
  },

  calculateUnionArea(rectangles) {
    if (rectangles.length === 0) return 0;

    const xs = [...new Set(rectangles.flatMap(({ x, w }) => [x, x + w]))].sort(
      (a, b) => a - b,
    );
    const ys = [...new Set(rectangles.flatMap(({ y, l }) => [y, y + l]))].sort(
      (a, b) => a - b,
    );
    let area = 0;

    for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
        const x0 = xs[xIndex];
        const x1 = xs[xIndex + 1];
        const y0 = ys[yIndex];
        const y1 = ys[yIndex + 1];
        const covered = rectangles.some(
          (rectangle) =>
            rectangle.x <= x0 &&
            rectangle.x + rectangle.w >= x1 &&
            rectangle.y <= y0 &&
            rectangle.y + rectangle.l >= y1,
        );
        if (covered) area += (x1 - x0) * (y1 - y0);
      }
    }

    return area;
  },

  calculateNetRoomArea(room, rooms, items) {
    const targetIds = new Set([room.dataset.id]);
    room.geometryParts.forEach((part) => {
      if (part.id) targetIds.add(`${room.dataset.id}.${part.id}`);
    });
    const coveredBy = rooms
      .filter((other) => other !== room)
      .flatMap((other) =>
        other.geometryParts.filter((part) =>
          (part.overlapTargets ?? other.allowedOverlaps ?? []).some((target) =>
            targetIds.has(target),
          ),
        ),
      );
    const itemOverlaps = items
      .filter((item) =>
        (item.allowedOverlaps ?? []).some((target) => targetIds.has(target)),
      )
      .map((item) => ({
        x: item.x0(),
        y: item.y0(),
        w: item.w(),
        l: item.l(),
      }));
    const deductions = [];
    room.geometryParts.forEach((part) => {
      [...coveredBy, ...itemOverlaps].forEach((other) => {
        const x0 = Math.max(part.x, other.x);
        const y0 = Math.max(part.y, other.y);
        const x1 = Math.min(part.x + part.w, other.x + other.w);
        const y1 = Math.min(part.y + part.l, other.y + other.l);
        if (x1 > x0 && y1 > y0)
          deductions.push({ x: x0, y: y0, w: x1 - x0, l: y1 - y0 });
      });
    });
    const grossArea = room.geometryParts.reduce(
      (total, part) => total + part.w * part.l,
      0,
    );
    return grossArea - FloorPlanModel.calculateUnionArea(deductions);
  },

  floorRows(floors, roomDefinitions, roomReferences) {
    const getReference = (room, floor) => {
      const reference = roomReferences?.get(room.id);
      if (
        reference &&
        typeof reference.x0 === "function" &&
        typeof reference.x1 === "function" &&
        typeof reference.y0 === "function" &&
        typeof reference.y1 === "function"
      ) {
        return reference;
      }

      const received = reference === undefined
        ? "undefined"
        : reference?.constructor?.name || typeof reference;
      throw new Error(
        `Invalid room reference for "${room.id}" on floor "${floor.id || floor.label || "unknown"}": expected x0(), x1(), y0(), y1(); received ${received}`,
      );
    };

    return floors.map((floor) => {
      const rooms = (floor.rooms ?? [])
        .filter((room) => roomDefinitions.get(room.id) === room)
        .map((room) => getReference(room, floor))
        .filter(Boolean);
      const baseRooms = (floor.rooms ?? [])
        .filter(
          (room) =>
            room.overlaps === undefined &&
            roomDefinitions.get(room.id) === room,
        )
        .map((room) => getReference(room, floor))
        .filter(Boolean);
      const dimensionRooms = baseRooms.length ? baseRooms : rooms;
      const areaRooms = baseRooms.length ? baseRooms : rooms;
      return {
        label: floor.label || floor.id || "Piso",
        count: rooms.length,
        width: dimensionRooms.length
          ? Math.max(...dimensionRooms.map((room) => room.x1())) -
            Math.min(...dimensionRooms.map((room) => room.x0()))
          : 0,
        height: dimensionRooms.length
          ? Math.max(...dimensionRooms.map((room) => room.y1())) -
            Math.min(...dimensionRooms.map((room) => room.y0()))
          : 0,
        area: FloorPlanModel.calculateUnionArea(
          areaRooms.flatMap((room) => room.geometryParts || []),
        ),
      };
    });
  },
};
