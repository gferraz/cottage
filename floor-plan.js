export class FloorPlan {
  constructor({ root, summary = null, downloadButton = null, scale = 56 }) {
    this.root = root;
    this.summary = summary;
    this.downloadButton = downloadButton;
    this.roomArea = 0;
    this.roomCount = 0;
    this.rooms = new Map();

    root.style.setProperty("--m", `${scale}px`);
    if (downloadButton) downloadButton.addEventListener("click", () => this.downloadHtml());
  }

  add({ x, y, w, h, label = "", classes = "", title = "", room = false }) {
    const element = document.createElement("div");
    element.className = `plan-item${room ? " room" : ""}${classes ? ` ${classes}` : ""}`;
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
    const normalized = this.normalizeRoom(room);
    const element = this.add({ ...normalized, room: true });
    if (room.id) this.rooms.set(room.id, element);
    this.roomArea += element.area();
    this.roomCount += 1;
    this.updateSummary();
    return element;
  }

  normalizeRoom(data) {
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
    return this.add(item);
  }

  formatMeters(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  updateSummary() {
    if (!this.summary) return;
    this.summary.textContent = `Área total dos cômodos: ${this.formatMeters(this.roomArea)}m² (${this.roomCount} cômodos)`;
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
