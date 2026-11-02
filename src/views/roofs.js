const FloorPlanRoofs = {
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
        return [{ roof, polygons, planes: [[-1, 0, 0, x0], [1, 0, 0, -x1], [0, -1, 0, y0], [0, 1, 0, -y1], ...slopes] }];
      } catch {
        return [];
      }
    });
    return definitions.map((definition, index) => {
      let polygons = definition.polygons;
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
        if (roof.type !== "gable")
          throw new Error(`Unsupported roof type: ${roof.type || "undefined"}`);
        const baseDefinition = roof.base ?? roof;
        if (!roof.base && !["from", "to", "rectangle", "pos", "size", "inset", "outset"].some((key) => roof[key] !== undefined)) {
          throw new Error("A gable roof needs a base definition");
        }
        if (!["longitudinal", "transverse"].includes(roof.orientation)) {
          throw new Error(
            'A gable roof orientation must be "longitudinal" or "transverse"',
          );
        }

        const base = FloorPlanRoofs.resolveBase(plan, baseDefinition);
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
        const z0 =
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
        const ridgeX = longitudinal ? (baseX0 + baseX1) / 2 : x0;
        const ridgeY = longitudinal ? y0 : (baseY0 + baseY1) / 2;
        const ridgeEndX = longitudinal ? ridgeX : x1;
        const ridgeEndY = longitudinal ? y1 : ridgeY;
        const ridgeLength = Math.hypot(ridgeEndX - ridgeX, ridgeEndY - ridgeY);
        const rise = (baseSpan / 2) * Math.tan(radians);
        roof.bounds = () =>
          FloorPlanGeometryBox.fromValues({
            x: x0,
            y: y0,
            w: x1 - x0,
            l: y1 - y0,
            z0,
            h: rise,
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
          if (Math.abs(a[2] - z0 - rise) < 1e-7 && Math.abs(b[2] - z0 - rise) < 1e-7) ridgeSegments.push(segment);
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
        group.dataset.pitch = String(pitch);
        group.dataset.eave = JSON.stringify([eave0, eave1]);
        group.dataset.rake = JSON.stringify([rake0, rake1]);
        group.dataset.baseZ = String(z0);
        group.dataset.ridgeZ = String(z0 + rise);
        group.append(defs, polygon, boundary, ridge);
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
          details.textContent = `Cumeeira: ${plan.formatMeters(ridgeLength)} m — Altura: ${plan.formatMeters(rise)} m — Inclinação: ${plan.formatMeters(pitch)}°`;
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
