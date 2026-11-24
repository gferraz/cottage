const FloorPlanModel = {
  // Symbol metadata survives internal object spreads but is omitted by JSON.stringify.
  deprecationWarningsKey: Symbol("deprecationWarnings"),

  collectDeprecations(config) {
    const warnings = [];
    const emit = (value, property, path, code, message) => {
      warnings.push({
        code, path: `${path}.${property}`, message,
        location: window.FloorPlanParser?.location(value, property)
          ?? window.FloorPlanParser?.location(value),
      });
    };
    const visit = (value, path = "$", context = "") => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((entry, index) => visit(entry, `${path}[${index}]`, context));
        return;
      }
      if (["", "floors"].includes(context) && Object.hasOwn(value, "wall_max_height")) {
        emit(value, "wall_max_height", path, "floor-wall-max-height",
          "wall_max_height está depreciado. Use ceiling_height; quando ambos existem, ceiling_height tem prioridade.");
      }
      if (context === "roofs" && Object.hasOwn(value, "eave")) {
        emit(value, "eave", path, "roof-eave",
          "eave está depreciado. Use eaves: { left: valor, right: valor }; para arrays, use o primeiro e o segundo valores, respectivamente. eaves.left/right explícitos têm prioridade.");
      }
      if (["rooms", "stairs", "parts", "walls"].includes(context) &&
          value.top && typeof value.top === "object" && !Array.isArray(value.top) &&
          Object.hasOwn(value.top, "level")) {
        emit(value, "top", path, "top-level",
          'top: { level: ... } está depreciado. Use top diretamente com o número ou a expressão de cota.');
      }
      if (["rooms", "stairs", "parts", "walls"].includes(context) && value.top === "roof") {
        emit(value, "top", path, "top-roof",
          'top: "roof" está depreciado. Use top: "roofs" para o conjunto de telhados.');
      }
      if (["rooms", "parts", "walls"].includes(context) && value.top &&
          typeof value.top === "object" && !Array.isArray(value.top) &&
          Object.hasOwn(value.top, "under") &&
          (value.top.offset === undefined || value.top.offset === 0)) {
        emit(value, "top", path, "top-under",
          "top: { under: ... } sem deslocamento está depreciado. Use top diretamente com o ID ou a lista de IDs de under.");
      }
      if (["", "floors", "rooms", "roofs"].includes(context)) {
        for (const key of ["openings", "doors", "windows"]) {
          if (!Array.isArray(value[key])) continue;
          value[key].forEach((entry, index) => {
            if (entry.type !== undefined) {
              const collection = { door: "doors", window: "windows", opening: "openings" }[entry.type];
              const destination = key === "openings" ? collection ?? key : key;
              emit(entry, "type", `${path}.${key}[${index}]`, "opening-type",
                `${key} com type: ${JSON.stringify(entry.type)} está depreciado. ${destination === key ? "Mantenha a entrada nesta coleção" : `Mova a entrada para ${destination}`} e remova type; a coleção determina a categoria.`);
            }
          });
        }
      }
      if (context === "config" && value.openings) {
        for (const [type, collection] of [["door", "doors"], ["window", "windows"], ["opening", "openings"]]) {
          if (Object.hasOwn(value.openings, type)) {
            emit(value.openings, type, `${path}.openings`, "opening-defaults",
              `config.openings.${type} está depreciado. Use config.${collection} diretamente com w, h e z0; os novos padrões têm prioridade por propriedade.`);
          }
        }
      }
      // Only inspect structural collections, never user-defined IDs or parameter names.
      for (const key of ["config", "floors", "rooms", "stairs", "parts", "walls", "roofs"]) {
        if (value[key] && typeof value[key] === "object") {
          visit(value[key], `${path}.${key}`, key);
        }
      }
    };
    visit(config);
    return warnings;
  },

  normalizeWallSides(config) {
    const side = (value) => value === "front" ? "top" : value === "rear" ? "bottom" : value;
    const visit = (value, key) => {
      if (!value || typeof value !== "object") return value;
      let result;
      if (key === "walls") {
        result = Array.isArray(value) ? value.map(side)
          : Object.fromEntries(Object.entries(value).map(([name, child]) => [side(name), visit(child)]));
      } else {
        result = Array.isArray(value) ? value.map((child) => visit(child))
          : Object.fromEntries(Object.entries(value).map(([name, child]) => {
            if (["openings", "doors", "windows"].includes(name) && Array.isArray(child)) {
              return [name, child.map((opening) => {
                const normalized = visit(opening);
                if (normalized.wall !== undefined) {
                  normalized.from = normalized.wall;
                  delete normalized.wall;
                }
                if (typeof normalized.from === "string") {
                  normalized.from = normalized.from.replace(/(^|\.)(front|rear)$/, (_, prefix, wall) => prefix + side(wall));
                }
                return normalized;
              })];
            }
            return [name, visit(child, name)];
          }));
      }
      for (const symbol of Object.getOwnPropertySymbols(value)) result[symbol] = value[symbol];
      return window.FloorPlanParser?.copyLocation(value, result) ?? result;
    };
    return visit(config);
  },

  resolveParameters(config) {
    if (!config.parameters) return config;
    const evaluate = FloorPlanExpressions.dependencies({
      label: name => `params.${name}`,
      location: name => window.FloorPlanParser?.location(config.parameters, name),
      cycleMessage: name => `Referência circular no parâmetro ${name}`,
      invalidMessage: name => `O parâmetro ${name} precisa ser numérico`,
      read(name, resolve) {
        if (!Object.hasOwn(config.parameters, name)) throw new Error(`Parâmetro desconhecido: params.${name}`);
        return FloorPlanExpressions.evaluate(config.parameters[name], reference => {
          if (!/^params\.[\w-]+$/.test(reference)) {
            throw new Error(`Valor de parâmetro inválido: ${reference}. Use números ou referências params.nome`);
          }
          return resolve(reference.slice(7));
        });
      },
    });
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
          throw FloorPlanExpressions.withLocation(error,
            window.FloorPlanParser?.location(value, key) ?? window.FloorPlanParser?.location(value));
        }
      };
      const result = Array.isArray(value) ? value.map(childValue)
        : Object.fromEntries(Reflect.ownKeys(value).map(key => [key, childValue(value[key], key)]));
      return window.FloorPlanParser?.copyLocation(value, result) ?? result;
    };
    return visit(config);
  },

  resolveFloorLevels(config) {
    const floors = config.floors ?? [config];
    const byId = new Map(floors.filter(floor => floor.id).map(floor => [floor.id, floor]));
    const evaluate = FloorPlanExpressions.dependencies({
      label: floor => `${floor.id ?? "pavimento"}.z0`,
      location: floor => window.FloorPlanParser?.location(floor, "z0") ?? window.FloorPlanParser?.location(floor),
      cycleMessage: name => `Referência circular na cota ${name}`,
      invalidMessage: name => `A cota ${name} precisa ser numérica e finita`,
      read(floor, resolve) {
        return FloorPlanExpressions.evaluate(floor.z0 ?? 0, reference => {
          const match = reference.match(/^([A-Za-z_][\w-]*)\.z0$/);
          const label = `${floor.id ?? "pavimento"}.z0`;
          if (!match) throw new Error(`Referência inválida na cota ${label}: ${reference}. Use ID-do-pavimento.z0`);
          const target = byId.get(match[1]);
          if (!target) throw new Error(`Pavimento desconhecido na cota ${label}: ${match[1]}`);
          return resolve(target);
        });
      },
    });
    const resolved = floors.map(floor => {
      const result = { ...floor, ...(floor.z0 !== undefined ? { z0: evaluate(floor) } : {}) };
      return window.FloorPlanParser?.copyLocation(floor, result) ?? result;
    });
    const result = config.floors ? { ...config, floors: resolved } : resolved[0];
    return window.FloorPlanParser?.copyLocation(config, result) ?? result;
  },

  applyDefaults(config) {
    config = this.resolveParameters(this.normalizeWallSides(config));
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
    const { parts: _stairParts, ...stairDefaults } = defaults.stairs ?? {};
    const stairWithDefaults = (entry) => {
      const stair = { ...stairDefaults, ...entry,
        ...(stairDefaults.steps || entry.steps ? { steps: { ...stairDefaults.steps, ...entry.steps } } : {}),
        ...(stairDefaults.colors || entry.colors ? { colors: { ...stairDefaults.colors, ...entry.colors } } : {}),
      };
      const kind = stair.kind ?? (String(stair.classes ?? "").split(/\s+/).includes("stair-landing") ? "landing" : "flight");
      const classes = new Set(String(stair.classes ?? "").split(/\s+/).filter(Boolean));
      if (!stair.parts?.length) classes.add(kind === "landing" ? "stair-landing" : "stair-flight");
      const result = { ...stair, walls: stair.walls ?? [], classes: [...classes].join(" ") };
      if (stair.parts) result.parts = stair.parts.map((part, index) => {
        const inherited = FloorPlanStairPath.isPath(stair)
          ? Object.fromEntries(['width', 'riser', 'tread', 'type', 'steps', 'colors', 'walls']
            .filter(key => stair[key] !== undefined).map(key => [key, stair[key]])) : {};
        const normalized = stairWithDefaults({ ...inherited, ...part });
        // Generated paths need stable IDs even when the author omits them.
        if (FloorPlanStairPath.isPath(stair)) normalized.id ??= `${stair.id}-part-${index + 1}`;
        return window.FloorPlanParser?.copyLocation(part, normalized) ?? normalized;
      });
      return window.FloorPlanParser?.copyLocation(entry, result) ?? result;
    };
    const expand = (floor) => {
      const ceilingHeight = floor.ceiling_height ?? floor.wall_max_height ??
        defaults.floors?.ceiling_height ?? defaults.floors?.wall_max_height;
      const result = {
        ...floor,
        ...(useHouseSides && floor.rooms ? { rooms: floor.rooms.map(roomWithPlanWalls) } : {}),
        ...(ceilingHeight !== undefined ? { ceiling_height: ceilingHeight } : {}),
        ...(floor.stairs ? { stairs: floor.stairs.map(stairWithDefaults).map(stair => useHouseSides ? roomWithPlanWalls(stair) : stair) } : {}),
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
    const coordinateSystem = config.coordinate_system;
    const warnings = config[this.deprecationWarningsKey] ?? this.collectDeprecations(config);
    config = this.normalizeWallSides(config);
    if (config.coordinate_system === "cartesian") {
      config = FloorPlanCoordinates.reflectX(config);
      delete config.coordinate_system;
    }
    config = this.resolveFloorLevels(this.applyDefaults(config));
    if (warnings.length) config[this.deprecationWarningsKey] = warnings;
    if (config.terrain?.grading !== undefined) FloorPlanTerrainGeometry.profile(config.terrain.grading);
    const floors = config.floors ?? [config];
    const viewport = config.viewport ?? {
      size: [20, 20],
      origin: [-4.25, -4.25],
    };
    return {
      config,
      coordinateSystem,
      warnings,
      floors,
      viewport,
      stairs: [
        ...(config.floors ? (config.stairs ?? []).map(stair => {
          const floor = stair.scope ? floors.find(candidate => candidate.id === stair.scope) : floors[0];
          return { stair, floor, floorId: floor?.id ?? null, floorLabel: floor?.label ?? null };
        }) : []),
        ...floors.flatMap(floor => (floor.stairs ?? []).map(stair => ({
          stair, floor, floorId: floor.id ?? null, floorLabel: floor.label ?? null,
        }))),
      ],
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
    return FloorPlanGeometryOperations.partitionRectangles(rectangles)
      .reduce((area, part) => area + part.w * part.l, 0);
  },

  calculateNetRoomArea(room, rooms, items) {
    // Compatibility adapter for existing element/reference callers. The pure
    // rule retains the legacy caller-selected scope for net area.
    const describe = (value) => ({
      id: value.dataset.id,
      floorId: value.dataset.floorId,
      parts: value.geometryParts,
      unused: value.unused === true,
      overlapTargets: value.allowedOverlaps,
    });
    const target = describe(room);
    const roomData = rooms.map((other) => other === room ? target : describe(other));
    const itemData = items.map((item) => ({
      x: item.x0(), y: item.y0(), w: item.w(), l: item.l(),
      floorId: item.dataset?.floorId,
      overlapTargets: item.allowedOverlaps,
    }));
    return FloorPlanRoomArea.netArea(target,
      FloorPlanRoomArea.deductionsFor(target, roomData, itemData));
  },

  presentationFloors(plan) {
    const floors = plan.model?.floors ?? plan.currentConfig?.floors ?? [plan.currentConfig];
    const storeyLevels = new Map();
    for (const floor of floors.filter(Boolean)) {
      if (floor.storey) storeyLevels.set(floor.storey,
        Math.min(storeyLevels.get(floor.storey) ?? Infinity, Number(floor.z0 ?? 0)));
    }
    const positions = floors.filter(Boolean).map(floor => {
      const references = (floor.rooms ?? []).map(room => plan.roomReferences?.get(room.id))
        .filter(reference => reference && ["x0", "x1", "y0"].every(key => typeof reference[key] === "function"));
      return {
        floor,
        z: floor.storey ? storeyLevels.get(floor.storey) : Number(floor.z0 ?? 0),
        y: Math.min(...references.map(reference => reference.y0())),
        x: Math.min(...references.map(reference => plan.model?.coordinateSystem === "cartesian"
          ? -reference.x1() : reference.x0())),
      };
    });
    const compare = (a, b) => {
      for (const key of ["z", "y", "x"]) {
        if (a[key] === b[key]) continue;
        return a[key] < b[key] ? -1 : 1;
      }
      return 0;
    };
    return positions.sort(compare).map(entry => entry.floor);
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
