const FloorPlanModel = {
  resolveParameters(config) {
    if (!config.parameters) return config;
    const values = new Map();
    const stack = new Set();
    const evaluate = (name) => {
      if (values.has(name)) return values.get(name);
      if (!Object.hasOwn(config.parameters, name)) throw new Error(`Parâmetro desconhecido: params.${name}`);
      if (stack.has(name)) throw new Error(`Referência circular no parâmetro params.${name}`);
      stack.add(name);
      try {
        const value = resolver.resolve(config.parameters[name]);
        if (!Number.isFinite(value)) throw new Error(`O parâmetro params.${name} precisa ser numérico`);
        values.set(name, value);
        return value;
      } catch (error) {
        if (!error.location) {
          error.location = window.FloorPlanParser?.location(config.parameters, name);
          if (error.location) error.message = `${FloorPlanParser.formatLocation(error.location)}: ${error.message}`;
        }
        throw error;
      } finally {
        stack.delete(name);
      }
    };
    const resolver = {
      resolveExpression: FloorPlanGeometry.resolveExpression,
      resolve(value) {
        if (typeof value === "number") return value;
        const text = String(value).trim();
        if (/^params\.[\w-]+$/.test(text)) return evaluate(text.slice(7));
        if (text !== "" && Number.isFinite(Number(text))) return Number(text);
        if (!/[()+*/]|\s[+-]\s|^[+-]/.test(text)) {
          throw new Error(`Valor de parâmetro inválido: ${text}. Use números ou referências params.nome`);
        }
        return this.resolveExpression(text);
      },
    };
    for (const name of Object.keys(config.parameters)) evaluate(name);
    const visit = (value) => {
      if (typeof value === "string" && /\bparams\.[\w-]+/.test(value)) {
        if (/^params\.[\w-]+$/.test(value)) return evaluate(value.slice(7));
        return value.replace(/\bparams\.([\w-]+)/g, (_, name) => `(${evaluate(name)})`);
      }
      if (!value || typeof value !== "object") return value;
      const childValue = (child, key) => {
        try {
          return key === "parameters" ? child : visit(child);
        } catch (error) {
          if (!error.location) {
            error.location = window.FloorPlanParser?.location(value, key) ?? window.FloorPlanParser?.location(value);
            if (error.location) error.message = `${FloorPlanParser.formatLocation(error.location)}: ${error.message}`;
          }
          throw error;
        }
      };
      const result = Array.isArray(value) ? value.map(childValue)
        : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, childValue(child, key)]));
      return window.FloorPlanParser?.copyLocation(value, result) ?? result;
    };
    return visit(config);
  },

  applyDefaults(config) {
    config = this.resolveParameters(config);
    const defaults = config.config ?? {};
    const { room_wall_sides: roomWallSides, ...elementDefaults } = defaults;
    const useHouseSides = roomWallSides === "house";
    const planSide = (side) => side === "left" ? "right" : side === "right" ? "left" : side;
    const roomWithPlanWalls = (room) => {
      const result = { ...room };
      if (Array.isArray(room.walls)) {
        result.walls = room.walls.map(planSide);
      } else if (room.walls && typeof room.walls === "object") {
        result.walls = Object.fromEntries(
          Object.entries(room.walls).map(([side, state]) => [planSide(side), state]),
        );
      }
      if (room.parts) result.parts = room.parts.map(roomWithPlanWalls);
      return window.FloorPlanParser?.copyLocation(room, result) ?? result;
    };
    const roofDefaults = Object.fromEntries(
      ["type", "pitch", "eaves", "eave", "rake", "slope", "thickness"].filter((key) => defaults.roofs?.[key] !== undefined)
        .map((key) => [key, defaults.roofs[key]]),
    );
    const roofWithDefaults = (roof) => {
      const result = { ...roofDefaults, ...roof };
      if (roofDefaults.eaves || roof.eaves) {
        const localLegacy = roof.eave === undefined ? {} : {
          left: Array.isArray(roof.eave) ? roof.eave[0] : roof.eave,
          right: Array.isArray(roof.eave) ? roof.eave[1] : roof.eave,
        };
        result.eaves = { ...roofDefaults.eaves, ...localLegacy, ...roof.eaves };
      }
      return result;
    };
    const expand = (floor) => {
      const ceilingHeight = floor.ceiling_height ?? floor.wall_max_height ??
        defaults.floors?.ceiling_height ?? defaults.floors?.wall_max_height;
      const result = {
        ...floor,
        ...(useHouseSides && floor.rooms ? { rooms: floor.rooms.map(roomWithPlanWalls) } : {}),
        ...(ceilingHeight !== undefined ? { ceiling_height: ceilingHeight } : {}),
        ...(floor.roofs ? { roofs: floor.roofs.map(roofWithDefaults) } : {}),
      };
      if (floor.roofs) result.roofs.forEach((roof, index) => window.FloorPlanParser?.copyLocation(floor.roofs[index], roof));
      return window.FloorPlanParser?.copyLocation(floor, result) ?? result;
    };
    const result = expand(config);
    if (config.floors) result.floors = config.floors.map(expand);
    // Internal definitions use plan coordinates, including when a floor is reloaded.
    if (useHouseSides) result.config = elementDefaults;
    return result;
  },

  fromText(sourceText) {
    return FloorPlanModel.fromConfig(FloorPlanParser.parse(sourceText));
  },

  fromConfig(config) {
    config = this.applyDefaults(config);
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

window.FloorPlanModel = FloorPlanModel;
