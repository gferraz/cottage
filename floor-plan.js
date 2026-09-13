class FloorPlan {
  constructor({ root, terrainLayer = null, roomList = null, roomCountSummary = null, summary = null, boundsSummary = null, terrainSummary = null, openingList = null, windowList = null, naturalList = null, errorList = null, downloadButton = null, markdownButton = null, jsonInput = null, reloadButton = null, scale = 56 }) {
    this.root = root;
    this.terrainLayer = terrainLayer;
    this.roomList = roomList;
    this.roomCountSummary = roomCountSummary;
    this.summary = summary;
    this.boundsSummary = boundsSummary;
    this.terrainSummary = terrainSummary;
    this.openingList = openingList;
    this.windowList = windowList;
    this.naturalList = naturalList;
    this.errorList = errorList;
    this.downloadButton = downloadButton;
    this.markdownButton = markdownButton;
    this.jsonInput = jsonInput;
    this.reloadButton = reloadButton;
    this.roomArea = 0;
    this.roomCount = 0;
    this.rooms = new Map();
    this.roomElements = [];
    this.itemElements = [];
    this.openings = [];
    this.windows = [];
    this.naturalCommunications = [];
    this.currentConfig = null;
    this.currentSourceText = null;
    this.terrainArea = 0;
    this.terrainReference = null;

    root.style.setProperty("--m", `${scale}px`);
    if (downloadButton) downloadButton.addEventListener("click", () => this.downloadHtml());
    if (markdownButton) markdownButton.addEventListener("click", () => this.downloadMarkdown());
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

  add(data) {
    const { label = "", classes = "", title = "", room = false, showLabel = false } = data;
    const { x, y, w, h } = this.normalizeGeometry(data);
    const element = document.createElement("div");
    element.className = `plan-item plan-generated${room ? " room" : ""}${classes ? ` ${classes}` : ""}`;
    element.style.setProperty("--x", x);
    element.style.setProperty("--y", y);
    element.style.setProperty("--w", w);
    element.style.setProperty("--h", h);
    if (title) element.title = title;
    if (!room && showLabel && (label || title)) {
      const dimensions = `${this.formatMeters(w)}m × ${this.formatMeters(h)}m`;
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
    element.y1 = () => Number(y) + Number(h);
    element.w = () => Number(w);
    element.h = () => Number(h);
    element.area = () => Number(w) * Number(h);

    if (room) {
      if (data.id) element.dataset.id = data.id;
      element.dataset.label = label;
      const roomLabel = document.createElement("span");
      roomLabel.className = "room-label";
      roomLabel.textContent = label;
      element.append(roomLabel);
      const dimensions = document.createElement("small");
      dimensions.textContent = `${this.formatMeters(w)}m × ${this.formatMeters(h)}m`;
      element.append(dimensions);

      const area = document.createElement("small");
      area.className = "area";
      area.textContent = `Área: ${this.formatMeters(element.area())}m²`;
      element.append(area);
    }

    this.root.append(element);
    return element;
  }

  addRoom(room) {
    const parts = room.parts?.map((part, index) => ({
      ...this.normalizeGeometry(part),
      id: part.id || `part-${index + 1}`
    }));
    const geometry = parts?.length
      ? {
        x: Math.min(...parts.map((part) => part.x)),
        y: Math.min(...parts.map((part) => part.y)),
        w: Math.max(...parts.map((part) => part.x + part.w)) - Math.min(...parts.map((part) => part.x)),
        h: Math.max(...parts.map((part) => part.y + part.h)) - Math.min(...parts.map((part) => part.y))
      }
      : {};
    const roomData = parts?.length
      ? { ...room, pos: [geometry.x, geometry.y], size: [geometry.w, geometry.h] }
      : room;
    const element = this.add({ ...roomData, room: true });
    element.allowedOverlaps = room.overlaps === undefined
      ? []
      : (Array.isArray(room.overlaps) ? room.overlaps : [room.overlaps]).map(String);
    element.geometryParts = parts?.length
      ? parts.map(({ x, y, w, h }) => ({ x, y, w, h }))
      : [{ x: element.x0(), y: element.y0(), w: element.w(), h: element.h() }];
    if (parts?.length) {
      element.classList.add("compound-room");
      element.partReferences = new Map(parts.map((part) => [part.id, {
        x0: () => part.x,
        x1: () => part.x + part.w,
        y0: () => part.y,
        y1: () => part.y + part.h,
        w: () => part.w,
        h: () => part.h,
        area: () => part.w * part.h
      }]));
      parts.forEach((part) => {
        const partElement = document.createElement("div");
        partElement.className = `room-part${room.classes ? ` ${room.classes}` : ""}`;
        partElement.style.left = `calc((${part.x} - var(--x)) * var(--m))`;
        partElement.style.top = `calc((${part.y} - var(--y)) * var(--m))`;
        partElement.style.width = `calc(${part.w} * var(--m))`;
        partElement.style.height = `calc(${part.h} * var(--m))`;
        const walls = this.normalizeWalls(part.walls ?? room.walls);
        ["top", "right", "bottom", "left"].forEach((side) => {
          partElement.dataset[`wall${side[0].toUpperCase()}${side.slice(1)}`] = walls[side];
        });
        element.prepend(partElement);
      });
      element.area = () => parts.reduce((total, part) => total + part.w * part.h, 0);
    }
    this.roomElements.push(element);
    if (room.id) this.rooms.set(room.id, element);
    this.updateOverlaps();
    this.roomArea += element.area();
    this.roomCount += 1;
    this.updateSummary();
    return element;
  }

  addRooms(rooms) {
    let pending = [...rooms];
    while (pending.length > 0) {
      const next = [];
      let added = 0;
      let lastError = null;

      pending.forEach((room) => {
        try {
          this.addRoom(room);
          added += 1;
        } catch (error) {
          if (error.message.startsWith("Unknown room reference:") || error.message.startsWith("Unknown room reference")) {
            next.push(room);
            lastError = error;
          } else {
            throw error;
          }
        }
      });

      if (added === 0) throw lastError || new Error("Unable to resolve room references");
      pending = next;
    }
  }

  normalizeGeometry(data) {
    const [xValue, yValue] = data.pos ?? [data.x, data.y];
    const [wValue, hValue] = data.size ?? [data.w, data.h];

    if ([xValue, yValue, wValue, hValue].some((value) => value === undefined)) {
      throw new Error("A room needs pos/size or x/y/w/h values");
    }

    return {
      ...data,
      x: this.resolve(xValue),
      y: this.resolve(yValue),
      w: this.resolve(wValue),
      h: this.resolve(hValue)
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
    this.root.style.removeProperty("--site-width");
    this.root.style.removeProperty("--site-height");
    this.root.style.removeProperty("--plan-offset-x");
    this.root.style.removeProperty("--plan-offset-y");
    this.root.style.removeProperty("--building-offset-x");
    this.root.style.removeProperty("--building-offset-y");
    this.terrainArea = 0;
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

    const bounds = this.bounds();
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
    const siteWidth = Math.max(19, width + terrainPadding * 2);
    const siteHeight = Math.max(25, height + terrainPadding * 2);
    this.root.style.setProperty("--plan-offset-x", offsetX);
    this.root.style.setProperty("--plan-offset-y", offsetY);
    this.root.style.setProperty("--site-width", siteWidth);
    this.root.style.setProperty("--site-height", siteHeight);
    this.root.style.setProperty("--building-offset-x", offsetX);
    this.root.style.setProperty("--building-offset-y", offsetY);
    this.terrainReference = {
      frontStart: { x: offsetX, y: offsetY }
    };
    this.terrainLayer.setAttribute("viewBox", `0 0 ${siteWidth} ${siteHeight}`);
    this.terrainLayer.setAttribute("preserveAspectRatio", "none");

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
    const northBaseX = siteWidth - 2.4;
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

  resolve(value) {
    if (typeof value === "number") return value;

    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }

    if (typeof value === "object" && value !== null) {
      return this.resolve(value.from) + Number(value.delta ?? 0);
    }

    const reference = String(value).trim();
    const partMatch = reference.match(
      /^([\w-]+)\.([\w-]+)\.(x0|x1|y0|y1|w|h|area)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/
    );
    if (partMatch) {
      const [, roomId, partId, method, operator, amount] = partMatch;
      const room = this.rooms.get(roomId);
      if (!room) throw new Error(`Unknown room reference: ${roomId}`);
      const part = room.partReferences?.get(partId);
      if (!part) throw new Error(`Unknown part reference: ${roomId}.${partId}`);
      const offset = amount ? Number(amount) : 0;
      return part[method]() + (operator === "-" ? -offset : offset);
    }

    const match = reference.match(
      /^([\w-]+)\.(x0|x1|y0|y1|w|h|area)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/
    );

    if (!match) throw new Error(`Invalid geometric reference: ${value}`);

    const [, roomId, method, operator, amount] = match;
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown room reference: ${roomId}`);

    const offset = amount ? Number(amount) : 0;
    return room[method]() + (operator === "-" ? -offset : offset);
  }

  addItem(item) {
    const element = this.add({ ...item, showLabel: true });
    element.allowedOverlaps = item.overlaps === undefined
      ? []
      : (Array.isArray(item.overlaps) ? item.overlaps : [item.overlaps]).map(String);
    this.itemElements.push(element);
    return element;
  }

  addOpening(opening) {
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
      h: feature.horizontal ? wallThickness : feature.w,
      classes: `${baseClass} opening-${feature.type} opening-${feature.horizontal ? "horizontal" : "vertical"}`,
      title: `${feature.type}: ${feature.id}`
    });
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
    const wallLength = horizontal ? room.w() : room.h();
    let sharedStart = null;
    let sharedEnd = null;
    if (target !== "exterior") {
      const targetRoom = this.rooms.get(target);
      const oppositeWall = { top: "bottom", right: "left", bottom: "top", left: "right" }[wall];
      const targetWall = this.wallSegment(targetRoom, oppositeWall);
      const sourceWall = this.wallSegment(room, wall);
      if (Math.abs(sourceWall.coordinate - targetWall.coordinate) >= 1e-9) {
        throw new Error(`Room ${target} is not connected to ${opening.from}`);
      }
      sharedStart = Math.max(sourceWall.start, targetWall.start);
      sharedEnd = Math.min(sourceWall.end, targetWall.end);
      if (sharedEnd <= sharedStart) throw new Error(`Room ${target} is not connected to ${opening.from}`);
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
      if (openingStart < sharedStart || openingEnd > sharedEnd) {
        throw new Error(`Room ${target} is not connected to ${opening.from}`);
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

  updateOverlaps() {
    const rooms = this.roomElements;
    rooms.forEach((room) => room.classList.remove("room-overlap"));

    const pieces = rooms.flatMap((room) => room.geometryParts.map((part) => ({ room, part })));
    const epsilon = 1e-9;
    for (let index = 0; index < pieces.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < pieces.length; otherIndex += 1) {
        const first = pieces[index];
        const second = pieces[otherIndex];
        const overlapWidth = Math.min(first.part.x + first.part.w, second.part.x + second.part.w)
          - Math.max(first.part.x, second.part.x);
        const overlapHeight = Math.min(first.part.y + first.part.h, second.part.y + second.part.h)
          - Math.max(first.part.y, second.part.y);
        const overlaps = overlapWidth > epsilon && overlapHeight > epsilon;
        const allowed = first.room.allowedOverlaps.includes(second.room.dataset.id)
          || second.room.allowedOverlaps.includes(first.room.dataset.id);

        if (overlaps && !allowed) {
          first.room.classList.add("room-overlap");
          second.room.classList.add("room-overlap");
        }
      }
    }
  }

  calculateRoomArea() {
    return this.calculateUnionArea(this.roomElements.flatMap((room) => room.geometryParts));
  }

  calculateUnionArea(rectangles) {
    if (rectangles.length === 0) return 0;

    const xs = [...new Set(rectangles.flatMap(({ x, w }) => [x, x + w]))].sort((a, b) => a - b);
    const ys = [...new Set(rectangles.flatMap(({ y, h }) => [y, y + h]))].sort((a, b) => a - b);
    let area = 0;

    for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
      for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
        const x0 = xs[xIndex];
        const x1 = xs[xIndex + 1];
        const y0 = ys[yIndex];
        const y1 = ys[yIndex + 1];
        const covered = rectangles.some((rectangle) =>
          rectangle.x <= x0 && rectangle.x + rectangle.w >= x1
          && rectangle.y <= y0 && rectangle.y + rectangle.h >= y1
        );
        if (covered) area += (x1 - x0) * (y1 - y0);
      }
    }

    return area;
  }

  calculateNetRoomArea(room) {
    const coveredBy = this.roomElements
      .filter((other) => other !== room && other.allowedOverlaps.includes(room.dataset.id))
      .flatMap((other) => other.geometryParts);
    const itemOverlaps = this.itemElements
      .filter((item) => item.allowedOverlaps.includes(room.dataset.id))
      .map((item) => ({ x: item.x0(), y: item.y0(), w: item.w(), h: item.h() }));
    coveredBy.push(...itemOverlaps);
    const deductions = [];
    room.geometryParts.forEach((part) => {
      coveredBy.forEach((other) => {
        const x0 = Math.max(part.x, other.x);
        const y0 = Math.max(part.y, other.y);
        const x1 = Math.min(part.x + part.w, other.x + other.w);
        const y1 = Math.min(part.y + part.h, other.y + other.h);
        if (x1 > x0 && y1 > y0) deductions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      });
    });
    const grossArea = room.geometryParts.reduce((total, part) => total + part.w * part.h, 0);
    return grossArea - this.calculateUnionArea(deductions);
  }

  clear() {
    this.root.querySelectorAll(".plan-generated").forEach((element) => element.remove());
    this.clearTerrain();
    this.rooms.clear();
    this.roomElements = [];
    this.itemElements = [];
    this.openings = [];
    this.windows = [];
    this.errors = [];
    this.roomArea = 0;
    this.roomCount = 0;
    this.updateSummary();
  }

  load(config) {
    this.currentConfig = config;
    this.clear();
    this.renderTerrain(config.terrain);
    this.addRooms(config.rooms ?? []);
    (config.items ?? []).forEach((item) => this.addItem(item));
    (config.openings ?? []).forEach((opening, index) => {
      try {
        this.addOpening(opening);
      } catch (error) {
        this.errors.push({ index, opening, category: opening.type === "window" ? "window" : "opening", message: error.message });
      }
    });
    (config.windows ?? []).forEach((window, index) => {
      try {
        this.addWindow(window);
      } catch (error) {
        this.errors.push({ index, opening: window, category: "window", message: error.message });
      }
    });
    this.applyBuildingPlacement(config.building);
    this.updateSummary();
    if (this.reloadButton) this.reloadButton.disabled = false;
    return this;
  }

  async loadFile(file) {
    const sourceText = await file.text();
    const config = JSON.parse(sourceText);
    this.currentSourceText = sourceText;
    return this.load(config);
  }

  async reload() {
    if (this.currentSourceText !== null) {
      const config = JSON.parse(this.currentSourceText);
      return this.load(config);
    }
    if (!this.currentConfig) return this;
    return this.load(this.currentConfig);
  }

  formatMeters(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  preparePrint() {
    const siteWidth = Number.parseFloat(getComputedStyle(this.root).getPropertyValue("--site-width"));
    const siteHeight = Number.parseFloat(getComputedStyle(this.root).getPropertyValue("--site-height"));
    if (!(siteWidth > 0) || !(siteHeight > 0)) return;

    const mmToPx = 96 / 25.4;
    const printableWidth = 200 * mmToPx;
    const printableHeight = (287 - 16) * mmToPx;
    const maxScale = Math.min(22, printableWidth / siteWidth, printableHeight / siteHeight);
    const printScale = Math.max(16, Math.floor(maxScale * 10) / 10);
    this.root.style.setProperty("--print-m", `${printScale}px`);
    this.root.dataset.printSplitRequired = maxScale < 16 ? "true" : "false";
  }

  clearPrintScale() {
    this.root.style.removeProperty("--print-m");
    delete this.root.dataset.printSplitRequired;
  }

  updateSummary() {
    this.roomArea = this.calculateRoomArea();
    this.roomElements.forEach((room) => {
      room.netArea = this.calculateNetRoomArea(room);
    });
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
    this.updateOpeningList();
    this.updateWindowList();
    this.updateNaturalList();
    this.updateErrorList();
  }

  updateRoomList() {
    if (!this.roomList) return;

    this.roomList.replaceChildren();
    this.roomElements.forEach((room, index) => {
      const item = document.createElement("div");
      item.className = "room-list-item";

      const label = document.createElement("span");
      label.textContent = `${index + 1}. ${room.dataset.label || "Cômodo"}`;

      const area = document.createElement("span");
      area.textContent = `${this.formatMeters(room.area())}m² bruta · ${this.formatMeters(room.netArea ?? room.area())}m² útil`;

      item.append(label, area);
      this.roomList.append(item);
    });
  }

  updateOpeningList() {
    if (!this.openingList) return;

    this.openingList.replaceChildren();
    if (this.openings.length === 0) {
      this.openingList.textContent = "Nenhuma passagem carregada.";
      return;
    }

    [...this.openings, ...this.windows].forEach((opening) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";

      const title = document.createElement("strong");
      title.textContent = opening.id;

      const details = document.createElement("span");
      const from = this.rooms.get(opening.roomId)?.dataset.label || opening.roomId;
      const to = opening.to === "exterior"
        ? "EXTERIOR"
        : this.rooms.get(opening.to)?.dataset.label || opening.to;
      details.textContent = `${opening.type} — ${from} → ${to} (${this.formatMeters(opening.w)}m)`;

      item.append(title, details);
      this.openingList.append(item);
    });
  }

  updateWindowList() {
    if (!this.windowList) return;

    this.windowList.replaceChildren();
    if (this.windows.length === 0) {
      this.windowList.textContent = "Nenhuma janela carregada.";
      return;
    }

    this.windows.forEach((window) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = window.id;
      const details = document.createElement("span");
      const from = this.rooms.get(window.roomId)?.dataset.label || window.roomId;
      const to = window.to === "exterior" ? "EXTERIOR" : this.rooms.get(window.to)?.dataset.label || window.to;
      details.textContent = `${from} → ${to} (${this.formatMeters(window.w)}m)`;
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

    this.errors.forEach(({ index, opening, category = "opening", message }) => {
      const item = document.createElement("div");
      item.className = "error-list-item";
      item.textContent = `${category === "window" ? "Janela" : "Passagem"} ${index + 1}: ${message} `;
      const source = document.createElement("code");
      source.textContent = JSON.stringify(opening);
      item.append(source);
      this.errorList.append(item);
    });
  }

  asciiLayout() {
    const bounds = this.bounds();
    if (!bounds) return "(nenhum cômodo carregado)";

    const step = 0.5;
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

  downloadMarkdown(filename = "planta-terrea-layout.md") {
    if (!this.currentConfig) {
      alert("Carregue uma planta antes de exportar o layout.");
      return;
    }

    const lines = ["# Layout da planta térrea", "", "## Cômodos", "", "| # | ID | Nome | x | y | Largura | Altura | Área bruta | Área útil | Paredes |", "|---:|---|---|---:|---:|---:|---:|---:|---:|---|"];
    this.roomElements.forEach((room, index) => {
      const walls = ["top", "right", "bottom", "left"]
        .filter((side) => room.wallState?.(side) === "solid")
        .join(", ") || "—";
      lines.push(`| ${index + 1} | ${this.markdownText(room.dataset.id || "—")} | ${this.markdownText(room.dataset.label || "Cômodo")} | ${this.formatMeters(room.x0())} | ${this.formatMeters(room.y0())} | ${this.formatMeters(room.w())} | ${this.formatMeters(room.h())} | ${this.formatMeters(room.area())} | ${this.formatMeters(room.netArea ?? room.area())} | ${walls} |`);
    });

    lines.push("", `**Total:** ${this.roomCount} cômodos · ${this.formatMeters(this.roomArea)} m²`);
    lines.push("", "## Itens", "", "| # | Nome | x | y | Largura | Altura | Área | Classes | Sobrepõe |", "|---:|---|---:|---:|---:|---:|---:|---|---|");
    if (this.itemElements.length === 0) {
      lines.push("| — | Nenhum item definido |  |  |  |  |  |  |");
    } else {
      this.itemElements.forEach((item, index) => {
        const classes = [...item.classList]
          .filter((className) => !["plan-item", "plan-generated"].includes(className))
          .join(", ") || "—";
        const overlaps = item.allowedOverlaps.join(", ") || "—";
        lines.push(`| ${index + 1} | ${this.markdownText(item.dataset.label || item.title || "Item")} | ${this.formatMeters(item.x0())} | ${this.formatMeters(item.y0())} | ${this.formatMeters(item.w())} | ${this.formatMeters(item.h())} | ${this.formatMeters(item.area())} | ${this.markdownText(classes)} | ${this.markdownText(overlaps)} |`);
      });
    }
    lines.push("", "## Passagens", "", "| ID | De | Para | Tipo | Parede | Posição | Largura |", "|---|---|---|---|---|---:|---:|");
    if (this.openings.length === 0) {
      lines.push("| — | Nenhuma passagem definida |  |  |  |  |  |");
    } else {
      this.openings.forEach((opening) => {
        lines.push(`| ${this.markdownText(opening.id)} | ${this.markdownText(opening.roomId)} | ${this.markdownText(opening.to)} | ${this.markdownText(opening.type)} | ${opening.wall} | ${this.formatMeters(opening.position)} | ${this.formatMeters(opening.w)} |`);
      });
    }

    lines.push("", "## Janelas", "", "| ID | De | Para | Parede | Posição | Largura |", "|---|---|---|---|---:|---:|");
    if (this.windows.length === 0) {
      lines.push("| — | Nenhuma janela definida |  |  |  |  |");
    } else {
      this.windows.forEach((window) => {
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
      lines.push("", "## Elementos com erro", "", ...this.errors.map(({ opening, category = "opening", message }) => `- **${category === "window" ? "Janela" : "Passagem"}:** \`${this.markdownText(JSON.stringify(opening))}\`: ${this.markdownText(message)}`));
    }

    lines.push("", "## ASCII art", "", "```text", this.asciiLayout(), "```");

    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async downloadHtml(filename = "planta-terrea-gerada.html") {
    const exportedDocument = document.cloneNode(true);
    exportedDocument.querySelectorAll("#json-file, #load-json, #reload-json, #download-html, #download-markdown, #plan-status, #terrain-compass-rose-data")
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
