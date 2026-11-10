const FloorPlanRoofs = {
  axisLabel(plan, roof, length) {
    if (roof.type !== "shed") return `${plan.roofOrientationLabel(roof.orientation)} · ${plan.formatMeters(length)} m`;
    const slope = roof.slope ?? (roof.orientation === "longitudinal" ? "right" : "bottom");
    const direction = { top: "frente", bottom: "fundos", left: "esquerda", right: "direita" }[slope];
    return `Caimento: ${direction} · borda alta: ${plan.formatMeters(length)} m`;
  },

  // z0 é a cota da borda baixa na base, antes do avanço dos beirais.
  shedGeometry(plan, roof, includeEaves = true) {
    if (!["longitudinal", "transverse"].includes(roof.orientation)) {
      throw new Error('Telhado shed precisa de orientação "longitudinal" ou "transverse"');
    }
    const longitudinal = roof.orientation === "longitudinal";
    const slope = roof.slope ?? (longitudinal ? "right" : "bottom");
    if (!(longitudinal ? ["left", "right"] : ["top", "bottom"]).includes(slope)) {
      throw new Error("O caimento (slope) precisa corresponder à orientação do telhado shed");
    }
    const floor = this.floorForRoof(plan, roof, roof.base ?? roof);
    const base = this.resolveBase(plan, roof.base ?? roof, floor);
    const pitch = Number(roof.pitch);
    if (!(pitch > 0 && pitch < 90)) throw new Error("A inclinação do telhado precisa estar entre 0 e 90 graus");
    const eave = this.overhangPair(roof.eave), rake = this.overhangPair(roof.rake);
    if (![...eave, ...rake].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error("Os beirais do telhado precisam ser números não negativos");
    }
    const [e0, e1] = includeEaves ? eave : [0, 0];
    const [r0, r1] = rake;
    const x0 = base.x0() - (longitudinal ? e0 : r0), x1 = base.x1() + (longitudinal ? e1 : r1);
    const y0 = base.y0() - (longitudinal ? r0 : e0), y1 = base.y1() + (longitudinal ? r1 : e1);
    const start = longitudinal ? base.x0() : base.y0(), end = longitudinal ? base.x1() : base.y1();
    const z0 = roof.z0 === undefined ? this.baseCeilingZ(plan, base, 0, floor) : plan.resolve(roof.z0);
    if (![x0, x1, y0, y1, z0].every(Number.isFinite) || x1 <= x0 || y1 <= y0) throw new Error("Base inválida para o telhado shed");
    const tangent = Math.tan(pitch * Math.PI / 180);
    const lowAtStart = slope === "left" || slope === "top";
    const gradient = (lowAtStart ? 1 : -1) * tangent;
    const intercept = z0 - gradient * (lowAtStart ? start : end);
    const at = (x, y) => [x, y, intercept + gradient * (longitudinal ? x : y)];
    const polygon = [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
    const rise = (end - start) * tangent;
    const high = lowAtStart ? end : start;
    return {
      base, longitudinal, slope, pitch, eave, rake, z0, baseElevation: z0, rise,
      baseSpan: end - start, baseX0: base.x0(), baseX1: base.x1(), baseY0: base.y0(), baseY1: base.y1(),
      eave0: eave[0], eave1: eave[1], pitchTangent: tangent,
      x0, x1, y0, y1, roofWidth: x1 - x0, roofLength: y1 - y0,
      ridgeLength: longitudinal ? y1 - y0 : x1 - x0,
      ridgeX0: longitudinal ? high : x0, ridgeX1: longitudinal ? high : x1,
      ridgeY0: longitudinal ? y0 : high, ridgeY1: longitudinal ? y1 : high,
      surfaceArea: (x1 - x0) * (y1 - y0) / Math.cos(pitch * Math.PI / 180),
      minZ: Math.min(...polygon.map((point) => point[2])),
      peakZ: Math.max(...polygon.map((point) => point[2])),
      bounds: [[-1, 0, 0, x0], [1, 0, 0, -x1], [0, -1, 0, y0], [0, 1, 0, -y1]],
      slopes: [longitudinal ? [-gradient, 0, 1, -intercept] : [0, -gradient, 1, -intercept]],
      polygon,
    };
  },

  clipPolygon(points, plane) {
    if (!points.length) return [];
    const distances = points.map((point) => plane.slice(0, 3).reduce((sum, value, i) => sum + value * point[i], plane[3]));
    if (distances.every((value) => value <= 1e-8)) return points;
    if (distances.every((value) => value >= -1e-8)) return [];
    const result = [];
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      const a = distances[i], b = distances[(i + 1) % points.length];
      if (a <= 1e-8) result.push(point);
      if ((a < -1e-8 && b > 1e-8) || (a > 1e-8 && b < -1e-8)) {
        result.push(point.map((value, axis) => value + (next[axis] - value) * a / (a - b)));
      }
    });
    return result.length >= 3 ? result : [];
  },

  intersectingSurfaces(plan, roofs = plan.allRoofs ?? []) {
    const definitions = roofs.flatMap((roof) => {
      if (roof.type === "shed") {
        try {
          const geometry = this.shedGeometry(plan, roof);
          const { base, longitudinal, x0, x1, y0, y1 } = geometry;
          const bounds = [
            [-1, 0, 0, longitudinal ? x0 : base.x0()],
            [1, 0, 0, -(longitudinal ? x1 : base.x1())],
            [0, -1, 0, longitudinal ? base.y0() : y0],
            [0, 1, 0, -(longitudinal ? base.y1() : y1)],
          ];
          return [{ roof, polygons: [geometry.polygon], planes: [...bounds, ...geometry.slopes] }];
        } catch { return []; }
      }
      if (roof.type !== "gable" || !["longitudinal", "transverse"].includes(roof.orientation)) return [];
      try {
        const floor = this.floorForRoof(plan, roof, roof.base ?? roof);
        const base = this.resolveBase(plan, roof.base ?? roof, floor);
        const longitudinal = roof.orientation === "longitudinal";
        const [e0, e1] = this.overhangPair(roof.eave);
        const [r0, r1] = this.overhangPair(roof.rake);
        const x0 = base.x0() - (longitudinal ? e0 : r0), x1 = base.x1() + (longitudinal ? e1 : r1);
        const y0 = base.y0() - (longitudinal ? r0 : e0), y1 = base.y1() + (longitudinal ? r1 : e1);
        const start = longitudinal ? base.x0() : base.y0();
        const end = longitudinal ? base.x1() : base.y1();
        const tangent = Math.tan(Number(roof.pitch) * Math.PI / 180);
        const z = roof.z0 === undefined ? this.baseCeilingZ(plan, base, 0, floor) : plan.resolve(roof.z0);
        if (![x0, x1, y0, y1, tangent, z].every(Number.isFinite) || tangent < 0 || x1 <= x0 || y1 <= y0) return [];
        const ridge = (start + end) / 2;
        const rise = (end - start) * tangent / 2;
        const slopes = longitudinal
          ? [[-tangent, 0, 1, start * tangent - z], [tangent, 0, 1, -end * tangent - z]]
          : [[0, -tangent, 1, start * tangent - z], [0, tangent, 1, -end * tangent - z]];
        const at = (x, y) => [x, y, z + rise - Math.abs((longitudinal ? x : y) - ridge) * tangent];
        const polygons = longitudinal ? [
          [at(x0, y0), at(ridge, y0), at(ridge, y1), at(x0, y1)],
          [at(ridge, y0), at(x1, y0), at(x1, y1), at(ridge, y1)],
        ] : [
          [at(x0, y0), at(x1, y0), at(x1, ridge), at(x0, ridge)],
          [at(x0, ridge), at(x1, ridge), at(x1, y1), at(x0, y1)],
        ];
        // Rake extensions are drawn, but do not remove roofs beneath them.
        // Eave bounds and the roof's slopes still participate in clipping.
        const bounds = [
          [-1, 0, 0, longitudinal ? x0 : base.x0()],
          [1, 0, 0, -(longitudinal ? x1 : base.x1())],
          [0, -1, 0, longitudinal ? base.y0() : y0],
          [0, 1, 0, -(longitudinal ? base.y1() : y1)],
        ];
        return [{ roof, polygons, planes: [...bounds, ...slopes] }];
      } catch {
        return [];
      }
    });
    return definitions.map((definition, index) => {
      let polygons = definition.polygons;
      // Uma cobertura inferior pode continuar sob os beirais de outro volume.
      if (definition.roof.clip_intersections === false) return { roof: definition.roof, polygons };
      definitions.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        polygons = polygons.flatMap((polygon) => {
          // Coplanar overlap belongs to the earlier definition only.
          let inside = polygon;
          const outside = [];
          for (const plane of other.planes) {
            const distance = (point) => plane.slice(0, 3).reduce((sum, value, axis) => sum + value * point[axis], plane[3]);
            if (otherIndex > index && plane[2] === 1 && inside.length && inside.every((point) => Math.abs(distance(point)) <= 1e-8)) {
              outside.push(inside);
              inside = [];
              break;
            }
            const next = this.clipPolygon(inside, plane);
            const remainder = this.clipPolygon(inside, plane.map((value) => -value));
            if (remainder.length && !(next === inside && remainder === inside)) outside.push(remainder);
            inside = next;
            if (!inside.length) break;
          }
          return outside;
        });
      });
      return { roof: definition.roof, polygons };
    });
  },

  surfaceEdges(polygons) {
    const vertices = polygons.flat();
    const edges = new Map();
    const key = (point) => point.map((value) => Math.round(value * 1e7)).join(",");
    polygons.forEach((polygon) => {
      const u = polygon[1].map((value, axis) => value - polygon[0][axis]);
      const v = polygon[2].map((value, axis) => value - polygon[0][axis]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const magnitude = Math.hypot(...normal);
      if (magnitude < 1e-10) return;
      const unit = normal.map((value) => value / magnitude);
      polygon.forEach((from, i) => {
        const to = polygon[(i + 1) % polygon.length];
        const delta = to.map((value, axis) => value - from[axis]);
        const length2 = delta.reduce((sum, value) => sum + value * value, 0);
        if (length2 < 1e-14) return;
        const cuts = [0, 1];
        vertices.forEach((point) => {
          const t = delta.reduce((sum, value, axis) => sum + value * (point[axis] - from[axis]), 0) / length2;
          if (t > 1e-8 && t < 1 - 1e-8 && point.every((value, axis) => Math.abs(value - from[axis] - t * delta[axis]) < 1e-7)) cuts.push(t);
        });
        cuts.sort((a, b) => a - b);
        for (let j = 0; j < cuts.length - 1; j += 1) {
          if (cuts[j + 1] - cuts[j] < 1e-8) continue;
          const a = from.map((value, axis) => value + cuts[j] * delta[axis]);
          const b = from.map((value, axis) => value + cuts[j + 1] * delta[axis]);
          const id = [key(a), key(b)].sort().join(":");
          const edge = edges.get(id);
          if (!edge) edges.set(id, { a, b, count: 1, normal: unit, crease: false });
          else {
            edge.count += 1;
            if (Math.abs(edge.normal.reduce((sum, value, axis) => sum + value * unit[axis], 0)) < 0.999999) edge.crease = true;
          }
        }
      });
    });
    // Shared edges between slopes are ridges/valleys; shared coplanar edges
    // are harmless subdivision seams and need no extra line.
    return [...edges.values()].filter((edge) => edge.count === 1 || edge.crease).flatMap(({ a, b }) => [a, b]);
  },

  asGeometryBox(base, label = "roof base") {
    if (typeof base?.w === "function" && typeof base?.l === "function") {
      return base;
    }
    return FloorPlanGeometryBox.fromValues({
      x: base?.x,
      y: base?.y,
      w: base?.w,
      l: base?.l,
      z0: base?.z0,
      h: base?.h,
      label,
    });
  },

  floorForRoof(plan, roof, baseDefinition) {
    const floors = plan.currentConfig?.floors ?? [plan.currentConfig ?? {}];
    if (roof.floorId) {
      const matchingFloor = floors.find((floor) => floor.id === roof.floorId);
      if (matchingFloor) return matchingFloor;
    }
    if (typeof baseDefinition === "string") {
      const room = plan.roomDefinitions?.get(baseDefinition);
      const owner = floors.find((floor) => (floor.rooms ?? []).includes(room));
      if (owner) return owner;
    }

    let best = null;
    floors.forEach((floor) => {
      try {
        const base = plan.normalizeGeometryAtFloor(baseDefinition, floor);
        const overlap = (floor.rooms ?? []).reduce((total, definition) => {
          const reference = plan.roomReferences?.get(definition.id);
          if (!reference) return total;
          const width = Math.max(
            0,
            Math.min(base.x + base.w, reference.x1()) -
              Math.max(base.x, reference.x0()),
          );
          const length = Math.max(
            0,
            Math.min(base.y + base.l, reference.y1()) -
              Math.max(base.y, reference.y0()),
          );
          return total + width * length;
        }, 0);
        if (
          overlap > 0 &&
          (!best || overlap > best.overlap ||
            (overlap === best.overlap && Number(floor.z0 ?? 0) > Number(best.floor.z0 ?? 0)))
        ) {
          best = { floor, overlap };
        }
      } catch {
        // A geometry may depend on references that are unavailable in this floor context.
      }
    });
    return best?.floor ?? floors[0];
  },

  baseCeilingZ(plan, base, fallback = 0, floorConfig) {
    const baseZ0 = typeof base?.z0 === "function" ? Number(base.z0()) : 0;
    const baseZ1 = typeof base?.z1 === "function" ? Number(base.z1()) : NaN;
    if (Number.isFinite(baseZ1) && baseZ1 > baseZ0) return baseZ1;

    const floors = plan.currentConfig?.floors ?? [plan.currentConfig ?? {}];
    const owningFloor = floorConfig ?? floors[0];
    const zoneDefinitions = [
      ...(plan.currentConfig?.floors ? plan.currentConfig.zones ?? [] : []),
      ...(owningFloor?.zones ?? []),
    ];
    const candidates = zoneDefinitions
      .map((definition) => {
        try {
          return FloorPlanRoofs.asGeometryBox(
            plan.normalizeGeometryAtFloor(definition, owningFloor),
          );
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter(
        (zone) =>
          typeof zone.x0 === "function" &&
          typeof zone.x1 === "function" &&
          typeof zone.y0 === "function" &&
          typeof zone.y1 === "function" &&
          typeof zone.z1 === "function" &&
          zone.x0() <= base.x0() &&
          zone.y0() <= base.y0() &&
          zone.x1() >= base.x1() &&
          zone.y1() >= base.y1() &&
          zone.z1() > baseZ0,
      )
      .sort((first, second) => first.area() - second.area());

    if (candidates[0]) return candidates[0].z1();

    const wallMaxHeight = Number(owningFloor?.ceiling_height ?? owningFloor?.wall_max_height);
    if (baseZ0 > 0) return baseZ0;
    if (Number.isFinite(wallMaxHeight) && wallMaxHeight > 0) {
      return baseZ0 + wallMaxHeight;
    }
    return fallback;
  },

  resolveBase(plan, baseDefinition, floorConfig) {
    if (typeof baseDefinition === "string") {
      const base = plan.references.get(baseDefinition);
      if (!base) throw new Error(`Unknown roof base reference: ${baseDefinition}`);
      return FloorPlanRoofs.asGeometryBox(base);
    }
    if (!baseDefinition || typeof baseDefinition !== "object") {
      throw new Error("A roof base must be an object or a reference ID");
    }
    const base = floorConfig
      ? plan.normalizeGeometryAtFloor(baseDefinition, floorConfig)
      : plan.normalizeGeometry(baseDefinition);
    return FloorPlanRoofs.asGeometryBox(base);
  },

  overhangPair(value) {
    const values = Array.isArray(value) ? value : [value ?? 0, value ?? 0];
    return [Number(values[0] ?? 0), Number(values[1] ?? 0)];
  },

  formatOverhang(plan, value) {
    const [first, second] = FloorPlanRoofs.overhangPair(value);
    const formatted = [plan.formatMeters(first), plan.formatMeters(second)];
    return first === second ? formatted[0] : `${formatted[0]} / ${formatted[1]}`;
  },

  render(plan, roofs = []) {
    if (!plan.guidesLayer) return;
    const svg = "http://www.w3.org/2000/svg";
    const create = (name, attributes = {}) => {
      const element = document.createElementNS(svg, name);
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
      return element;
    };

    const clippedRoofs = this.intersectingSurfaces(plan, plan.allRoofs?.length ? plan.allRoofs : roofs);
    roofs.forEach((roof, index) => {
      try {
        if (!["gable", "shed"].includes(roof.type))
          throw new Error(`Unsupported roof type: ${roof.type || "undefined"}`);
        const baseDefinition = roof.base ?? roof;
        if (!roof.base && !["from", "to", "rectangle", "pos", "size", "inset", "outset"].some((key) => roof[key] !== undefined)) {
          throw new Error("O telhado precisa de uma base");
        }
        if (!["longitudinal", "transverse"].includes(roof.orientation)) {
          throw new Error(
            'A orientação do telhado precisa ser "longitudinal" ou "transverse"',
          );
        }

        const shed = roof.type === "shed" ? this.shedGeometry(plan, roof) : null;
        const base = shed?.base ?? FloorPlanRoofs.resolveBase(plan, baseDefinition);
        const pitch = Number(roof.pitch);
        if (!(pitch > 0 && pitch < 90))
          throw new Error(
            "A gable roof pitch must be between 0 and 90 degrees",
          );
        const [eave0, eave1] = FloorPlanRoofs.overhangPair(roof.eave);
        const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
        if (
          ![eave0, eave1, rake0, rake1].every(Number.isFinite) ||
          [eave0, eave1, rake0, rake1].some((value) => value < 0)
        ) {
          throw new Error("A roof eave and rake must be non-negative numbers");
        }
        const longitudinal = roof.orientation === "longitudinal";
        const x0 = base.x0() - (longitudinal ? eave0 : rake0);
        const x1 = base.x1() + (longitudinal ? eave1 : rake1);
        const y0 = base.y0() - (longitudinal ? rake0 : eave0);
        const y1 = base.y1() + (longitudinal ? rake1 : eave1);
        const z0 = shed ? shed.z0 :
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : FloorPlanRoofs.baseCeilingZ(plan, base);
        if (!Number.isFinite(z0))
          throw new Error("A cota z0 do telhado precisa ser numérica");
        const radians = (pitch * Math.PI) / 180;
        const baseSpan = longitudinal ? base.w() : base.l();
        const baseX0 = base.x0();
        const baseX1 = base.x1();
        const baseY0 = base.y0();
        const baseY1 = base.y1();
        const ridgeX = shed ? shed.ridgeX0 : longitudinal ? (baseX0 + baseX1) / 2 : x0;
        const ridgeY = shed ? shed.ridgeY0 : longitudinal ? y0 : (baseY0 + baseY1) / 2;
        const ridgeEndX = shed ? shed.ridgeX1 : longitudinal ? ridgeX : x1;
        const ridgeEndY = shed ? shed.ridgeY1 : longitudinal ? y1 : ridgeY;
        const ridgeLength = Math.hypot(ridgeEndX - ridgeX, ridgeEndY - ridgeY);
        const rise = shed ? shed.rise : (baseSpan / 2) * Math.tan(radians);
        roof.bounds = () =>
          FloorPlanGeometryBox.fromValues({
            x: x0,
            y: y0,
            w: x1 - x0,
            l: y1 - y0,
            z0: shed ? shed.minZ : z0,
            h: shed ? shed.peakZ - shed.minZ : rise,
          });
        roof.geometry = () => {
          throw new Error(
            `Rectangular-prism geometry does not apply to roof "${roof.id || index + 1}"; use bounds()`,
          );
        };
        const offsetX =
          Number.parseFloat(
            getComputedStyle(plan.root).getPropertyValue("--building-offset-x"),
          ) || 0;
        const offsetY =
          Number.parseFloat(
            getComputedStyle(plan.root).getPropertyValue("--building-offset-y"),
          ) || 0;
        const px0 = x0 + offsetX;
        const px1 = x1 + offsetX;
        const py0 = y0 + offsetY;
        const py1 = y1 + offsetY;
        const pridgex = ridgeX + offsetX;
        const ridgey = ridgeY + offsetY;
        const pridgex2 = ridgeEndX + offsetX;
        const ridgey2 = ridgeEndY + offsetY;

        const surfaces = clippedRoofs.find((entry) => entry.roof === roof || (roof.id && entry.roof.id === roof.id))
          ?? this.intersectingSurfaces(plan, [roof])[0];
        if (!surfaces?.polygons.length) return;
        const point = ([x, y]) => `${x + offsetX},${y + offsetY}`;
        const polygon = create("path", {
          d: surfaces.polygons.map((vertices) => vertices.map((vertex, i) => `${i ? "L" : "M"}${point(vertex)}`).join(" ") + " Z").join(" "),
          class: "roof-surface",
        });
        polygon.style.stroke = "none";
        const edges = this.surfaceEdges(surfaces.polygons);
        const boundarySegments = [], ridgeSegments = [];
        for (let edge = 0; edge < edges.length; edge += 2) {
          const a = edges[edge], b = edges[edge + 1];
          const segment = `M${point(a)} L${point(b)}`;
          if (!shed && Math.abs(a[2] - z0 - rise) < 1e-7 && Math.abs(b[2] - z0 - rise) < 1e-7) ridgeSegments.push(segment);
          else boundarySegments.push(segment);
        }
        const boundary = create("path", { d: boundarySegments.join(" "), class: "roof-surface", fill: "none" });
        boundary.style.fill = "none";
        const gradientId = `roof-gradient-${index + 1}`;
        const roofStyle = getComputedStyle(plan.root);
        const gradientDark =
          roofStyle.getPropertyValue("--theme-roof-gradient-dark").trim() ||
          "#a84f31";
        const gradientLight =
          roofStyle.getPropertyValue("--theme-roof-gradient-light").trim() ||
          "#f1c0a0";
        const gradient = create("linearGradient", {
          id: gradientId,
          x1: px0,
          y1: py0,
          x2: longitudinal ? px1 : px0,
          y2: longitudinal ? py0 : py1,
          gradientUnits: "userSpaceOnUse",
        });
        [
          ["0%", gradientDark, "0.34"],
          ["50%", gradientLight, "0.10"],
          ["100%", gradientDark, "0.34"],
        ].forEach(([offset, color, opacity]) => {
          gradient.append(
            create("stop", {
              offset,
              "stop-color": color,
              "stop-opacity": opacity,
            }),
          );
        });
        const defs = create("defs");
        defs.append(gradient);
        polygon.style.setProperty("fill", `url(#${gradientId})`);

        const ridge = create("path", { d: ridgeSegments.join(" "), class: "roof-ridge", fill: "none" });
        const group = create("g", {
          class: "roof-plan",
          "data-id": roof.id || `roof-${index + 1}`,
        });
        group.dataset.base =
          typeof baseDefinition === "string" ? baseDefinition : "inline-geometry";
        group.dataset.orientation = roof.orientation;
        if (shed) group.dataset.slope = shed.slope;
        group.dataset.pitch = String(pitch);
        group.dataset.eave = JSON.stringify([eave0, eave1]);
        group.dataset.rake = JSON.stringify([rake0, rake1]);
        group.dataset.baseZ = String(z0);
        group.dataset.ridgeZ = String(z0 + rise);
        group.append(defs, polygon, boundary, ridge);
        if (shed) {
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          const sign = ["top", "left"].includes(shed.slope) ? -1 : 1;
          const dx = longitudinal ? sign : 0, dy = longitudinal ? 0 : sign;
          const tip = [cx + dx * 0.4, cy + dy * 0.4];
          const arrow = create("path", {
            d: `M${point([cx - dx * 0.4, cy - dy * 0.4])} L${point(tip)} M${point([tip[0] - dx * 0.18 - dy * 0.12, tip[1] - dy * 0.18 + dx * 0.12])} L${point(tip)} L${point([tip[0] - dx * 0.18 + dy * 0.12, tip[1] - dy * 0.18 - dx * 0.12])}`,
            class: "roof-ridge",
            "aria-label": "Direção do caimento",
          });
          group.append(arrow);
        }
        if (roof.label) {
          const label = create("text", {
            x: (pridgex + pridgex2) / 2,
            y: (ridgey + ridgey2) / 2 - 0.18,
            class: "roof-label",
            "text-anchor": "middle",
          });
          const title = create("tspan", {
            x: (pridgex + pridgex2) / 2,
            class: "roof-label-title",
          });
          title.textContent = roof.label;
          const details = create("tspan", {
            x: (pridgex + pridgex2) / 2,
            dy: "1.25em",
            class: "roof-label-details",
          });
          details.textContent = `${shed ? "Borda alta" : "Cumeeira"}: ${plan.formatMeters(ridgeLength)} m — Altura: ${plan.formatMeters(rise)} m — Inclinação: ${plan.formatMeters(pitch)}°`;
          label.append(title, details);
          group.append(label);
        }
        plan.guidesLayer.append(group);
      } catch (error) {
        plan.errors.push({
          index,
          opening: roof,
          category: "roof",
          message: error.message,
        });
      }
    });
  },
};

window.FloorPlanRoofs = FloorPlanRoofs;
