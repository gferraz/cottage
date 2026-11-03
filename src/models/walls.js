const FloorPlanWalls = {
  // Clip a convex solid, closing the cut with a face ordered around its normal.
  clipSolid(faces, plane) {
    const distance = (point) => plane.slice(0, 3).reduce((sum, n, i) => sum + n * point[i], plane[3]);
    const distances = faces.flat().map(distance);
    if (distances.every((value) => value <= 1e-9)) return faces;
    if (distances.every((value) => value >= -1e-9)) return [];
    const cuts = [];
    const result = faces.map((face) => {
      const polygon = [];
      face.forEach((point, i) => {
        const next = face[(i + 1) % face.length];
        const a = distance(point);
        const b = distance(next);
        if (a <= 1e-9) polygon.push(point);
        if ((a < -1e-9 && b > 1e-9) || (a > 1e-9 && b < -1e-9)) {
          const cut = point.map((value, axis) => value + (next[axis] - value) * a / (a - b));
          polygon.push(cut);
          cuts.push(cut);
        } else if (Math.abs(a) <= 1e-9) cuts.push(point);
      });
      return polygon;
    }).filter((face) => face.length >= 3);
    const unique = cuts.filter((point, i) => cuts.findIndex((other) =>
      point.every((value, axis) => Math.abs(value - other[axis]) < 1e-8)) === i);
    if (unique.length >= 3) {
      const center = unique[0].map((_, axis) => unique.reduce((sum, point) => sum + point[axis], 0) / unique.length);
      const normal = plane.slice(0, 3);
      const magnitude = Math.hypot(...normal);
      const n = normal.map((value) => value / magnitude);
      const seed = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const u = cross(n, seed);
      const v = cross(n, u);
      const angle = (point) => {
        const delta = point.map((value, axis) => value - center[axis]);
        return Math.atan2(delta.reduce((sum, value, axis) => sum + value * v[axis], 0), delta.reduce((sum, value, axis) => sum + value * u[axis], 0));
      };
      unique.sort((a, b) => angle(a) - angle(b));
      result.push(unique);
    }
    const volume = result.reduce((sum, face) => {
      const a = face[0];
      for (let i = 1; i < face.length - 1; i += 1) {
        const b = face[i], c = face[i + 1];
        sum += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      }
      return sum;
    }, 0);
    return Math.abs(volume) > 1e-10 ? result : [];
  },

  outlineSegments(solids) {
    const epsilon = 1e-7;
    const offset = 1e-5;
    const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    const subtract = (a, b) => a.map((value, i) => value - b[i]);
    const add = (a, b, factor) => a.map((value, i) => value + b[i] * factor);
    const normalize = (vector) => {
      const length = Math.hypot(...vector);
      return length > epsilon ? vector.map((value) => value / length) : null;
    };
    const parts = solids.map((faces) => faces.flatMap((face) => {
      const a = subtract(face[1], face[0]);
      let normal;
      for (let i = 2; i < face.length && !normal; i += 1) {
        const b = subtract(face[i], face[0]);
        normal = normalize([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
      }
      if (!normal) return [];
      const center = face[0].map((_, axis) => face.reduce((sum, point) => sum + point[axis], 0) / face.length);
      return [{ face, normal, center, distance: -dot(normal, face[0]) }];
    }));
    const faces = parts.flat();
    const contains = (part, point) => part.every(({ normal, distance }) => dot(normal, point) + distance <= epsilon);
    const inUnion = (point) => parts.some((part) => contains(part, point));
    const result = [];
    const seen = new Set();
    faces.forEach(({ face }) => face.forEach((from, index) => {
      const to = face[(index + 1) % face.length];
      const delta = subtract(to, from);
      const direction = normalize(delta);
      if (!direction) return;
      const cuts = [0, 1];
      faces.forEach(({ normal, distance }) => {
        const denominator = dot(normal, delta);
        if (Math.abs(denominator) <= epsilon) return;
        const t = -(dot(normal, from) + distance) / denominator;
        if (t > epsilon && t < 1 - epsilon) cuts.push(t);
      });
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i += 1) {
        if (cuts[i + 1] - cuts[i] <= epsilon) continue;
        const start = add(from, delta, cuts[i]);
        const end = add(from, delta, cuts[i + 1]);
        const key = [start, end].map((point) => point.map((value) => Math.round(value / epsilon)).join(",")).sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        const midpoint = add(from, delta, (cuts[i] + cuts[i + 1]) / 2);
        const normals = [];
        parts.forEach((part) => part.forEach(({ normal, distance, center }) => {
          if (Math.abs(dot(normal, midpoint) + distance) > epsilon) return;
          const towardCenter = subtract(center, midpoint);
          const tangent = normalize(add(towardCenter, direction, -dot(towardCenter, direction)));
          const sample = tangent ? add(midpoint, tangent, offset) : midpoint;
          // Probe just inside the face, so concave corners remain visible too.
          if (!contains(part, add(sample, normal, -offset)) || inUnion(add(sample, normal, offset))) return;
          if (!normals.some((other) => dot(other, normal) > 0.999)) normals.push(normal);
        }));
        if (normals.some((normal, j) => normals.slice(j + 1).some((other) => Math.abs(dot(normal, other)) < 0.999))) {
          result.push(start, end);
        }
      }
    }));
    return result;
  },

  roofParts(part, roofs, clip, roofOnly) {
    const split = (piece, planes) => {
      let inside = piece;
      const outside = [];
      for (const plane of planes) {
        const next = clip(inside, plane);
        const remainder = clip(inside, plane.map((value) => -value));
        if (remainder.length && !(next === inside && remainder === inside)) outside.push(remainder);
        inside = next;
        if (!inside.length) break;
      }
      return { inside, outside };
    };
    const result = [];
    const previous = [];
    let uncovered = [part];
    roofs.forEach((roof) => {
      const planes = [...roof.bounds, ...roof.slopes];
      const candidate = split(part, planes).inside;
      // Union the volumes below each roof. Subtract earlier volumes to avoid
      // duplicate faces and count overlapping coverage only once.
      let additions = candidate.length ? [candidate] : [];
      previous.forEach((earlier) => {
        additions = additions.flatMap((piece) => split(piece, earlier).outside);
      });
      result.push(...additions);
      previous.push(planes);
      uncovered = uncovered.flatMap((piece) => split(piece, roof.bounds).outside);
    });
    return roofOnly ? result : [...result, ...uncovered];
  },

  roofSolids(faces, roofs, roofOnly = false) {
    return this.roofParts(faces, roofs, (part, plane) => this.clipSolid(part, plane), roofOnly);
  },

  elevationOutline(polygons) {
    const epsilon = 1e-7;
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const subtract = (a, b) => a.map((value, i) => value - b[i]);
    const at = (a, delta, t) => a.map((value, i) => value + delta[i] * t);
    const edges = polygons.flatMap((polygon) => polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length]]));
    const contains = ([x, y]) => polygons.some((polygon) => {
      let inside = false;
      polygon.forEach(([ax, ay], i) => {
        const [bx, by] = polygon[(i + 1) % polygon.length];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      });
      return inside;
    });
    const seen = new Set();
    const result = [];
    edges.forEach(([a, b]) => {
      const delta = subtract(b, a);
      const length = Math.hypot(...delta);
      if (length < epsilon) return;
      const cuts = [0, 1];
      edges.forEach(([c, d]) => {
        const other = subtract(d, c);
        const denominator = cross(delta, other);
        const offset = subtract(c, a);
        if (Math.abs(denominator) > epsilon) {
          const t = cross(offset, other) / denominator;
          const u = cross(offset, delta) / denominator;
          if (t > epsilon && t < 1 - epsilon && u >= -epsilon && u <= 1 + epsilon) cuts.push(t);
        } else if (Math.abs(cross(offset, delta)) < epsilon) {
          [c, d].forEach((point) => {
            const t = subtract(point, a).reduce((sum, value, i) => sum + value * delta[i], 0) / (length * length);
            if (t > epsilon && t < 1 - epsilon) cuts.push(t);
          });
        }
      });
      cuts.sort((x, y) => x - y);
      for (let i = 0; i < cuts.length - 1; i += 1) {
        if ((cuts[i + 1] - cuts[i]) * length < epsilon) continue;
        const midpoint = at(a, delta, (cuts[i] + cuts[i + 1]) / 2);
        const normal = [-delta[1] / length * 1e-6, delta[0] / length * 1e-6];
        if (contains(at(midpoint, normal, 1)) === contains(at(midpoint, normal, -1))) continue;
        const start = at(a, delta, cuts[i]), end = at(a, delta, cuts[i + 1]);
        const key = [start, end].map((point) => point.map((value) => Math.round(value / epsilon)).join(",")).sort().join(":");
        if (!seen.has(key)) { seen.add(key); result.push(start, end); }
      }
    });
    return result;
  },

  wallElevation({ from, to, thickness, baseStart, baseEnd, top, roofOnly }, roofs, side) {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length <= 1e-9) return [];
    const ux = dx / length, uy = dy / length;
    const faces = this.boxFaces(0, -thickness / 2, baseStart, length, thickness / 2, top)
      .map((face) => face.map(([x, y, z]) => [
        from[0] + ux * x - uy * y,
        from[1] + uy * x + ux * y,
        z === baseStart && x === length ? baseEnd : z,
      ]));
    return this.roofSolids(faces, roofs, roofOnly).flatMap((solid) => {
      // A clipped piece is convex, so its orthographic silhouette is the hull
      // of its projected vertices, including both faces across the thickness.
      const points = solid.flat().map(([x, y, z]) => [side ? y : x, z]
        .map((value) => Math.round(value * 1e8) / 1e8))
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .filter((point, i, all) => !i || point.some((value, axis) => Math.abs(value - all[i - 1][axis]) > 1e-9));
      const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const half = (vertices) => {
        const hull = [];
        vertices.forEach((point) => {
          while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 1e-9) hull.pop();
          hull.push(point);
        });
        return hull.slice(0, -1);
      };
      const hull = [...half(points), ...half([...points].reverse())];
      return hull.length >= 3 ? [hull] : [];
    });
  },

  roofSection(polygon, from, to, roofs, roofOnly = false) {
    const clip = (points, plane) => {
      const distance = ([t, z]) => plane[0] * (from[0] + (to[0] - from[0]) * t) +
        plane[1] * (from[1] + (to[1] - from[1]) * t) + plane[2] * z + plane[3];
      if (!points.length) return [];
      const distances = points.map(distance);
      if (distances.every((value) => value <= 1e-9)) return points;
      if (distances.every((value) => value >= -1e-9)) return [];
      const result = [];
      points.forEach((point, i) => {
        const next = points[(i + 1) % points.length];
        const a = distances[i], b = distances[(i + 1) % points.length];
        if (a <= 1e-9) result.push(point);
        if ((a < -1e-9 && b > 1e-9) || (a > 1e-9 && b < -1e-9)) {
          result.push(point.map((value, axis) => value + (next[axis] - value) * a / (a - b)));
        }
      });
      return result.length >= 3 ? result : [];
    };
    return this.roofParts(polygon, roofs, clip, roofOnly);
  },

  roofLimits(plan, config = null) {
    const roofs = config
      ? [...(config.roofs ?? []), ...(config.floors ?? []).flatMap((floor) =>
          (floor.roofs ?? []).map((roof) => ({ ...roof, floorId: floor.id }))) ]
      : plan.allRoofs ?? [];
    return roofs.flatMap((roof) => {
      if (roof.type !== "gable" || !["longitudinal", "transverse"].includes(roof.orientation)) return [];
      try {
        const floor = FloorPlanRoofs.floorForRoof(plan, roof, roof.base ?? roof);
        const base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof, floor);
        const longitudinal = roof.orientation === "longitudinal";
        const [r0, r1] = FloorPlanRoofs.overhangPair(roof.rake);
        const x0 = base.x0() - (longitudinal ? 0 : r0);
        const x1 = base.x1() + (longitudinal ? 0 : r1);
        const y0 = base.y0() - (longitudinal ? r0 : 0);
        const y1 = base.y1() + (longitudinal ? r1 : 0);
        const start = longitudinal ? base.x0() : base.y0();
        const end = longitudinal ? base.x1() : base.y1();
        const tangent = Math.tan(Number(roof.pitch) * Math.PI / 180);
        const z = roof.z0 === undefined ? FloorPlanRoofs.baseCeilingZ(plan, base, 0, floor) : plan.resolve(roof.z0);
        if (![x0, x1, y0, y1, tangent, z].every(Number.isFinite) || tangent < 0) return [];
        return [{
          peakZ: z + (end - start) * tangent / 2,
          bounds: [[-1, 0, 0, x0], [1, 0, 0, -x1], [0, -1, 0, y0], [0, 1, 0, -y1]],
          slopes: longitudinal
            ? [[-tangent, 0, 1, tangent * start - z], [tangent, 0, 1, -tangent * end - z]]
            : [[0, -tangent, 1, tangent * start - z], [0, tangent, 1, -tangent * end - z]],
        }];
      } catch {
        return [];
      }
    });
  },

  boxFaces(x0, y0, z0, x1, y1, z1) {
    const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y1, z0], d = [x0, y1, z0];
    const e = [x0, y0, z1], f = [x1, y0, z1], g = [x1, y1, z1], h = [x0, y1, z1];
    return [[a, d, c, b], [e, f, g, h], [a, b, f, e], [b, c, g, f], [c, d, h, g], [d, a, e, h]];
  },

  geometryParts(wall) {
    const epsilon = 1e-9;
    return wall.path.points.slice(0, -1).flatMap((from, index) => {
      const to = wall.path.points[index + 1];
      const horizontal = Math.abs(from[1] - to[1]) <= epsilon;
      const vertical = Math.abs(from[0] - to[0]) <= epsilon;
      if (!horizontal && !vertical) {
        return [{
          id: `${wall.id}-segment-${index + 1}`,
          sourceWallId: wall.id,
          pathSegment: index,
          axis: "path",
          from: [from[0], from[1], wall.baseZ],
          to: [to[0], to[1], wall.baseZ],
          thickness: wall.thickness,
          z0: wall.baseZ,
          z1: wall.topZ,
          h: wall.h,
        }];
      }

      const axis = horizontal ? "x" : "y";
      const start = horizontal
        ? Math.min(from[0], to[0])
        : Math.min(from[1], to[1]);
      const end = horizontal
        ? Math.max(from[0], to[0])
        : Math.max(from[1], to[1]);
      const length = end - start;
      if (length <= epsilon) return [];
      const x = horizontal ? start : from[0] - wall.thickness / 2;
      const y = horizontal ? from[1] - wall.thickness / 2 : start;
      const width = horizontal ? length : wall.thickness;
      const depth = horizontal ? wall.thickness : length;
      const center = horizontal ? from[1] : from[0];
      return [{
        id: `${wall.id}-segment-${index + 1}`,
        sourceWallId: wall.id,
        pathSegment: index,
        axis,
        from: horizontal
          ? [start, center, wall.baseZ]
          : [center, start, wall.baseZ],
        to: horizontal
          ? [end, center, wall.baseZ]
          : [center, end, wall.baseZ],
        pos: [x, y, wall.baseZ],
        size: [width, depth, wall.h],
        thickness: wall.thickness,
        z0: wall.baseZ,
        z1: wall.topZ,
        h: wall.h,
        color: wall.color,
      }];
    });
  },

  resolveRoomSide(plan, roomId, side, opening) {
    const roomWalls = [...plan.walls.values()].filter((wall) =>
      wall.sourceSides.some(
        (source) => source.roomId === roomId && source.side === side,
      ),
    );
    const epsilon = 1e-7;
    const coversOpening = (wall, axis, from, to, coordinate) => {
      const alongStart = axis === "x" ? from[0] : from[1];
      const alongEnd = axis === "x" ? to[0] : to[1];
      const openingStart = axis === "x" ? opening.x : opening.y;
      const openingEnd = openingStart + opening.w;
      const openingCoordinate = axis === "x" ? opening.y : opening.x;
      return (
        Math.abs(openingCoordinate - coordinate) <= Math.max(epsilon, wall.thickness / 2) &&
        openingStart >= Math.min(alongStart, alongEnd) - epsilon &&
        openingEnd <= Math.max(alongStart, alongEnd) + epsilon &&
        opening.z0 >= wall.z0 - epsilon &&
        opening.z0 + opening.h <= wall.z1 + epsilon
      );
    };

    const independentCandidates = [];
    const room = plan.rooms.get(roomId);
    const horizontalSide = side === "top" || side === "bottom";
    const axis = horizontalSide ? "x" : "y";
    const sideCoordinate = side === "top" ? room?.y0() : side === "bottom" ? room?.y1() : side === "left" ? room?.x0() : room?.x1();
    plan.independentWalls?.forEach((wall) => {
      const roomFloorId = plan.roomFloorConfigs?.get(roomId)?.id;
      if (wall.scopeFloorId && roomFloorId && wall.scopeFloorId !== roomFloorId) return;
      const points = wall.path?.points ?? [];
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        const horizontal = Math.abs(to[1] - from[1]) <= epsilon;
        const vertical = Math.abs(to[0] - from[0]) <= epsilon;
        if (!horizontal && !vertical) continue;
        const segmentAxis = horizontal ? "x" : "y";
        if (segmentAxis !== axis) continue;
        const coordinate = axis === "x" ? from[1] : from[0];
        const sideStart = axis === "x" ? room?.x0() : room?.y0();
        const sideEnd = axis === "x" ? room?.x1() : room?.y1();
        const segmentStart = axis === "x" ? from[0] : from[1];
        const segmentEnd = axis === "x" ? to[0] : to[1];
        if (
          Math.abs(coordinate - sideCoordinate) > Math.max(epsilon, wall.thickness / 2) ||
          Math.min(Math.max(segmentStart, segmentEnd), sideEnd) -
            Math.max(Math.min(segmentStart, segmentEnd), sideStart) <= epsilon ||
          !coversOpening(wall, axis, from, to, coordinate)
        ) continue;
        independentCandidates.push({
          ...wall,
          id: wall.id,
          sourceWallId: wall.id,
          pathSegment: index,
          axis,
          from: axis === "x"
            ? [Math.min(from[0], to[0]), coordinate, wall.z0]
            : [coordinate, Math.min(from[1], to[1]), wall.z0],
          to: axis === "x"
            ? [Math.max(from[0], to[0]), coordinate, wall.z0]
            : [coordinate, Math.max(from[1], to[1]), wall.z0],
          z1: wall.topZ,
        });
      }
    });

    if (independentCandidates.length === 1) return independentCandidates[0];
    if (independentCandidates.length > 1) {
      throw new Error(`A abertura ${opening.id} encontra mais de uma parede independente em ${roomId}.${side}`);
    }

    // A shared boundary may be declared only by the neighboring room.
    if (roomWalls.length === 0 && room) {
      const sharedWalls = [...plan.walls.values()].filter((wall) =>
        wall.axis === axis &&
        Math.abs((axis === "x" ? wall.from[1] : wall.from[0]) - sideCoordinate) <= epsilon &&
        coversOpening(wall, axis, wall.from, wall.to, sideCoordinate),
      );
      if (sharedWalls.length === 1) return sharedWalls[0];
      if (sharedWalls.length > 1) {
        throw new Error(`Mais de uma parede corresponde a ${roomId}.${side}`);
      }
    }

    if (roomWalls.length !== 1) {
      throw new Error(
        roomWalls.length === 0
          ? `Nenhuma parede corresponde a ${roomId}.${side}`
          : `Mais de uma parede corresponde a ${roomId}.${side}`,
      );
    }
    const [wall] = roomWalls;
    if (!coversOpening(wall, wall.axis, wall.from, wall.to, wall.axis === "x" ? wall.from[1] : wall.from[0])) {
      throw new Error(`A abertura está fora dos limites geométricos da parede ${wall.id}`);
    }
    return wall;
  },

  renderIndependentWalls(plan) {
    plan.wallElements = [];
    plan.independentWalls.forEach((wall) => {
      if (!plan.showAllFloors && wall.scopeFloorId && wall.scopeFloorId !== plan.currentFloorId) return;
      const points = wall.path.points;
      points.slice(0, -1).forEach(([x0, y0], index) => {
        const [x1, y1] = points[index + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        if (length <= 1e-9) return;
        const element = plan.add({
          id: `${wall.id}-segment-${index + 1}`,
          label: "",
          color: wall.color,
          pos: [
            (x0 + x1) / 2 - length / 2,
            (y0 + y1) / 2 - wall.thickness / 2,
            wall.z0,
          ],
          size: [length, wall.thickness, wall.h],
          classes: "plan-wall independent-wall",
          showLabel: false,
        });
        element.style.transform = `rotate(${Math.atan2(y1 - y0, x1 - x0)}rad)`;
        element.style.transformOrigin = "center";
        element.dataset.wallId = wall.id;
        plan.wallElements.push(element);
      });
    });
  },

  normalizeRoomWalls(plan, config) {
    plan.walls = new Map();
    plan.independentWalls = new Map();
    const floors = config.floors ?? [config];
    const roomFloors = new Map();
    floors.forEach((floor) => {
      (floor.rooms ?? []).forEach((room) => roomFloors.set(room.id, floor));
    });
    const thickness = Number(plan.catalog.walls?.thickness ?? 0.12);
    if (!Number.isFinite(thickness) || thickness <= 0) {
      plan.errors.push({
        category: "wall",
        message: "A espessura padrão de parede precisa ser um número positivo",
      });
      return;
    }

    const roomVolumes = [];
    const signatures = new Map();
    plan.roomDefinitions.forEach((definition, roomId) => {
      if (plan.invalidRoomIds.has(roomId)) return;
      const floor = roomFloors.get(roomId) ?? floors[0] ?? {};
      try {
        const geometry = plan.getRoomGeometry(roomId);
        const floorZ0 = Number(floor.z0 ?? 0);
        const nextFloorIndex = floors.indexOf(floor) + 1;
        const nextFloorZ0 = Number(floors[nextFloorIndex]?.z0);
        const configuredMaxHeight = Number(floor.ceiling_height ?? floor.wall_max_height);
        const floorHeight = Number.isFinite(nextFloorZ0)
          ? Math.min(nextFloorZ0 - floorZ0, configuredMaxHeight)
          : configuredMaxHeight;
        const explicitHeight = Number(geometry.h());
        const height = explicitHeight > 0 ? explicitHeight : floorHeight;
        const roomBounds = [
          geometry.x0(),
          geometry.x1(),
          geometry.y0(),
          geometry.y1(),
          floorZ0,
          height,
        ];
        if (
          !roomBounds.every(Number.isFinite) ||
          geometry.x1() <= geometry.x0() ||
          geometry.y1() <= geometry.y0() ||
          height <= 0
        ) {
          throw new Error(`Não foi possível determinar o volume vertical do cômodo ${roomId}`);
        }
        roomVolumes.push({
          id: roomId,
          outdoor: definition.classes?.split(/\s+/).includes("outdoor"),
          x0: geometry.x0(),
          x1: geometry.x1(),
          y0: geometry.y0(),
          y1: geometry.y1(),
          z0: floorZ0,
          z1: floorZ0 + height,
        });

        const wallStates = plan.normalizeWalls(definition.walls);
        ["top", "right", "bottom", "left"].forEach((side) => {
          const state = wallStates[side];
          if (state !== "solid" && state !== "virtual") return;
          const alongX = side === "top" || side === "bottom";
          const centerX = alongX
            ? null
            : side === "left" ? geometry.x0() : geometry.x1();
          const centerY = alongX
            ? side === "top" ? geometry.y0() : geometry.y1()
            : null;
          const x = alongX
            ? geometry.x0()
            : centerX - thickness / 2;
          const y = alongX
            ? centerY - thickness / 2
            : geometry.y0();
          const w = alongX ? geometry.x1() - geometry.x0() : thickness;
          const l = alongX ? thickness : geometry.y1() - geometry.y0();
          const from = alongX
            ? [geometry.x0(), centerY, floorZ0]
            : [centerX, geometry.y0(), floorZ0];
          const to = alongX
            ? [geometry.x1(), centerY, floorZ0]
            : [centerX, geometry.y1(), floorZ0];
          const wallId = `${roomId}-${side}`;
          const signature = [
            alongX ? "x" : "y",
            x,
            y,
            w,
            l,
            floorZ0,
            height,
            thickness,
          ]
            .map((value) => typeof value === "number" ? value.toFixed(6) : value)
            .join(":");
          const existing = signatures.get(signature);
          if (existing) {
            if (existing.state !== state) {
              plan.errors.push({
                category: "wall",
                id: wallId,
                opening: definition,
                message: `Definições de parede coincidentes têm estados diferentes: ${existing.id} e ${wallId}`,
              });
            }
            if (!existing.sourceRoomIds.includes(roomId))
              existing.sourceRoomIds.push(roomId);
            existing.sourceSides.push({ roomId, side });
            return;
          }
          if (plan.references.has(wallId)) {
            plan.errors.push({
              category: "wall",
              id: wallId,
              opening: definition,
              message: `ID global duplicado para parede derivada: ${wallId}`,
            });
            return;
          }
          const wall = {
            id: wallId,
            type: "wall",
            sourceRoomIds: [roomId],
            sourceSides: [{ roomId, side }],
            state,
            axis: alongX ? "x" : "y",
            from,
            to,
            pos: [x, y, floorZ0],
            size: [w, l, height],
            x,
            y,
            w,
            l,
            z0: floorZ0,
            z1: floorZ0 + height,
            h: height,
            thickness,
            touchedRoomIds: [],
            signature,
          };
          signatures.set(signature, wall);
          plan.walls.set(wallId, wall);
        });
      } catch (error) {
        plan.errors.push({
          category: "wall",
          id: roomId,
          opening: definition,
          message: error.message,
        });
      }
    });

    const epsilon = 1e-9;
    plan.walls.forEach((wall) => {
      const [x0, y0, z0] = wall.pos;
      const [w, l, h] = wall.size;
      const x1 = x0 + w;
      const y1 = y0 + l;
      const z1 = z0 + h;
      wall.touchedRoomIds = roomVolumes
        .filter((room) =>
          Math.min(x1, room.x1) - Math.max(x0, room.x0) > epsilon &&
          Math.min(y1, room.y1) - Math.max(y0, room.y0) > epsilon &&
          Math.min(z1, room.z1) - Math.max(z0, room.z0) > epsilon,
        )
        .map((room) => room.id);
      wall.adjacentEnclosedRoomIds = roomVolumes
        .filter((room) =>
          !room.outdoor &&
          Math.min(x1, room.x1) - Math.max(x0, room.x0) > epsilon &&
          Math.min(y1, room.y1) - Math.max(y0, room.y0) > epsilon &&
          Math.min(z1, room.z1) - Math.max(z0, room.z0) > epsilon,
        )
        .map((room) => room.id);
      if (!wall.touchedRoomIds.length) {
        plan.errors.push({
          category: "wall",
          id: wall.id,
          message: "A parede derivada não toca nenhum volume de cômodo",
        });
      }
      FloorPlanGeometryBox.attach(wall, { label: wall.id });
      plan.references.set(wall.id, wall);
    });

    const groundLevel = Number(floors[0]?.z0 ?? 0);
    const terrainElevations = Object.values(config.terrain?.corners ?? {})
      .map((corner) => Number(corner.z))
      .filter(Number.isFinite);
    const terrainMinimumZ = Math.min(groundLevel, ...terrainElevations);
    const roofLimits = this.roofLimits(plan, config);
    (config.walls ?? []).forEach((definition) => {
      try {
        const defaults = config.config?.walls ?? {};
        definition = { ...definition };
        for (const key of ["base", "top", "thickness", "color"]) {
          if (definition[key] === undefined && defaults[key] !== undefined) {
            definition[key] = defaults[key];
          }
        }
        if (!definition.id) throw new Error("Parede independente precisa de id");
        if (FloorPlanValidation.isReservedId(definition.id)) {
          throw new Error(`ID reservado: ${definition.id}`);
        }
        if (plan.references.has(definition.id)) {
          throw new Error(`ID global duplicado: ${definition.id}`);
        }
        let scopeFields = {};
        if (definition.scope !== undefined) {
          if (typeof definition.scope !== "string" || !definition.scope.trim()) {
            throw new Error("scope da parede precisa ser o ID de um piso ou cômodo");
          }
          const scope = definition.scope.trim();
          const scopeFloor = floors.find((floor) => floor.id === scope);
          const roomFloor = roomFloors.get(scope);
          if (!scopeFloor && !roomFloor) {
            throw new Error(`Escopo inexistente: ${scope}. Informe o ID de um piso ou cômodo`);
          }
          if (scopeFloor && roomFloor) throw new Error(`Escopo ambíguo: ${scope} identifica um piso e um cômodo`);
          scopeFields = {
            scope,
            scopeType: scopeFloor ? "floor" : "room",
            scopeFloorId: (scopeFloor ?? roomFloor).id,
            ...(roomFloor ? { scopeRoomId: scope } : {}),
          };
        }
        const hasEndpoints = definition.from !== undefined || definition.to !== undefined;
        if (hasEndpoints && definition.path !== undefined) {
          throw new Error("Use from/to ou path.points para definir a parede, sem combinar os dois formatos");
        }
        const pointSource = hasEndpoints ? "from/to" : "path.points";
        const points = hasEndpoints ? [definition.from, definition.to] : definition.path?.points;
        if (!Array.isArray(points) || points.length < 2) {
          throw new Error("Parede independente precisa de from/to ou path.points com ao menos dois pontos");
        }
        let localOrigin = null;
        const resolvedPoints = points.map((point, index) => {
          if (!Array.isArray(point) || point.length !== 2) {
            throw new Error(`Cada ponto de ${pointSource} precisa ser [x, y]`);
          }
          const resolved = point.map((value) => plan.resolve(value, localOrigin));
          if (!resolved.every(Number.isFinite)) {
            throw new Error(`As coordenadas de ${pointSource} precisam ser numéricas`);
          }
          if (hasEndpoints && index === 0) {
            localOrigin = { x0: resolved[0], y0: resolved[1] };
          }
          return resolved;
        });
        const thickness = Number(
          definition.thickness ?? plan.catalog.walls?.thickness ?? 0.12,
        );
        const baseDefinition = definition.base ?? "terrain";
        const base = baseDefinition === "terrain" ? "terrain" : "level";
        const baseZ = base === "terrain"
          ? terrainMinimumZ
          : plan.resolve(baseDefinition?.level);
        const roofOnly = definition.top === "roof";
        if (roofOnly && !roofLimits.length) {
          throw new Error('A parede com top: "roof" precisa de um telhado válido acima da base');
        }
        const topZ = roofOnly
          ? Math.max(...roofLimits.map((roof) => roof.peakZ))
          : plan.resolve(definition.top?.level ?? groundLevel);
        if (
          !Number.isFinite(thickness) || thickness <= 0 ||
          !Number.isFinite(baseZ) || !Number.isFinite(topZ)
        ) {
          throw new Error("Parede precisa de thickness positiva e cota superior numérica");
        }
        const x0 = Math.min(...resolvedPoints.map(([x]) => x)) - thickness / 2;
        const x1 = Math.max(...resolvedPoints.map(([x]) => x)) + thickness / 2;
        const y0 = Math.min(...resolvedPoints.map(([, y]) => y)) - thickness / 2;
        const y1 = Math.max(...resolvedPoints.map(([, y]) => y)) + thickness / 2;
        const wall = {
          ...definition,
          ...scopeFields,
          id: definition.id,
          type: "wall",
          path: { ...definition.path, points: resolvedPoints },
          base,
          baseZ,
          top: roofOnly ? "roof" : { ...definition.top, level: topZ },
          topZ,
          thickness,
          x: x0,
          y: y0,
          w: x1 - x0,
          l: y1 - y0,
          x0,
          x1,
          y0,
          y1,
          // This is the lower bound of the compound wall volume. For a
          // terrain-based wall it encloses the varying base elevations.
          z0: baseZ,
          z1: topZ,
          h: topZ - baseZ,
          touchedRoomIds: roomVolumes
            .filter((room) =>
              room.x0 < x1 && room.x1 > x0 &&
              room.y0 < y1 && room.y1 > y0 &&
              room.z0 <= topZ && room.z1 >= baseZ,
            )
            .map((room) => room.id),
        };
        if (wall.base !== "terrain" && wall.base !== "level") {
          throw new Error('A base da parede precisa ser "terrain" ou { level: "referência.z0" }');
        }
        if (wall.h <= 0) throw new Error("A cota superior da parede precisa ficar acima da base");
        wall.geometryParts = this.geometryParts(wall).map((part) => ({ ...part, ...scopeFields, roofOnly }));
        if (roofOnly) {
          const covered = resolvedPoints.slice(0, -1).some((from, i) =>
            this.roofSection([[0, baseZ], [1, baseZ], [1, topZ], [0, topZ]],
              from, resolvedPoints[i + 1], roofLimits, true).length > 0);
          if (!covered) throw new Error('A parede com top: "roof" não encontra nenhum telhado acima da base ao longo do seu caminho');
        }
        FloorPlanGeometryBox.attach(wall, { compound: true, label: wall.id });
        plan.independentWalls.set(wall.id, wall);
        plan.references.set(wall.id, wall);
      } catch (error) {
        plan.errors.push({
          category: "wall",
          id: definition.id,
          opening: definition,
          message: error.message,
        });
      }
    });

    plan.wallRenderParts = [
      ...plan.walls.values(),
      ...[...plan.independentWalls.values()].flatMap((wall) => wall.geometryParts),
    ];

  },
};

window.FloorPlanWalls = FloorPlanWalls;
