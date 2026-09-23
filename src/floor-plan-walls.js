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

  renderIndependentWalls(plan) {
    plan.wallElements = [];
    plan.independentWalls.forEach((wall) => {
      const points = wall.path.points;
      points.slice(0, -1).forEach(([x0, y0], index) => {
        const [x1, y1] = points[index + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        if (length <= 1e-9) return;
        const element = plan.add({
          id: `${wall.id}-segment-${index + 1}`,
          label: "",
          pos: [
            (x0 + x1) / 2 - length / 2,
            (y0 + y1) / 2 - wall.thickness / 2,
            wall.z0,
          ],
          size: [length, wall.thickness, wall.h],
          classes: "plan-wall independent-wall",
          showLabel: false,
        });
        element.style.transform = `rotate(${Math.atan2(y1 - y0, x1 - x0)}rad)`;
        element.style.transformOrigin = "center";
        element.dataset.wallId = wall.id;
        plan.wallElements.push(element);
      });
    });
  },

  normalizeRoomWalls(plan, config) {
    plan.walls = new Map();
    plan.independentWalls = new Map();
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
          outdoor: definition.classes?.split(/\s+/).includes("outdoor"),
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
      wall.adjacentEnclosedRoomIds = roomVolumes
        .filter((room) =>
          !room.outdoor &&
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

    const groundLevel = Number(floors[0]?.z0 ?? 0);
    (config.walls ?? []).forEach((definition) => {
      try {
        if (!definition.id) throw new Error("Parede independente precisa de id");
        if (FloorPlanValidation.isReservedId(definition.id)) {
          throw new Error(`ID reservado: ${definition.id}`);
        }
        if (plan.references.has(definition.id)) {
          throw new Error(`ID global duplicado: ${definition.id}`);
        }
        const points = definition.path?.points;
        if (!Array.isArray(points) || points.length < 2) {
          throw new Error("Parede independente precisa de path.points com ao menos dois pontos");
        }
        const resolvedPoints = points.map((point) => {
          if (!Array.isArray(point) || point.length !== 2) {
            throw new Error("Cada ponto de path.points precisa ser [x, y]");
          }
          const resolved = point.map((value) => plan.resolve(value));
          if (!resolved.every(Number.isFinite)) {
            throw new Error("As coordenadas de path.points precisam ser numéricas");
          }
          return resolved;
        });
        const thickness = Number(
          definition.thickness ?? plan.catalog.walls?.thickness ?? 0.12,
        );
        const topZ = plan.resolve(definition.top?.level ?? groundLevel);
        if (!Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(topZ)) {
          throw new Error("Parede precisa de thickness positiva e cota superior numérica");
        }
        const x0 = Math.min(...resolvedPoints.map(([x]) => x)) - thickness / 2;
        const x1 = Math.max(...resolvedPoints.map(([x]) => x)) + thickness / 2;
        const y0 = Math.min(...resolvedPoints.map(([, y]) => y)) - thickness / 2;
        const y1 = Math.max(...resolvedPoints.map(([, y]) => y)) + thickness / 2;
        const wall = {
          ...definition,
          id: definition.id,
          type: "wall",
          path: { ...definition.path, points: resolvedPoints },
          base: definition.base ?? "terrain",
          top: { ...definition.top, level: topZ },
          topZ,
          thickness,
          x: x0,
          y: y0,
          w: x1 - x0,
          l: y1 - y0,
          x0,
          x1,
          y0,
          y1,
          z0: groundLevel,
          z1: topZ,
          h: topZ - groundLevel,
          touchedRoomIds: roomVolumes
            .filter((room) =>
              room.x0 < x1 && room.x1 > x0 &&
              room.y0 < y1 && room.y1 > y0 &&
              room.z0 <= topZ && room.z1 >= groundLevel,
            )
            .map((room) => room.id),
        };
        if (wall.base !== "terrain") {
          throw new Error('Por ora, a base de parede independente aceita apenas "terrain"');
        }
        if (wall.h < 0) throw new Error("A cota superior da parede não pode ficar abaixo do piso térreo");
        FloorPlanGeometryBox.attach(wall, { compound: true, label: wall.id });
        plan.independentWalls.set(wall.id, wall);
        plan.references.set(wall.id, wall);
      } catch (error) {
        plan.errors.push({
          category: "wall",
          id: definition.id,
          opening: definition,
          message: error.message,
        });
      }
    });

    const enclosedGroundRooms = roomVolumes.filter(
      (room) => !room.outdoor && Math.abs(room.z0 - groundLevel) <= epsilon,
    );
    const boundaries = [];
    enclosedGroundRooms.forEach((room) => {
      boundaries.push(
        { room, axis: "x", side: "left", coordinate: room.x0, start: room.y0, end: room.y1, negative: true },
        { room, axis: "x", side: "right", coordinate: room.x1, start: room.y0, end: room.y1, negative: false },
        { room, axis: "y", side: "top", coordinate: room.y0, start: room.x0, end: room.x1, negative: true },
        { room, axis: "y", side: "bottom", coordinate: room.y1, start: room.x0, end: room.x1, negative: false },
      );
    });
    const boundarySegments = [];
    boundaries.forEach((boundary) => {
      const { room, axis, coordinate, start, end, negative } = boundary;
      const breaks = new Set([start, end]);
      enclosedGroundRooms.forEach((other) => {
        if (other.id === room.id) return;
        const perpendicularStart = axis === "x" ? other.x0 : other.y0;
        const perpendicularEnd = axis === "x" ? other.x1 : other.y1;
        const alongStart = axis === "x" ? other.y0 : other.x0;
        const alongEnd = axis === "x" ? other.y1 : other.x1;
        if (
          perpendicularStart < coordinate + epsilon &&
          perpendicularEnd > coordinate - epsilon
        ) {
          breaks.add(Math.max(start, alongStart));
          breaks.add(Math.min(end, alongEnd));
        }
      });
      const sortedBreaks = [...breaks]
        .filter((value) => value >= start && value <= end)
        .sort((a, b) => a - b);
      for (let index = 0; index < sortedBreaks.length - 1; index += 1) {
        const segmentStart = sortedBreaks[index];
        const segmentEnd = sortedBreaks[index + 1];
        if (segmentEnd - segmentStart <= epsilon) continue;
        const midpoint = (segmentStart + segmentEnd) / 2;
        const hasRoomOutside = enclosedGroundRooms.some((other) => {
          if (other.id === room.id) return false;
          const otherAlongStart = axis === "x" ? other.y0 : other.x0;
          const otherAlongEnd = axis === "x" ? other.y1 : other.x1;
          const otherPerpendicularStart = axis === "x" ? other.x0 : other.y0;
          const otherPerpendicularEnd = axis === "x" ? other.x1 : other.y1;
          const crossesBoundary = negative
            ? otherPerpendicularStart < coordinate - epsilon &&
              otherPerpendicularEnd >= coordinate - epsilon
            : otherPerpendicularStart <= coordinate + epsilon &&
              otherPerpendicularEnd > coordinate + epsilon;
          return (
            midpoint > otherAlongStart + epsilon &&
            midpoint < otherAlongEnd - epsilon &&
            crossesBoundary
          );
        });
        if (!hasRoomOutside) {
          boundarySegments.push({ ...boundary, start: segmentStart, end: segmentEnd });
        }
      }
    });

    const uniqueBoundarySegments = new Map();
    boundarySegments.forEach((segment) => {
      const key = [
        segment.axis,
        segment.coordinate,
        segment.start,
        segment.end,
      ].map((value) => Number(value).toFixed(6)).join(":");
      if (!uniqueBoundarySegments.has(key)) uniqueBoundarySegments.set(key, segment);
    });
    const foundationThickness = Number(plan.catalog.walls?.thickness ?? 0.12);
    plan.foundationWalls = [...uniqueBoundarySegments.values()].map((segment, index) => {
      const { room, axis, side, coordinate, start, end } = segment;
      const alongX = axis === "y";
      const x = alongX ? start : coordinate - foundationThickness / 2;
      const y = alongX ? coordinate - foundationThickness / 2 : start;
      const width = alongX ? end - start : foundationThickness;
      const depth = alongX ? foundationThickness : end - start;
      const from = axis === "y"
        ? [start, coordinate, groundLevel]
        : [coordinate, start, groundLevel];
      const to = axis === "y"
        ? [end, coordinate, groundLevel]
        : [coordinate, end, groundLevel];
      return {
        id: `foundation-${room.id}-${side}-${index + 1}`,
        type: "wall",
        sourceRoomIds: [room.id],
        axis: axis === "y" ? "x" : "y",
        from,
        to,
        pos: [x, y, groundLevel],
        size: [width, depth],
        topZ: groundLevel,
        base: "terrain",
        top: { level: groundLevel },
        thickness: foundationThickness,
        touchedRoomIds: [room.id],
      };
    });
  },
};

window.FloorPlanWalls = FloorPlanWalls;
