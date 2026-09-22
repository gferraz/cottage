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
    plan.roomGeometryCache.clear();
    plan.roomGeometryStack.clear();
    plan.invalidRoomIds.clear();
    plan.rooms.clear();
    plan.roomReferences.clear();
    plan.references.clear();
    const collected = FloorPlanValidation.collectRoomDefinitions(
      plan.model || FloorPlanModel.fromConfig(config),
    );
    plan.roomDefinitions = collected.definitions;
    plan.errors.push(...collected.errors);

    plan.roomDefinitions.forEach((_room, id) => {
      const reference = plan.createRoomReference(id);
      plan.rooms.set(id, reference);
      plan.roomReferences.set(id, reference);
      plan.references.set(id, reference);
    });
    plan.registerGlobalPartReferences();
    plan.registerFloorReferences(config);
    plan.registerStaticGuideReferences(config);
    plan.registerStaticZoneReferences(config);
    plan.registerRoofReferences(config);
    plan.roomDefinitions.forEach((_room, id) => {
      try {
        plan.getRoomGeometry(id);
      } catch (error) {
        plan.invalidRoomIds.add(id);
        plan.errors.push({
          category: "room",
          id,
          opening: plan.roomDefinitions.get(id),
          message: error.message,
        });
      }
    });
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
      const height = Number(floorConfig.h ?? 0);
      plan.references.set(floorConfig.id, {
        z0: () => height,
        z1: () => height,
        zc: () => height,
        h: () => height,
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
          z0: plan.currentFloorHeight,
        });
      const endpointY = () =>
        plan.resolve(toYValue, {
          x0: startX(),
          y0: startY(),
          z0: plan.currentFloorHeight,
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
    const floorZones = (config.floors ?? [config]).flatMap(
      (floorConfig) => floorConfig.zones ?? [],
    );
    const zones = config.floors
      ? [...(config.zones ?? []), ...floorZones]
      : floorZones;
    zones.forEach((zone) => {
      if (!zone.id || plan.references?.has(zone.id)) return;
      const geometry = () => plan.normalizeGeometry(zone);
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

  registerRoofReferences(plan, config) {
    const roofs = config.floors
      ? [
          ...(config.roofs ?? []),
          ...config.floors.flatMap((floor) => floor.roofs ?? []),
        ]
      : config.roofs ?? [];

    roofs.forEach((roof) => {
      if (
        !roof.id ||
        FloorPlanValidation.isReservedId(roof.id) ||
        plan.references.has(roof.id)
      ) {
        return;
      }
      try {
        const base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof);
        plan.references.set(roof.id, base);
      } catch (error) {
        plan.errors.push({
          category: "roof",
          id: roof.id,
          opening: roof,
          message: error.message,
        });
      }
    });
  },

  validateGlobalObjectIds(plan, config) {
    plan.globalObjectIds = new Set([
      ...plan.roomDefinitions.keys(),
      ...(plan.partOwners?.keys() ?? []),
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
        ...(floorConfig.items ?? []),
        ...(floorConfig.openings ?? []),
        ...plan.roomOpenings(floorConfig),
        ...(floorConfig.windows ?? []),
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

  validateInactiveFloorFeatures(plan, config, activeFloorIndex) {
    (config.floors ?? []).forEach((floorConfig, floorIndex) => {
      if (floorIndex === activeFloorIndex) return;
      (floorConfig.zones ?? []).forEach((zone, index) => {
        try {
          plan.normalizeGeometry(zone);
        } catch (error) {
          plan.errors.push({
            index,
            opening: zone,
            category: "zone",
            message: error.message,
          });
        }
      });
      (floorConfig.items ?? []).forEach((item, index) => {
        try {
          plan.normalizeGeometry(plan.resolveItemType(item));
        } catch (error) {
          plan.errors.push({
            index,
            opening: item,
            category: "item",
            message: error.message,
          });
        }
      });
      [...(floorConfig.openings ?? []), ...plan.roomOpenings(floorConfig)].forEach((opening, index) => {
        if (plan.isVerticalOpening(opening)) return;
        try {
          plan.normalizeOpening(opening);
        } catch (error) {
          plan.errors.push({
            index,
            opening,
            category: opening.type === "window" ? "window" : "opening",
            message: error.message,
          });
        }
      });
      (floorConfig.windows ?? []).forEach((window, index) => {
        try {
          plan.normalizeOpening({ ...window, type: "window" });
        } catch (error) {
          plan.errors.push({
            index,
            opening: window,
            category: "window",
            message: error.message,
          });
        }
      });
    });
  },

  prepareGlobalLists(plan, config) {
    const floors = config.floors ?? [{ id: null, label: null, ...config }];
    plan.allRooms = [...plan.roomDefinitions.entries()].map(([id, room]) => {
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
      plan.allRoofs.push({ ...roof, floorId: null, floorLabel: null });
    });
    floors.forEach((floorConfig) => {
      const previousFloorHeight = plan.currentFloorHeight;
      plan.currentFloorHeight = Number(floorConfig.h ?? 0);
      (floorConfig.roofs ?? []).forEach((roof) => {
        plan.allRoofs.push({
          ...roof,
          floorId: floorConfig.id,
          floorLabel: floorConfig.label,
        });
      });
      (floorConfig.items ?? []).forEach((item) => {
        try {
          const resolvedItem = plan.resolveItemType(item);
          const geometry = plan.normalizeGeometry(resolvedItem);
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
      [...(floorConfig.openings ?? []), ...plan.roomOpenings(floorConfig)].forEach((opening) => {
        if (plan.isVerticalOpening(opening)) return;
        try {
          const feature = plan.normalizeOpening(opening);
          const target =
            feature.type === "window" ? plan.allWindows : plan.allOpenings;
          target.push({
            ...feature,
            floorId: floorConfig.id,
            floorLabel: floorConfig.label,
          });
        } catch {
          // Validation and rendering record the error with its source data.
        }
      });
      (floorConfig.windows ?? []).forEach((window) => {
        try {
          const feature = plan.normalizeOpening({ ...window, type: "window" });
          plan.allWindows.push({
            ...feature,
            floorId: floorConfig.id,
            floorLabel: floorConfig.label,
          });
        } catch {
          // Validation and rendering record the error with its source data.
        }
      });
      plan.currentFloorHeight = previousFloorHeight;
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
    const localReferences = new Map();
    plan.partReferenceStack.push(localReferences);
    try {
      return parts.map((part, index) => {
        const geometry = {
          ...plan.normalizeGeometry(part),
          id: part.id || `part-${index + 1}`,
        };
        const reference = {
          x0: () => geometry.x,
          x1: () => geometry.x + geometry.w,
          xc: () => geometry.x + geometry.w / 2,
          y0: () => geometry.y,
          y1: () => geometry.y + geometry.l,
          yc: () => geometry.y + geometry.l / 2,
          z0: () => geometry.z0,
          z1: () => geometry.z1,
          zc: () => (geometry.z0 + geometry.z1) / 2,
          h: () => geometry.h,
          w: () => geometry.w,
          l: () => geometry.l,
          area: () => geometry.w * geometry.l,
        };
        FloorPlanGeometryBox.attach(reference, { label: geometry.id });
        localReferences.set(geometry.id, reference);
        return geometry;
      });
    } finally {
      plan.partReferenceStack.pop();
    }
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
      const parts = room.parts?.length
        ? plan.normalizeParts(room.parts)
        : undefined;
      const geometry = parts?.length
        ? {
            x: Math.min(...parts.map((part) => part.x)),
            y: Math.min(...parts.map((part) => part.y)),
            w:
              Math.max(...parts.map((part) => part.x + part.w)) -
              Math.min(...parts.map((part) => part.x)),
            l:
              Math.max(...parts.map((part) => part.y + part.l)) -
              Math.min(...parts.map((part) => part.y)),
          }
        : plan.normalizeGeometry(room);
      const walls = plan.normalizeWalls(room.walls);
      const reference = {
        x0: () => geometry.x,
        x1: () => geometry.x + geometry.w,
        xc: () => geometry.x + geometry.w / 2,
        y0: () => geometry.y,
        y1: () => geometry.y + geometry.l,
        yc: () => geometry.y + geometry.l / 2,
        z0: () => geometry.z0,
        z1: () => geometry.z1,
        zc: () => (geometry.z0 + geometry.z1) / 2,
        h: () => geometry.h,
        w: () => geometry.w,
        l: () => geometry.l,
        area: () =>
          parts?.length
            ? parts.reduce((total, part) => total + part.w * part.l, 0)
            : geometry.w * geometry.l,
        wallState: (side) => walls[side],
        hasWall: (side) => walls[side] === "solid",
        geometryParts: parts?.length
          ? parts.map(({ x, y, w, l }) => ({ x, y, w, l }))
          : [{ x: geometry.x, y: geometry.y, w: geometry.w, l: geometry.l }],
        partReferences: new Map(
          (parts ?? []).map((part) => {
            const reference = {
              x0: () => part.x,
              x1: () => part.x + part.w,
              xc: () => part.x + part.w / 2,
              y0: () => part.y,
              y1: () => part.y + part.l,
              yc: () => part.y + part.l / 2,
              z0: () => part.z0,
              z1: () => part.z1,
              zc: () => (part.z0 + part.z1) / 2,
              h: () => part.h,
              w: () => part.w,
              l: () => part.l,
              area: () => part.w * part.l,
            };
            FloorPlanGeometryBox.attach(reference, { label: part.id });
            return [part.id, reference];
          }),
        ),
      };
      FloorPlanGeometryBox.attach(reference, {
        compound: Boolean(parts?.length),
        label: id,
      });
      plan.roomGeometryCache.set(id, reference);
      return reference;
    } finally {
      plan.roomGeometryStack.delete(id);
    }
  },
};

window.FloorPlanReferences = FloorPlanReferences;
