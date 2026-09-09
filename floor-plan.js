class FloorPlan {
  constructor({ root, roomList = null, roomCountSummary = null, summary = null, boundsSummary = null, downloadButton = null, jsonInput = null, reloadButton = null, scale = 56 }) {
    this.root = root;
    this.roomList = roomList;
    this.roomCountSummary = roomCountSummary;
    this.summary = summary;
    this.boundsSummary = boundsSummary;
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
    this.currentConfig = null;

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
      reloadButton.addEventListener("click", () => this.reload());
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

    element.x0 = () => Number(x);
    element.x1 = () => Number(x) + Number(w);
    element.y0 = () => Number(y);
    element.y1 = () => Number(y) + Number(h);
    element.w = () => Number(w);
    element.h = () => Number(h);
    element.area = () => Number(w) * Number(h);

    if (room) {
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
      classes: `plan-opening opening-${passage.type}`,
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
    this.roomArea = 0;
    this.roomCount = 0;
    this.updateSummary();
  }

  load(config) {
    this.currentConfig = config;
    this.clear();
    (config.rooms ?? []).forEach((room) => this.addRoom(room));
    (config.items ?? []).forEach((item) => this.addItem(item));
    (config.openings ?? []).forEach((opening) => this.addOpening(opening));
    if (this.reloadButton) this.reloadButton.disabled = false;
    return this;
  }

  async loadFile(file) {
    return this.load(JSON.parse(await file.text()));
  }

  reload() {
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
