class FloorPlanExport {
  static downloadText(text, filename, type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  static downloadDxf(plan, filename = "planta.dxf") {
    const dxf = this.toDxf(plan);
    this.downloadText(dxf, filename, "application/dxf;charset=utf-8");
  }

  static toDxf(plan) {
    const config = plan.currentConfig ?? plan.config;
    if (!config) throw new Error("Carregue uma planta antes de exportar o DXF.");
    const lines = [];
    const add = (...values) => values.forEach((value) => lines.push(String(value)));
    const line = (layer, x1, y1, x2, y2) => add(0, "LINE", 8, layer, 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);
    const text = (layer, value, x, y, height = 0.25) => add(0, "TEXT", 8, layer, 10, x, 20, y, 30, 0, 40, height, 1, value);
    const arc = (layer, x, y, radius, start, end) => add(0, "ARC", 8, layer, 10, x, 20, y, 30, 0, 40, radius, 50, start, 51, end);

    add(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 0, "ENDSEC");
    add(0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", 70, 7);
    [
      ["WALLS", 7], ["WALLS_VIRTUAL", 8], ["DOORS", 1],
      ["WINDOWS", 4], ["OPENINGS", 3], ["ROOM_LABELS", 2], ["DIMENSIONS", 6]
    ].forEach(([name, color]) => add(0, "LAYER", 2, name, 70, 0, 62, color));
    add(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");

    const floors = config.floors ?? [config];
    const wallSegments = new Map();
    const features = [];
    const keyFor = (horizontal, coordinate, start, end) =>
      `${horizontal ? "h" : "v"}:${coordinate.toFixed(6)}:${start.toFixed(6)}:${end.toFixed(6)}`;
    const addWall = (horizontal, coordinate, start, end, layer) => {
      if (end <= start) return;
      wallSegments.set(keyFor(horizontal, coordinate, start, end), { horizontal, coordinate, start, end, layer });
    };

    floors.forEach((floor) => {
      plan.currentFloorHeight = Number(floor.h ?? 0);
      (floor.rooms ?? []).forEach((room) => {
        if (!room.id || !plan.roomDefinitions.has(room.id)) return;
        const geometry = plan.getRoomGeometry(room.id);
        const parts = room.parts?.length ? plan.normalizeParts(room.parts) : [{ ...geometry.geometryParts[0], walls: room.walls }];
        parts.forEach((part) => {
          const walls = plan.normalizeWalls(part.walls ?? room.walls);
          const sides = {
            top: [true, part.y, part.x, part.x + part.w],
            bottom: [true, part.y + part.l, part.x, part.x + part.w],
            left: [false, part.x, part.y, part.y + part.l],
            right: [false, part.x + part.w, part.y, part.y + part.l]
          };
          Object.entries(sides).forEach(([side, [horizontal, coordinate, start, end]]) => {
            const state = walls[side];
            if (state === "solid") addWall(horizontal, coordinate, start, end, "WALLS");
            if (state === "virtual") addWall(horizontal, coordinate, start, end, "WALLS_VIRTUAL");
          });
        });
        const label = room.label || room.id;
        if (label && geometry.w() >= 1 && geometry.l() >= 1) {
          text("ROOM_LABELS", label, geometry.x0() + geometry.w() / 2, geometry.y0() + geometry.l() / 2);
        }
      });
      [...(floor.openings ?? []), ...(floor.windows ?? []).map((window) => ({ ...window, type: "window" }))].forEach((opening) => {
        if (plan.isVerticalOpening(opening)) return;
        try {
          const feature = plan.normalizeOpening(opening);
          features.push(feature);
        } catch {
          // The application already reports invalid features; valid geometry is exported.
        }
      });
    });

    const intervals = new Map();
    features.forEach((feature) => {
      const horizontal = feature.horizontal;
      const coordinate = horizontal ? feature.y : feature.x;
      const start = feature.horizontal ? feature.x : feature.y;
      const key = `${horizontal ? "h" : "v"}:${coordinate.toFixed(6)}`;
      const values = intervals.get(key) ?? [];
      values.push([start, start + feature.w]);
      intervals.set(key, values);
    });
    wallSegments.forEach(({ horizontal, coordinate, start, end, layer }) => {
      const cuts = intervals.get(`${horizontal ? "h" : "v"}:${coordinate.toFixed(6)}`) ?? [];
      const relevant = cuts.filter(([cutStart, cutEnd]) => cutEnd > start && cutStart < end)
        .sort((a, b) => a[0] - b[0]);
      let cursor = start;
      relevant.forEach(([cutStart, cutEnd]) => {
        const clippedStart = Math.max(start, cutStart);
        const clippedEnd = Math.min(end, cutEnd);
        if (clippedStart > cursor) {
          if (horizontal) line(layer, cursor, coordinate, clippedStart, coordinate);
          else line(layer, coordinate, cursor, coordinate, clippedStart);
        }
        cursor = Math.max(cursor, clippedEnd);
      });
      if (cursor < end) {
        if (horizontal) line(layer, cursor, coordinate, end, coordinate);
        else line(layer, coordinate, cursor, coordinate, end);
      }
    });

    features.forEach((feature) => {
      const { x, y, w, horizontal, wall, type } = feature;
      const layer = type === "window" ? "WINDOWS" : type === "opening" ? "OPENINGS" : "DOORS";
      if (type === "window") {
        const offset = 0.07;
        if (horizontal) {
          line(layer, x, y - offset, x + w, y - offset);
          line(layer, x, y + offset, x + w, y + offset);
        } else {
          line(layer, x - offset, y, x - offset, y + w);
          line(layer, x + offset, y, x + offset, y + w);
        }
        return;
      }
      if (type === "opening") return;
      const inward = { top: [0, 1], right: [-1, 0], bottom: [0, -1], left: [1, 0] }[wall];
      line(layer, x, y, x + inward[0] * w, y + inward[1] * w);
      const startAngle = { top: 0, right: 90, bottom: 270, left: 0 }[wall];
      const endAngle = { top: 90, right: 180, bottom: 360, left: 90 }[wall];
      arc(layer, x, y, w, startAngle, endAngle);
    });

    add(0, "ENDSEC", 0, "EOF");
    return `${lines.join("\n")}\n`;
  }
}
