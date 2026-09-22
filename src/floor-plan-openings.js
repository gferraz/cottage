const FloorPlanOpenings = {
  roomOpenings(plan, floorConfig) {
    return (floorConfig.rooms ?? []).flatMap((room) =>
      (room.openings ?? []).map((opening) => {
        const from = String(opening.from ?? "").trim();
        const relativeWall = /^(top|right|bottom|left)$/.test(from);
        return {
          ...opening,
          from: relativeWall ? `${room.id}.${from}` : from,
          roomId: room.id,
        };
      }),
    );
  },

  addOpening(plan, opening) {
    if (plan.isVerticalOpening(opening)) {
      return plan.addVerticalOpening(opening);
    }
    const passage = plan.normalizeOpening(opening);
    if (passage.type === "window") {
      plan.windows.push(passage);
      plan.renderWallFeature(passage, "plan-window");
      return passage;
    }
    plan.openings.push(passage);

    plan.renderWallFeature(passage, "plan-opening");
    return passage;
  },

  isVerticalOpening(plan, opening) {
    const floors = plan.currentConfig?.floors ?? [];
    const from = String(opening?.from ?? "").trim();
    const to = String(opening?.to ?? "").trim();
    return (
      (Array.isArray(opening?.size) ||
        opening?.rectangle !== undefined ||
        opening?.inset !== undefined ||
        opening?.outset !== undefined) &&
      floors.some((floor) => floor.id === from) &&
      floors.some((floor) => floor.id === to)
    );
  },

  addVerticalOpening(plan, opening, floorConfig = null) {
    const floors = plan.currentConfig?.floors ?? [plan.currentConfig];
    const fromId = String(opening.from ?? "").trim();
    const toId = String(opening.to ?? "").trim();
    const fromFloor = floors.find((floor) => floor.id === fromId);
    const toFloor = floors.find((floor) => floor.id === toId);
    if (!fromFloor)
      throw new Error(`Unknown vertical opening source floor: ${fromId}`);
    if (!toFloor)
      throw new Error(`Unknown vertical opening target floor: ${toId}`);
    if (fromId === toId)
      throw new Error("Abertura vertical precisa conectar pisos diferentes");
    const fromHeight = Number(fromFloor.z0 ?? 0);
    const toHeight = Number(toFloor.z0 ?? 0);
    if (
      ![fromHeight, toHeight].every(Number.isFinite) ||
      fromHeight === toHeight
    ) {
      throw new Error(
        "Os pisos da abertura vertical precisam ter elevações diferentes",
      );
    }

    const geometry = plan.normalizeGeometryAtFloor(opening, fromFloor);
    const { x, y, w: width, l: length } = geometry;
    if (
      ![x, y, width, length].every(Number.isFinite) ||
      width <= 0 ||
      length <= 0
    ) {
      throw new Error("Abertura vertical precisa de dimensões válidas");
    }

    const passage = {
      ...opening,
      id: opening.id || `${fromId}-${toId}-vertical`,
      x,
      y,
      w: width,
      l: length,
      z0: fromHeight,
      h: 0,
      from: fromId,
      to: toId,
    };
    const element = plan.add({
      pos: [x, y, fromHeight],
      size: [width, length, 0],
      classes: "floor-opening vertical-opening",
      title: `Abertura vertical: ${passage.id}`,
    });
    element.dataset.from = fromId;
    element.dataset.to = toId;
    if ((floorConfig?.id ?? plan.currentFloorId) === fromId) {
      plan.root.querySelectorAll("[data-spanning-stair]").forEach((stair) => {
        plan.clipProjection(
          stair,
          { x: stair.x0(), y: stair.y0(), w: stair.w(), l: stair.l() },
          passage,
        );
      });
      plan.renderLowerFloorProjection(floors, fromFloor, fromHeight, passage);
    }
    return passage;
  },

  clipProjection(plan, element, geometry, opening) {
    const top = Math.max(0, opening.y - geometry.y);
    const right = Math.max(
      0,
      geometry.x + geometry.w - (opening.x + opening.w),
    );
    const bottom = Math.max(
      0,
      geometry.y + geometry.l - (opening.y + opening.l),
    );
    const left = Math.max(0, opening.x - geometry.x);
    element.style.clipPath = `inset(calc(${top} * var(--m)) calc(${right} * var(--m)) calc(${bottom} * var(--m)) calc(${left} * var(--m)))`;
  },

  renderLowerFloorProjection(plan, floors, fromFloor, fromHeight, opening) {
    const lowerFloors = floors
      .filter((floor) => Number(floor.z0 ?? 0) < fromHeight)
      .sort((first, second) => Number(second.z0 ?? 0) - Number(first.z0 ?? 0));
    const lowerFloor = lowerFloors[0];
    if (!lowerFloor) return;
    const lowerFloorHeight = Number(lowerFloor.z0 ?? 0);

    const compoundGeometry = (definition) => {
      const parts = plan.normalizeParts(definition.parts);
      const x = Math.min(...parts.map((part) => part.x));
      const y = Math.min(...parts.map((part) => part.y));
      const x1 = Math.max(...parts.map((part) => part.x + part.w));
      const y1 = Math.max(...parts.map((part) => part.y + part.l));
      const z0 = Math.min(...parts.map((part) => part.z0));
      const z1 = Math.max(...parts.map((part) => part.z1));
      return { x, y, w: x1 - x, l: y1 - y, z0, z1, h: z1 - z0 };
    };

    const addProjection = (definition, geometry, room = false) => {
      const overlaps =
        geometry.x < opening.x + opening.w &&
        geometry.x + geometry.w > opening.x &&
        geometry.y < opening.y + opening.l &&
        geometry.y + geometry.l > opening.y;
      if (!overlaps || (geometry.z1 < fromHeight && geometry.z0 < fromHeight))
        return;
      const projected = room
        ? plan.addRoom({
            ...definition,
            derived: true,
            container: plan.projectionLayer,
            pos: [geometry.x, geometry.y, geometry.z0],
            size: [geometry.w, geometry.l, geometry.h],
            classes: `${definition.classes || ""} floor-projection`.trim(),
          })
        : plan.add({
            ...definition,
            container: plan.projectionLayer,
            pos: [geometry.x, geometry.y, geometry.z0],
            size: [geometry.w, geometry.l, geometry.h],
            classes: `${definition.classes || ""} floor-projection`.trim(),
            showLabel: false,
          });
      plan.clipProjection(projected, geometry, opening);
    };

    (lowerFloor.rooms ?? []).forEach((room) => {
      const previousHeight = plan.currentFloorHeight;
      plan.currentFloorHeight = lowerFloorHeight;
      try {
        const geometry = room.parts?.length
          ? compoundGeometry(room)
          : plan.normalizeGeometry(room);
        addProjection(room, geometry, true);
      } catch (error) {
        plan.errors.push({
          opening: room,
          category: "projection",
          message: error.message,
        });
      } finally {
        plan.currentFloorHeight = previousHeight;
      }
    });
    (lowerFloor.items ?? []).forEach((item) => {
      try {
        addProjection(item, plan.normalizeGeometryAtFloor(item, lowerFloor));
      } catch (error) {
        plan.errors.push({
          opening: item,
          category: "projection",
          message: error.message,
        });
      }
    });
  },

  addVisibleVerticalOpenings(plan, config, floorConfig) {
    const floors = config.floors ?? [config];
    const currentFloorId = floorConfig.id;
    floors.forEach((sourceFloor) => {
      (sourceFloor.openings ?? []).forEach((opening) => {
        if (!plan.isVerticalOpening(opening)) return;
        const targetId = String(opening.to ?? "").trim();
        const sourceFloorId = String(opening.from ?? "").trim();
        const targetFloorId = String(opening.to ?? "").trim();
        if (
          currentFloorId !== sourceFloorId &&
          currentFloorId !== targetFloorId
        )
          return;
        try {
          plan.addVerticalOpening(opening, floorConfig);
        } catch (error) {
          plan.errors.push({
            opening,
            category: "opening",
            message: error.message,
          });
        }
      });
    });
  },

  addWindow(plan, window) {
    const feature = plan.normalizeOpening({ ...window, type: "window" });
    plan.windows.push(feature);

    plan.renderWallFeature(feature, "plan-window");
    return feature;
  },

  renderWallFeature(plan, feature, baseClass) {
    const wallThickness = 0.14;
    const element = plan.add({
      x: feature.horizontal ? feature.x : feature.x - wallThickness / 2,
      y: feature.horizontal ? feature.y - wallThickness / 2 : feature.y,
      w: feature.horizontal ? feature.w : wallThickness,
      l: feature.horizontal ? wallThickness : feature.w,
      classes: `${baseClass} opening-${feature.type} opening-${feature.horizontal ? "horizontal" : "vertical"}`,
      title: `${feature.type}: ${feature.id}`,
    });
    element.dataset.openingRoomId = feature.roomId;
    if (feature.type === "opening") {
      const sourceRoom = plan.rooms.get(feature.roomId);
      const sourceBackground = sourceRoom
        ? getComputedStyle(sourceRoom).backgroundColor
        : "";
      if (sourceBackground)
        element.style.setProperty(
          "--opening-source-background",
          sourceBackground,
        );
    }
  },

  normalizeOpening(plan, opening) {
    const match = String(opening.from ?? "")
      .trim()
      .match(/^(.+)\.(top|left|right|bottom)$/);
    if (!match)
      throw new Error(`Invalid opening wall reference: ${opening.from}`);

    const [, roomId, wall] = match;
    const room = plan.rooms.get(roomId);
    if (!room) throw new Error(`Unknown opening room reference: ${roomId}`);
    if (!room.hasWall(wall))
      throw new Error(`Room ${roomId} has no solid ${wall} wall`);

    const target = String(opening.to ?? "exterior").trim() || "exterior";
    if (target !== "exterior" && !plan.rooms?.has(target)) {
      throw new Error(`Unknown opening target: ${target}`);
    }

    const verticalDefaults = {
      door: { w: 0.8, z0: 0, h: 2.1 },
      opening: { w: 1.0, z0: 0, h: 2.1 },
      window: { w: 0.9, z0: 0.9, h: 1.5 },
      ...(plan.catalog.openings || {}),
    };
    const defaults = Object.fromEntries(
      Object.entries(verticalDefaults).map(([key, definition]) => [
        key,
        definition.w,
      ]),
    );
    const type = String(opening.type ?? "door").trim();
    if (!(type in defaults))
      throw new Error(`Unsupported opening type: ${type}`);

    const horizontal = wall === "top" || wall === "bottom";
    const wallStart = horizontal ? room.x0() : room.y0();
    const wallLength = horizontal ? room.w() : room.l();
    let sharedStart = null;
    let sharedEnd = null;
    let targetRoom = null;
    const sourceWall = plan.wallSegment(room, wall);
    if (target !== "exterior") {
      targetRoom = plan.rooms.get(target);
      const oppositeWall = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
      }[wall];
      const targetWall = plan.wallSegment(targetRoom, oppositeWall);
      if (Math.abs(sourceWall.coordinate - targetWall.coordinate) < 1e-9) {
        sharedStart = Math.max(sourceWall.start, targetWall.start);
        sharedEnd = Math.min(sourceWall.end, targetWall.end);
        if (sharedEnd <= sharedStart) {
          sharedStart = null;
          sharedEnd = null;
        }
      }
    }

    const sharedLength =
      sharedStart === null ? wallLength : sharedEnd - sharedStart;
    const width = Number(
      opening.w ?? opening.length ?? Math.min(defaults[type], sharedLength),
    );
    if (!(width > 0))
      throw new Error("Opening width must be greater than zero");
    if (width > wallLength)
      throw new Error(`Opening is wider than wall ${opening.from}`);
    if (width > sharedLength)
      throw new Error(
        `Opening is wider than the shared wall segment ${opening.from}`,
      );

    const relativePosition = horizontal
      ? (opening.dx ?? opening.position ?? opening.x)
      : (opening.dy ?? opening.position ?? opening.y);
    const hasPosition = relativePosition !== undefined;
    const position = hasPosition
      ? plan.resolve(relativePosition)
      : sharedStart === null
        ? (wallLength - width) / 2
        : sharedStart - wallStart + (sharedLength - width) / 2;
    if (!(position >= 0) || position + width > wallLength) {
      throw new Error(`Opening position is outside wall ${opening.from}`);
    }

    if (target !== "exterior") {
      const openingStart = wallStart + position;
      const openingEnd = openingStart + width;
      if (sharedStart !== null) {
        if (openingStart < sharedStart || openingEnd > sharedEnd) {
          throw new Error(`Room ${target} is not connected to ${opening.from}`);
        }
      } else {
        const epsilon = 1e-9;
        const targetContainsOpening = horizontal
          ? sourceWall.coordinate >= targetRoom.y0() - epsilon &&
            sourceWall.coordinate <= targetRoom.y1() + epsilon &&
            openingStart >= targetRoom.x0() - epsilon &&
            openingEnd <= targetRoom.x1() + epsilon
          : sourceWall.coordinate >= targetRoom.x0() - epsilon &&
            sourceWall.coordinate <= targetRoom.x1() + epsilon &&
            openingStart >= targetRoom.y0() - epsilon &&
            openingEnd <= targetRoom.y1() + epsilon;
        if (!targetContainsOpening) {
          throw new Error(
            `Room ${target} is not connected to or containing the opening from ${opening.from}`,
          );
        }
      }
    }

    const shift = hasPosition ? Math.round(position * 100) : 0;
    const id = `${roomId}-${target}-${shift}`;
    const openingDefaults = verticalDefaults[type] || {};
    const floorZ0 = Number(plan.currentFloorHeight) || 0;
    const z0 =
      opening.z0 === undefined
        ? floorZ0 + plan.resolve(openingDefaults.z0 ?? 0)
        : plan.resolve(opening.z0);
    const height = plan.resolve(opening.h ?? openingDefaults.h ?? 2.1);
    if (![z0, height].every(Number.isFinite) || z0 < 0 || height <= 0) {
      throw new Error(
        "Opening z0 must be non-negative and h must be greater than zero",
      );
    }
    const normalized = {
      ...opening,
      id,
      from: opening.from,
      to: target,
      type,
      position,
      w: width,
      roomId,
      wall,
      wallLength,
      x: horizontal
        ? wallStart + position
        : wall === "left"
          ? room.x0()
          : room.x1(),
      y: horizontal
        ? wall === "top"
          ? room.y0()
          : room.y1()
        : wallStart + position,
      horizontal,
      z0,
      z1: z0 + height,
      h: height,
    };
    FloorPlanGeometryBox.attach(normalized, {
      label: normalized.id,
    });
    return normalized;
  },

  wallSegment(plan, room, wall) {
    // Keep this helper compatible with older callers that passed only
    // (room, wall) while the public facade now passes (plan, room, wall).
    if (wall === undefined && typeof room === "string") {
      wall = room;
      room = plan;
      plan = null;
    }
    const geometry =
      typeof room.x0 === "function" &&
      typeof room.x1 === "function" &&
      typeof room.y0 === "function" &&
      typeof room.y1 === "function"
        ? room
        : typeof plan?.normalizeGeometry === "function"
          ? plan.normalizeGeometry(room)
          : room;
    const x0 = typeof geometry.x0 === "function" ? geometry.x0() : geometry.x;
    const x1 = typeof geometry.x1 === "function" ? geometry.x1() : geometry.x + geometry.w;
    const y0 = typeof geometry.y0 === "function" ? geometry.y0() : geometry.y;
    const y1 = typeof geometry.y1 === "function" ? geometry.y1() : geometry.y + geometry.l;
    const horizontal = wall === "top" || wall === "bottom";
    return {
      coordinate: horizontal
        ? wall === "top"
          ? y0
          : y1
        : wall === "left"
          ? x0
          : x1,
      start: horizontal ? x0 : y0,
      end: horizontal ? x1 : y1,
    };
  },
};

window.FloorPlanOpenings = FloorPlanOpenings;
