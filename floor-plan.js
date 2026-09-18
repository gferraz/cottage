class FloorPlan {
  constructor({ root, terrainLayer = null, guidesLayer = null, viewportSummary = null, titleElement = null, floorSelect = null, roomList = null, itemList = null, floorSummary = null, roomCountSummary = null, summary = null, usefulAreaSummary = null, boundsSummary = null, terrainSummary = null, openingList = null, windowList = null, naturalList = null, errorList = null, downloadButton = null, markdownButton = null, dxfButton = null, jsonInput = null, reloadButton = null, layerButton = null, scale = 56 }) {
    this.root = root;
    this.terrainLayer = terrainLayer;
    this.guidesLayer = guidesLayer;
    this.viewportSummary = viewportSummary;
    this.titleElement = titleElement;
    this.floorSelect = floorSelect;
    this.roomList = roomList;
    this.itemList = itemList;
    this.floorSummary = floorSummary;
    this.roomCountSummary = roomCountSummary;
    this.summary = summary;
    this.usefulAreaSummary = usefulAreaSummary;
    this.boundsSummary = boundsSummary;
    this.terrainSummary = terrainSummary;
    this.openingList = openingList;
    this.windowList = windowList;
    this.naturalList = naturalList;
    this.errorList = errorList;
    this.downloadButton = downloadButton;
    this.markdownButton = markdownButton;
    this.dxfButton = dxfButton;
    this.jsonInput = jsonInput;
    this.reloadButton = reloadButton;
    this.layerButton = layerButton;
    this.roomArea = 0;
    this.roomCount = 0;
    this.rooms = new Map();
    this.references = new Map();
    this.roomElements = [];
    this.stairElements = [];
    this.itemElements = [];
    this.zoneElements = [];
    this.openings = [];
    this.windows = [];
    this.naturalCommunications = [];
    this.errors = [];
    this.currentConfig = null;
    this.currentFloorId = null;
    this.currentFloorHeight = 0;
    this.currentSourceText = null;
    this.model = null;
    this.itemTypes = {};
    this.roomDefinitions = new Map();
    this.roomGeometryCache = new Map();
    this.roomGeometryStack = new Set();
    this.partReferenceStack = [];
    this.invalidRoomIds = new Set();
    this.allRooms = [];
    this.allItems = [];
    this.allOpenings = [];
    this.allWindows = [];
    this.terrainArea = 0;
    this.terrainDimensions = null;
    this.terrainReference = null;
    this.theme = { colors: { red: "#c94c4c", blue: "#4d7899", green: "#628b5a", gray: "#777", circulation: "#f5eede" } };
    this.viewport = { size: [20, 20], origin: [-4.25, -4.25] };
    this.viewportScale = scale;
    this.pointerPan = null;
    this.layerCutoff = null;
    this.projectionLayer = document.createElement("div");
    this.projectionLayer.className = "floor-projection-layer";
    root.prepend(this.projectionLayer);

    root.style.setProperty("--m", `${scale}px`);
    root.addEventListener("pointerdown", (event) => this.beginViewportPan(event));
    root.addEventListener("pointermove", (event) => this.updateViewportPan(event));
    root.addEventListener("pointerup", (event) => this.endViewportPan(event));
    root.addEventListener("pointercancel", (event) => this.endViewportPan(event));
    root.addEventListener("lostpointercapture", () => { this.pointerPan = null; });
    if (typeof ResizeObserver !== "undefined") {
      this.viewportResizeObserver = new ResizeObserver(() => this.resizeViewport());
      this.viewportResizeObserver.observe(root.parentElement || root);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", () => this.resizeViewport());
    }
    if (downloadButton) downloadButton.addEventListener("click", () => this.downloadHtml());
    if (markdownButton) markdownButton.addEventListener("click", () => this.downloadMarkdown());
    if (dxfButton) dxfButton.addEventListener("click", () => FloorPlanExport.downloadDxf(this));
    if (dxfButton) dxfButton.disabled = true;
    if (layerButton) {
      layerButton.disabled = true;
      layerButton.addEventListener("click", () => this.cycleLayer());
    }
    if (floorSelect) {
      floorSelect.disabled = true;
      floorSelect.addEventListener("change", () => {
        if (!this.currentConfig?.floors) return;
        const activeFloor = this.currentConfig.floors.findIndex((floorConfig) => floorConfig.id === floorSelect.value);
        if (activeFloor >= 0) this.load({ ...this.currentConfig, activeFloor });
      });
    }
    if (jsonInput) {
      jsonInput.addEventListener("change", async (event) => {
        const [file] = event.target.files;
        if (!file) return;

        try {
          await this.loadFile(file);
        } catch (error) {
          alert(`Não foi possível carregar a planta: ${error.message}`);
        } finally {
          event.target.value = "";
        }
      });
    }
    if (reloadButton) {
      reloadButton.disabled = true;
      reloadButton.addEventListener("click", async () => {
        try {
          await this.reload();
        } catch (error) {
          alert(`Não foi possível recarregar a planta: ${error.message}`);
        }
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeprint", () => this.preparePrint());
      window.addEventListener("afterprint", () => this.clearPrintScale());
    }
  }

  configureViewport(viewport) {
    const size = Array.isArray(viewport?.size) ? viewport.size.map(Number) : [20, 20];
    const origin = Array.isArray(viewport?.origin) ? viewport.origin.map(Number) : [-4.25, -4.25];
    if (size.length !== 2 || size.some((value) => !(value > 0))) {
      throw new Error("Viewport size must contain two positive metre values");
    }
    if (origin.length !== 2 || origin.some((value) => !Number.isFinite(value))) {
      throw new Error("Viewport origin must contain two numeric metre values");
    }
    this.viewport = { size, origin };
    this.root.style.setProperty("--viewport-width", size[0]);
    this.root.style.setProperty("--viewport-height", size[1]);
    this.root.style.setProperty("--viewport-origin-x", origin[0]);
    this.root.style.setProperty("--viewport-origin-y", origin[1]);
    this.resizeViewport();
  }

  resizeViewport() {
    const [width] = this.viewport.size;
    const availableWidth = this.root.parentElement?.clientWidth || width * this.viewportScale;
    const scale = Math.max(1, availableWidth / width);
    this.viewportScale = scale;
    this.root.style.setProperty("--m", `${scale}px`);
    this.updateViewportSummary();
  }

  updateViewportSummary() {
    if (!this.viewportSummary) return;
    const [width, height] = this.viewport.size;
    const [originX, originY] = this.viewport.origin;
    this.viewportSummary.textContent = `Viewport: ${this.formatMeters(width)}m × ${this.formatMeters(height)}m · origem (${this.formatMeters(originX)}, ${this.formatMeters(originY)})m · escala ${this.viewportScale.toFixed(2)} px/m`;
  }

  beginViewportPan(event) {
    if (event.button !== 0 || event.target.closest("button, select, input, a")) return;
    this.pointerPan = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: [...this.viewport.origin] };
    this.root.setPointerCapture(event.pointerId);
    this.root.classList.add("is-panning");
  }

  updateViewportPan(event) {
    if (!this.pointerPan || event.pointerId !== this.pointerPan.id) return;
    const dx = (event.clientX - this.pointerPan.x) / this.viewportScale;
    const dy = (event.clientY - this.pointerPan.y) / this.viewportScale;
    this.viewport.origin[0] = this.pointerPan.origin[0] - dx;
    this.viewport.origin[1] = this.pointerPan.origin[1] - dy;
    this.root.style.setProperty("--viewport-origin-x", this.viewport.origin[0]);
    this.root.style.setProperty("--viewport-origin-y", this.viewport.origin[1]);
    this.updateTerrainViewport();
    this.updateViewportSummary();
  }

  endViewportPan(event) {
    if (this.pointerPan && (!event || event.pointerId === this.pointerPan.id)) {
      this.pointerPan = null;
      this.root.classList.remove("is-panning");
    }
  }

  updateTerrainViewport() {
    const [width, height] = this.viewport.size;
    const [originX, originY] = this.viewport.origin;
    const viewBox = `${originX} ${originY} ${width} ${height}`;
    this.terrainLayer?.setAttribute("viewBox", viewBox);
    this.guidesLayer?.setAttribute("viewBox", viewBox);
  }

  themeColor(color) {
    const value = this.theme.colors?.[color];
    return typeof value === "string" ? value : (value?.line || color || "#777");
  }

  normalizeOverlapTargets(value) {
    if (value === undefined) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.map((target) => {
      if (target && typeof target === "object") return String(target.with ?? target.target ?? "").trim();
      return String(target).trim();
    }).filter(Boolean);
  }

  shouldRenderLabel(w, l) {
    return Number(w) >= 1 && Number(l) >= 1;
  }

  add(data) {
    const { label = "", classes = "", title = "", room = false, showLabel = false, visible = true, container = this.root } = data;
    const { x, y, w, l, z0, z1, h, stairDirection = "forward" } = this.normalizeGeometry(data);
    const element = document.createElement("div");
    element.className = `plan-item plan-generated${room ? " room" : ""}${classes ? ` ${classes}` : ""}${visible === false ? " plan-hidden" : ""}`;
    element.style.setProperty("--x", x);
    element.style.setProperty("--y", y);
    element.style.setProperty("--w", w);
    element.style.setProperty("--l", l);
    element.style.setProperty("--z0", z0);
    element.style.setProperty("--z1", z1);
    element.style.setProperty("--h", h);
    element.dataset.z0 = String(z0);
    element.dataset.z1 = String(z1);
    element.dataset.height = String(h);
    if (classes.split(/\s+/).includes("stair-flight")) {
      element.dataset.stairAxis = w >= l ? "horizontal" : "vertical";
      element.dataset.stairDirection = stairDirection;
      element.dataset.stairRise = h > 0 ? "up" : "flat";
      const elevationTolerance = 1e-9;
      element.dataset.stairFace = this.currentFloorHeight >= z1 - elevationTolerance ? "top" : "bottom";
      if (h > 0) {
        element.style.setProperty("--stair-clearance-stop", `${Math.min(100, (2 / h) * 100)}%`);
      }
      const baseArrow = document.createElement("span");
      baseArrow.className = "stair-arrow stair-arrow-base";
      baseArrow.setAttribute("aria-hidden", "true");
      const topArrow = document.createElement("span");
      topArrow.className = "stair-arrow stair-arrow-top";
      topArrow.setAttribute("aria-hidden", "true");
      element.append(baseArrow, topArrow);
    }
    if (title) element.title = title;
    if (!room && showLabel && (label || title)) {
      const dimensions = `${this.formatMeters(w)}m × ${this.formatMeters(l)}m`;
      const itemLabel = String(label || title)
        .replace(/\s+\d+(?:[,.]\d+)?\s*m?\s*[×x]\s*\d+(?:[,.]\d+)?\s*m?\s*$/iu, "")
        .trim();
      element.dataset.label = itemLabel;
      element.title = `${itemLabel} ${dimensions}`;
    }

    const walls = room ? this.normalizeWalls(data.walls) : null;
    if (walls) {
      element.walls = walls;
      ["top", "right", "bottom", "left"].forEach((side) => {
        element.dataset[`wall${side[0].toUpperCase()}${side.slice(1)}`] = walls[side];
      });
      element.wallState = (side) => walls[side];
      element.hasWall = (side) => walls[side] === "solid";
    }

    element.x0 = () => Number(x);
    element.x1 = () => Number(x) + Number(w);
    element.y0 = () => Number(y);
    element.y1 = () => Number(y) + Number(l);
    element.z0 = () => Number(z0);
    element.z1 = () => Number(z1);
    element.h = () => Number(h);
    element.w = () => Number(w);
    element.l = () => Number(l);
    element.area = () => Number(w) * Number(l);

    if (room) {
      if (data.id) element.dataset.id = data.id;
      element.dataset.label = label;
      if (this.shouldRenderLabel(w, l)) {
        const roomLabel = document.createElement("span");
        roomLabel.className = "room-label";
        roomLabel.textContent = label;
        element.append(roomLabel);
        const dimensions = document.createElement("small");
        dimensions.textContent = `${this.formatMeters(w)}m × ${this.formatMeters(l)}m`;
        element.append(dimensions);

        const area = document.createElement("small");
        area.className = "area";
        area.textContent = `Área: ${this.formatMeters(element.area())}m²`;
        element.append(area);
      }
    }

    FloorPlanRenderer.append(container, element);
    return element;
  }

  addRoom(room) {
    const derived = room.derived === true;
    const { container = this.root } = room;
    const parts = room.parts?.length ? this.normalizeParts(room.parts) : undefined;
    const geometry = parts?.length
      ? {
        x: Math.min(...parts.map((part) => part.x)),
        y: Math.min(...parts.map((part) => part.y)),
        w: Math.max(...parts.map((part) => part.x + part.w)) - Math.min(...parts.map((part) => part.x)),
        l: Math.max(...parts.map((part) => part.y + part.l)) - Math.min(...parts.map((part) => part.y))
      }
      : {};
    const roomData = parts?.length
      ? { ...room, pos: [geometry.x, geometry.y], size: [geometry.w, geometry.l] }
      : room;
    const element = this.add({ ...roomData, room: true, container });
    if (derived) {
      element.dataset.derived = "true";
      if (room.classes?.split(/\s+/).includes("stair-flight")) element.dataset.spanningStair = "true";
    }
    element.allowedOverlaps = this.normalizeOverlapTargets(room.overlaps);
    element.allowedOverlays = this.normalizeOverlapTargets(room.overlays);
    element.geometryParts = parts?.length
      ? parts.map((part) => ({
        x: part.x,
        y: part.y,
        w: part.w,
        l: part.l,
        id: part.id,
        overlapTargets: this.normalizeOverlapTargets(part.overlaps ?? room.overlaps),
        overlayTargets: this.normalizeOverlapTargets(part.overlays ?? room.overlays)
      }))
      : [{ x: element.x0(), y: element.y0(), w: element.w(), l: element.l(), id: room.id, overlapTargets: element.allowedOverlaps, overlayTargets: element.allowedOverlays }];
    if (parts?.length) {
      element.classList.add("compound-room");
      element.partReferences = new Map(parts.map((part) => [part.id, {
        x0: () => part.x,
        x1: () => part.x + part.w,
        y0: () => part.y,
        y1: () => part.y + part.l,
        z0: () => part.z0,
        z1: () => part.z1,
        h: () => part.h,
        w: () => part.w,
        l: () => part.l,
        area: () => part.w * part.l
      }]));
      parts.forEach((part) => {
        const partElement = document.createElement("div");
        const partClasses = part.classes || room.classes || "";
        partElement.className = `room-part${partClasses ? ` ${partClasses}` : ""}`;
        if (part.label && this.shouldRenderLabel(part.w, part.l)) {
          const partLabel = document.createElement("span");
          partLabel.className = "room-label";
          partLabel.textContent = part.label;
          partElement.append(partLabel);
          const partDimensions = document.createElement("small");
          partDimensions.className = "part-dimensions";
          partDimensions.textContent = `${this.formatMeters(part.w)}m × ${this.formatMeters(part.l)}m`;
          partElement.append(partDimensions);
        }
        partElement.style.left = `calc((${part.x} - var(--x)) * var(--m))`;
        partElement.style.top = `calc((${part.y} - var(--y)) * var(--m))`;
        partElement.style.width = `calc(${part.w} * var(--m))`;
        partElement.style.height = `calc(${part.l} * var(--m))`;
        partElement.style.setProperty("--z0", part.z0);
        partElement.style.setProperty("--z1", part.z1);
        partElement.style.setProperty("--h", part.h);
        if (partClasses.split(/\s+/).includes("stair-flight")) {
          partElement.dataset.stairAxis = part.w >= part.l ? "horizontal" : "vertical";
          partElement.dataset.stairDirection = part.stairDirection || "forward";
          partElement.dataset.stairRise = part.h > 0 ? "up" : "flat";
          const elevationTolerance = 1e-9;
          partElement.dataset.stairFace = this.currentFloorHeight >= part.z1 - elevationTolerance ? "top" : "bottom";
          if (part.h > 0) {
            partElement.style.setProperty("--stair-clearance-stop", `${Math.min(100, (2 / part.h) * 100)}%`);
          }
          ["base", "top"].forEach((position) => {
            const arrow = document.createElement("span");
            arrow.className = `stair-arrow stair-arrow-${position}`;
            arrow.setAttribute("aria-hidden", "true");
            partElement.append(arrow);
          });
        }
        const walls = this.normalizeWalls(part.walls ?? room.walls);
        ["top", "right", "bottom", "left"].forEach((side) => {
          partElement.dataset[`wall${side[0].toUpperCase()}${side.slice(1)}`] = walls[side];
        });
        partElement.dataset.overlapTargets = JSON.stringify(this.normalizeOverlapTargets(part.overlaps ?? room.overlaps));
        partElement.dataset.overlayTargets = JSON.stringify(this.normalizeOverlapTargets(part.overlays ?? room.overlays));
        partElement.dataset.partId = part.id;
        element.geometryParts.find((geometryPart) => geometryPart.id === part.id).element = partElement;
        element.prepend(partElement);
      });
      element.area = () => parts.reduce((total, part) => total + part.w * part.l, 0);
    }
    const roomDimensions = `${this.formatMeters(element.w())}m × ${this.formatMeters(element.l())}m`;
    const roomArea = `Área: ${this.formatMeters(element.area())}m²`;
    element.title = `${room.label || room.id || "Cômodo"} — ${roomDimensions} — ${roomArea}`;
    const displayedArea = element.querySelector(":scope > .area");
    if (displayedArea) displayedArea.textContent = roomArea;
    if (!derived) this.roomElements.push(element);
    else if (room.classes?.split(/\s+/).includes("stair-flight") && container === this.root) this.stairElements.push(element);
    if (room.id) element.dataset.id = room.id;
    if (room.id && !derived) {
      this.rooms.set(room.id, element);
      this.references.set(room.id, element);
    }
    if (!derived) {
      this.updateOverlaps();
      this.roomArea += element.area();
      this.roomCount += 1;
      this.updateSummary();
    }
    return element;
  }

  normalizeGeometryAtFloor(data, floorConfig) {
    const previousHeight = this.currentFloorHeight;
    this.currentFloorHeight = Number(floorConfig?.h ?? 0);
    try {
      return this.normalizeGeometry(data);
    } finally {
      this.currentFloorHeight = previousHeight;
    }
  }

  addSpanningStairs(config, floorConfig) {
    const floors = config.floors ?? [config];
    const existingStairs = (floorConfig.rooms ?? [])
      .filter((room) => room.classes?.split(/\s+/).includes("stair-flight"))
      .map((room) => this.normalizeGeometry(room));
    const currentHeight = this.currentFloorHeight;

    floors.forEach((sourceFloor) => {
      (sourceFloor.rooms ?? [])
        .filter((room) => room.classes?.split(/\s+/).includes("stair-flight"))
        .forEach((stair) => {
          const geometry = this.normalizeGeometryAtFloor(stair, sourceFloor);
          if (geometry.h <= 0 || currentHeight < geometry.z0 || currentHeight > geometry.z1) return;
          const alreadyVisible = existingStairs.some((existing) => {
            const overlapWidth = Math.max(0, Math.min(existing.x + existing.w, geometry.x + geometry.w) - Math.max(existing.x, geometry.x));
            const overlapLength = Math.max(0, Math.min(existing.y + existing.l, geometry.y + geometry.l) - Math.max(existing.y, geometry.y));
            const overlapArea = overlapWidth * overlapLength;
            const smallerArea = Math.min(existing.w * existing.l, geometry.w * geometry.l);
            return smallerArea > 0 && overlapArea / smallerArea >= 0.95;
          });
          if (alreadyVisible) return;

          this.addRoom({
            ...stair,
            derived: true,
            pos: [geometry.x, geometry.y, geometry.z0],
            size: [geometry.w, geometry.l, geometry.h]
          });
        });
    });
  }

  addRooms(rooms) {
    let pending = [...rooms];
    while (pending.length > 0) {
      const next = [];
      let added = 0;

      pending.forEach((room) => {
        try {
          this.addRoom(room);
          added += 1;
        } catch (error) {
          if (error.message.startsWith("Unknown room reference:") || error.message.startsWith("Unknown room reference")) {
            next.push(room);
          } else {
            this.errors.push({ category: "room", id: room.id, opening: room, message: error.message });
          }
        }
      });

      if (added === 0) {
        next.forEach((room) => {
          this.errors.push({
            category: "room",
            id: room.id,
            opening: room,
            message: "Não foi possível resolver as referências geométricas do cômodo"
          });
        });
        break;
      }
      pending = next;
    }
  }

  prepareRoomReferences(config) {
    this.roomDefinitions.clear();
    this.roomGeometryCache.clear();
    this.roomGeometryStack.clear();
    this.invalidRoomIds.clear();
    this.rooms.clear();
    this.references.clear();
    const collected = FloorPlanValidation.collectRoomDefinitions(this.model || FloorPlanModel.fromConfig(config));
    this.roomDefinitions = collected.definitions;
    this.errors.push(...collected.errors);

    this.roomDefinitions.forEach((_room, id) => {
      const reference = this.createRoomReference(id);
      this.rooms.set(id, reference);
      this.references.set(id, reference);
    });
    this.registerGlobalPartReferences();
    this.registerFloorReferences(config);
    this.registerStaticGuideReferences(config);
    this.registerStaticZoneReferences(config);
    this.roomDefinitions.forEach((_room, id) => {
      try {
        this.getRoomGeometry(id);
      } catch (error) {
        this.invalidRoomIds.add(id);
        this.errors.push({ category: "room", id, opening: this.roomDefinitions.get(id), message: error.message });
      }
    });
    this.validateGlobalObjectIds(config);
  }

  registerGlobalPartReferences() {
    this.partOwners = new Map();
    this.roomDefinitions.forEach((room, roomId) => {
      (room.parts ?? []).forEach((part, index) => {
        const partId = part.id || `part-${index + 1}`;
        if (this.partOwners.has(partId)) {
          this.errors.push({
            category: "room",
            id: partId,
            opening: room,
            message: `ID de parte duplicado: ${partId}`
          });
          return;
        }
        if (this.references.has(partId)) {
          this.errors.push({
            category: "room",
            id: partId,
            opening: room,
            message: `ID global duplicado: ${partId}`
          });
          return;
        }
        this.partOwners.set(partId, roomId);
        const reference = {};
        ["x0", "x1", "y0", "y1", "z0", "z1", "h", "w", "l", "area"].forEach((method) => {
          reference[method] = () => this.getRoomGeometry(roomId).partReferences.get(partId)[method]();
        });
        this.references.set(partId, reference);
      });
    });
  }

  registerFloorReferences(config) {
    (config.floors ?? [config]).forEach((floorConfig) => {
      if (!floorConfig.id || FloorPlanValidation.isReservedId(floorConfig.id) || this.references.has(floorConfig.id)) return;
      const height = Number(floorConfig.h ?? 0);
      this.references.set(floorConfig.id, {
        z0: () => height,
        z1: () => height,
        h: () => height,
        w: () => 0,
        l: () => 0,
        area: () => 0
      });
    });
  }

  registerStaticGuideReferences(config) {
    const floorGuides = (config.floors ?? [config]).flatMap((floorConfig) => floorConfig.guides ?? []);
    const guides = config.floors ? [...(config.guides ?? []), ...floorGuides] : floorGuides;
    guides.forEach((guide) => {
      if (!guide.id || FloorPlanValidation.isReservedId(guide.id) || this.references.has(guide.id)) return;
      const [xValue, yValue] = guide.pos ?? guide.from ?? [];
      const widthValue = guide.w;
      const lengthValue = guide.l;
      const [toXValue, toYValue] = guide.to ?? [];
      const hasEndpoint = guide.to !== undefined;
      if (!hasEndpoint && (widthValue === undefined) === (lengthValue === undefined)) return;
      const startX = () => this.resolve(xValue);
      const startY = () => this.resolve(yValue);
      const endpointX = () => this.resolve(toXValue, { x0: startX(), y0: startY(), z0: this.currentFloorHeight });
      const endpointY = () => this.resolve(toYValue, { x0: startX(), y0: startY(), z0: this.currentFloorHeight });
      this.references.set(guide.id, {
        x0: startX,
        x1: () => hasEndpoint ? endpointX() : startX() + (widthValue === undefined ? 0 : this.resolve(widthValue)),
        y0: startY,
        y1: () => hasEndpoint ? endpointY() : startY() + (lengthValue === undefined ? 0 : this.resolve(lengthValue)),
        w: () => hasEndpoint ? Math.abs(endpointX() - startX()) : (widthValue === undefined ? 0 : this.resolve(widthValue)),
        l: () => hasEndpoint ? Math.abs(endpointY() - startY()) : (lengthValue === undefined ? 0 : this.resolve(lengthValue)),
        area: () => 0
      });
    });
  }

  registerStaticZoneReferences(config) {
    const floorZones = (config.floors ?? [config]).flatMap((floorConfig) => floorConfig.zones ?? []);
    const zones = config.floors ? [...(config.zones ?? []), ...floorZones] : floorZones;
    zones.forEach((zone) => {
      if (!zone.id || this.references.has(zone.id)) return;
      const geometry = () => this.normalizeGeometry(zone);
      this.references.set(zone.id, {
        x0: () => geometry().x,
        x1: () => geometry().x + geometry().w,
        y0: () => geometry().y,
        y1: () => geometry().y + geometry().l,
        w: () => geometry().w,
        l: () => geometry().l,
        area: () => geometry().w * geometry().l
      });
    });
  }

  validateGlobalObjectIds(config) {
    this.globalObjectIds = new Set([
      ...this.roomDefinitions.keys(),
      ...(this.partOwners?.keys() ?? [])
    ]);
    this.validZoneIds = new Set();
    const floorConfigs = config.floors ?? [config];
    const globalGuides = config.floors ? (config.guides ?? []) : [];
    globalGuides.forEach((guide) => {
      if (guide.id && FloorPlanValidation.isReservedId(guide.id)) {
        this.errors.push({ category: "guide", id: guide.id, opening: guide, message: `ID reservado: ${guide.id}` });
      }
    });
    floorConfigs.forEach((floorConfig) => {
      if (floorConfig.id && FloorPlanValidation.isReservedId(floorConfig.id)) {
        this.errors.push({ category: "floor", id: floorConfig.id, opening: floorConfig, message: `ID reservado: ${floorConfig.id}` });
      }
      (floorConfig.guides ?? []).forEach((guide) => {
        if (guide.id && FloorPlanValidation.isReservedId(guide.id)) {
          this.errors.push({ category: "guide", id: guide.id, opening: guide, message: `ID reservado: ${guide.id}` });
        }
      });
    });
    const globalZones = config.floors ? (config.zones ?? []) : [];
    [...globalZones, ...floorConfigs.flatMap((floorConfig) => floorConfig.zones ?? [])].forEach((zone) => {
        if (!zone.id) {
          this.errors.push({ category: "zone", opening: zone, message: "Zona sem id global" });
        } else if (FloorPlanValidation.isReservedId(zone.id)) {
          this.errors.push({ category: "zone", id: zone.id, opening: zone, message: `ID reservado: ${zone.id}` });
        } else if (this.globalObjectIds.has(zone.id)) {
          this.errors.push({ category: "zone", id: zone.id, opening: zone, message: `ID global duplicado: ${zone.id}` });
        } else {
          this.globalObjectIds.add(zone.id);
          this.validZoneIds.add(zone.id);
        }
      });
    floorConfigs.forEach((floorConfig) => {
      [...(floorConfig.items ?? []), ...(floorConfig.openings ?? []), ...(floorConfig.windows ?? [])].forEach((object) => {
        if (!object.id) return;
        if (FloorPlanValidation.isReservedId(object.id)) {
          this.errors.push({ category: "object", id: object.id, opening: object, message: `ID reservado: ${object.id}` });
        } else if (this.globalObjectIds.has(object.id)) {
          this.errors.push({ category: "object", id: object.id, opening: object, message: `ID global duplicado: ${object.id}` });
        } else {
          this.globalObjectIds.add(object.id);
        }
      });
    });
  }

  visibleZones(config, floorConfig) {
    const globalZones = config.floors ? (config.zones ?? []) : [];
    return [...globalZones, ...(floorConfig.zones ?? [])];
  }

  visibleGuides(config, floorConfig) {
    const globalGuides = config.floors ? (config.guides ?? []) : [];
    return [...globalGuides, ...(floorConfig.guides ?? [])];
  }

  validateInactiveFloorFeatures(config, activeFloorIndex) {
    (config.floors ?? []).forEach((floorConfig, floorIndex) => {
      if (floorIndex === activeFloorIndex) return;
      (floorConfig.zones ?? []).forEach((zone, index) => {
        try {
          this.normalizeGeometry(zone);
        } catch (error) {
          this.errors.push({ index, opening: zone, category: "zone", message: error.message });
        }
      });
      (floorConfig.items ?? []).forEach((item, index) => {
        try {
          this.normalizeGeometry(this.resolveItemType(item));
        } catch (error) {
          this.errors.push({ index, opening: item, category: "item", message: error.message });
        }
      });
      (floorConfig.openings ?? []).forEach((opening, index) => {
        if (this.isVerticalOpening(opening)) return;
        try {
          this.normalizeOpening(opening);
        } catch (error) {
          this.errors.push({ index, opening, category: opening.type === "window" ? "window" : "opening", message: error.message });
        }
      });
      (floorConfig.windows ?? []).forEach((window, index) => {
        try {
          this.normalizeOpening({ ...window, type: "window" });
        } catch (error) {
          this.errors.push({ index, opening: window, category: "window", message: error.message });
        }
      });
    });
  }

  prepareGlobalLists(config) {
    const floors = config.floors ?? [{ id: null, label: null, ...config }];
    this.allRooms = [...this.roomDefinitions.entries()].map(([id, room]) => {
      const floor = floors.find((floorConfig) => (floorConfig.rooms ?? []).includes(room));
      const reference = this.rooms.get(id);
      return { id, label: room.label || id, floorId: floor?.id, floorLabel: floor?.label, reference };
    });
    this.allItems = [];
    this.allOpenings = [];
    this.allWindows = [];
    floors.forEach((floorConfig) => {
      (floorConfig.items ?? []).forEach((item) => {
        try {
          const resolvedItem = this.resolveItemType(item);
          const geometry = this.normalizeGeometry(resolvedItem);
          this.allItems.push({ ...resolvedItem, ...geometry, floorId: floorConfig.id, floorLabel: floorConfig.label });
        } catch {
          // The active-floor render path records the detailed error.
        }
      });
      (floorConfig.openings ?? []).forEach((opening) => {
        if (this.isVerticalOpening(opening)) return;
        try {
          const feature = this.normalizeOpening(opening);
          const target = feature.type === "window" ? this.allWindows : this.allOpenings;
          target.push({ ...feature, floorId: floorConfig.id, floorLabel: floorConfig.label });
        } catch {
          // Validation and rendering record the error with its source data.
        }
      });
      (floorConfig.windows ?? []).forEach((window) => {
        try {
          const feature = this.normalizeOpening({ ...window, type: "window" });
          this.allWindows.push({ ...feature, floorId: floorConfig.id, floorLabel: floorConfig.label });
        } catch {
          // Validation and rendering record the error with its source data.
        }
      });
    });
  }

  createRoomReference(id) {
    const floorPlan = this;
    return {
      dataset: { id, label: this.roomDefinitions.get(id)?.label || id },
      x0: () => this.getRoomGeometry(id).x0(),
      x1: () => this.getRoomGeometry(id).x1(),
      y0: () => this.getRoomGeometry(id).y0(),
      y1: () => this.getRoomGeometry(id).y1(),
      z0: () => this.getRoomGeometry(id).z0(),
      z1: () => this.getRoomGeometry(id).z1(),
      h: () => this.getRoomGeometry(id).h(),
      w: () => this.getRoomGeometry(id).w(),
      l: () => this.getRoomGeometry(id).l(),
      area: () => this.getRoomGeometry(id).area(),
      wallState: (side) => this.getRoomGeometry(id).wallState(side),
      hasWall: (side) => this.getRoomGeometry(id).hasWall(side),
      get geometryParts() { return floorPlan.getRoomGeometry(id).geometryParts; },
      get partReferences() { return floorPlan.getRoomGeometry(id).partReferences; }
    };
  }

  normalizeParts(parts) {
    const localReferences = new Map();
    this.partReferenceStack.push(localReferences);
    try {
      return parts.map((part, index) => {
        const geometry = {
          ...this.normalizeGeometry(part),
          id: part.id || `part-${index + 1}`
        };
        localReferences.set(geometry.id, {
          x0: () => geometry.x,
          x1: () => geometry.x + geometry.w,
          y0: () => geometry.y,
          y1: () => geometry.y + geometry.l,
          z0: () => geometry.z0,
          z1: () => geometry.z1,
          h: () => geometry.h,
          w: () => geometry.w,
          l: () => geometry.l,
          area: () => geometry.w * geometry.l
        });
        return geometry;
      });
    } finally {
      this.partReferenceStack.pop();
    }
  }

  getRoomGeometry(id) {
    if (this.roomGeometryCache.has(id)) return this.roomGeometryCache.get(id);
    if (!this.roomDefinitions.has(id)) throw new Error(`Unknown room reference: ${id}`);
    if (this.roomGeometryStack.has(id)) throw new Error(`Circular room reference: ${id}`);

    this.roomGeometryStack.add(id);
    try {
      const room = this.roomDefinitions.get(id);
      const parts = room.parts?.length ? this.normalizeParts(room.parts) : undefined;
      const geometry = parts?.length
        ? {
          x: Math.min(...parts.map((part) => part.x)),
          y: Math.min(...parts.map((part) => part.y)),
          w: Math.max(...parts.map((part) => part.x + part.w)) - Math.min(...parts.map((part) => part.x)),
          l: Math.max(...parts.map((part) => part.y + part.l)) - Math.min(...parts.map((part) => part.y))
        }
        : this.normalizeGeometry(room);
      const walls = this.normalizeWalls(room.walls);
      const reference = {
        x0: () => geometry.x,
        x1: () => geometry.x + geometry.w,
        y0: () => geometry.y,
        y1: () => geometry.y + geometry.l,
        z0: () => geometry.z0,
        z1: () => geometry.z1,
        h: () => geometry.h,
        w: () => geometry.w,
        l: () => geometry.l,
        area: () => parts?.length ? parts.reduce((total, part) => total + part.w * part.l, 0) : geometry.w * geometry.l,
        wallState: (side) => walls[side],
        hasWall: (side) => walls[side] === "solid",
        geometryParts: parts?.length
          ? parts.map(({ x, y, w, l }) => ({ x, y, w, l }))
          : [{ x: geometry.x, y: geometry.y, w: geometry.w, l: geometry.l }],
        partReferences: new Map((parts ?? []).map((part) => [part.id, {
          x0: () => part.x,
          x1: () => part.x + part.w,
          y0: () => part.y,
          y1: () => part.y + part.l,
          z0: () => part.z0,
          z1: () => part.z1,
          h: () => part.h,
          w: () => part.w,
          l: () => part.l,
          area: () => part.w * part.l
        }]))
      };
      this.roomGeometryCache.set(id, reference);
      return reference;
    } finally {
      this.roomGeometryStack.delete(id);
    }
  }

  normalizeGeometry(data) {
    const isStair = data.classes?.split(/\s+/).includes("stair-flight");
    if (Array.isArray(data.from) || Array.isArray(data.to)) {
      if (!Array.isArray(data.from) || !Array.isArray(data.to)
        || (data.from.length !== 2 && data.from.length !== 3)
        || (data.to.length !== 2 && data.to.length !== 3)) {
        throw new Error("A geometria precisa ter from e to como [x, y] ou [x, y, z]");
      }

      const fromValues = data.from.map((value) => this.resolve(value));
      const localOrigin = {
        x0: fromValues[0],
        y0: fromValues[1],
        z0: fromValues[2] ?? this.currentFloorHeight
      };
      const toValues = data.to.map((value) => this.resolve(value, localOrigin));
      const [fromX, fromY] = fromValues;
      const [toX, toY] = toValues;
      const z0 = this.resolve(fromValues[2] ?? this.currentFloorHeight);
      const z1 = this.resolve(toValues[2] ?? z0);
      const w = Math.abs(toX - fromX);
      const l = Math.abs(toY - fromY);
      if (![fromX, fromY, toX, toY, z0, z1].every(Number.isFinite) || (w === 0 && l === 0)) {
        throw new Error("A geometria precisa usar coordenadas numéricas diferentes");
      }
      if (z1 < z0) throw new Error("A geometria precisa terminar em uma cota igual ou superior à inicial");

      const horizontal = w >= l;
      return {
        ...data,
        x: Math.min(fromX, toX),
        y: Math.min(fromY, toY),
        w,
        l,
        z0,
        z1,
        h: z1 - z0,
        ...(isStair ? { stairDirection: (horizontal ? toX < fromX : toY < fromY) ? "reverse" : "forward" } : {})
      };
    }

    if (data.rectangle !== undefined) {
      if (!Array.isArray(data.rectangle) || data.rectangle.length !== 4) {
        throw new Error("Rectangle precisa ter [x0, y0, x1, y1]");
      }
      if (data.inset !== undefined || data.pos !== undefined || data.size !== undefined || data.x !== undefined || data.y !== undefined || data.w !== undefined || data.l !== undefined) {
        throw new Error("Rectangle não pode ser combinado com outra definição geométrica");
      }

      const x0Value = this.resolve(data.rectangle[0]);
      const y0Value = this.resolve(data.rectangle[1]);
      const rectangleOrigin = {
        x0: x0Value,
        y0: y0Value,
        z0: this.resolve(data.z0 ?? this.currentFloorHeight)
      };
      const x1Value = this.resolve(data.rectangle[2], rectangleOrigin);
      const y1Value = this.resolve(data.rectangle[3], rectangleOrigin);
      if (![x0Value, y0Value, x1Value, y1Value].every(Number.isFinite)) {
        throw new Error("Rectangle precisa usar valores numéricos");
      }
      if (!(x1Value > x0Value && y1Value > y0Value)) {
        throw new Error("Rectangle precisa ter x1 maior que x0 e y1 maior que y0");
      }

      const z0 = rectangleOrigin.z0;
      const h = this.resolve(data.h ?? 0);
      if (![z0, h].every(Number.isFinite) || h < 0) {
        throw new Error("A elevação precisa ter z0 numérico e h não negativo");
      }
      return {
        ...data,
        x: x0Value,
        y: y0Value,
        w: x1Value - x0Value,
        l: y1Value - y0Value,
        z0,
        z1: z0 + h,
        h
      };
    }

    if (data.inset !== undefined) {
      if (!Array.isArray(data.inset) || data.inset.length !== 3) {
        throw new Error("Inset precisa ter [id, dx, dy]");
      }

      const [referenceId, xInsetValue, yInsetValue] = data.inset;
      const reference = this.references.get(String(referenceId));
      if (!reference) throw new Error(`Unknown geometric reference: ${referenceId}`);

      const xInset = this.resolve(xInsetValue);
      const yInset = this.resolve(yInsetValue);
      const baseWidth = reference.w();
      const baseLength = reference.l();
      if (![xInset, yInset, baseWidth, baseLength].every(Number.isFinite)) {
        throw new Error(`Inset precisa usar valores numéricos: ${referenceId}`);
      }
      if (!(xInset >= 0 && xInset < baseWidth / 2 && yInset >= 0 && yInset < baseLength / 2)) {
        throw new Error(`Inset deve ser não negativo e menor que metade das dimensões de ${referenceId}`);
      }

      const z0 = reference.z0 ? reference.z0() : this.currentFloorHeight;
      const h = reference.h ? reference.h() : 0;
      return {
        ...data,
        x: reference.x0() + xInset,
        y: reference.y0() + yInset,
        w: baseWidth - 2 * xInset,
        l: baseLength - 2 * yInset,
        z0,
        z1: z0 + h,
        h
      };
    }

    const [xValue, yValue, zValue] = data.pos ?? [data.x, data.y, data.z0];
    const [wValue, lValue, hValue] = data.size ?? [data.w, data.l, data.h];

    if ([xValue, yValue, wValue, lValue].some((value) => value === undefined)) {
      throw new Error("A figure needs pos/size or x/y/w/l values");
    }

    const z0 = this.resolve(zValue ?? this.currentFloorHeight);
    const h = this.resolve(hValue ?? 0);
    if (![z0, h].every(Number.isFinite) || h < 0) {
      throw new Error("A elevação precisa ter z0 numérico e h não negativo");
    }

    return {
      ...data,
      x: this.resolve(xValue),
      y: this.resolve(yValue),
      w: this.resolve(wValue),
      l: this.resolve(lValue),
      z0,
      z1: z0 + h,
      h
    };
  }

  normalizeWalls(walls) {
    const sides = ["top", "right", "bottom", "left"];
    const normalized = Object.fromEntries(sides.map((side) => [side, "solid"]));

    if (walls === undefined) return normalized;
    if (Array.isArray(walls)) {
      sides.forEach((side) => { normalized[side] = "open"; });
      walls.forEach((side) => {
        if (!sides.includes(side)) throw new Error(`Invalid wall side: ${side}`);
        normalized[side] = "solid";
      });
      return normalized;
    }

    if (typeof walls === "string") {
      if (!["solid", "open", "virtual"].includes(walls)) {
        throw new Error(`Invalid wall state "${walls}". Use "solid", "open" or "virtual".`);
      }
      sides.forEach((side) => { normalized[side] = walls; });
      return normalized;
    }

    if (typeof walls !== "object" || walls === null) {
      throw new Error("Walls must be an array or an object");
    }

    Object.entries(walls).forEach(([side, state]) => {
      if (!sides.includes(side)) throw new Error(`Invalid wall side: ${side}`);
      if (!["solid", "open", "virtual"].includes(state)) {
        throw new Error(`Invalid wall state "${state}". Use "solid", "open" or "virtual".`);
      }
      normalized[side] = state;
    });
    return normalized;
  }

  clearTerrain() {
    this.terrainLayer?.replaceChildren();
    this.guidesLayer?.replaceChildren();
    this.root.style.removeProperty("--plan-offset-x");
    this.root.style.removeProperty("--plan-offset-y");
    this.root.style.removeProperty("--building-offset-x");
    this.root.style.removeProperty("--building-offset-y");
    this.terrainArea = 0;
    this.terrainDimensions = null;
    this.terrainReference = null;
  }

  applyBuildingPlacement(building = null) {
    const position = building?.position;
    if (!position) return;
    const anchor = building.anchor || "terrain.front-start";
    if (!["terrain.front-start", "bounds.top-left"].includes(anchor)) {
      throw new Error(`Unsupported building anchor: ${building.anchor}`);
    }

    const localX = Number(position.x);
    const localY = Number(position.y);
    if (![localX, localY].every(Number.isFinite)) {
      throw new Error("Building position needs numeric x and y values");
    }

    const planOffsetX = Number.parseFloat(getComputedStyle(this.root).getPropertyValue("--plan-offset-x")) || 0;
    const planOffsetY = Number.parseFloat(getComputedStyle(this.root).getPropertyValue("--plan-offset-y")) || 0;
    const anchorPoint = anchor === "terrain.front-start"
      ? (this.terrainReference?.frontStart || { x: planOffsetX, y: planOffsetY })
      : { x: planOffsetX, y: planOffsetY };
    const targetX = anchorPoint.x + localX;
    const targetY = anchorPoint.y + localY;

    const bounds = this.buildingReferenceBounds();
    if (!bounds) return;
    this.root.style.setProperty("--building-offset-x", targetX - bounds.x0);
    this.root.style.setProperty("--building-offset-y", targetY - bounds.y0);
  }

  renderTerrain(terrain) {
    this.clearTerrain();
    if (!this.terrainLayer || !terrain?.corners || !terrain.boundary_order?.length) return;

    const order = terrain.boundary_order;
    const corners = order.map((id) => {
      const point = terrain.corners[id];
      if (!point) throw new Error(`Unknown terrain corner: ${id}`);
      return { id, easting: Number(point.easting), northing: Number(point.northing) };
    });
    const first = corners[0];
    const second = corners[1];
    const frontEasting = second.easting - first.easting;
    const frontNorthing = second.northing - first.northing;
    const frontLength = Math.hypot(frontEasting, frontNorthing);
    const ux = frontEasting / frontLength;
    const uy = frontNorthing / frontLength;
    let vx = -uy;
    let vy = ux;
    const centroid = corners.reduce(
      (sum, point) => ({ easting: sum.easting + point.easting, northing: sum.northing + point.northing }),
      { easting: 0, northing: 0 }
    );
    centroid.easting /= corners.length;
    centroid.northing /= corners.length;
    const toCentroidEasting = centroid.easting - first.easting;
    const toCentroidNorthing = centroid.northing - first.northing;
    if (toCentroidEasting * vx + toCentroidNorthing * vy < 0) {
      vx *= -1;
      vy *= -1;
    }

    const localCorners = corners.map((point) => {
      const easting = point.easting - first.easting;
      const northing = point.northing - first.northing;
      return {
        ...point,
        x: easting * ux + northing * uy,
        y: easting * vx + northing * vy
      };
    });
    const minX = Math.min(...localCorners.map((point) => point.x));
    const minY = Math.min(...localCorners.map((point) => point.y));
    const maxX = Math.max(...localCorners.map((point) => point.x));
    const maxY = Math.max(...localCorners.map((point) => point.y));
    const terrainPadding = 2;
    const offsetX = -minX + terrainPadding;
    const offsetY = -minY + terrainPadding;
    localCorners.forEach((point) => {
      point.x += offsetX;
      point.y += offsetY;
    });
    const width = maxX - minX;
    const height = maxY - minY;
    this.terrainDimensions = { width, height };
    this.root.style.setProperty("--plan-offset-x", offsetX);
    this.root.style.setProperty("--plan-offset-y", offsetY);
    this.root.style.setProperty("--building-offset-x", offsetX);
    this.root.style.setProperty("--building-offset-y", offsetY);
    this.terrainReference = {
      frontStart: { x: offsetX, y: offsetY }
    };
    this.updateTerrainViewport();
    this.terrainLayer.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const svg = "http://www.w3.org/2000/svg";
    const create = (name, attributes = {}) => {
      const element = document.createElementNS(svg, name);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      return element;
    };
    const pointString = localCorners.map((point) => `${point.x},${point.y}`).join(" ");
    this.terrainLayer.append(create("polygon", { points: pointString, class: "terrain-boundary" }));

    const shoelace = localCorners.reduce((sum, point, index) => {
      const next = localCorners[(index + 1) % localCorners.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    this.terrainArea = Math.abs(shoelace) / 2;

    localCorners.forEach((point) => {
      this.terrainLayer.append(create("circle", { cx: point.x, cy: point.y, r: 0.12, class: "terrain-point" }));
      const label = create("text", { x: point.x + 0.18, y: point.y - 0.18, class: "terrain-label" });
      label.textContent = point.id;
      this.terrainLayer.append(label);
    });

    const segmentByPair = new Map((terrain.segments ?? []).map((segment) => [`${segment.from}-${segment.to}`, segment]));
    localCorners.forEach((point, index) => {
      const next = localCorners[(index + 1) % localCorners.length];
      this.terrainLayer.append(create("line", {
        x1: point.x, y1: point.y, x2: next.x, y2: next.y, class: "terrain-segment"
      }));
      const segment = segmentByPair.get(`${point.id}-${next.id}`);
      if (segment) {
        const label = create("text", {
          x: (point.x + next.x) / 2,
          y: (point.y + next.y) / 2 - 0.12,
          class: "terrain-side-label"
        });
        label.textContent = `${Number(segment.distance).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m`;
        this.terrainLayer.append(label);
      }
    });

    const addSideLabel = (side) => {
      const fallback = side === "front" ? order.slice(0, 2) : order.slice(-2);
      const [fromId, toId] = terrain[side]?.edge ?? fallback;
      const from = localCorners.find((point) => point.id === fromId);
      const to = localCorners.find((point) => point.id === toId);
      const sideData = terrain[side];
      if (!from || !to || !sideData?.label) return;
      const label = create("text", {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 + (side === "front" ? -0.35 : 0.45),
        class: "terrain-side-label"
      });
      label.textContent = sideData.label;
      this.terrainLayer.append(label);
    };
    addSideLabel("front");
    addSideLabel("rear");

    const northLength = Math.hypot(uy, vy);
    const northX = uy / northLength;
    const northY = vy / northLength;
    const northBaseX = width - 2.4;
    const northBaseY = 2.5;
    const compassRose = create("image", {
      class: "terrain-compass-rose",
      href: document.querySelector("#terrain-compass-rose-data")?.content.textContent.trim(),
      x: northBaseX - 1.5,
      y: northBaseY - 1.8,
      width: 3,
      height: 3.6,
      preserveAspectRatio: "xMidYMid meet",
      transform: `rotate(${Math.atan2(northX, -northY) * 180 / Math.PI} ${northBaseX} ${northBaseY})`
    });
    this.terrainLayer.append(compassRose);
  }

  renderGuides(guides = []) {
    if (!this.guidesLayer) return;
    const svg = "http://www.w3.org/2000/svg";
    const create = (name, attributes = {}) => {
      const element = document.createElementNS(svg, name);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      return element;
    };

    guides.forEach((guide, index) => {
      const [xValue, yValue] = guide.pos ?? guide.from ?? [];
      const width = guide.w;
      const lengthValue = guide.l;
      const [toXValue, toYValue] = guide.to ?? [];
      const hasEndpoint = guide.to !== undefined;
      const hasWidth = width !== undefined;
      const hasLength = lengthValue !== undefined;
      let values;
      try {
        values = [xValue, yValue].map((value) => this.resolve(value));
        if (hasEndpoint) {
          const localOrigin = { x0: values[0], y0: values[1], z0: this.currentFloorHeight };
          values.push(this.resolve(toXValue, localOrigin), this.resolve(toYValue, localOrigin));
        }
        else values.push(this.resolve(hasWidth ? width : lengthValue));
      } catch (error) {
        this.errors.push({ index, opening: guide, category: "guide", message: error.message });
        return;
      }
      const validLength = !hasEndpoint && values[2] > 0;
      const validEndpoint = hasEndpoint && values.slice(2).every(Number.isFinite)
        && (values[2] !== values[0] || values[3] !== values[1]);
      if (values.slice(0, hasEndpoint ? 4 : 3).some((value) => !Number.isFinite(value))
        || (!hasEndpoint && hasWidth === hasLength)
        || (!validLength && !validEndpoint)) {
        this.errors.push({ index, opening: guide, category: "guide", message: "Guia precisa de pos e w, l ou to [x, y] válido" });
        return;
      }

      const offsetX = Number.parseFloat(getComputedStyle(this.root).getPropertyValue("--building-offset-x")) || 0;
      const offsetY = Number.parseFloat(getComputedStyle(this.root).getPropertyValue("--building-offset-y")) || 0;
      const [localX, localY] = values;
      const x = localX + offsetX;
      const y = localY + offsetY;
      const x2 = hasEndpoint ? values[2] + offsetX : (hasWidth ? x + values[2] : x);
      const y2 = hasEndpoint ? values[3] + offsetY : (hasWidth ? y : y + values[2]);
      const line = create("line", { x1: x, y1: y, x2, y2, class: "guide-line" });
      line.setAttribute("stroke", this.themeColor(guide.color));
      if (guide.id) line.dataset.id = guide.id;
      this.guidesLayer.append(line);

      if (guide.label) {
        const labelGap = 0.25;
        const label = create("text", {
          x,
          y,
          class: "guide-label",
          fill: this.themeColor(guide.color)
        });
        if (hasEndpoint) {
          let angle = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
          const reverseLabel = angle > 90 || angle < -90;
          if (reverseLabel) angle += 180;
          label.setAttribute("dy", -labelGap);
          label.setAttribute("text-anchor", reverseLabel ? "end" : "start");
          label.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
        } else if (hasWidth) {
          label.setAttribute("dy", -labelGap);
        } else {
          label.setAttribute("dy", -labelGap);
          label.setAttribute("transform", `rotate(90 ${x} ${y})`);
        }
        label.textContent = guide.label;
        this.guidesLayer.append(label);
      }
    });
  }

  resolveExpression(expression, localOrigin = null) {
    const tokens = [];
    const tokenPattern = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][\w.-]*)|([()+\-*/]))/i;
    let source = expression;
    while (source.length > 0) {
      const match = source.match(tokenPattern);
      if (!match) throw new Error(`Invalid geometric expression: ${expression}`);
      tokens.push(match[1] ?? match[2]);
      source = source.slice(match[0].length);
    }

    let index = 0;
    const primary = () => {
      const token = tokens[index++];
      if (token === "+") return primary();
      if (token === "-") return -primary();
      if (token === "(") {
        const result = addSubtract();
        if (tokens[index++] !== ")") throw new Error(`Invalid geometric expression: ${expression}`);
        return result;
      }
      if (!token || ["+", "-", "*", "/", ")"].includes(token)) {
        throw new Error(`Invalid geometric expression: ${expression}`);
      }
      return this.resolve(token, localOrigin);
    };
    const multiplyDivide = () => {
      let result = primary();
      while (["*", "/"].includes(tokens[index])) {
        const operator = tokens[index++];
        const operand = primary();
        if (operator === "/" && operand === 0) throw new Error("Division by zero in geometric expression");
        result = operator === "*" ? result * operand : result / operand;
      }
      return result;
    };
    const addSubtract = () => {
      let result = multiplyDivide();
      while (["+", "-"].includes(tokens[index])) {
        const operator = tokens[index++];
        const operand = multiplyDivide();
        result += operator === "+" ? operand : -operand;
      }
      return result;
    };

    const result = addSubtract();
    if (index !== tokens.length || !Number.isFinite(result)) {
      throw new Error(`Invalid geometric expression: ${expression}`);
    }
    return result;
  }

  resolve(value, localOrigin = null) {
    if (typeof value === "number") return value;

    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }

    if (typeof value === "object" && value !== null) {
      return this.resolve(value.from, localOrigin) + Number(value.delta ?? 0);
    }

    const reference = String(value).trim();
    if (localOrigin && ["x0", "y0", "z0"].includes(reference)) {
      return localOrigin[reference];
    }
    if (reference.includes("*") || reference.includes("/") || /\s[+-]\s/.test(reference)
      || /^(?:x0|y0|z0)\s*[+-]/.test(reference)) {
      return this.resolveExpression(reference, localOrigin);
    }

    const partMatch = reference.match(
      /^([\w-]+)\.([\w-]+)\.(x|x0|x1|y|y0|y1|z0|z1|w|l|h|area)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/
    );
    if (partMatch) {
      const [, roomId, partId, method, operator, amount] = partMatch;
      const room = this.partReferenceStack.at(-1)?.get(roomId) || this.references.get(roomId);
      if (!room) throw new Error(`Unknown room reference: ${roomId}`);
      const part = room.partReferences?.get(partId);
      if (!part) throw new Error(`Unknown part reference: ${roomId}.${partId}`);
      const offset = amount ? Number(amount) : 0;
      const resolvedMethod = { x: "x0", y: "y0" }[method] || method;
      return part[resolvedMethod]() + (operator === "-" ? -offset : offset);
    }

    const match = reference.match(
      /^([\w-]+)\.(x|x0|x1|y|y0|y1|z0|z1|w|l|h|area)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/
    );

    if (!match) throw new Error(`Invalid geometric reference: ${value}`);

    const [, roomId, method, operator, amount] = match;
    const room = this.partReferenceStack.at(-1)?.get(roomId) || this.references.get(roomId);
    if (!room) throw new Error(`Unknown room reference: ${roomId}`);

    const offset = amount ? Number(amount) : 0;
    const resolvedMethod = { x: "x0", y: "y0" }[method] || method;
    return room[resolvedMethod]() + (operator === "-" ? -offset : offset);
  }

  addItem(item) {
    const resolvedItem = this.resolveItemType(item);
    const element = this.add({ ...resolvedItem, showLabel: true });
    element.allowedOverlaps = this.normalizeOverlapTargets(resolvedItem.overlaps);
    element.allowedOverlays = this.normalizeOverlapTargets(resolvedItem.overlays);
    this.itemElements.push(element);
    if (resolvedItem.id && !FloorPlanValidation.isReservedId(resolvedItem.id)) {
      element.dataset.id = resolvedItem.id;
      this.references.set(resolvedItem.id, element);
    }
    return element;
  }

  resolveItemType(item) {
    if (!item.type) return item;
    const definition = this.itemTypes?.[item.type];
    if (!definition) throw new Error(`Unknown item type: ${item.type}`);
    return {
      ...definition,
      ...item,
      type: item.type,
      size: item.size ?? definition.size,
      classes: item.classes ?? definition.classes,
      label: item.label ?? definition.label,
      title: item.title ?? definition.title ?? definition.label
    };
  }

  addZone(zone) {
    const element = this.add({ ...zone, showLabel: true, classes: `${zone.classes || ""} reference-zone`.trim() });
    if (zone.color) element.style.setProperty("--zone-line-color", this.themeColor(zone.color));
    element.dataset.id = zone.id;
    element.dataset.label = zone.label || zone.id;
    element.allowedOverlaps = [];
    this.zoneElements.push(element);
    if (zone.id) this.references.set(zone.id, element);
    return element;
  }

  addZones(zones) {
    let pending = [...zones];
    while (pending.length) {
      const next = [];
      let added = 0;
      pending.forEach((zone, index) => {
        try {
          this.addZone(zone);
          added += 1;
        } catch (error) {
          if (error.message.startsWith("Unknown room reference:")) next.push(zone);
          else this.errors.push({ index, id: zone.id, opening: zone, category: "zone", message: error.message });
        }
      });
      if (!added) {
        next.forEach((zone) => this.errors.push({ id: zone.id, opening: zone, category: "zone", message: "Não foi possível resolver as referências geométricas da zona" }));
        break;
      }
      pending = next;
    }
  }

  addOpening(opening) {
    if (this.isVerticalOpening(opening)) {
      return this.addVerticalOpening(opening);
    }
    const passage = this.normalizeOpening(opening);
    if (passage.type === "window") {
      this.windows.push(passage);
      this.renderWallFeature(passage, "plan-window");
      return passage;
    }
    this.openings.push(passage);

    this.renderWallFeature(passage, "plan-opening");
    return passage;
  }

  isVerticalOpening(opening) {
    const floors = this.currentConfig?.floors ?? [];
    const from = String(opening?.from ?? "").trim();
    const to = String(opening?.to ?? "").trim();
    return (Array.isArray(opening?.size) || opening?.rectangle !== undefined || opening?.inset !== undefined)
      && floors.some((floor) => floor.id === from)
      && floors.some((floor) => floor.id === to);
  }

  addVerticalOpening(opening, floorConfig = null) {
    const floors = this.currentConfig?.floors ?? [this.currentConfig];
    const fromId = String(opening.from ?? "").trim();
    const toId = String(opening.to ?? "").trim();
    const fromFloor = floors.find((floor) => floor.id === fromId);
    const toFloor = floors.find((floor) => floor.id === toId);
    if (!fromFloor) throw new Error(`Unknown vertical opening source floor: ${fromId}`);
    if (!toFloor) throw new Error(`Unknown vertical opening target floor: ${toId}`);
    if (fromId === toId) throw new Error("Abertura vertical precisa conectar pisos diferentes");
    const fromHeight = Number(fromFloor.h ?? 0);
    const toHeight = Number(toFloor.h ?? 0);
    if (![fromHeight, toHeight].every(Number.isFinite) || fromHeight === toHeight) {
      throw new Error("Os pisos da abertura vertical precisam ter elevações diferentes");
    }

    const geometry = this.normalizeGeometryAtFloor(opening, fromFloor);
    const { x, y, w: width, l: length } = geometry;
    if (![x, y, width, length].every(Number.isFinite) || width <= 0 || length <= 0) {
      throw new Error("Abertura vertical precisa de dimensões válidas");
    }

    const passage = { ...opening, id: opening.id || `${fromId}-${toId}-vertical`, x, y, w: width, l: length, z0: fromHeight, h: 0, from: fromId, to: toId };
    const element = this.add({ pos: [x, y, fromHeight], size: [width, length, 0], classes: "floor-opening vertical-opening", title: `Abertura vertical: ${passage.id}` });
    element.dataset.from = fromId;
    element.dataset.to = toId;
    if ((floorConfig?.id ?? this.currentFloorId) === fromId) {
      this.root.querySelectorAll("[data-spanning-stair]").forEach((stair) => {
        this.clipProjection(stair, { x: stair.x0(), y: stair.y0(), w: stair.w(), l: stair.l() }, passage);
      });
      this.renderLowerFloorProjection(floors, fromFloor, fromHeight, passage);
    }
    return passage;
  }

  clipProjection(element, geometry, opening) {
    const top = Math.max(0, opening.y - geometry.y);
    const right = Math.max(0, geometry.x + geometry.w - (opening.x + opening.w));
    const bottom = Math.max(0, geometry.y + geometry.l - (opening.y + opening.l));
    const left = Math.max(0, opening.x - geometry.x);
    element.style.clipPath = `inset(calc(${top} * var(--m)) calc(${right} * var(--m)) calc(${bottom} * var(--m)) calc(${left} * var(--m)))`;
  }

  renderLowerFloorProjection(floors, fromFloor, fromHeight, opening) {
    const lowerFloors = floors
      .filter((floor) => Number(floor.h ?? 0) < fromHeight)
      .sort((first, second) => Number(second.h ?? 0) - Number(first.h ?? 0));
    const lowerFloor = lowerFloors[0];
    if (!lowerFloor) return;
    const lowerFloorHeight = Number(lowerFloor.h ?? 0);

    const compoundGeometry = (definition) => {
      const parts = this.normalizeParts(definition.parts);
      const x = Math.min(...parts.map((part) => part.x));
      const y = Math.min(...parts.map((part) => part.y));
      const x1 = Math.max(...parts.map((part) => part.x + part.w));
      const y1 = Math.max(...parts.map((part) => part.y + part.l));
      const z0 = Math.min(...parts.map((part) => part.z0));
      const z1 = Math.max(...parts.map((part) => part.z1));
      return { x, y, w: x1 - x, l: y1 - y, z0, z1, h: z1 - z0 };
    };

    const addProjection = (definition, geometry, room = false) => {
      const overlaps = geometry.x < opening.x + opening.w
        && geometry.x + geometry.w > opening.x
        && geometry.y < opening.y + opening.l
        && geometry.y + geometry.l > opening.y;
      if (!overlaps || geometry.z1 < fromHeight && geometry.z0 < fromHeight) return;
      const projected = room
        ? this.addRoom({
          ...definition,
          derived: true,
          container: this.projectionLayer,
          pos: [geometry.x, geometry.y, geometry.z0],
          size: [geometry.w, geometry.l, geometry.h],
          classes: `${definition.classes || ""} floor-projection`.trim()
        })
        : this.add({
          ...definition,
          container: this.projectionLayer,
          pos: [geometry.x, geometry.y, geometry.z0],
          size: [geometry.w, geometry.l, geometry.h],
          classes: `${definition.classes || ""} floor-projection`.trim(),
          showLabel: false
        });
      this.clipProjection(projected, geometry, opening);
    };

    (lowerFloor.rooms ?? []).forEach((room) => {
      const previousHeight = this.currentFloorHeight;
      this.currentFloorHeight = lowerFloorHeight;
      try {
        const geometry = room.parts?.length
          ? compoundGeometry(room)
          : this.normalizeGeometry(room);
        addProjection(room, geometry, true);
      } catch (error) {
        this.errors.push({ opening: room, category: "projection", message: error.message });
      } finally {
        this.currentFloorHeight = previousHeight;
      }
    });
    (lowerFloor.items ?? []).forEach((item) => {
      try {
        addProjection(item, this.normalizeGeometryAtFloor(item, lowerFloor));
      } catch (error) {
        this.errors.push({ opening: item, category: "projection", message: error.message });
      }
    });
  }

  addVisibleVerticalOpenings(config, floorConfig) {
    const floors = config.floors ?? [config];
    const currentFloorId = floorConfig.id;
    floors.forEach((sourceFloor) => {
      (sourceFloor.openings ?? []).forEach((opening) => {
        if (!this.isVerticalOpening(opening)) return;
        const targetId = String(opening.to ?? "").trim();
        const sourceFloorId = String(opening.from ?? "").trim();
        const targetFloorId = String(opening.to ?? "").trim();
        if (currentFloorId !== sourceFloorId && currentFloorId !== targetFloorId) return;
        try {
          this.addVerticalOpening(opening, floorConfig);
        } catch (error) {
          this.errors.push({ opening, category: "opening", message: error.message });
        }
      });
    });
  }

  addWindow(window) {
    const feature = this.normalizeOpening({ ...window, type: "window" });
    this.windows.push(feature);

    this.renderWallFeature(feature, "plan-window");
    return feature;
  }

  renderWallFeature(feature, baseClass) {

    const wallThickness = 0.14;
    const element = this.add({
      x: feature.horizontal ? feature.x : feature.x - wallThickness / 2,
      y: feature.horizontal ? feature.y - wallThickness / 2 : feature.y,
      w: feature.horizontal ? feature.w : wallThickness,
      l: feature.horizontal ? wallThickness : feature.w,
      classes: `${baseClass} opening-${feature.type} opening-${feature.horizontal ? "horizontal" : "vertical"}`,
      title: `${feature.type}: ${feature.id}`
    });
    element.dataset.openingRoomId = feature.roomId;
    if (feature.type === "opening") {
      const sourceRoom = this.rooms.get(feature.roomId);
      const sourceBackground = sourceRoom ? getComputedStyle(sourceRoom).backgroundColor : "";
      if (sourceBackground) element.style.setProperty("--opening-source-background", sourceBackground);
    }
  }

  normalizeOpening(opening) {
    const match = String(opening.from ?? "").trim().match(/^(.+)\.(top|left|right|bottom)$/);
    if (!match) throw new Error(`Invalid opening wall reference: ${opening.from}`);

    const [, roomId, wall] = match;
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown opening room reference: ${roomId}`);
    if (!room.hasWall(wall)) throw new Error(`Room ${roomId} has no solid ${wall} wall`);

    const target = String(opening.to ?? "exterior").trim() || "exterior";
    if (target !== "exterior" && !this.rooms.has(target)) {
      throw new Error(`Unknown opening target: ${target}`);
    }

    const defaults = { door: 0.8, opening: 1.0, window: 0.9 };
    const type = String(opening.type ?? "door").trim();
    if (!(type in defaults)) throw new Error(`Unsupported opening type: ${type}`);

    const horizontal = wall === "top" || wall === "bottom";
    const wallStart = horizontal ? room.x0() : room.y0();
    const wallLength = horizontal ? room.w() : room.l();
    let sharedStart = null;
    let sharedEnd = null;
    let targetRoom = null;
    const sourceWall = this.wallSegment(room, wall);
    if (target !== "exterior") {
      targetRoom = this.rooms.get(target);
      const oppositeWall = { top: "bottom", right: "left", bottom: "top", left: "right" }[wall];
      const targetWall = this.wallSegment(targetRoom, oppositeWall);
      if (Math.abs(sourceWall.coordinate - targetWall.coordinate) < 1e-9) {
        sharedStart = Math.max(sourceWall.start, targetWall.start);
        sharedEnd = Math.min(sourceWall.end, targetWall.end);
        if (sharedEnd <= sharedStart) {
          sharedStart = null;
          sharedEnd = null;
        }
      }
    }

    const sharedLength = sharedStart === null ? wallLength : sharedEnd - sharedStart;
    const width = Number(opening.w ?? opening.length ?? Math.min(defaults[type], sharedLength));
    if (!(width > 0)) throw new Error("Opening width must be greater than zero");
    if (width > wallLength) throw new Error(`Opening is wider than wall ${opening.from}`);
    if (width > sharedLength) throw new Error(`Opening is wider than the shared wall segment ${opening.from}`);

    const relativePosition = horizontal
      ? (opening.dx ?? opening.position ?? opening.x)
      : (opening.dy ?? opening.position ?? opening.y);
    const hasPosition = relativePosition !== undefined;
    const position = hasPosition
      ? this.resolve(relativePosition)
      : (sharedStart === null
        ? (wallLength - width) / 2
        : sharedStart - wallStart + (sharedLength - width) / 2);
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
          ? sourceWall.coordinate >= targetRoom.y0() - epsilon
            && sourceWall.coordinate <= targetRoom.y1() + epsilon
            && openingStart >= targetRoom.x0() - epsilon
            && openingEnd <= targetRoom.x1() + epsilon
          : sourceWall.coordinate >= targetRoom.x0() - epsilon
            && sourceWall.coordinate <= targetRoom.x1() + epsilon
            && openingStart >= targetRoom.y0() - epsilon
            && openingEnd <= targetRoom.y1() + epsilon;
        if (!targetContainsOpening) {
          throw new Error(`Room ${target} is not connected to or containing the opening from ${opening.from}`);
        }
      }
    }

    const shift = hasPosition ? Math.round(position * 100) : 0;
    const id = `${roomId}-${target}-${shift}`;
    return {
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
      x: horizontal ? wallStart + position : (wall === "left" ? room.x0() : room.x1()),
      y: horizontal ? (wall === "top" ? room.y0() : room.y1()) : wallStart + position,
      horizontal
    };
  }

  wallSegment(room, wall) {
    const horizontal = wall === "top" || wall === "bottom";
    return {
      coordinate: horizontal
        ? (wall === "top" ? room.y0() : room.y1())
        : (wall === "left" ? room.x0() : room.x1()),
      start: horizontal ? room.x0() : room.y0(),
      end: horizontal ? room.x1() : room.y1()
    };
  }

  bounds({ includeItems = false } = {}) {
    const elements = includeItems
      ? [...this.roomElements, ...this.itemElements]
      : this.roomElements;

    if (elements.length === 0) return null;

    const x0 = Math.min(...elements.map((element) => element.x0()));
    const y0 = Math.min(...elements.map((element) => element.y0()));
    const x1 = Math.max(...elements.map((element) => element.x1()));
    const y1 = Math.max(...elements.map((element) => element.y1()));

    return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
  }

  buildingReferenceBounds() {
    const referenceRooms = this.model?.floors?.[0]?.rooms ?? [];
    const geometries = referenceRooms
      .map((room) => room.id && this.roomDefinitions.has(room.id) ? this.getRoomGeometry(room.id) : null)
      .filter(Boolean);
    if (!geometries.length) return this.bounds();

    const x0 = Math.min(...geometries.map((geometry) => geometry.x0()));
    const y0 = Math.min(...geometries.map((geometry) => geometry.y0()));
    const x1 = Math.max(...geometries.map((geometry) => geometry.x1()));
    const y1 = Math.max(...geometries.map((geometry) => geometry.y1()));
    return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
  }

  updateOverlaps() {
    const rooms = [...this.roomElements, ...this.stairElements];
    this.errors = this.errors.filter((error) => !["collision", "overlap"].includes(error.category));
    rooms.forEach((room) => room.classList.remove("room-overlap", "room-overlap-above", "room-overlap-below"));

    const pieces = rooms.flatMap((room) => room.geometryParts.map((part) => ({
      room,
      part,
      key: part.id && room.dataset.id ? `${room.dataset.id}.${part.id}` : room.dataset.id,
      overlapTargets: part.overlapTargets ?? room.allowedOverlaps,
      overlayTargets: part.overlayTargets ?? room.allowedOverlays
    })));
    const itemPieces = this.itemElements.map((item) => ({
      item,
      key: item.dataset.id,
      overlapTargets: item.allowedOverlaps ?? [],
      overlayTargets: item.allowedOverlays ?? [],
      part: { x: item.x0(), y: item.y0(), w: item.w(), l: item.l() }
    }));
    const nodes = [...pieces, ...itemPieces].filter((piece) => piece.key);
    const nodesByKey = new Map(nodes.map((node) => [node.key, node]));
    const nodesByRoom = new Map();
    pieces.forEach((piece) => {
      const roomId = piece.room.dataset.id;
      if (!nodesByRoom.has(roomId)) nodesByRoom.set(roomId, []);
      nodesByRoom.get(roomId).push(piece);
    });

    const targetNodes = (target) => nodesByKey.has(target)
      ? [nodesByKey.get(target)]
      : (nodesByRoom.get(target) ?? []);
    const targetMatches = (targets, targetPiece) => targets.includes(targetPiece.key)
      || targets.includes(targetPiece.room?.dataset.id);

    const edges = new Map(nodes.map((node) => [node.key, []]));
    nodes.forEach((node) => {
      node.overlayTargets.forEach((target) => {
        const matches = targetNodes(target);
        if (matches.length === 0) {
          this.errors.push({ category: "overlap", id: node.key, message: `Referência de sobreposição inexistente: ${target}` });
          return;
        }
        matches.forEach((targetNode) => edges.get(node.key).push(targetNode.key));
      });
    });

    const layers = new Map();
    const visiting = new Set();
    const visited = new Set();
    const calculateLayer = (key) => {
      if (layers.has(key)) return layers.get(key);
      if (visiting.has(key)) {
        this.errors.push({ category: "overlap", id: key, message: `Ciclo de camadas detectado envolvendo ${key}` });
        return 0;
      }
      visiting.add(key);
      const layer = edges.get(key).reduce((highest, target) => Math.max(highest, calculateLayer(target) + 1), 0);
      visiting.delete(key);
      visited.add(key);
      layers.set(key, layer);
      return layer;
    };
    nodes.forEach((node) => calculateLayer(node.key));
    const maxLayer = Math.max(0, ...layers.values());
    nodes.forEach((node) => {
      const layer = layers.get(node.key) ?? 0;
      node.layer = layer;
      const element = node.item || node.part.element || node.room;
      element.dataset.layer = String(layer);
      element.style.setProperty("--layer", layer);
    });
    rooms.forEach((room) => {
      room.dataset.layer = String(Math.max(...room.geometryParts.map((part) => layers.get(
        part.id && room.dataset.id ? `${room.dataset.id}.${part.id}` : room.dataset.id
      ) ?? 0)));
    });
    this.maxLayer = maxLayer;
    this.updateLayerVisibility();

    const collisionKeys = new Set();
    const epsilon = 1e-9;
    for (let index = 0; index < pieces.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < pieces.length; otherIndex += 1) {
        const first = pieces[index];
        const second = pieces[otherIndex];
        const overlapWidth = Math.min(first.part.x + first.part.w, second.part.x + second.part.w)
          - Math.max(first.part.x, second.part.x);
        const overlapHeight = Math.min(first.part.y + first.part.l, second.part.y + second.part.l)
          - Math.max(first.part.y, second.part.y);
        const overlaps = overlapWidth > epsilon && overlapHeight > epsilon;
        const firstAbove = targetMatches(first.overlayTargets, second);
        const secondAbove = targetMatches(second.overlayTargets, first);
        const firstAllowed = targetMatches(first.overlapTargets, second);
        const secondAllowed = targetMatches(second.overlapTargets, first);
        const allowed = firstAllowed || secondAllowed;

        if (overlaps && !allowed) {
          first.room.classList.add("room-overlap");
          second.room.classList.add("room-overlap");
          const firstId = first.room.dataset.id || first.room.dataset.label || "elemento";
          const secondId = second.room.dataset.id || second.room.dataset.label || "elemento";
          const collisionKey = [firstId, secondId].sort().join(" / ");
          if (!collisionKeys.has(collisionKey)) {
            collisionKeys.add(collisionKey);
            this.errors.push({
              category: "collision",
              id: collisionKey,
              message: `Sobreposição entre ${firstId} e ${secondId}`
            });
          }
        } else if (overlaps) {
          // Declarative overlaps are intentional: keep both elements with
          // their normal appearance. The layer graph still records which
          // element is above the other for visibility and area calculations.
        }
      }
    }
  }

  cycleLayer() {
    if (!(this.maxLayer > 0)) return;
    this.layerCutoff = this.layerCutoff === null ? this.maxLayer - 1 : this.layerCutoff - 1;
    if (this.layerCutoff < 0) this.layerCutoff = null;
    this.updateLayerVisibility();
  }

  updateLayerVisibility() {
    const cutoff = this.layerCutoff;
    this.root.querySelectorAll(".plan-generated").forEach((element) => {
      const sourceRoom = element.dataset.openingRoomId
        ? this.roomElements.find((room) => room.dataset.id === element.dataset.openingRoomId)
        : null;
      const layer = Number(sourceRoom?.dataset.layer ?? element.dataset.layer ?? 0);
      element.classList.toggle("layer-hidden", cutoff !== null && layer > cutoff);
    });
    if (this.layerButton) {
      this.layerButton.textContent = cutoff === null
        ? "Todas as camadas"
        : `Mostrar até camada ${cutoff}`;
      this.layerButton.disabled = !(this.maxLayer > 0);
    }
  }

  calculateRoomArea() {
    return this.calculateUnionArea(this.roomElements.flatMap((room) => room.geometryParts));
  }

  calculateUnionArea(rectangles) {
    return FloorPlanModel.calculateUnionArea(rectangles);
  }

  calculateNetRoomArea(room) {
    return FloorPlanModel.calculateNetRoomArea(room, this.roomElements, this.itemElements);
  }

  clear() {
    FloorPlanRenderer.clearGenerated(this.root);
    this.projectionLayer.replaceChildren();
    this.clearTerrain();
    this.rooms.clear();
    this.stairElements = [];
    this.references.clear();
    this.roomElements = [];
    this.itemElements = [];
    this.zoneElements = [];
    this.openings = [];
    this.windows = [];
    this.errors = [];
    this.roomArea = 0;
    this.roomCount = 0;
    this.layerCutoff = null;
    this.maxLayer = 0;
    this.updateSummary();
  }

  load(config) {
    this.model = FloorPlanModel.fromConfig(config);
    this.currentConfig = config;
    this.itemTypes = config["item-types"] || {};
    this.theme = {
      ...this.theme,
      ...(config.theme || {}),
      colors: { ...this.theme.colors, ...(config.theme?.colors || {}) }
    };
    this.configureViewport(this.model.viewport);
    const configuredFloorIndex = Number.isInteger(config.activeFloor)
      ? config.activeFloor
      : config.floors?.findIndex((floorConfig) => floorConfig.id === this.currentFloorId);
    const floorIndex = configuredFloorIndex >= 0 ? configuredFloorIndex : 0;
    const floorConfig = config.floors?.[floorIndex] || config;
    this.currentFloorId = floorConfig.id || null;
    this.currentFloorHeight = Number(floorConfig.h ?? 0);
    if (!Number.isFinite(this.currentFloorHeight)) {
      throw new Error("floor.h precisa ser numérico");
    }
    if (this.floorSelect) {
      this.floorSelect.replaceChildren();
      if (config.floors?.length) {
        config.floors.forEach((availableFloor) => {
          const option = document.createElement("option");
          option.value = availableFloor.id || "";
          option.textContent = availableFloor.label || availableFloor.id || "Pavimento";
          this.floorSelect.append(option);
        });
        this.floorSelect.value = this.currentFloorId || "";
        this.floorSelect.disabled = false;
      } else {
        this.floorSelect.disabled = true;
      }
    }
    const title = floorConfig.label ? `${config.title || "Planta"} — ${floorConfig.label}` : config.title;
    if (title) {
      if (this.titleElement) this.titleElement.textContent = title;
      if (typeof document !== "undefined") document.title = title;
    }
    this.clear();
    this.prepareRoomReferences(config);
    this.validateInactiveFloorFeatures(config, floorIndex);
    this.prepareGlobalLists(config);
    try {
      this.renderTerrain(config.terrain);
    } catch (error) {
      this.errors.push({ category: "presentation", message: error.message });
    }
    const validRooms = (floorConfig.rooms ?? []).filter((room) => room.id
      && this.roomDefinitions.get(room.id) === room
      && !this.invalidRoomIds.has(room.id));
    this.addRooms(validRooms);
    this.addSpanningStairs(config, floorConfig);
    this.updateOverlaps();
    this.addVisibleVerticalOpenings(config, floorConfig);
    this.addZones(this.visibleZones(config, floorConfig).filter((zone) => this.validZoneIds.has(zone.id)));
    (floorConfig.items ?? []).forEach((item, index) => {
      try {
        this.addItem(item);
      } catch (error) {
        this.errors.push({ index, opening: item, category: "item", message: error.message });
      }
    });
    this.updateOverlaps();
    (floorConfig.openings ?? []).forEach((opening, index) => {
      if (this.isVerticalOpening(opening)) return;
      try {
        this.addOpening(opening);
      } catch (error) {
        this.errors.push({ index, opening, category: opening.type === "window" ? "window" : "opening", message: error.message });
      }
    });
    (floorConfig.windows ?? []).forEach((window, index) => {
      try {
        this.addWindow(window);
      } catch (error) {
        this.errors.push({ index, opening: window, category: "window", message: error.message });
      }
    });
    this.updateLayerVisibility();
    try {
      this.applyBuildingPlacement(config.building);
    } catch (error) {
      this.errors.push({ category: "presentation", message: error.message });
    }
    this.renderGuides(this.visibleGuides(config, floorConfig));
    this.updateSummary();
    if (this.reloadButton) this.reloadButton.disabled = false;
    if (this.dxfButton) this.dxfButton.disabled = false;
    return this;
  }

  async loadFile(file) {
    const sourceText = await file.text();
    const config = JSON.parse(sourceText);
    this.currentSourceText = sourceText;
    return this.load(config);
  }

  async reload() {
    let config;
    if (this.currentSourceText !== null) {
      config = JSON.parse(this.currentSourceText);
    } else {
      config = this.currentConfig;
    }
    if (!config) return this;
    if (config.floors) {
      const activeFloor = config.floors.findIndex((floorConfig) => floorConfig.id === this.currentFloorId);
      if (activeFloor >= 0) config = { ...config, activeFloor };
    }
    return this.load(config);
  }

  formatMeters(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  formatFixed(value) {
    return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  preparePrint() {
    const [siteWidth, siteHeight] = this.viewport.size;
    if (!(siteWidth > 0) || !(siteHeight > 0)) return;

    const mmToPx = 96 / 25.4;
    const printableWidth = 200 * mmToPx;
    // Reserve space for the printed title and its scale note above the plan.
    const printableHeight = (287 - 24) * mmToPx;
    const maxScale = Math.min(printableWidth / siteWidth, printableHeight / siteHeight);
    const printScale = Math.max(1, Math.floor(maxScale * 10) / 10);
    this.root.style.setProperty("--print-m", `${printScale}px`);
    this.root.dataset.printSplitRequired = "false";
  }

  clearPrintScale() {
    this.root.style.removeProperty("--print-m");
    delete this.root.dataset.printSplitRequired;
  }

  updateSummary() {
    this.roomElements.forEach((room) => {
      room.netArea = this.calculateNetRoomArea(room);
    });
    this.roomArea = this.roomElements.reduce((total, room) => total + room.netArea, 0);
    if (this.roomCountSummary) {
      this.roomCountSummary.textContent = `Total de cômodos: ${this.roomCount}`;
    }
    if (this.summary) {
      this.summary.textContent = `Área total: ${this.formatMeters(this.roomArea)}m²`;
    }
    if (this.boundsSummary) {
      const bounds = this.bounds();
      this.boundsSummary.textContent = bounds
        ? `Dimensões máximas: ${this.formatMeters(bounds.width)}m × ${this.formatMeters(bounds.height)}m`
        : "Dimensões máximas: —";
    }
    if (this.terrainSummary) {
      this.terrainSummary.textContent = this.terrainArea > 0
        ? `Área calculada do terreno: ${this.formatMeters(this.terrainArea)}m²`
        : "Área calculada do terreno: —";
    }
    this.updateRoomList();
    this.updateFloorSummary();
    this.updateItemList();
    this.updateOpeningList();
    this.updateWindowList();
    this.updateNaturalList();
    this.updateErrorList();
  }

  updateRoomList() {
    if (!this.roomList) return;

    this.roomList.replaceChildren();
    const header = document.createElement("div");
    header.className = "room-list-header";
    ["Cômodo", "Largura (m)", "Comprimento (m)", "Bruta (m²)", "Útil (m²)"].forEach((text) => {
      const cell = document.createElement("span");
      cell.textContent = text;
      header.append(cell);
    });
    this.roomList.append(header);
    const rooms = this.allRooms.length ? this.allRooms : this.roomElements.map((reference) => ({
      id: reference.dataset.id,
      label: reference.dataset.label,
      reference
    }));
    rooms.forEach((roomEntry, index) => {
      const room = roomEntry.reference || roomEntry;
      const activeRoom = this.roomElements.find((candidate) => candidate.dataset.id === roomEntry.id);
      const item = document.createElement("div");
      item.className = "room-list-item";

      const label = document.createElement("span");
      label.textContent = `${index + 1}. ${roomEntry.label || room.dataset.label || "Cômodo"}${roomEntry.floorLabel ? ` (${roomEntry.floorLabel})` : ""}`;

      const grossArea = document.createElement("span");
      grossArea.textContent = this.formatFixed(room.area());

      const netArea = document.createElement("span");
      netArea.textContent = this.formatFixed(activeRoom?.netArea ?? room.area());

      const width = document.createElement("span");
      width.textContent = this.formatFixed(room.w());

      const height = document.createElement("span");
      height.textContent = this.formatFixed(room.l());

      item.append(label, width, height, grossArea, netArea);
      this.roomList.append(item);
    });
  }

  updateFloorSummary() {
    if (!this.floorSummary) return;
    const floors = this.model?.floors ?? [{ id: null, label: "Planta", rooms: [] }];
    const rows = FloorPlanModel.floorRows(
      floors,
      this.roomDefinitions,
      this.rooms,
    );
    const total = {
      label: "Total geral",
      count: rows.reduce((sum, row) => sum + row.count, 0),
      width: rows.length ? Math.max(...rows.map((row) => row.width)) : 0,
      height: rows.length ? Math.max(...rows.map((row) => row.height)) : 0,
      area: rows.reduce((sum, row) => sum + row.area, 0)
    };
    const terrain = this.terrainDimensions
      ? { label: "Terreno", count: "—", width: this.terrainDimensions.width, height: this.terrainDimensions.height, area: this.terrainArea }
      : null;
    const table = document.createElement("table");
    table.className = "floor-summary-table";
    table.innerHTML = "<thead><tr><th>Local</th><th>Cômodos</th><th>Largura máx.</th><th>Comprimento máx.</th><th>Área</th></tr></thead>";
    const body = document.createElement("tbody");
    [...rows, total, ...(terrain ? [terrain] : [])].forEach((row) => {
      const tr = document.createElement("tr");
      if (row === total) tr.className = "floor-summary-total";
      [row.label, row.count, this.formatFixed(row.width), this.formatFixed(row.height), this.formatFixed(row.area)].forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        cell.textContent = index > 1 ? `${value} ${index === 4 ? "m²" : "m"}` : value;
        tr.append(cell);
      });
      body.append(tr);
    });
    table.append(body);
    this.floorSummary.replaceChildren(table);
  }

  updateItemList() {
    if (!this.itemList) return;

    this.itemList.replaceChildren();
    if (this.allItems.length === 0) {
      this.itemList.textContent = "Nenhum item carregado.";
      return;
    }
    this.allItems.forEach((item, index) => {
      const entry = document.createElement("div");
      entry.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = `${index + 1}. ${item.label || item.title || "Item"}`;
      const details = document.createElement("span");
      details.textContent = `${this.formatMeters(item.w)}m × ${this.formatMeters(item.l)}m${item.floorLabel ? ` — ${item.floorLabel}` : ""}`;
      entry.append(title, details);
      this.itemList.append(entry);
    });
  }

  updateOpeningList() {
    if (!this.openingList) return;

    this.openingList.replaceChildren();
    const openings = this.allOpenings.length ? this.allOpenings : this.openings;
    if (openings.length === 0) {
      this.openingList.textContent = "Nenhuma passagem carregada.";
      return;
    }

    openings.forEach((opening) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";

      const title = document.createElement("strong");
      title.textContent = opening.id;

      const details = document.createElement("span");
      const from = this.rooms.get(opening.roomId)?.dataset.label || opening.roomId;
      const to = opening.to === "exterior"
        ? "EXTERIOR"
        : this.rooms.get(opening.to)?.dataset.label || opening.to;
      details.textContent = `${opening.type} — ${from} → ${to} (${this.formatMeters(opening.w)}m)${opening.floorLabel ? ` — ${opening.floorLabel}` : ""}`;

      item.append(title, details);
      this.openingList.append(item);
    });
  }

  updateWindowList() {
    if (!this.windowList) return;

    this.windowList.replaceChildren();
    const windows = this.allWindows.length ? this.allWindows : this.windows;
    if (windows.length === 0) {
      this.windowList.textContent = "Nenhuma janela carregada.";
      return;
    }

    windows.forEach((window) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = window.id;
      const details = document.createElement("span");
      const from = this.rooms.get(window.roomId)?.dataset.label || window.roomId;
      const to = window.to === "exterior" ? "EXTERIOR" : this.rooms.get(window.to)?.dataset.label || window.to;
      details.textContent = `${from} → ${to} (${this.formatMeters(window.w)}m)${window.floorLabel ? ` — ${window.floorLabel}` : ""}`;
      item.append(title, details);
      this.windowList.append(item);
    });
  }

  findNaturalCommunications() {
    const communications = [];
    const pairs = [
      ["right", "left", "vertical"],
      ["bottom", "top", "horizontal"]
    ];
    for (let index = 0; index < this.roomElements.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < this.roomElements.length; otherIndex += 1) {
        const first = this.roomElements[index];
        const second = this.roomElements[otherIndex];

        for (const [firstSide, secondSide, orientation] of pairs) {
          if (first.wallState(firstSide) === "solid" || second.wallState(secondSide) === "solid") continue;

          const firstSegment = this.wallSegment(first, firstSide);
          const secondSegment = this.wallSegment(second, secondSide);
          if (Math.abs(firstSegment.coordinate - secondSegment.coordinate) >= 1e-9) continue;

          const start = Math.max(firstSegment.start, secondSegment.start);
          const end = Math.min(firstSegment.end, secondSegment.end);
          if (end <= start) continue;

          const firstId = first.dataset.id || `room-${index + 1}`;
          const secondId = second.dataset.id || `room-${otherIndex + 1}`;
          communications.push({
            id: `${firstId}-${secondId}`,
            firstId,
            secondId,
            firstLabel: first.dataset.label || firstId,
            secondLabel: second.dataset.label || secondId,
            orientation,
            length: end - start
          });
        }
      }
    }

    return communications;
  }

  updateNaturalList() {
    if (!this.naturalList) return;

    this.naturalCommunications = this.findNaturalCommunications();
    this.naturalList.replaceChildren();
    if (this.naturalCommunications.length === 0) {
      this.naturalList.textContent = "Nenhuma comunicação natural detectada.";
      return;
    }

    this.naturalCommunications.forEach((communication) => {
      const item = document.createElement("div");
      item.className = "natural-list-item";

      const title = document.createElement("strong");
      title.textContent = communication.id;

      const details = document.createElement("span");
      details.textContent = `abertura sem parede — ${communication.firstLabel} → ${communication.secondLabel} (${this.formatMeters(communication.length)}m)`;

      item.append(title, details);
      this.naturalList.append(item);
    });
  }

  updateErrorList() {
    if (!this.errorList) return;

    this.errorList.replaceChildren();
    if (this.errors.length === 0) {
      this.errorList.textContent = "Nenhum erro.";
      return;
    }

    this.errors.forEach(({ index, id, opening, category = "opening", message }) => {
      const item = document.createElement("div");
      item.className = "error-list-item";
      const labels = { window: "Janela", item: "Item", room: "Cômodo", presentation: "Apresentação", opening: "Passagem", collision: "Colisão", overlap: "Sobreposição", zone: "Zona", object: "Objeto", guide: "Guia", floor: "Piso" };
      const name = id || (index === undefined ? "" : ` ${index + 1}`);
      item.textContent = `${labels[category] || "Erro"}${name ? ` ${name}` : ""}: ${message} `;
      const source = document.createElement("code");
      if (opening !== undefined) source.textContent = JSON.stringify(opening);
      item.append(source);
      this.errorList.append(item);
    });
  }

  asciiLayout() {
    const bounds = this.bounds();
    if (!bounds) return "(nenhum cômodo carregado)";

    const step = 0.25;
    const columns = Math.ceil(bounds.width / step) + 1;
    const rows = Math.ceil(bounds.height / step) + 1;
    const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ({ mask: 0, character: " " })));
    const directions = { north: 1, east: 2, south: 4, west: 8 };
    const column = (value) => Math.max(0, Math.min(columns - 1, Math.round((value - bounds.x0) / step)));
    const row = (value) => Math.max(0, Math.min(rows - 1, Math.round((value - bounds.y0) / step)));
    const connect = (x, y, direction) => {
      if (x < 0 || x >= columns || y < 0 || y >= rows) return;
      grid[y][x].mask |= direction;
    };
    const remove = (x, y, direction) => {
      if (x < 0 || x >= columns || y < 0 || y >= rows) return;
      grid[y][x].mask &= ~direction;
    };
    const setVirtual = (x, y, character) => {
      if (x < 0 || x >= columns || y < 0 || y >= rows) return;
      if (grid[y][x].mask === 0) grid[y][x].character = character;
    };
    const addHorizontal = (x, y, state) => {
      if (state === "open") return;
      if (state === "virtual") return setVirtual(x, y, "┄");
      connect(x, y, directions.east | directions.west);
    };
    const addVertical = (x, y, state) => {
      if (state === "open") return;
      if (state === "virtual") return setVirtual(x, y, "┆");
      connect(x, y, directions.north | directions.south);
    };
    const glyphs = {
      0: "  ", 1: "│ ", 2: "──", 3: "└─", 4: "│ ", 5: "│ ", 6: "┌─", 7: "├─",
      8: "─ ", 9: "┘ ", 10: "──", 11: "┴ ", 12: "┐ ", 13: "┤ ", 14: "┬ ", 15: "┼ "
    };

    this.roomElements.forEach((room) => {
      const left = column(room.x0());
      const right = column(room.x1());
      const top = row(room.y0());
      const bottom = row(room.y1());
      const walls = room.walls || {};
      const horizontal = (y, state) => {
        for (let x = left; x <= right; x += 1) addHorizontal(x, y, state);
      };
      const vertical = (x, state) => {
        for (let y = top; y <= bottom; y += 1) addVertical(x, y, state);
      };
      horizontal(top, walls.top);
      horizontal(bottom, walls.bottom);
      vertical(left, walls.left);
      vertical(right, walls.right);

      const label = (room.dataset.label || room.dataset.id || "Cômodo").toUpperCase();
      const labelRow = Math.min(bottom - 1, Math.max(top + 1, Math.round((top + bottom) / 2)));
      const available = Math.max(0, right - left - 1);
      if (available > 1) {
        const text = label.slice(0, available);
        const start = left + 1 + Math.max(0, Math.floor((available - text.length) / 2));
        [...text].forEach((character, index) => {
          if (start + index < right && grid[labelRow][start + index].mask === 0) grid[labelRow][start + index].character = character;
        });
      }
    });

    this.openings.forEach((opening) => {
      const room = this.rooms.get(opening.roomId);
      if (!room) return;
      const wall = opening.wall;
      const start = opening.position;
      const end = start + opening.w;
      const horizontal = wall === "top" || wall === "bottom";
      const startPoint = horizontal ? room.x0() : room.y0();
      const from = Math.round((startPoint + start - (horizontal ? bounds.x0 : bounds.y0)) / step);
      const to = Math.round((startPoint + end - (horizontal ? bounds.x0 : bounds.y0)) / step);
      const fixed = horizontal
        ? row(wall === "top" ? room.y0() : room.y1())
        : column(wall === "left" ? room.x0() : room.x1());
      for (let position = from; position <= to; position += 1) {
        if (horizontal) {
          grid[fixed][position].mask = 0;
          grid[fixed][position].character = " ";
        } else {
          grid[position][fixed].mask = 0;
          grid[position][fixed].character = " ";
        }
      }
      if (to > from) {
        if (horizontal) {
          remove(from - 1, fixed, directions.east);
          remove(to + 1, fixed, directions.west);
          const inward = wall === "top" ? directions.south : directions.north;
          grid[fixed][from].mask = (wall === "top" ? directions.south | directions.west : directions.north | directions.west);
          grid[fixed][to].mask = (wall === "top" ? directions.south | directions.east : directions.north | directions.east);
          grid[fixed][from].mask |= inward;
          grid[fixed][to].mask |= inward;
        } else {
          remove(fixed, from - 1, directions.south);
          remove(fixed, to + 1, directions.north);
          const inward = wall === "left" ? directions.east : directions.west;
          grid[from][fixed].mask = (wall === "left" ? directions.north | directions.east : directions.north | directions.west);
          grid[to][fixed].mask = (wall === "left" ? directions.south | directions.east : directions.south | directions.west);
          grid[from][fixed].mask |= inward;
          grid[to][fixed].mask |= inward;
        }
      }
    });

    return grid.map((line) => line.map((cell) => cell.mask ? glyphs[cell.mask] : (cell.character === "┄" ? "┄┄" : cell.character === "┆" ? "┆ " : `${cell.character} `)).join("").replace(/ +$/u, "")).join("\n");
  }

  markdownText(value) {
    return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  }

  downloadMarkdownLegacy(filename = "planta-terrea-layout.md") {
    if (!this.currentConfig) {
      alert("Carregue uma planta antes de exportar o layout.");
      return;
    }

    const lines = [`# ${this.currentConfig.title || "Layout da planta térrea"}`, "", "## Cômodos", "", "| # | ID | Nome | x | y | Largura | Altura | Área bruta | Área útil | Paredes |", "|---:|---|---|---:|---:|---:|---:|---:|---:|---|"];
    const rooms = this.allRooms.length ? this.allRooms : this.roomElements.map((reference) => ({ reference }));
    rooms.forEach((roomEntry, index) => {
      const room = roomEntry.reference || roomEntry;
      const walls = ["top", "right", "bottom", "left"]
        .filter((side) => room.wallState?.(side) === "solid")
        .join(", ") || "—";
      const activeRoom = this.roomElements.find((candidate) => candidate.dataset.id === roomEntry.id);
      lines.push(`| ${index + 1} | ${this.markdownText(roomEntry.id || room.dataset?.id || "—")} | ${this.markdownText(roomEntry.label || room.dataset?.label || "Cômodo")}${roomEntry.floorLabel ? ` (${this.markdownText(roomEntry.floorLabel)})` : ""} | ${this.formatMeters(room.x0())} | ${this.formatMeters(room.y0())} | ${this.formatMeters(room.w())} | ${this.formatMeters(room.l())} | ${this.formatMeters(room.area())} | ${this.formatMeters(activeRoom?.netArea ?? room.area())} | ${walls} |`);
    });

    lines.push("", `**Total:** ${this.roomCount} cômodos · ${this.formatMeters(this.roomArea)} m² (área líquida, com descontos de sobreposição)`);
    lines.push("", "## Itens", "", "| # | Nome | x | y | Largura | Altura | Área | Classes | Sobrepõe |", "|---:|---|---:|---:|---:|---:|---:|---|---|");
    const items = this.allItems.length ? this.allItems : this.itemElements;
    if (items.length === 0) {
      lines.push("| — | Nenhum item definido |  |  |  |  |  |  |");
    } else {
      items.forEach((item, index) => {
        const classes = item.classes || [...(item.classList || [])]
          .filter((className) => !["plan-item", "plan-generated"].includes(className))
          .join(", ") || "—";
        const overlaps = item.overlaps || item.allowedOverlaps?.join(", ") || "—";
        const x = item.x0 ? item.x0() : item.x;
        const y = item.y0 ? item.y0() : item.y;
        const w = item.w instanceof Function ? item.w() : item.w;
        const l = item.l instanceof Function ? item.l() : item.l;
        const area = item.area instanceof Function ? item.area() : w * l;
        lines.push(`| ${index + 1} | ${this.markdownText(item.label || item.dataset?.label || item.title || "Item")}${item.floorLabel ? ` (${this.markdownText(item.floorLabel)})` : ""} | ${this.formatMeters(x)} | ${this.formatMeters(y)} | ${this.formatMeters(w)} | ${this.formatMeters(l)} | ${this.formatMeters(area)} | ${this.markdownText(classes)} | ${this.markdownText(overlaps)} |`);
      });
    }
    lines.push("", "## Passagens", "", "| ID | De | Para | Tipo | Parede | Posição | Largura |", "|---|---|---|---|---|---:|---:|");
    const openings = this.allOpenings.length ? this.allOpenings : this.openings;
    if (openings.length === 0) {
      lines.push("| — | Nenhuma passagem definida |  |  |  |  |  |");
    } else {
      openings.forEach((opening) => {
        lines.push(`| ${this.markdownText(opening.id)} | ${this.markdownText(opening.roomId)} | ${this.markdownText(opening.to)} | ${this.markdownText(opening.type)} | ${opening.wall} | ${this.formatMeters(opening.position)} | ${this.formatMeters(opening.w)} |`);
      });
    }

    lines.push("", "## Janelas", "", "| ID | De | Para | Parede | Posição | Largura |", "|---|---|---|---|---:|---:|");
    const windows = this.allWindows.length ? this.allWindows : this.windows;
    if (windows.length === 0) {
      lines.push("| — | Nenhuma janela definida |  |  |  |  |");
    } else {
      windows.forEach((window) => {
        lines.push(`| ${this.markdownText(window.id)} | ${this.markdownText(window.roomId)} | ${this.markdownText(window.to)} | ${window.wall} | ${this.formatMeters(window.position)} | ${this.formatMeters(window.w)} |`);
      });
    }

    lines.push("", "## Comunicações naturais", "");
    if (this.naturalCommunications.length === 0) {
      lines.push("Nenhuma comunicação natural detectada.");
    } else {
      this.naturalCommunications.forEach((communication) => {
        lines.push(`- **${this.markdownText(communication.id)}:** ${this.markdownText(communication.firstId)} → ${this.markdownText(communication.secondId)} (${this.formatMeters(communication.length)} m, orientação ${communication.orientation})`);
      });
    }

    if (this.errors.length > 0) {
      lines.push("", "## Elementos com erro", "", ...this.errors.map(({ opening, id, category = "opening", message }) => {
        const labels = { window: "Janela", item: "Item", room: "Cômodo", presentation: "Apresentação", opening: "Passagem", collision: "Colisão", overlap: "Sobreposição", zone: "Zona", object: "Objeto", guide: "Guia", floor: "Piso" };
        const label = `${labels[category] || "Erro"}${id ? ` ${id}` : ""}`;
        const source = opening === undefined ? "" : ` \`${this.markdownText(JSON.stringify(opening))}\``;
        return `- **${label}:**${source} ${this.markdownText(message)}`;
      }));
    }

    lines.push("", "## ASCII art", "", "```text", this.asciiLayout(), "```");

    FloorPlanExport.downloadText(`${lines.join("\n")}\n`, filename, "text/markdown;charset=utf-8");
  }

  downloadMarkdown(filename = "planta-layout.md") {
    if (!this.currentConfig) {
      alert("Carregue uma planta antes de exportar o layout.");
      return;
    }

    const lines = [`# ${this.currentConfig.title || "Layout da planta"}`];
    const floors = this.model?.floors ?? [{ id: null, label: "Planta", rooms: [] }];
    const rooms = this.allRooms.length
      ? this.allRooms
      : this.roomElements.map((reference) => ({ reference, floorId: this.currentFloorId }));
    const items = this.allItems.length ? this.allItems : this.itemElements;
    const openings = this.allOpenings.length ? this.allOpenings : this.openings;
    const windows = this.allWindows.length ? this.allWindows : this.windows;
    const floorRows = FloorPlanModel.floorRows(
      floors,
      this.roomDefinitions,
      this.rooms,
    );

    floors.forEach((floor, floorIndex) => {
      const floorId = floor.id ?? null;
      const floorName = floor.label || floor.id || `Piso ${floorIndex + 1}`;
      const floorRooms = rooms.filter((entry) => (entry.floorId ?? null) === floorId);
      const floorItems = items.filter((item) => (item.floorId ?? null) === floorId);
      const floorOpenings = openings.filter((opening) => (opening.floorId ?? null) === floorId);
      const floorWindows = windows.filter((window) => (window.floorId ?? null) === floorId);

      lines.push("", `## ${this.markdownText(floorName)}`);
      lines.push("", "### Cômodos", "", "| # | ID | Nome | x | y | Largura | Comprimento | Área bruta | Área útil | Paredes |", "|---:|---|---|---:|---:|---:|---:|---:|---:|---|");
      if (floorRooms.length === 0) {
        lines.push("| — | Nenhum cômodo definido |  |  |  |  |  |  |  |  |");
      } else {
        floorRooms.forEach((entry, index) => {
          const room = entry.reference || entry;
          const walls = ["top", "right", "bottom", "left"]
            .filter((side) => room.wallState?.(side) === "solid")
            .join(", ") || "—";
          const activeRoom = this.roomElements.find((candidate) => candidate.dataset.id === entry.id);
          lines.push(`| ${index + 1} | ${this.markdownText(entry.id || room.dataset?.id || "—")} | ${this.markdownText(entry.label || room.dataset?.label || "Cômodo")} | ${this.formatMeters(room.x0())} | ${this.formatMeters(room.y0())} | ${this.formatMeters(room.w())} | ${this.formatMeters(room.l())} | ${this.formatMeters(room.area())} | ${this.formatMeters(activeRoom?.netArea ?? room.area())} | ${walls} |`);
        });
      }
      const floorArea = floorRows[floorIndex]?.area ?? 0;
      lines.push("", `**Total do piso:** ${floorRows[floorIndex]?.count ?? floorRooms.length} cômodos · ${this.formatMeters(floorArea)} m²`);

      lines.push("", "### Itens", "", "| # | Nome | x | y | Largura | Comprimento | Área | Classes | Sobrepõe |", "|---:|---|---:|---:|---:|---:|---:|---|---|");
      if (floorItems.length === 0) {
        lines.push("| — | Nenhum item definido |  |  |  |  |  |  |  |");
      } else {
        floorItems.forEach((item, index) => {
          const classes = item.classes || [...(item.classList || [])]
            .filter((className) => !["plan-item", "plan-generated"].includes(className))
            .join(", ") || "—";
          const overlaps = item.overlaps || item.allowedOverlaps?.join(", ") || "—";
          const x = item.x0 ? item.x0() : item.x;
          const y = item.y0 ? item.y0() : item.y;
          const w = item.w instanceof Function ? item.w() : item.w;
          const l = item.l instanceof Function ? item.l() : item.l;
          const area = item.area instanceof Function ? item.area() : w * l;
          lines.push(`| ${index + 1} | ${this.markdownText(item.label || item.dataset?.label || item.title || "Item")} | ${this.formatMeters(x)} | ${this.formatMeters(y)} | ${this.formatMeters(w)} | ${this.formatMeters(l)} | ${this.formatMeters(area)} | ${this.markdownText(classes)} | ${this.markdownText(overlaps)} |`);
        });
      }

      lines.push("", "### Passagens", "", "| ID | De | Para | Tipo | Parede | Posição | Largura |", "|---|---|---|---|---|---:|---:|");
      if (floorOpenings.length === 0) {
        lines.push("| — | Nenhuma passagem definida |  |  |  |  |  |");
      } else {
        floorOpenings.forEach((opening) => {
          lines.push(`| ${this.markdownText(opening.id)} | ${this.markdownText(opening.roomId)} | ${this.markdownText(opening.to)} | ${this.markdownText(opening.type)} | ${opening.wall} | ${this.formatMeters(opening.position)} | ${this.formatMeters(opening.w)} |`);
        });
      }

      lines.push("", "### Janelas", "", "| ID | De | Para | Parede | Posição | Largura |", "|---|---|---|---|---:|---:|");
      if (floorWindows.length === 0) {
        lines.push("| — | Nenhuma janela definida |  |  |  |  |");
      } else {
        floorWindows.forEach((window) => {
          lines.push(`| ${this.markdownText(window.id)} | ${this.markdownText(window.roomId)} | ${this.markdownText(window.to)} | ${window.wall} | ${this.formatMeters(window.position)} | ${this.formatMeters(window.w)} |`);
        });
      }
    });

    lines.push("", "## Comunicações naturais do piso ativo", "");
    if (this.naturalCommunications.length === 0) {
      lines.push("Nenhuma comunicação natural detectada.");
    } else {
      this.naturalCommunications.forEach((communication) => {
        lines.push(`- **${this.markdownText(communication.id)}:** ${this.markdownText(communication.firstId)} → ${this.markdownText(communication.secondId)} (${this.formatMeters(communication.length)} m, orientação ${communication.orientation})`);
      });
    }

    if (this.errors.length > 0) {
      lines.push("", "## Elementos com erro", "", ...this.errors.map(({ opening, id, category = "opening", message }) => {
        const labels = { window: "Janela", item: "Item", room: "Cômodo", presentation: "Apresentação", opening: "Passagem", collision: "Colisão", overlap: "Sobreposição", zone: "Zona", object: "Objeto", guide: "Guia", floor: "Piso" };
        const label = `${labels[category] || "Erro"}${id ? ` ${id}` : ""}`;
        const source = opening === undefined ? "" : ` \`${this.markdownText(JSON.stringify(opening))}\``;
        return `- **${label}:**${source} ${this.markdownText(message)}`;
      }));
    }

    lines.push("", "## ASCII art", "", "```text", this.asciiLayout(), "```");
    FloorPlanExport.downloadText(`${lines.join("\n")}\n`, filename, "text/markdown;charset=utf-8");
  }

  async downloadHtml(filename = "planta-terrea-gerada.html") {
    const exportedDocument = document.cloneNode(true);
    const livePlan = document.querySelector("#floor-plan");
    const exportedPlan = exportedDocument.querySelector("#floor-plan");

    // Snapshot the currently selected floor after all dynamic rendering and
    // projection layers have been updated.
    if (livePlan && exportedPlan) {
      exportedPlan.replaceWith(livePlan.cloneNode(true));
    }

    exportedDocument.querySelectorAll("#json-file, #load-json, #reload-json, #download-html, #download-markdown, #download-dxf, #floor-select, .floor-selector, #plan-status, #terrain-compass-rose-data")
      .forEach((element) => element.remove());
    exportedDocument.querySelectorAll("script").forEach((script) => script.remove());

    const stylesheetLinks = [...document.querySelectorAll('link[rel="stylesheet"]')];
    const fallbackLinks = [];
    const embeddedCss = document.querySelector("#portable-export-css")?.content.textContent.trim();
    const styles = embeddedCss ? [embeddedCss] : [];
    if (!embeddedCss) {
      for (const link of stylesheetLinks) {
        const sheet = link.sheet;
        if (!sheet) {
          fallbackLinks.push(link);
          continue;
        }
        try {
          styles.push(...[...sheet.cssRules].map((rule) => rule.cssText));
        } catch {
          try {
            const response = await fetch(link.href);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            styles.push(await response.text());
          } catch {
            fallbackLinks.push(link);
          }
        }
      }
    }
    exportedDocument.querySelector("#portable-export-css")?.remove();
    exportedDocument.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
    if (styles.length > 0) {
      const style = exportedDocument.createElement("style");
      style.textContent = styles.join("\n");
      exportedDocument.head.append(style);
    }
    fallbackLinks.forEach((link) => {
      const fallback = exportedDocument.createElement("link");
      fallback.rel = "stylesheet";
      fallback.href = new URL(link.getAttribute("href"), document.baseURI).href;
      exportedDocument.head.append(fallback);
    });

    const html = `<!doctype html>\n${exportedDocument.documentElement.outerHTML}`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}

window.FloorPlan = FloorPlan;
