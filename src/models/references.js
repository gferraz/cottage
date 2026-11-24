const FloorPlanReferences = {
  prepareRoomReferences(plan, config) {
    // These collections are part of the plan state even before the first
    // configuration is prepared. Keep the preparation safe for a fresh plan
    // and for callers that reload a configuration more than once.
    plan.references ??= new Map();
    plan.rooms ??= new Map();
    plan.roomReferences ??= new Map();
    plan.roomDefinitions ??= new Map();
    plan.roomGeometryCache ??= new Map();
    plan.roomGeometryStack ??= new Set();
    plan.partOwners ??= new Map();
    plan.globalObjectIds ??= new Set();
    plan.validZoneIds ??= new Set();
    plan.roomDefinitions.clear();
    plan.roomFloorConfigs = new Map();
    plan.roomGeometryCache.clear();
    plan.roomGeometryStack.clear();
    plan.invalidRoomIds.clear();
    plan.rooms.clear();
    plan.roomReferences.clear();
    plan.references.clear();
    plan.errors.push(...FloorPlanValidation.validateFloors(config));
    plan.errors.push(...FloorPlanValidation.validateRoofOpenings(config));
    const collected = FloorPlanValidation.collectRoomDefinitions(
      plan.model || FloorPlanModel.fromConfig(config),
    );
    plan.roomDefinitions = collected.definitions;
    plan.errors.push(...collected.errors);
    plan.stairDefinitions = new Map();
    const owners = config.floors ? [config, ...config.floors] : [config];
    const nonStairIds = new Set(owners.flatMap(owner => [
      ...(owner === config && config.floors ? [] : [owner.id]),
      ...["walls", "roofs", "items", "zones", "guides"].flatMap(key =>
        (Array.isArray(owner[key]) ? owner[key] : []).map(object => object.id)),
    ]).filter(Boolean));
    for (const { stair, floor } of plan.model?.stairs ?? []) {
      const fail = message => plan.errors.push({ category: "stair", id: stair.id, opening: stair, message });
      if (stair.kind !== undefined && !["flight", "landing"].includes(stair.kind)) { fail(`Tipo de escada inválido: ${stair.kind}`); continue; }
      if (!stair.id) { fail("Escada sem id global"); continue; }
      if (FloorPlanValidation.isReservedId(stair.id)) { fail(`ID reservado: ${stair.id}`); continue; }
      if (plan.roomDefinitions.has(stair.id) || nonStairIds.has(stair.id)) { fail(`ID global duplicado: ${stair.id}`); continue; }
      if (!floor) { fail(`Piso de escada desconhecido: ${stair.scope}`); continue; }
      const invalidKind = (stair.parts ?? []).find(part => part.kind !== undefined && !["flight", "landing"].includes(part.kind));
      if (invalidKind) { fail(`Tipo de parte de escada inválido: ${invalidKind.kind}`); continue; }
      const invalidPart = (stair.parts ?? []).find(part => part.id && FloorPlanValidation.isReservedId(part.id));
      if (invalidPart) { fail(`Parte com ID reservado: ${invalidPart.id}`); continue; }
      plan.stairDefinitions.set(stair.id, stair);
      plan.roomDefinitions.set(stair.id, stair);
      plan.roomFloorConfigs.set(stair.id, floor);
    }

    plan.roomDefinitions.forEach((_room, id) => {
      const reference = plan.createRoomReference(id);
      plan.rooms.set(id, reference);
      plan.roomReferences.set(id, reference);
      plan.references.set(id, reference);
    });
    const floors = config.floors ?? [config];
    floors.forEach((floor) => {
      (floor.rooms ?? []).forEach((room) => {
        plan.roomFloorConfigs.set(room.id, floor);
      });
    });
    plan.registerGlobalPartReferences();
    plan.registerFloorReferences(config);
    plan.registerStaticGuideReferences(config);
    plan.registerStaticZoneReferences(config);
    FloorPlanReferences.registerStaticItemReferences(plan, config);
    FloorPlanReferences.registerWallReferences(plan, config);
    plan.registerRoofReferences(config);
    plan.roomDefinitions.forEach((_room, id) => {
      try {
        plan.getRoomGeometry(id);
      } catch (error) {
        plan.invalidRoomIds.add(id);
        plan.errors.push({
          category: plan.stairDefinitions.has(id) ? "stair" : "room",
          id,
          opening: plan.roomDefinitions.get(id),
          message: error.message,
        });
      }
    });
    FloorPlanWalls.normalizeRoomWalls(plan, config);
    plan.validateGlobalObjectIds(config);
  },

  registerGlobalPartReferences(plan) {
    plan.partOwners = new Map();
    plan.roomDefinitions.forEach((room, roomId) => {
      (room.parts ?? []).forEach((part, index) => {
        const partId = part.id || `part-${index + 1}`;
        if (plan.partOwners?.has(partId)) {
          plan.errors.push({
            category: "room",
            id: partId,
            opening: room,
            message: `ID de parte duplicado: ${partId}`,
          });
          return;
        }
        if (plan.references?.has(partId)) {
          plan.errors.push({
            category: "room",
            id: partId,
            opening: room,
            message: `ID global duplicado: ${partId}`,
          });
          return;
        }
        plan.partOwners.set(partId, roomId);
        const reference = {};
        [
          "x0",
          "x1",
          "xc",
          "y0",
          "y1",
          "yc",
          "z0",
          "z1",
          "zc",
          "h",
          "w",
          "l",
          "area",
        ].forEach((method) => {
          reference[method] = () =>
            plan.getRoomGeometry(roomId).partReferences.get(partId)[method]();
        });
        FloorPlanGeometryBox.attach(reference, { label: partId });
        plan.references.set(partId, reference);
      });
    });
  },

  registerFloorReferences(plan, config) {
    (config.floors ?? [config]).forEach((floorConfig) => {
      if (
        !floorConfig.id ||
        FloorPlanValidation.isReservedId(floorConfig.id) ||
        plan.references?.has(floorConfig.id)
      )
        return;
      const height = Number(floorConfig.z0 ?? 0);
      const wallMaxHeight = Number(floorConfig.ceiling_height ?? floorConfig.wall_max_height ?? 0);
      plan.references.set(floorConfig.id, {
        z0: () => height,
        z1: () => height + wallMaxHeight,
        zc: () => height + wallMaxHeight / 2,
        h: () => wallMaxHeight,
        w: () => 0,
        l: () => 0,
        area: () => 0,
      });
    });
  },

  registerStaticGuideReferences(plan, config) {
    const floorGuides = (config.floors ?? [config]).flatMap(
      (floorConfig) => floorConfig.guides ?? [],
    );
    const guides = config.floors
      ? [...(config.guides ?? []), ...floorGuides]
      : floorGuides;
    guides.forEach((guide) => {
      if (
        !guide.id ||
        FloorPlanValidation.isReservedId(guide.id) ||
        plan.references?.has(guide.id)
      )
        return;
      const [xValue, yValue] = guide.pos ?? guide.from ?? [];
      const widthValue = guide.w;
      const lengthValue = guide.l;
      const [toXValue, toYValue] = guide.to ?? [];
      const hasEndpoint = guide.to !== undefined;
      if (
        !hasEndpoint &&
        (widthValue === undefined) === (lengthValue === undefined)
      )
        return;
      const startX = () => plan.resolve(xValue);
      const startY = () => plan.resolve(yValue);
      const endpointX = () =>
        plan.resolve(toXValue, {
          x0: startX(),
          y0: startY(),
          z0: FloorPlanGeometry.context(plan).floorZ,
        });
      const endpointY = () =>
        plan.resolve(toYValue, {
          x0: startX(),
          y0: startY(),
          z0: FloorPlanGeometry.context(plan).floorZ,
        });
      plan.references.set(guide.id, {
        x0: startX,
        x1: () =>
          hasEndpoint
            ? endpointX()
            : startX() +
              (widthValue === undefined ? 0 : plan.resolve(widthValue)),
        xc: () =>
          (startX() +
            (hasEndpoint
              ? endpointX()
              : startX() +
                (widthValue === undefined ? 0 : plan.resolve(widthValue)))) /
          2,
        y0: startY,
        y1: () =>
          hasEndpoint
            ? endpointY()
            : startY() +
              (lengthValue === undefined ? 0 : plan.resolve(lengthValue)),
        yc: () =>
          (startY() +
            (hasEndpoint
              ? endpointY()
              : startY() +
                (lengthValue === undefined ? 0 : plan.resolve(lengthValue)))) /
          2,
        w: () =>
          hasEndpoint
            ? Math.abs(endpointX() - startX())
            : widthValue === undefined
              ? 0
              : plan.resolve(widthValue),
        l: () =>
          hasEndpoint
            ? Math.abs(endpointY() - startY())
            : lengthValue === undefined
              ? 0
              : plan.resolve(lengthValue),
        area: () => 0,
      });
    });
  },

  registerStaticZoneReferences(plan, config) {
    const floors = config.floors ?? [config];
    const globalFloor = floors[0];
    const zones = [
      ...(config.floors ? (config.zones ?? []).map((zone) => ({ zone, floor: globalFloor })) : []),
      ...floors.flatMap((floor) => (floor.zones ?? []).map((zone) => ({ zone, floor }))),
    ];
    zones.forEach(({ zone, floor }) => {
      if (!zone.id || plan.references?.has(zone.id)) return;
      const geometry = () => plan.normalizeGeometryAtFloor(zone, floor);
      plan.references.set(zone.id, {
        x0: () => geometry().x,
        x1: () => geometry().x + geometry().w,
        xc: () => geometry().x + geometry().w / 2,
        y0: () => geometry().y,
        y1: () => geometry().y + geometry().l,
        yc: () => geometry().y + geometry().l / 2,
        zc: () => (geometry().z0 + geometry().z1) / 2,
        w: () => geometry().w,
        l: () => geometry().l,
        area: () => geometry().w * geometry().l,
      });
    });
  },

  registerStaticItemReferences(plan, config) {
    const resolving = new Set();
    for (const expanded of [false, true]) {
      (config.floors ?? [config]).forEach((floor) => {
        (expanded ? (window.FloorPlanElements?.items(plan, floor) ?? floor.items ?? []) : (floor.items ?? [])).forEach((item) => {
          if (!item.id || plan.references.has(item.id)) return;
          const geometry = () => {
            if (resolving.has(item.id)) {
              throw new Error(`Circular item reference: ${item.id}`);
            }
            resolving.add(item.id);
            try {
              return FloorPlanGeometryBox.fromValues(
                plan.normalizeGeometryAtFloor(plan.resolveItemType(item), floor),
              );
            } finally {
              resolving.delete(item.id);
            }
          };
          plan.references.set(item.id, Object.fromEntries(
            ["x0", "x1", "xc", "y0", "y1", "yc", "z0", "z1", "zc", "w", "l", "h", "area"]
              .map((method) => [method, () => geometry()[method]()]),
          ));
        });
      });
    }
  },

  registerWallReferences(plan, config) {
    plan.wallReferences = new Map();
    const resolving = new Set();
    const floors = config.floors ?? [config];
    const ground = Number(floors[0]?.z0 ?? 0);
    for (const source of config.walls ?? []) {
      if (!source.id || FloorPlanValidation.isReservedId(source.id) || plan.references.has(source.id)) continue;
      const definition = { ...(config.config?.walls ?? {}), ...source };
      const guarded = (key, calculate) => {
        const token = `${source.id}.${key}`;
        if (resolving.has(token)) throw new Error(`Referência circular de parede: ${token}`);
        resolving.add(token);
        try { return calculate(); } finally { resolving.delete(token); }
      };
      // Resolve the footprint separately: a room may depend on the wall's
      // position while the wall's height depends on that room.
      const footprint = () => guarded("path", () => {
        const endpoints = definition.from !== undefined || definition.to !== undefined;
        if (endpoints && definition.path !== undefined) throw new Error("Use from/to ou path.points para definir a parede, sem combinar os dois formatos");
        const points = endpoints ? [definition.from, definition.to] : definition.path?.points;
        if (!Array.isArray(points) || points.length < 2) throw new Error("Parede independente precisa de from/to ou path.points com ao menos dois pontos");
        let origin = null;
        const resolved = points.map((point) => {
          if (!Array.isArray(point) || point.length !== 2) throw new Error("Cada ponto da parede precisa ser [x, y]");
          const result = point.map((value) => plan.resolve(value, origin));
          origin = { x0: result[0], y0: result[1] };
          return result;
        });
        const thickness = Number(definition.thickness ?? plan.catalog.walls?.thickness ?? 0.12);
        if (!Number.isFinite(thickness) || thickness <= 0) throw new Error("A espessura da parede precisa ser positiva");
        const x = Math.min(...resolved.map(([x]) => x)) - thickness / 2;
        const y = Math.min(...resolved.map(([, y]) => y)) - thickness / 2;
        return FloorPlanGeometryBox.fromValues({ x, y,
          w: Math.max(...resolved.map(([x]) => x)) + thickness / 2 - x,
          l: Math.max(...resolved.map(([, y]) => y)) + thickness / 2 - y });
      });
      const base = () => guarded("z0", () => {
        const value = definition.base ?? "terrain";
        return value === "terrain" ? Math.min(ground, ...[...Object.values(config.terrain?.corners ?? {}), ...(config.terrain?.grading?.profile ?? [])]
          .map((corner) => Number(corner.z)).filter(Number.isFinite)) : plan.resolve(value.level);
      });
      const top = () => guarded("z1", () => {
        if (["roofs", "roof"].includes(definition.top)) return Math.max(...FloorPlanWalls.roofLimits(plan, config).map((roof) => roof.peakZ));
        const limits = FloorPlanWalls.undersideLimits(plan, definition.top,
          Number(definition.thickness ?? plan.catalog.walls?.thickness ?? 0.12) / 2);
        return plan.resolve(FloorPlanWalls.topLevel(definition.top) ?? (limits.length
          ? Math.max(...limits.map((limit) => limit.peakZ), ...floors.map((floor) =>
            Number(floor.z0 ?? 0) + Number(floor.ceiling_height ?? floor.wall_max_height ?? 0))) : ground));
      });
      const reference = Object.fromEntries(["x0", "x1", "xc", "y0", "y1", "yc", "w", "l", "area"]
        .map((method) => [method, () => footprint()[method]() ]));
      Object.assign(reference, { z0: base, z1: top, zc: () => (base() + top()) / 2, h: () => top() - base() });
      FloorPlanGeometryBox.attach(reference, { compound: true, label: source.id });
      plan.wallReferences.set(source.id, reference);
      plan.references.set(source.id, reference);
    }
  },

  registerRoofReferences(plan, config) {
    const roofs = config.floors
      ? [
          ...(config.roofs ?? []),
          ...config.floors.flatMap((floor) => floor.roofs ?? []),
        ]
      : config.roofs ?? [];

    let pending = roofs.filter((roof) => roof.id
      && !FloorPlanValidation.isReservedId(roof.id)
      && !plan.references.has(roof.id));
    while (pending.length) {
      const unresolved = [];
      const errors = [];
      pending.forEach((roof) => {
        if (plan.references.has(roof.id)) return;
        try {
          const baseDefinition = roof.base ?? roof;
          const floor = FloorPlanRoofGeometry.floorForRoof(plan, roof, baseDefinition);
          const base = FloorPlanRoofGeometry.resolveBase(plan, baseDefinition, floor);
          plan.references.set(roof.id, base);
        } catch (error) {
          unresolved.push(roof);
          errors.push({
            category: "roof",
            id: roof.id,
            opening: roof,
            message: error.message,
          });
        }
      });
      if (unresolved.length === pending.length) {
        plan.errors.push(...errors);
        break;
      }
      pending = unresolved;
    }
  },

  validateGlobalObjectIds(plan, config) {
    plan.globalObjectIds = new Set([
      ...plan.roomDefinitions.keys(),
      ...(plan.partOwners?.keys() ?? []),
      ...(plan.walls?.keys() ?? []),
      ...(plan.independentWalls?.keys() ?? []),
    ]);
    plan.validZoneIds = new Set();
    const floorConfigs = config.floors ?? [config];
    const globalGuides = config.floors ? (config.guides ?? []) : [];
    globalGuides.forEach((guide) => {
      if (guide.id && FloorPlanValidation.isReservedId(guide.id)) {
        plan.errors.push({
          category: "guide",
          id: guide.id,
          opening: guide,
          message: `ID reservado: ${guide.id}`,
        });
      }
    });
    floorConfigs.forEach((floorConfig) => {
      if (floorConfig.id && FloorPlanValidation.isReservedId(floorConfig.id)) {
        plan.errors.push({
          category: "floor",
          id: floorConfig.id,
          opening: floorConfig,
          message: `ID reservado: ${floorConfig.id}`,
        });
      }
      (floorConfig.guides ?? []).forEach((guide) => {
        if (guide.id && FloorPlanValidation.isReservedId(guide.id)) {
          plan.errors.push({
            category: "guide",
            id: guide.id,
            opening: guide,
            message: `ID reservado: ${guide.id}`,
          });
        }
      });
    });
    const globalZones = config.floors ? (config.zones ?? []) : [];
    [
      ...globalZones,
      ...floorConfigs.flatMap((floorConfig) => floorConfig.zones ?? []),
    ].forEach((zone) => {
      if (!zone.id) {
        plan.errors.push({
          category: "zone",
          opening: zone,
          message: "Zona sem id global",
        });
      } else if (FloorPlanValidation.isReservedId(zone.id)) {
        plan.errors.push({
          category: "zone",
          id: zone.id,
          opening: zone,
          message: `ID reservado: ${zone.id}`,
        });
      } else if (plan.globalObjectIds?.has(zone.id)) {
        plan.errors.push({
          category: "zone",
          id: zone.id,
          opening: zone,
          message: `ID global duplicado: ${zone.id}`,
        });
      } else {
        plan.globalObjectIds.add(zone.id);
        plan.validZoneIds.add(zone.id);
      }
    });
    floorConfigs.forEach((floorConfig) => {
      [
        ...(window.FloorPlanElements?.items(plan, floorConfig) ?? floorConfig.items ?? []),
        ...FloorPlanOpenings.forFloor(plan, floorConfig),
      ].forEach((object) => {
        if (!object.id) return;
        if (FloorPlanValidation.isReservedId(object.id)) {
          plan.errors.push({
            category: "object",
            id: object.id,
            opening: object,
            message: `ID reservado: ${object.id}`,
          });
        } else if (plan.globalObjectIds?.has(object.id)) {
          plan.errors.push({
            category: "object",
            id: object.id,
            opening: object,
            message: `ID global duplicado: ${object.id}`,
          });
        } else {
          plan.globalObjectIds.add(object.id);
        }
      });
    });
  },

  visibleZones(plan, config, floorConfig) {
    const globalZones = config.floors ? (config.zones ?? []) : [];
    return [...globalZones, ...(floorConfig.zones ?? [])];
  },

  visibleRoofs(plan, config, floorConfig) {
    const globalRoofs = config.floors ? (config.roofs ?? []) : [];
    return [...globalRoofs, ...(floorConfig.roofs ?? [])];
  },

  visibleGuides(plan, config, floorConfig) {
    const globalGuides = config.floors ? (config.guides ?? []) : [];
    return [...globalGuides, ...(floorConfig.guides ?? [])];
  },

  collectFloorFeatureErrors(plan, floorConfig) {
    const errors = [];
    const scoped = FloorPlanGeometry.inContext(plan, {
      floorZ: Number(floorConfig.z0 ?? 0), floorId: floorConfig.id ?? null,
    });
    (floorConfig.zones ?? []).forEach((zone, index) => {
      try {
        scoped.normalizeGeometry(zone);
      } catch (error) {
        errors.push({
          index,
          opening: zone,
          category: "zone",
          message: error.message,
        });
      }
    });
    (window.FloorPlanElements?.items(scoped, floorConfig) ?? floorConfig.items ?? []).forEach((item, index) => {
      try {
        scoped.normalizeGeometry(scoped.resolveItemType(item));
      } catch (error) {
        errors.push({
          index,
          opening: item,
          category: "item",
          message: error.message,
        });
      }
    });
    [
      ...FloorPlanOpenings.forFloor(scoped, floorConfig),
    ].forEach((opening, index) => {
      if (scoped.isVerticalOpening(opening)) return;
      try {
        scoped.normalizeOpening(opening);
      } catch (error) {
        errors.push({
          index,
          opening,
          category: opening.type === "door" ? "door" : opening.type === "window" ? "window" : "opening",
          message: error.message,
        });
      }
    });
    return errors;
  },

  validateInactiveFloorFeatures(plan, config, activeFloorIndex) {
    (config.floors ?? []).forEach((floor, index) => {
      if (index !== activeFloorIndex) plan.errors.push(...this.collectFloorFeatureErrors(plan, floor));
    });
  },

  prepareGlobalLists(plan, config) {
    const floors = config.floors ?? [{ id: null, label: null, ...config }];
    plan.allStairs = (plan.model?.stairs ?? []).filter(({ stair }) => plan.stairDefinitions?.get(stair.id) === stair)
      .map(({ stair, floor, floorId, floorLabel }) => ({
        id: stair.id, label: stair.label || stair.id, stair, floor, floorId, floorLabel,
        reference: plan.roomReferences.get(stair.id),
      }));
    plan.allRooms = [...plan.roomDefinitions.entries()].filter(([id]) => !plan.stairDefinitions?.has(id)).map(([id, room]) => {
      const floor = floors.find((floorConfig) =>
        (floorConfig.rooms ?? []).includes(room),
      );
      const reference = plan.roomReferences.get(id);
      return {
        id,
        label: room.label || id,
        floorId: floor?.id,
        floorLabel: floor?.label,
        reference,
      };
    });
    plan.allItems = [];
    plan.allOpenings = [];
    plan.allWindows = [];
    plan.allRoofs = [];
    const globalRoofs = config.floors ? (config.roofs ?? []) : [];
    globalRoofs.forEach((roof) => {
      const baseDefinition = roof.base ?? roof;
      const floor = FloorPlanRoofGeometry.floorForRoof(plan, roof, baseDefinition);
      plan.allRoofs.push({
        ...roof,
        floorId: floor?.id ?? null,
        floorLabel: floor?.label ?? null,
      });
    });
    floors.forEach((floorConfig) => {
      const scoped = FloorPlanGeometry.inContext(plan, {
        floorZ: Number(floorConfig.z0 ?? 0), floorId: floorConfig.id ?? null,
      });
      (floorConfig.roofs ?? []).forEach((roof) => {
        plan.allRoofs.push({
          ...roof,
          floorId: floorConfig.id,
          floorLabel: floorConfig.label,
        });
      });
      (window.FloorPlanElements?.items(scoped, floorConfig) ?? floorConfig.items ?? []).forEach((item) => {
        try {
          const resolvedItem = scoped.resolveItemType(item);
          const geometry = scoped.normalizeGeometry(resolvedItem);
          plan.allItems.push({
            ...resolvedItem,
            ...geometry,
            floorId: floorConfig.id,
            floorLabel: floorConfig.label,
          });
        } catch {
          // The active-floor render path records the detailed error.
        }
      });
      FloorPlanOpenings.forFloor(scoped, floorConfig).forEach((opening) => {
        if (scoped.isVerticalOpening(opening)) return;
        try {
          const feature = scoped.normalizeOpening(opening);
          const target =
            feature.type === "window" ? plan.allWindows : plan.allOpenings;
          target.push({
            ...feature,
            floorId: floorConfig.id,
            floorLabel: floorConfig.label,
          });
          const transom = FloorPlanOpenings.transomForDoor(scoped, feature);
          if (transom) plan.allWindows.push({
            ...transom,
            floorId: floorConfig.id,
            floorLabel: floorConfig.label,
          });
        } catch {
          // Validation and rendering record the error with its source data.
        }
      });
    });
  },

  createRoomReference(plan, id) {
    const reference = {
      dataset: { id, label: plan.roomDefinitions.get(id)?.label || id },
      x0: () => plan.getRoomGeometry(id).x0(),
      x1: () => plan.getRoomGeometry(id).x1(),
      xc: () => plan.getRoomGeometry(id).xc(),
      y0: () => plan.getRoomGeometry(id).y0(),
      y1: () => plan.getRoomGeometry(id).y1(),
      yc: () => plan.getRoomGeometry(id).yc(),
      z0: () => plan.getRoomGeometry(id).z0(),
      z1: () => plan.getRoomGeometry(id).z1(),
      zc: () => plan.getRoomGeometry(id).zc(),
      h: () => plan.getRoomGeometry(id).h(),
      w: () => plan.getRoomGeometry(id).w(),
      l: () => plan.getRoomGeometry(id).l(),
      area: () => plan.getRoomGeometry(id).area(),
      wallState: (side) => plan.getRoomGeometry(id).wallState(side),
      hasWall: (side) => plan.getRoomGeometry(id).hasWall(side),
      get normalizedParts() {
        return plan.getRoomGeometry(id).normalizedParts;
      },
      get nominalGeometry() {
        return plan.getRoomGeometry(id).nominalGeometry;
      },
      get geometryParts() {
        return plan.getRoomGeometry(id).geometryParts;
      },
      get partReferences() {
        return plan.getRoomGeometry(id).partReferences;
      },
    };
    FloorPlanGeometryBox.attach(reference, {
      compound: Boolean(plan.roomDefinitions.get(id)?.parts?.length),
      label: id,
    });
    return reference;
  },

  normalizeParts(plan, parts) {
    const owner = parts[0]?.id && plan.partOwners?.get(parts[0].id);
    const parent = owner && plan.roomDefinitions?.get(owner);
    if (parent && FloorPlanStairPath.isPath(parent)) return plan.getRoomGeometry(owner).normalizedParts;
    const localReferences = new Map();
    const scoped = FloorPlanGeometry.inContext(plan, {
      partScopes: [...FloorPlanGeometry.context(plan).partScopes, localReferences],
    });
    const geometries = new Map();
    const pending = new Set();
    const geometryAt = (index) => {
      if (geometries.has(index)) return geometries.get(index);
      const part = parts[index];
      if (pending.has(index)) throw new Error(`Referência circular entre partes: ${part.id || index + 1}`);
      pending.add(index);
      try {
        const geometry = { ...scoped.normalizeGeometry(part), id: part.id || `part-${index + 1}` };
        geometries.set(index, geometry);
        return geometry;
      } finally {
        pending.delete(index);
      }
    };
    parts.forEach((part, index) => {
      const id = part.id || `part-${index + 1}`;
      const reference = FloorPlanGeometryBox.fromGeometry(() => geometryAt(index), { label: id });
      localReferences.set(id, reference);
    });
    return parts.map((_, index) => geometryAt(index));
  },

  getRoomGeometry(plan, id) {
    if (id === undefined || id === null || String(id).trim() === "") {
      const knownIds = [...(plan.roomDefinitions?.keys() ?? [])].join(", ");
      const caller = new Error().stack
        ?.split("\n")
        .slice(2, 5)
        .join(" <- ");
      throw new Error(
        `Missing room reference ID while resolving geometry. Known room IDs: ${knownIds || "none"}. Call chain: ${caller || "unavailable"}`,
      );
    }
    if (plan.roomGeometryCache?.has(id)) return plan.roomGeometryCache.get(id);
    if (!plan.roomDefinitions?.has(id))
      throw new Error(`Unknown room reference: ${id}`);
    if (plan.roomGeometryStack?.has(id))
      throw new Error(`Circular room reference: ${id}`);

    plan.roomGeometryStack.add(id);
    try {
      const room = plan.roomDefinitions.get(id);
      const owningFloor = plan.roomFloorConfigs?.get(id);
      const scoped = FloorPlanGeometry.inContext(plan, {
        ...(owningFloor ? { floorZ: Number(owningFloor.z0 ?? 0), floorId: owningFloor.id ?? null } : {}),
        itemReferences: false,
      });
      const { normalizedParts, nominalGeometry } = FloorPlanGeometryDomain.normalizeRoomGeometry(scoped, room);
      if (plan.stairDefinitions?.has(id)) {
        for (const part of normalizedParts) {
          const classes = String(part.classes ?? "").split(/\s+/);
          if (classes.includes("stair-flight")) {
            if (!(part.h > 0)) throw new Error("Lance de escada precisa ter altura positiva");
            FloorPlanGeometry.stairSteps(part);
          } else if (classes.includes("stair-landing") && part.h !== 0) {
            throw new Error("Patamar de escada precisa ter altura zero");
          }
        }
      }
      const compound = Boolean(room.parts?.length);
      const walls = plan.normalizeWalls(room.walls);
      const reference = FloorPlanGeometryBox.fromGeometry(nominalGeometry, { compound, label: id });
      Object.assign(reference, {
        nominalGeometry,
        normalizedParts,
        // Compatibility projection: analyses still expect axis-aligned XY parts.
        geometryParts: normalizedParts.map(({ x, y, w, l }) => ({ x, y, w, l })),
        area: () => normalizedParts.reduce((total, part) => total + part.w * part.l, 0),
        wallState: (side) => walls[side],
        hasWall: (side) => walls[side] === "solid",
        partReferences: new Map(compound ? normalizedParts.map((part) => [part.id,
          FloorPlanGeometryBox.fromGeometry(part, { label: part.id }),
        ]) : []),
      });
      plan.roomGeometryCache.set(id, reference);
      return reference;
    } finally {
      plan.roomGeometryStack.delete(id);
    }
  },
};

window.FloorPlanReferences = FloorPlanReferences;
