class FloorPlan {
  constructor({ root, roomList = null, roomCountSummary = null, summary = null, boundsSummary = null, openingList = null, naturalList = null, errorList = null, downloadButton = null, jsonInput = null, reloadButton = null, scale = 56 }) {
    this.root = root;
    this.roomList = roomList;
    this.roomCountSummary = roomCountSummary;
    this.summary = summary;
    this.boundsSummary = boundsSummary;
    this.openingList = openingList;
    this.naturalList = naturalList;
    this.errorList = errorList;
    this.downloadButton = downloadButton;
    this.jsonInput = jsonInput;
    this.reloadButton = reloadButton;
    this.roomArea = 0;
    this.roomCount = 0;
    this.rooms = new Map();
    this.roomElements = [];
    this.itemElements = [];
    this.openings = [];
    this.openingElements = [];
    this.naturalCommunications = [];
    this.currentConfig = null;
    this.currentFile = null;

    root.style.setProperty("--m", `${scale}px`);
    if (downloadButton) downloadButton.addEventListener("click", () => this.downloadHtml());
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
  }

  add(data) {
    const { label = "", classes = "", title = "", room = false } = data;
    const { x, y, w, h } = this.normalizeGeometry(data);
    const element = document.createElement("div");
    element.className = `plan-item plan-generated${room ? " room" : ""}${classes ? ` ${classes}` : ""}`;
    element.style.setProperty("--x", x);
    element.style.setProperty("--y", y);
    element.style.setProperty("--w", w);
    element.style.setProperty("--h", h);
    if (title) element.title = title;

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
      element.append(label);
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
    const element = this.add({ ...room, room: true });
    this.roomElements.push(element);
    if (room.id) this.rooms.set(room.id, element);
    this.updateOverlaps();
    this.roomArea += element.area();
    this.roomCount += 1;
    this.updateSummary();
    return element;
  }

  normalizeGeometry(data) {
    const [xValue, yValue] = data.pos ?? [data.x, data.y];
    const [w, h] = data.size ?? [data.w, data.h];

    if ([xValue, yValue, w, h].some((value) => value === undefined)) {
      throw new Error("A room needs pos/size or x/y/w/h values");
    }

    return {
      ...data,
      x: this.resolve(xValue),
      y: this.resolve(yValue),
      w: Number(w),
      h: Number(h)
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

  resolve(value) {
    if (typeof value === "number") return value;

    if (typeof value === "object" && value !== null) {
      return this.resolve(value.from) + Number(value.delta ?? 0);
    }

    const match = String(value).trim().match(
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
    const element = this.add(item);
    this.itemElements.push(element);
    return element;
  }

  addOpening(opening) {
    const passage = this.normalizeOpening(opening);
    this.openings.push(passage);

    const wallThickness = 0.14;
    const element = this.add({
      x: passage.horizontal ? passage.x : passage.x - wallThickness / 2,
      y: passage.horizontal ? passage.y - wallThickness / 2 : passage.y,
      w: passage.horizontal ? passage.length : wallThickness,
      h: passage.horizontal ? wallThickness : passage.length,
      classes: `plan-opening opening-${passage.type} opening-${passage.horizontal ? "horizontal" : "vertical"}`,
      title: `${passage.type}: ${passage.id}`
    });
    this.openingElements.push(element);
    return passage;
  }

  normalizeOpening(opening) {
    const match = String(opening.from ?? "").trim().match(/^(.+)\.(top|left|right|bottom)$/);
    if (!match) throw new Error(`Invalid opening wall reference: ${opening.from}`);

    const [, roomId, wall] = match;
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Unknown opening room reference: ${roomId}`);
    if (!room.hasWall(wall)) throw new Error(`Room ${roomId} has no solid ${wall} wall`);

    const target = String(opening.to ?? "").trim();
    if (!target) throw new Error("An opening needs a target room or exterior");
    if (target !== "exterior" && !this.rooms.has(target)) {
      throw new Error(`Unknown opening target: ${target}`);
    }

    const defaults = { door: 0.8, opening: 1.0 };
    const type = String(opening.type ?? "door").trim();
    if (!(type in defaults)) throw new Error(`Unsupported opening type: ${type}`);

    const horizontal = wall === "top" || wall === "bottom";
    const wallStart = horizontal ? room.x0() : room.y0();
    const wallLength = horizontal ? room.w() : room.h();
    const length = Number(opening.length ?? defaults[type]);
    if (!(length > 0)) throw new Error("Opening length must be greater than zero");
    if (length > wallLength) throw new Error(`Opening is wider than wall ${opening.from}`);

    const hasPosition = opening.position !== undefined || opening.x !== undefined;
    const position = hasPosition ? Number(opening.position ?? opening.x) : (wallLength - length) / 2;
    if (!(position >= 0) || position + length > wallLength) {
      throw new Error(`Opening position is outside wall ${opening.from}`);
    }

    if (target !== "exterior") {
      const targetRoom = this.rooms.get(target);
      const oppositeWall = { top: "bottom", right: "left", bottom: "top", left: "right" }[wall];
      const targetWall = this.wallSegment(targetRoom, oppositeWall);
      const sourceWall = this.wallSegment(room, wall);
      const sameLine = Math.abs(sourceWall.coordinate - targetWall.coordinate) < 1e-9;
      const sharedStart = Math.max(sourceWall.start, targetWall.start);
      const sharedEnd = Math.min(sourceWall.end, targetWall.end);
      const openingStart = wallStart + position;
      const openingEnd = openingStart + length;
      if (!sameLine || sharedEnd <= sharedStart || openingStart < sharedStart || openingEnd > sharedEnd) {
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
      length,
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

    for (let index = 0; index < rooms.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < rooms.length; otherIndex += 1) {
        const first = rooms[index];
        const second = rooms[otherIndex];
        const overlaps =
          first.x0() < second.x1() &&
          first.x1() > second.x0() &&
          first.y0() < second.y1() &&
          first.y1() > second.y0();

        if (overlaps) {
          first.classList.add("room-overlap");
          second.classList.add("room-overlap");
        }
      }
    }
  }

  clear() {
    this.root.querySelectorAll(".plan-generated").forEach((element) => element.remove());
    this.rooms.clear();
    this.roomElements = [];
    this.itemElements = [];
    this.openings = [];
    this.openingElements = [];
    this.errors = [];
    this.roomArea = 0;
    this.roomCount = 0;
    this.updateSummary();
  }

  load(config) {
    this.currentConfig = config;
    this.clear();
    (config.rooms ?? []).forEach((room) => this.addRoom(room));
    (config.items ?? []).forEach((item) => this.addItem(item));
    (config.openings ?? []).forEach((opening, index) => {
      try {
        this.addOpening(opening);
      } catch (error) {
        this.errors.push({ index, opening, message: error.message });
      }
    });
    this.updateSummary();
    if (this.reloadButton) this.reloadButton.disabled = false;
    return this;
  }

  async loadFile(file) {
    const config = JSON.parse(await file.text());
    this.currentFile = file;
    return this.load(config);
  }

  async reload() {
    if (this.currentFile) return this.loadFile(this.currentFile);
    if (!this.currentConfig) return this;
    return this.load(this.currentConfig);
  }

  formatMeters(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  updateSummary() {
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
    this.updateRoomList();
    this.updateOpeningList();
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
      area.textContent = `${this.formatMeters(room.area())}m²`;

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

    this.openings.forEach((opening) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";

      const title = document.createElement("strong");
      title.textContent = opening.id;

      const details = document.createElement("span");
      const from = this.rooms.get(opening.roomId)?.dataset.label || opening.roomId;
      const to = opening.to === "exterior"
        ? "EXTERIOR"
        : this.rooms.get(opening.to)?.dataset.label || opening.to;
      details.textContent = `${opening.type} — ${from} → ${to} (${this.formatMeters(opening.length)}m)`;

      item.append(title, details);
      this.openingList.append(item);
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

    this.errors.forEach(({ index, opening, message }) => {
      const item = document.createElement("div");
      item.className = "error-list-item";
      item.textContent = `Passagem ${index + 1}: ${message} `;
      const source = document.createElement("code");
      source.textContent = JSON.stringify(opening);
      item.append(source);
      this.errorList.append(item);
    });
  }

  downloadHtml(filename = "planta-terrea-gerada.html") {
    const exportedDocument = document.cloneNode(true);
    exportedDocument.querySelector("#download-html")?.remove();
    exportedDocument.querySelectorAll("script").forEach((script) => script.remove());

    const styles = [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    });
    exportedDocument.querySelectorAll('link[rel="stylesheet"]').forEach((link) => link.remove());
    const style = exportedDocument.createElement("style");
    style.textContent = styles.join("\n");
    exportedDocument.head.append(style);

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
