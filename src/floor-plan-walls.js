const FloorPlanWalls = {
  resolveRoomSide(plan, roomId, side, opening) {
    const candidates = [...plan.walls.values()].filter((wall) =>
      wall.sourceSides.some(
        (source) => source.roomId === roomId && source.side === side,
      ),
    );
    if (candidates.length !== 1) {
      throw new Error(
        candidates.length === 0
          ? `No independent wall corresponds to ${roomId}.${side}`
          : `More than one independent wall corresponds to ${roomId}.${side}`,
      );
    }

    const [wall] = candidates;
    const epsilon = 1e-7;
    const alongStart = wall.axis === "x" ? wall.from[0] : wall.from[1];
    const alongEnd = wall.axis === "x" ? wall.to[0] : wall.to[1];
    const openingStart = wall.axis === "x" ? opening.x : opening.y;
    const openingEnd = openingStart + opening.w;
    const wallCoordinate = wall.axis === "x" ? wall.from[1] : wall.from[0];
    const openingCoordinate = wall.axis === "x" ? opening.y : opening.x;
    if (
      Math.abs(openingCoordinate - wallCoordinate) > epsilon ||
      openingStart < Math.min(alongStart, alongEnd) - epsilon ||
      openingEnd > Math.max(alongStart, alongEnd) + epsilon ||
      opening.z0 < wall.z0 - epsilon ||
      opening.z0 + opening.h > wall.z1 + epsilon
    ) {
      throw new Error(
        `A abertura está fora dos limites geométricos da parede ${wall.id}`,
      );
    }
    return wall;
  },

  normalizeRoomWalls(plan, config) {
    plan.walls = new Map();
    const floors = config.floors ?? [config];
    const roomFloors = new Map();
    floors.forEach((floor) => {
      (floor.rooms ?? []).forEach((room) => roomFloors.set(room.id, floor));
    });
    const thickness = Number(plan.catalog.walls?.thickness ?? 0.12);
    if (!Number.isFinite(thickness) || thickness <= 0) {
      plan.errors.push({
        category: "wall",
        message: "A espessura padrão de parede precisa ser um número positivo",
      });
      return;
    }

    const roomVolumes = [];
    const signatures = new Map();
    plan.roomDefinitions.forEach((definition, roomId) => {
      if (plan.invalidRoomIds.has(roomId)) return;
      const floor = roomFloors.get(roomId) ?? floors[0] ?? {};
      try {
        const geometry = plan.getRoomGeometry(roomId);
        const floorZ0 = Number(floor.z0 ?? 0);
        const nextFloorIndex = floors.indexOf(floor) + 1;
        const nextFloorZ0 = Number(floors[nextFloorIndex]?.z0);
        const configuredMaxHeight = Number(floor.wall_max_height);
        const floorHeight = Number.isFinite(nextFloorZ0)
          ? Math.min(nextFloorZ0 - floorZ0, configuredMaxHeight)
          : configuredMaxHeight;
        const explicitHeight = Number(geometry.h());
        const height = explicitHeight > 0 ? explicitHeight : floorHeight;
        const roomBounds = [
          geometry.x0(),
          geometry.x1(),
          geometry.y0(),
          geometry.y1(),
          floorZ0,
          height,
        ];
        if (
          !roomBounds.every(Number.isFinite) ||
          geometry.x1() <= geometry.x0() ||
          geometry.y1() <= geometry.y0() ||
          height <= 0
        ) {
          throw new Error(`Não foi possível determinar o volume vertical do cômodo ${roomId}`);
        }
        roomVolumes.push({
          id: roomId,
          x0: geometry.x0(),
          x1: geometry.x1(),
          y0: geometry.y0(),
          y1: geometry.y1(),
          z0: floorZ0,
          z1: floorZ0 + height,
        });

        const wallStates = plan.normalizeWalls(definition.walls);
        ["top", "right", "bottom", "left"].forEach((side) => {
          const state = wallStates[side];
          if (state !== "solid" && state !== "virtual") return;
          const alongX = side === "top" || side === "bottom";
          const centerX = alongX
            ? null
            : side === "left" ? geometry.x0() : geometry.x1();
          const centerY = alongX
            ? side === "top" ? geometry.y0() : geometry.y1()
            : null;
          const x = alongX
            ? geometry.x0()
            : centerX - thickness / 2;
          const y = alongX
            ? centerY - thickness / 2
            : geometry.y0();
          const w = alongX ? geometry.x1() - geometry.x0() : thickness;
          const l = alongX ? thickness : geometry.y1() - geometry.y0();
          const from = alongX
            ? [geometry.x0(), centerY, floorZ0]
            : [centerX, geometry.y0(), floorZ0];
          const to = alongX
            ? [geometry.x1(), centerY, floorZ0]
            : [centerX, geometry.y1(), floorZ0];
          const wallId = `${roomId}-${side}`;
          const signature = [
            alongX ? "x" : "y",
            x,
            y,
            w,
            l,
            floorZ0,
            height,
            thickness,
          ]
            .map((value) => typeof value === "number" ? value.toFixed(6) : value)
            .join(":");
          const existing = signatures.get(signature);
          if (existing) {
            if (existing.state !== state) {
              plan.errors.push({
                category: "wall",
                id: wallId,
                opening: definition,
                message: `Definições de parede coincidentes têm estados diferentes: ${existing.id} e ${wallId}`,
              });
            }
            if (!existing.sourceRoomIds.includes(roomId))
              existing.sourceRoomIds.push(roomId);
            existing.sourceSides.push({ roomId, side });
            return;
          }
          if (plan.references.has(wallId)) {
            plan.errors.push({
              category: "wall",
              id: wallId,
              opening: definition,
              message: `ID global duplicado para parede derivada: ${wallId}`,
            });
            return;
          }
          const wall = {
            id: wallId,
            type: "wall",
            sourceRoomIds: [roomId],
            sourceSides: [{ roomId, side }],
            state,
            axis: alongX ? "x" : "y",
            from,
            to,
            pos: [x, y, floorZ0],
            size: [w, l, height],
            x,
            y,
            w,
            l,
            z0: floorZ0,
            z1: floorZ0 + height,
            h: height,
            thickness,
            touchedRoomIds: [],
            signature,
          };
          signatures.set(signature, wall);
          plan.walls.set(wallId, wall);
        });
      } catch (error) {
        plan.errors.push({
          category: "wall",
          id: roomId,
          opening: definition,
          message: error.message,
        });
      }
    });

    const epsilon = 1e-9;
    plan.walls.forEach((wall) => {
      const [x0, y0, z0] = wall.pos;
      const [w, l, h] = wall.size;
      const x1 = x0 + w;
      const y1 = y0 + l;
      const z1 = z0 + h;
      wall.touchedRoomIds = roomVolumes
        .filter((room) =>
          Math.min(x1, room.x1) - Math.max(x0, room.x0) > epsilon &&
          Math.min(y1, room.y1) - Math.max(y0, room.y0) > epsilon &&
          Math.min(z1, room.z1) - Math.max(z0, room.z0) > epsilon,
        )
        .map((room) => room.id);
      if (!wall.touchedRoomIds.length) {
        plan.errors.push({
          category: "wall",
          id: wall.id,
          message: "A parede derivada não toca nenhum volume de cômodo",
        });
      }
      FloorPlanGeometryBox.attach(wall, { label: wall.id });
      plan.references.set(wall.id, wall);
    });
  },
};

window.FloorPlanWalls = FloorPlanWalls;
