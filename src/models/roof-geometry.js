// Shared roof construction and intersections; no DOM or rendering dependencies.
const FloorPlanRoofGeometry = {
  // Construct the nominal gable once. Consumers retain their existing
  // validation policy and choose full eaves or the wall-contact footprint.
  gableGeometry(plan, roof, { includeEaves = true, base, floor, z0 } = {}) {
    if (!base) {
      floor ??= this.floorForRoof(plan, roof, roof.base ?? roof);
      base = this.resolveBase(plan, roof.base ?? roof, floor);
    }
    const longitudinal = roof.orientation === "longitudinal";
    const pitch = Number(roof.pitch);
    const eave = this.eavePair(roof), rake = this.overhangPair(roof.rake);
    const [e0, e1] = includeEaves ? eave : [0, 0];
    const [r0, r1] = rake;
    const baseX0 = base.x0(), baseX1 = base.x1();
    const baseY0 = base.y0(), baseY1 = base.y1();
    const x0 = baseX0 - (longitudinal ? e0 : r0), x1 = baseX1 + (longitudinal ? e1 : r1);
    const y0 = baseY0 - (longitudinal ? r0 : e0), y1 = baseY1 + (longitudinal ? r1 : e1);
    const start = longitudinal ? baseX0 : baseY0, end = longitudinal ? baseX1 : baseY1;
    z0 ??= roof.z0 === undefined ? this.baseCeilingZ(plan, base, 0, floor) : plan.resolve(roof.z0);
    const tangent = Math.tan(pitch * Math.PI / 180);
    const ridge = (start + end) / 2;
    const baseSpan = end - start;
    const rise = baseSpan * tangent / 2;
    const slopes = longitudinal
      ? [[-tangent, 0, 1, start * tangent - z0], [tangent, 0, 1, -end * tangent - z0]]
      : [[0, -tangent, 1, start * tangent - z0], [0, tangent, 1, -end * tangent - z0]];
    const at = (x, y) => [x, y, z0 + rise - Math.abs((longitudinal ? x : y) - ridge) * tangent];
    const polygons = longitudinal ? [
      [at(x0, y0), at(ridge, y0), at(ridge, y1), at(x0, y1)],
      [at(ridge, y0), at(x1, y0), at(x1, y1), at(ridge, y1)],
    ] : [
      [at(x0, y0), at(x1, y0), at(x1, ridge), at(x0, ridge)],
      [at(x0, ridge), at(x1, ridge), at(x1, y1), at(x0, y1)],
    ];
    return {
      base, longitudinal, pitch, eave, rake, eave0: eave[0], eave1: eave[1],
      baseX0, baseX1, baseY0, baseY1, baseSpan, z0, rise, pitchTangent: tangent,
      x0, x1, y0, y1, roofWidth: x1 - x0, roofLength: y1 - y0,
      ridgeLength: longitudinal ? y1 - y0 : x1 - x0,
      ridgeX0: longitudinal ? ridge : x0, ridgeX1: longitudinal ? ridge : x1,
      ridgeY0: longitudinal ? y0 : ridge, ridgeY1: longitudinal ? y1 : ridge,
      minZ: z0 - Math.max(e0, e1) * tangent, peakZ: z0 + rise,
      bounds: [[-1, 0, 0, x0], [1, 0, 0, -x1], [0, -1, 0, y0], [0, 1, 0, -y1]],
      // Rake extensions are drawn but do not remove roofs beneath them.
      intersectionBounds: [
        [-1, 0, 0, longitudinal ? x0 : baseX0],
        [1, 0, 0, -(longitudinal ? x1 : baseX1)],
        [0, -1, 0, longitudinal ? baseY0 : y0],
        [0, 1, 0, -(longitudinal ? baseY1 : y1)],
      ],
      slopes, polygons,
    };
  },

  eavePair(roof) {
    const legacy = this.overhangPair(roof.eave);
    return [Number(roof.eaves?.left ?? legacy[0]), Number(roof.eaves?.right ?? legacy[1])];
  },

  eavePitch(roof) {
    const pitch = Number(roof.eaves?.pitch ?? roof.pitch);
    if (!Number.isFinite(pitch) || pitch < 0 || pitch >= 90) {
      throw new Error("A inclinação do beiral (eaves.pitch) precisa estar entre 0 e 90 graus, exclusive 90");
    }
    return pitch;
  },

  eavePatches(plan, definition) {
    const { roof } = definition;
    if (roof.eaves?.pitch === undefined) return [definition];
    const tangent = Math.tan(this.eavePitch(roof) * Math.PI / 180);
    const base = this.resolveBase(plan, roof.base ?? roof, this.floorForRoof(plan, roof, roof.base ?? roof));
    const axis = roof.orientation === "longitudinal" ? 0 : 1;
    const start = axis === 0 ? base.x0() : base.y0();
    const end = axis === 0 ? base.x1() : base.y1();
    const halfspace = (sign, edge) => axis === 0 ? [sign, 0, 0, -sign * edge] : [0, sign, 0, -sign * edge];
    return definition.polygons.flatMap((polygon) => {
      const delta = polygon[1].map((v, i) => v - polygon[0][i]);
      const other = polygon[2].map((v, i) => v - polygon[0][i]);
      const normal = [delta[1] * other[2] - delta[2] * other[1], delta[2] * other[0] - delta[0] * other[2], delta[0] * other[1] - delta[1] * other[0]];
      const gradient = -normal[axis] / normal[2];
      return [
        { bounds: [halfspace(1, start)], edge: start },
        { bounds: [halfspace(-1, start), halfspace(1, end)] },
        { bounds: [halfspace(-1, end)], edge: end },
      ].flatMap(({ bounds, edge }) => {
        let patch = polygon;
        bounds.forEach((plane) => { patch = this.clipPolygon(patch, plane); });
        if (!patch.length) return [];
        if (edge !== undefined) patch = patch.map((point) => point.map((v, i) => i === 2
          ? v + (point[axis] - edge) * (Math.sign(gradient) * tangent - gradient) : v));
        const a = patch[1].map((v, i) => v - patch[0][i]);
        const b = patch[2].map((v, i) => v - patch[0][i]);
        const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        if (Math.abs(n[2]) < 1e-10) return [];
        const plane = [n[0] / n[2], n[1] / n[2], 1];
        plane.push(-plane.reduce((sum, value, i) => sum + value * patch[0][i], 0));
        // Bound each patch by its projected polygon edges (also separates gable halves).
        const footprint = patch.map(([x, y]) => [x, y, 0]);
        const center = [0, 1].map((i) => footprint.reduce((sum, p) => sum + p[i], 0) / footprint.length);
        const limits = footprint.map((p, i) => {
          const q = footprint[(i + 1) % footprint.length];
          const boundary = [q[1] - p[1], p[0] - q[0], 0, 0];
          boundary[3] = -boundary[0] * p[0] - boundary[1] * p[1];
          return boundary[0] * center[0] + boundary[1] * center[1] + boundary[3] > 0 ? boundary.map(v => -v) : boundary;
        });
        return [{ roof, polygons: [patch], planes: [...definition.planes.filter(p => p[2] === 0), ...limits, plane] }];
      });
    });
  },

  surfaceArea(roof, baseSpan, ridgeLength) {
    const eaves = this.eavePair(roof);
    return ridgeLength * (baseSpan / Math.cos(Number(roof.pitch) * Math.PI / 180)
      + (eaves[0] + eaves[1]) / Math.cos(this.eavePitch(roof) * Math.PI / 180));
  },

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
    const eave = this.eavePair(roof), rake = this.overhangPair(roof.rake);
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
      surfaceArea: this.surfaceArea(roof, end - start, longitudinal ? y1 - y0 : x1 - x0),
      minZ: Math.min(...polygon.map((point) => point[2])),
      peakZ: Math.max(...polygon.map((point) => point[2])),
      bounds: [[-1, 0, 0, x0], [1, 0, 0, -x1], [0, -1, 0, y0], [0, 1, 0, -y1]],
      slopes: [longitudinal ? [-gradient, 0, 1, -intercept] : [0, -gradient, 1, -intercept]],
      polygon,
    };
  },

  clipPolygon(points, plane) {
    return FloorPlanGeometryOperations.clipPolygon(points, plane);
  },

  intersectingSurfaces(plan, roofs = plan.allRoofs ?? []) {
    const definitions = roofs.flatMap((roof) => {
      try { this.eavePitch(roof); } catch { return []; }
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
        const geometry = this.gableGeometry(plan, roof);
        const { x0, x1, y0, y1, pitchTangent, z0, polygons, intersectionBounds, slopes } = geometry;
        if (![x0, x1, y0, y1, pitchTangent, z0].every(Number.isFinite)
          || pitchTangent < 0 || x1 <= x0 || y1 <= y0) return [];
        return [{ roof, polygons, planes: [...intersectionBounds, ...slopes] }];
      } catch {
        return [];
      }
    });
    const patches = definitions.flatMap((definition) => this.eavePatches(plan, definition));
    const clipped = patches.map((definition, index) => {
      let polygons = definition.polygons;
      // Uma cobertura inferior pode continuar sob os beirais de outro volume.
      if (definition.roof.clip_intersections === false) return { roof: definition.roof, polygons };
      patches.forEach((other, otherIndex) => {
        if (otherIndex === index || other.roof === definition.roof) return;
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

    return definitions.map(({ roof }) => ({ roof, polygons: clipped.filter(entry => entry.roof === roof).flatMap(entry => entry.polygons) }));
  },

  solidSurface(polygons, thickness) {
    const top = (point) => [point[0], point[1], point[2] + thickness];
    const faces = polygons.map((polygon) => polygon.map(top));
    if (thickness > 0) {
      faces.push(...polygons.map((polygon) => [...polygon].reverse()));
      const boundary = this.surfaceEdges(polygons, true);
      for (let i = 0; i < boundary.length; i += 2) {
        const a = boundary[i];
        const b = boundary[i + 1];
        faces.push([a, b, top(b), top(a)]);
      }
    }
    return { faces, edges: this.surfaceEdges(faces) };
  },

  surfaceEdges(polygons, boundaryOnly = false) {
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
    return [...edges.values()].filter((edge) => edge.count === 1 || (!boundaryOnly && edge.crease)).flatMap(({ a, b }) => [a, b]);
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
    // An explicit base elevation identifies the supporting floor before the
    // footprint heuristic, which otherwise favors larger lower floors.
    const elevation = roof.z0 ?? roof.from?.[2] ?? roof.pos?.[2];
    if (elevation !== undefined) {
      try {
        const baseZ = plan.resolve(elevation);
        const supportingFloors = floors
          .map((floor) => ({ floor, z: plan.resolve(floor.z0 ?? 0) }))
          .filter(({ z }) => Number.isFinite(z) && z <= baseZ + 0.001)
          .sort((a, b) => b.z - a.z);
        if (supportingFloors.length && Number.isFinite(baseZ)) return supportingFloors[0].floor;
      } catch {
        // Unresolved elevations can still use the base or footprint fallback.
      }
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
          return this.asGeometryBox(
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
      return this.asGeometryBox(base);
    }
    if (!baseDefinition || typeof baseDefinition !== "object") {
      throw new Error("A roof base must be an object or a reference ID");
    }
    const base = floorConfig
      ? plan.normalizeGeometryAtFloor(baseDefinition, floorConfig)
      : plan.normalizeGeometry(baseDefinition);
    return this.asGeometryBox(base);
  },

  overhangPair(value) {
    const values = Array.isArray(value) ? value : [value ?? 0, value ?? 0];
    return [Number(values[0] ?? 0), Number(values[1] ?? 0)];
  },
};

window.FloorPlanRoofGeometry = FloorPlanRoofGeometry;
