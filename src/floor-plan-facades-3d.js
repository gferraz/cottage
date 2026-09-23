/* Experimental architectural facade renderer.
 * It deliberately depends only on the normalized FloorPlan geometry and does
 * not change the domain model or the existing SVG facade renderer.
 */
const FloorPlanFacades3D = {
  render(plan, { direction = "front" } = {}) {
    const container = plan.facade3dLayer;
    if (!container) return;
    container.replaceChildren();

    if (!window.THREE) {
      container.textContent =
        "A vista 3D alternativa não está disponível neste momento.";
      if (!container.dataset.threeWaiting) {
        container.dataset.threeWaiting = "true";
        window.addEventListener("three-ready", () => this.render(plan), {
          once: true,
        });
      }
      return;
    }
    delete container.dataset.threeWaiting;

    const THREE = window.THREE;
    const finite = (...values) => values.every((value) => Number.isFinite(Number(value)));
    const reportInvalid = (kind, id) => {
      console.warn(`Fachada 3D: geometria ignorada em ${kind}${id ? ` (${id})` : ""}.`);
    };
    const width = Math.max(container.clientWidth || 900, 480);
    const height = 420;
    const floors = plan.currentConfig?.floors ?? [plan.currentConfig];
    const terrainProfile = plan.terrainReference;
    const buildingOffsetY = Number.parseFloat(
      getComputedStyle(plan.root).getPropertyValue("--building-offset-y"),
    ) || 0;
    const hasTerrainProfile =
      terrainProfile &&
      [
        terrainProfile.frontY,
        terrainProfile.rearY,
        terrainProfile.frontZ,
        terrainProfile.rearZ,
      ].every(Number.isFinite) &&
      terrainProfile.rearY !== terrainProfile.frontY;
    const terrainElevationAt = (y) => {
      if (!hasTerrainProfile) return null;
      const siteY = y + buildingOffsetY;
      const progress = Math.max(
        0,
        Math.min(
          1,
          (siteY - terrainProfile.frontY) /
            (terrainProfile.rearY - terrainProfile.frontY),
        ),
      );
      return (
        terrainProfile.frontZ +
        progress * (terrainProfile.rearZ - terrainProfile.frontZ)
      );
    };
    const facadeSide = direction === "front" ? "top" : "bottom";
    const isStairFlight = (definition) =>
      String(definition?.classes || "")
        .split(/\s+/)
        .includes("stair-flight");
    const rooms = (plan.allRooms || [])
      .filter((entry) => !isStairFlight(plan.roomDefinitions?.get(entry.id)))
      .map((entry) => {
        const reference = plan.getRoomGeometry(entry.id);
        if (!reference) return null;
        const definition = plan.roomDefinitions?.get(entry.id);
        const floorIndex = floors.findIndex((floor) =>
          (floor?.rooms ?? []).includes(definition),
        );
        const floor = floors[floorIndex] || floors[0] || {};
        const floorZ0 = Number(floor.z0 ?? 0);
        const nextZ0 = Number(floors[floorIndex + 1]?.z0);
        const wallMaxHeight = Number(floor.wall_max_height ?? 0);
        const defaultHeight = Number.isFinite(nextZ0)
          ? Math.min(Math.max(0, nextZ0 - floorZ0), wallMaxHeight)
          : wallMaxHeight;
        const partReferences = [...(reference.partReferences?.values() ?? [])];
        const partValues = (method) =>
          partReferences
            .map((part) => Number(part[method]()))
            .filter(Number.isFinite);
        const partX0 = partValues("x0");
        const partX1 = partValues("x1");
        const partY0 = partValues("y0");
        const partY1 = partValues("y1");
        const partZ0 = partValues("z0");
        const partZ1 = partValues("z1");
        const x0 = partX0.length ? Math.min(...partX0) : Number(reference.x0());
        const x1 = partX1.length ? Math.max(...partX1) : Number(reference.x1());
        const y0 = partY0.length ? Math.min(...partY0) : Number(reference.y0());
        const y1 = partY1.length ? Math.max(...partY1) : Number(reference.y1());
        const hasPartElevation = partZ0.length > 0 && partZ1.length > 0;
        const z0 = hasPartElevation ? Math.min(...partZ0) : floorZ0;
        const z1 = hasPartElevation ? Math.max(...partZ1) : z0;
        const facadeZ1 = z1 > z0 ? z1 : z0 + defaultHeight;
        return {
          ...reference,
          dataset: { id: entry.id, label: entry.label || entry.id },
          x0: () => x0,
          x1: () => x1,
          y0: () => y0,
          y1: () => y1,
          z0: () => z0,
          z1: () => facadeZ1,
        };
      });

    const stairFlights = [];
    floors.forEach((floor) => {
      (floor?.rooms ?? []).forEach((definition) => {
        if (isStairFlight(definition)) {
          stairFlights.push(plan.normalizeGeometryAtFloor(definition, floor));
        }
        if (!Array.isArray(definition.parts)) return;
        const previousHeight = plan.currentFloorHeight;
        plan.currentFloorHeight = Number(floor?.z0 ?? 0);
        try {
          stairFlights.push(
            ...plan
              .normalizeParts(definition.parts)
              .filter(isStairFlight),
          );
        } finally {
          plan.currentFloorHeight = previousHeight;
        }
      });
    });

    if (!rooms.length) {
      container.textContent = "Nenhum cômodo disponível para esta fachada.";
      return;
    }

    const roomBounds = rooms.reduce(
      (bounds, room) => ({
        x0: Math.min(bounds.x0, room.x0()),
        x1: Math.max(bounds.x1, room.x1()),
        z0: Math.min(bounds.z0, room.z0()),
        z1: Math.max(bounds.z1, room.z1()),
      }),
      { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
    );
    const drawingBounds = { ...roomBounds };
    (plan.foundationWalls || []).forEach((wall) => {
      const startZ = terrainElevationAt(Number(wall.from?.[1]));
      const endZ = terrainElevationAt(Number(wall.to?.[1]));
      if (Number.isFinite(startZ)) drawingBounds.z0 = Math.min(drawingBounds.z0, startZ);
      if (Number.isFinite(endZ)) drawingBounds.z0 = Math.min(drawingBounds.z0, endZ);
    });
    (plan.independentWalls || new Map()).forEach((wall) => {
      drawingBounds.x0 = Math.min(drawingBounds.x0, wall.x0);
      drawingBounds.x1 = Math.max(drawingBounds.x1, wall.x1);
      wall.path.points.forEach(([, y]) => {
        const baseZ = terrainElevationAt(y);
        if (Number.isFinite(baseZ)) drawingBounds.z0 = Math.min(drawingBounds.z0, baseZ);
      });
      drawingBounds.z1 = Math.max(drawingBounds.z1, wall.topZ);
    });
    stairFlights.forEach((stair) => {
      drawingBounds.x0 = Math.min(drawingBounds.x0, Number(stair.x));
      drawingBounds.x1 = Math.max(drawingBounds.x1, Number(stair.x) + Number(stair.w));
      drawingBounds.z0 = Math.min(drawingBounds.z0, Number(stair.z0));
      drawingBounds.z1 = Math.max(drawingBounds.z1, Number(stair.z1));
    });
    (plan.allRoofs || []).forEach((roof) => {
      if (roof.type !== "gable") return;
      try {
        const base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof);
        const longitudinal = roof.orientation === "longitudinal";
        const [overhang0, overhang1] = FloorPlanRoofs.overhangPair(
          longitudinal ? roof.eave : roof.rake,
        );
        const baseX0 = Number(base.x0());
        const baseX1 = Number(base.x1());
        const baseSpan = longitudinal
          ? baseX1 - baseX0
          : Number(base.y1()) - Number(base.y0());
        const pitch = Number(roof.pitch);
        const z0 =
          roof.z0 === undefined
            ? FloorPlanRoofs.baseCeilingZ(plan, base, 0)
            : plan.resolve(roof.z0);
        const rise = (baseSpan / 2) * Math.tan((pitch * Math.PI) / 180);
        const x0 = longitudinal
          ? baseX0 - overhang0
          : baseX0 - overhang0;
        const x1 = longitudinal
          ? baseX1 + overhang1
          : baseX1 + overhang1;
        if (finite(x0, x1, z0, rise)) {
          drawingBounds.x0 = Math.min(drawingBounds.x0, x0);
          drawingBounds.x1 = Math.max(drawingBounds.x1, x1);
          drawingBounds.z1 = Math.max(drawingBounds.z1, z0 + rise);
        }
      } catch {
        // The regular roof renderer reports invalid roof definitions.
      }
    });
    const padding = 2.5;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#faf9f4");
    const aspect = width / height;
    const contentWidth = drawingBounds.x1 - drawingBounds.x0 + padding * 2;
    const contentHeight = drawingBounds.z1 - drawingBounds.z0 + padding * 2;
    const viewHeight = Math.max(
      contentHeight * 1.2,
      (contentWidth / aspect) * 1.15,
    );
    const viewWidth = viewHeight * aspect;
    const centerX = (drawingBounds.x0 + drawingBounds.x1) / 2;
    // Leave a little more visual breathing room below the facade baseline.
    const centerZ = (drawingBounds.z0 + drawingBounds.z1) / 2 - 0.8;
    // Elevations are read from outside the building. Mirror the presentation
    // around the facade center so the plan's longitudinal orientation is
    // preserved: the office remains on the observer's right, near P02.
    scene.scale.x = -1;
    scene.position.x = centerX * 2;
    const camera = new THREE.OrthographicCamera(
      centerX - viewWidth / 2,
      centerX + viewWidth / 2,
      centerZ + viewHeight / 2,
      centerZ - viewHeight / 2,
      0.1,
      200,
    );
    camera.position.set(
      (roomBounds.x0 + roomBounds.x1) / 2 + 8,
      direction === "front" ? -45 : 45,
      centerZ + 18,
    );
    camera.up.set(0, 0, 1);
    camera.lookAt(
      (roomBounds.x0 + roomBounds.x1) / 2,
      0,
      centerZ,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.className = "facade-3d-canvas";
    renderer.domElement.setAttribute("aria-label", "Fachada frontal alternativa em 3D");
    container.append(renderer.domElement);

    const wallMaterial = new THREE.MeshBasicMaterial({
      color: "#e7e7e1",
      side: THREE.DoubleSide,
    });
    const wallLineMaterial = new THREE.LineBasicMaterial({
      color: "#30302d",
    });
    const roofMaterial = new THREE.MeshBasicMaterial({
      color: "#b45c3d",
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const roofLineMaterial = new THREE.LineBasicMaterial({
      color: "#8c432d",
    });
    const windowMaterial = new THREE.MeshBasicMaterial({
      color: "#b9d5e5",
      transparent: true,
      opacity: 0.40,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const doorMaterial = new THREE.MeshBasicMaterial({
      color: "#8b6b4f",
      side: THREE.DoubleSide,
    });
    const terrainMaterial = new THREE.MeshBasicMaterial({
      color: "#9dbb8b",
      side: THREE.DoubleSide,
    });
    const outdoorIds = new Set(
      [...(plan.roomDefinitions?.entries() ?? [])]
        .filter(([, room]) =>
          String(room.classes || "").split(/\s+/).includes("outdoor"),
        )
        .map(([id]) => String(id)),
    );
    const externalOpenings = [
      ...(plan.allOpenings || []),
      ...(plan.allWindows || []),
    ].filter((opening) => {
      const target = String(opening.to || "exterior").split(".")[0];
      return target === "exterior" || outdoorIds.has(target);
    });
    const openingsByWall = new Map();
    [...(plan.allOpenings || []), ...(plan.allWindows || [])].forEach(
      (opening) => {
        if (!opening.wallId) return;
        const features = openingsByWall.get(opening.wallId) || [];
        features.push(opening);
        openingsByWall.set(opening.wallId, features);
      },
    );
    const gableOwnedOpeningIds = new Set();
    externalOpenings.forEach((opening) => {
      const part = opening.void || opening;
      const openingX = Number(part.x);
      const openingZ = Number(part.z0);
      const openingWidth = Number(part.w);
      const openingHeight = Number(part.h);
      if (!finite(openingX, openingZ, openingWidth, openingHeight)) return;
      (plan.allRoofs || []).forEach((roof) => {
        if (roof.type !== "gable" || roof.orientation !== "longitudinal") return;
        if (opening.wall !== facadeSide) return;
        try {
          const base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof);
          const baseX0 = Number(base.x0());
          const baseX1 = Number(base.x1());
          const roofZ0 =
            roof.z0 === undefined
              ? FloorPlanRoofs.baseCeilingZ(plan, base, 0)
              : plan.resolve(roof.z0);
          const rise =
            ((baseX1 - baseX0) / 2) *
            Math.tan((Number(roof.pitch) * Math.PI) / 180);
          const ridgeX = (baseX0 + baseX1) / 2;
          const roofTop =
            roofZ0 +
            rise -
            Math.abs(openingX + openingWidth / 2 - ridgeX) *
              Math.tan((Number(roof.pitch) * Math.PI) / 180);
          if (
            openingX >= baseX0 &&
            openingX + openingWidth <= baseX1 &&
            openingZ >= roofZ0 &&
            openingZ + openingHeight <= roofTop
          ) {
            gableOwnedOpeningIds.add(opening.id);
          }
        } catch {
          // Invalid roof geometry is reported by the regular model validator.
        }
      });
    });
    const terrainBounds = rooms.reduce(
      (bounds, room) => ({
        x0: Math.min(bounds.x0, room.x0()),
        x1: Math.max(bounds.x1, room.x1()),
        y0: Math.min(bounds.y0, room.y0()),
        y1: Math.max(bounds.y1, room.y1()),
      }),
      { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity },
    );
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(
        terrainBounds.x1 - terrainBounds.x0 + 8,
        terrainBounds.y1 - terrainBounds.y0 + 8,
      ),
      terrainMaterial,
    );
    terrain.position.set(
      (terrainBounds.x0 + terrainBounds.x1) / 2,
      (terrainBounds.y0 + terrainBounds.y1) / 2,
      -0.03,
    );
    if (hasTerrainProfile) {
      const positions = terrain.geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const siteY =
          terrain.position.y + positions.getY(index) + buildingOffsetY;
        const progress = Math.max(
          0,
          Math.min(
            1,
            (siteY - terrainProfile.frontY) /
              (terrainProfile.rearY - terrainProfile.frontY),
          ),
        );
        const elevation =
          terrainProfile.frontZ +
          progress * (terrainProfile.rearZ - terrainProfile.frontZ);
        positions.setZ(index, elevation);
      }
      positions.needsUpdate = true;
      terrain.geometry.computeVertexNormals();
      terrain.geometry.computeBoundingBox();
      terrain.geometry.computeBoundingSphere();
    }
    terrain.renderOrder = -10;
    scene.add(terrain);

    (plan.foundationWalls || []).forEach((wall) => {
      const [x, y, z0] = wall.pos;
      const [width, depth] = wall.size;
      const topZ = Number(wall.topZ);
      const alongX = wall.axis === "x";
      const length = alongX ? width : depth;
      const thickness = Number(wall.thickness);
      const startY = Number(wall.from[1]);
      const endY = Number(wall.to[1]);
      let baseStart = terrainElevationAt(startY);
      let baseEnd = terrainElevationAt(endY);
      if (
        !finite(x, y, z0, topZ, length, thickness, startY, endY) ||
        !Number.isFinite(baseStart) ||
        !Number.isFinite(baseEnd) ||
        length <= 0 || thickness <= 0
      ) {
        reportInvalid("parede de embasamento", wall.id);
        return;
      }

      let start = 0;
      let end = length;
      const originalBaseStart = baseStart;
      const originalBaseEnd = baseEnd;
      if (baseStart >= topZ && baseEnd >= topZ) return;
      if (baseStart >= topZ) {
        const crossing = (topZ - baseStart) / (baseEnd - baseStart);
        start = length * crossing;
        baseStart = topZ;
      } else if (baseEnd >= topZ) {
        const crossing = (topZ - baseStart) / (baseEnd - baseStart);
        end = length * crossing;
        baseEnd = topZ;
      }
      const visibleLength = end - start;
      if (visibleLength <= 1e-9) return;

      const shape = new THREE.Shape();
      const startBaseZ = alongX
        ? originalBaseStart
        : originalBaseStart + ((originalBaseEnd - originalBaseStart) * start) / length;
      const endBaseZ = alongX
        ? originalBaseEnd
        : originalBaseStart + ((originalBaseEnd - originalBaseStart) * end) / length;
      shape.moveTo(0, 0);
      shape.lineTo(visibleLength, endBaseZ - startBaseZ);
      shape.lineTo(visibleLength, topZ - startBaseZ);
      shape.lineTo(0, topZ - startBaseZ);
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: false,
      });
      const segmentX = alongX ? x + start : x;
      const segmentY = alongX ? y : y + start;
      const transform = alongX
        ? new THREE.Matrix4().set(
            1, 0, 0, segmentX,
            0, 0, -1, segmentY + thickness,
            0, 1, 0, startBaseZ,
            0, 0, 0, 1,
          )
        : new THREE.Matrix4().set(
            0, 0, 1, segmentX,
            1, 0, 0, segmentY,
            0, 1, 0, startBaseZ,
            0, 0, 0, 1,
          );
      geometry.applyMatrix4(transform);
      const foundation = new THREE.Mesh(geometry, wallMaterial);
      foundation.userData.domainId = wall.id;
      foundation.userData.sourceWallId = wall.sourceWallId;
      foundation.renderOrder = 1;
      scene.add(foundation);
      scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), wallLineMaterial));
    });

    (plan.independentWalls || new Map()).forEach((wall) => {
      const { points } = wall.path;
      for (let index = 0; index < points.length - 1; index += 1) {
        const [x0, y0] = points[index];
        const [x1, y1] = points[index + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const length = Math.hypot(dx, dy);
        let baseStart = terrainElevationAt(y0);
        let baseEnd = terrainElevationAt(y1);
        if (
          !finite(x0, y0, x1, y1, length, wall.topZ, wall.thickness) ||
          !Number.isFinite(baseStart) ||
          !Number.isFinite(baseEnd) ||
          length <= 1e-9 ||
          wall.thickness <= 0
        ) {
          reportInvalid("parede independente", wall.id);
          continue;
        }
        const originalBaseStart = baseStart;
        const originalBaseEnd = baseEnd;
        let start = 0;
        let end = length;
        if (baseStart >= wall.topZ && baseEnd >= wall.topZ) continue;
        if (baseStart >= wall.topZ) {
          start = length * (wall.topZ - baseStart) / (baseEnd - baseStart);
          baseStart = wall.topZ;
        } else if (baseEnd >= wall.topZ) {
          end = length * (wall.topZ - baseStart) / (baseEnd - baseStart);
          baseEnd = wall.topZ;
        }
        const segmentLength = end - start;
        if (segmentLength <= 1e-9) continue;
        const ux = dx / length;
        const uy = dy / length;
        const nx = -uy;
        const ny = ux;
        const startX = x0 + ux * start;
        const startY = y0 + uy * start;
        const startBaseZ = originalBaseStart + (originalBaseEnd - originalBaseStart) * start / length;
        const endBaseZ = originalBaseStart + (originalBaseEnd - originalBaseStart) * end / length;
        const profile = [
          [0, 0],
          [segmentLength, endBaseZ - startBaseZ],
          [segmentLength, wall.topZ - startBaseZ],
          [0, wall.topZ - startBaseZ],
        ];
        const polygon = profile.filter(([px, py], pointIndex) => {
          const previous = profile[(pointIndex + profile.length - 1) % profile.length];
          return Math.hypot(px - previous[0], py - previous[1]) > 1e-9;
        });
        const area = Math.abs(polygon.reduce((sum, [px, py], pointIndex) => {
          const next = polygon[(pointIndex + 1) % polygon.length];
          return sum + px * next[1] - next[0] * py;
        }, 0)) / 2;
        if (polygon.length < 3 || area <= 1e-9) continue;
        const shape = new THREE.Shape();
        shape.moveTo(...polygon[0]);
        polygon.slice(1).forEach((point) => shape.lineTo(...point));
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: wall.thickness,
          bevelEnabled: false,
        });
        geometry.applyMatrix4(new THREE.Matrix4().set(
          ux, 0, nx, startX - nx * wall.thickness / 2,
          uy, 0, ny, startY - ny * wall.thickness / 2,
          0, 1, 0, startBaseZ,
          0, 0, 0, 1,
        ));
        const mesh = new THREE.Mesh(geometry, wallMaterial);
        mesh.userData.domainId = wall.id;
        mesh.userData.pathSegment = index;
        mesh.renderOrder = 1;
        scene.add(mesh);
        scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), wallLineMaterial));
      }
    });

    plan.walls.forEach((wall) => {
      const [x0, y0, z0] = wall.pos;
      const [width, depth, height] = wall.size;
      const alongX = wall.axis === "x";
      const length = alongX ? width : depth;
      if (!finite(x0, y0, z0, width, depth, height, length) || length <= 0 || height <= 0) {
        reportInvalid("parede", wall.id);
        return;
      }

      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(length, 0);
      shape.lineTo(length, height);
      shape.lineTo(0, height);
      shape.closePath();
      (openingsByWall.get(wall.id) || []).forEach((opening) => {
        const part = opening.void || opening;
        const holeStart = alongX ? Number(part.x) : Number(part.y);
        const wallStart = alongX ? wall.from[0] : wall.from[1];
        const holeX = holeStart - wallStart;
        const holeZ = Number(part.z0) - z0;
        const holeWidth = Number(part.w);
        const holeHeight = Number(part.h);
        if (
          !finite(holeX, holeZ, holeWidth, holeHeight) ||
          holeWidth <= 0 ||
          holeHeight <= 0 ||
          holeX < 0 ||
          holeZ < 0 ||
          holeX + holeWidth > length ||
          holeZ + holeHeight > height
        ) {
          reportInvalid("recorte de parede", opening.id);
          return;
        }
        const hole = new THREE.Path();
        hole.moveTo(holeX, holeZ);
        hole.lineTo(holeX + holeWidth, holeZ);
        hole.lineTo(holeX + holeWidth, holeZ + holeHeight);
        hole.lineTo(holeX, holeZ + holeHeight);
        hole.closePath();
        shape.holes.push(hole);
      });

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: alongX ? depth : width,
        bevelEnabled: false,
      });
      const transform = alongX
        ? new THREE.Matrix4().set(
            1, 0, 0, x0,
            0, 0, -1, y0 + depth,
            0, 1, 0, z0,
            0, 0, 0, 1,
          )
        : new THREE.Matrix4().set(
            0, 0, 1, x0,
            1, 0, 0, y0,
            0, 1, 0, z0,
            0, 0, 0, 1,
          );
      geometry.applyMatrix4(transform);
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.userData.domainId = wall.id;
      scene.add(mesh);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        wallLineMaterial,
      );
      scene.add(outline);

      (openingsByWall.get(wall.id) || []).forEach((opening) => {
        if (!opening.element) return;
        const part = opening.element;
        const feature = new THREE.Mesh(
          new THREE.BoxGeometry(
            alongX ? Number(part.w) : 0.04,
            alongX ? 0.04 : Number(part.w),
            Number(part.h),
          ),
          part.type === "window" ? windowMaterial : doorMaterial,
        );
        feature.position.set(
          alongX ? Number(part.x) + Number(part.w) / 2 : wall.from[0],
          alongX ? wall.from[1] : Number(part.y) + Number(part.w) / 2,
          Number(part.z0) + Number(part.h) / 2,
        );
        feature.renderOrder = 9;
        scene.add(feature);
      });
    });

    stairFlights.forEach((stair) => {
      const x = Number(stair.x);
      const y = Number(stair.y);
      const width = Number(stair.w);
      const length = Number(stair.l);
      const z0 = Number(stair.z0);
      const height = Number(stair.h);
      const axis = stair.stairAxis || (width >= length ? "horizontal" : "vertical");
      const run = axis === "horizontal" ? width : length;
      if (
        !finite(x, y, width, length, z0, height, run) ||
        width <= 0 || length <= 0 || height <= 0 || run <= 0
      ) {
        reportInvalid("lance de escada", stair.id);
        return;
      }

      const stepCount = Math.max(1, Math.round(height / 0.16));
      const stepRun = run / stepCount;
      const stepRise = height / stepCount;
      const ascendsWithIncreasingAxis =
        (stair.stairDirection !== "reverse") === (stair.stairRise !== "down");
      for (let index = 0; index < stepCount; index += 1) {
        const offset = ascendsWithIncreasingAxis
          ? index * stepRun
          : run - (index + 1) * stepRun;
        const stepHeight = (index + 1) * stepRise;
        const dimensions = axis === "horizontal"
          ? [stepRun, length, stepHeight]
          : [width, stepRun, stepHeight];
        const center = axis === "horizontal"
          ? [x + offset + stepRun / 2, y + length / 2, z0 + stepHeight / 2]
          : [x + width / 2, y + offset + stepRun / 2, z0 + stepHeight / 2];
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(...dimensions),
          wallMaterial,
        );
        step.position.set(...center);
        step.userData.domainId = stair.id;
        step.userData.stepIndex = index;
        scene.add(step);
      }
    });

    (plan.allItems || [])
      .filter((item) => String(item.classes || "").split(/\s+/).includes("railing"))
      .forEach((item) => {
        const x = Number(item.x);
        const y = Number(item.y);
        const width = Number(item.w);
        const height = Number(item.h ?? item.z1 - item.z0);
        const z0 = Number(item.z0 ?? 0);
        const length = Number(item.l ?? item.length ?? item.w);
        if (!finite(x, y, width, length, height, z0) || width <= 0 || length <= 0 || height <= 0) return;
        const railing = new THREE.Mesh(
          new THREE.BoxGeometry(width, length, height),
          wallLineMaterial,
        );
        railing.position.set(x + width / 2, y + length / 2, z0 + height / 2);
        railing.renderOrder = 5;
        scene.add(railing);
      });

    const roofs = plan.allRoofs || [];
    roofs.forEach((roof) => {
      if (roof.type !== "gable") return;
      let base;
      try {
        base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof);
      } catch {
        return;
      }
      if (!base) return;
      const pitch = Number(roof.pitch);
      if (!Number.isFinite(pitch)) return;
      const baseX0 = Number(base.x0());
      const baseX1 = Number(base.x1());
      const baseY0 = Number(base.y0());
      const baseY1 = Number(base.y1());
      const [eave0, eave1] = FloorPlanRoofs.overhangPair(roof.eave);
      const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
      const span = roof.orientation === "longitudinal" ? baseX1 - baseX0 : baseY1 - baseY0;
      const rise = (span / 2) * Math.tan((pitch * Math.PI) / 180);
      const pitchTangent = Math.tan((pitch * Math.PI) / 180);
      const z0 =
        roof.z0 === undefined
          ? FloorPlanRoofs.baseCeilingZ(plan, base, 0)
          : plan.resolve(roof.z0);
      if (!finite(baseX0, baseX1, baseY0, baseY1, span, rise, z0) || span <= 0 || rise < 0) {
        reportInvalid("telhado", roof.id);
        return;
      }

      if (roof.orientation === "longitudinal") {
        const roofX0 = baseX0 - eave0;
        const roofX1 = baseX1 + eave1;
        const roofY0 = baseY0 - rake0;
        const roofY1 = baseY1 + rake1;
        const ridgeX = (baseX0 + baseX1) / 2;
        const makeSlope = (x0, z0AtEave, x1, z1AtRidge) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
              [
                x0, roofY0, z0AtEave,
                x1, roofY0, z1AtRidge,
                x1, roofY1, z1AtRidge,
                x0, roofY1, z0AtEave,
              ],
              3,
            ),
          );
          geometry.setIndex([0, 1, 2, 0, 2, 3]);
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, roofMaterial);
          mesh.renderOrder = 7;
          scene.add(mesh);
        };
        makeSlope(roofX0, z0 - eave0 * pitchTangent, ridgeX, z0 + rise);
        makeSlope(ridgeX, z0 + rise, roofX1, z0 - eave1 * pitchTangent);
        [roofY0, roofY1].forEach((y) => {
          const rakeEdge = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(
                roofX0,
                y,
                z0 - eave0 * pitchTangent,
              ),
              new THREE.Vector3(ridgeX, y, z0 + rise),
              new THREE.Vector3(
                roofX1,
                y,
                z0 - eave1 * pitchTangent,
              ),
            ]),
            roofLineMaterial,
          );
          rakeEdge.renderOrder = 8;
          scene.add(rakeEdge);
        });

        const shape = new THREE.Shape();
        shape.moveTo(base.x0(), z0);
        shape.lineTo(ridgeX, z0 + rise);
        shape.lineTo(baseX1, z0);
        shape.closePath();
        const roofWall = direction === "front" ? "top" : "bottom";
        const gableRidgeX = (baseX0 + baseX1) / 2;
        const roofOpeningCandidates = [
          ...externalOpenings.filter((opening) => {
            const part = opening.void || opening;
            const openingX = Number(part.x);
            const openingZ = Number(part.z0);
            return (
              opening.wall === roofWall &&
              finite(openingX, openingZ, part.w, part.h) &&
              openingX >= baseX0 &&
              openingX + Number(part.w) <= baseX1 &&
              openingZ >= z0
            );
          }),
          ...(Array.isArray(roof.openings) ? roof.openings : []).map(
            (opening) => {
              const openingWidth = Number(opening.w ?? 0.9);
              const openingHeight = Number(opening.h ?? 1.5);
              const offset =
                opening.dx === undefined
                  ? (baseX1 - baseX0 - openingWidth) / 2
                  : plan.resolve(opening.dx);
              return {
                ...opening,
                wall: roofWall,
                void: {
                  x: baseX0 + offset,
                  z0:
                    opening.z0 === undefined
                      ? z0 + Math.max(0, (rise - openingHeight) / 2)
                      : plan.resolve(opening.z0),
                  w: openingWidth,
                  h: openingHeight,
                },
              };
            },
          ),
        ];
        roofOpeningCandidates.forEach((opening) => {
          const part = opening.void || opening;
          const holeX = Number(part.x);
          const holeZ = Number(part.z0);
          const holeWidth = Number(part.w);
          const holeHeight = Number(part.h);
          const roofTop =
            z0 +
            rise -
            Math.abs(holeX + holeWidth / 2 - gableRidgeX) *
              Math.tan((pitch * Math.PI) / 180);
          if (
            !finite(holeX, holeZ, holeWidth, holeHeight, roofTop) ||
            holeX < 0 ||
            holeZ < z0 ||
            holeWidth <= 0 ||
            holeHeight <= 0 ||
            holeZ + holeHeight > roofTop
          ) {
            reportInvalid("recorte do frontão", opening.id);
            return;
          }
          const hole = new THREE.Path();
          hole.moveTo(holeX, holeZ);
          hole.lineTo(holeX + holeWidth, holeZ);
          hole.lineTo(holeX + holeWidth, holeZ + holeHeight);
          hole.lineTo(holeX, holeZ + holeHeight);
          hole.closePath();
          shape.holes.push(hole);
        });
        const geometry = new THREE.ShapeGeometry(shape);
        const mesh = new THREE.Mesh(geometry, wallMaterial);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y =
          direction === "front" ? baseY0 - 0.08 : baseY1 + 0.08;
        mesh.renderOrder = 3;
        scene.add(mesh);
        const wallOutline = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(baseX0, mesh.position.y - 0.01, z0),
            new THREE.Vector3(ridgeX, mesh.position.y - 0.01, z0 + rise),
            new THREE.Vector3(baseX1, mesh.position.y - 0.01, z0),
            new THREE.Vector3(baseX0, mesh.position.y - 0.01, z0),
          ]),
          roofLineMaterial,
        );
        wallOutline.renderOrder = 4;
        scene.add(wallOutline);

        roofOpeningCandidates.forEach((opening) => {
          if (!opening.element && !opening.type) return;
          const part = opening.element || opening.void || opening;
          const openingX = Number(part.x);
          const openingZ = Number(part.z0);
          const openingWidth = Number(part.w);
          const openingHeight = Number(part.h);
          if (
            !finite(openingX, openingZ, openingWidth, openingHeight) ||
            openingWidth <= 0 ||
            openingHeight <= 0
          )
            return;
          const feature = new THREE.Mesh(
            new THREE.BoxGeometry(openingWidth, 0.04, openingHeight),
            opening.type === "window" ? windowMaterial : doorMaterial,
          );
          feature.position.set(
            openingX + openingWidth / 2,
            direction === "front" ? baseY0 - 0.025 : baseY1 + 0.025,
            openingZ + openingHeight / 2,
          );
          feature.renderOrder = 9;
          scene.add(feature);
        });
      } else {
        const roofX0 = baseX0 - rake0;
        const roofX1 = baseX1 + rake1;
        const roofY0 = baseY0 - eave0;
        const roofY1 = baseY1 + eave1;
        const ridgeY = (baseY0 + baseY1) / 2;
        const makeSlope = (y0, zStart, y1, zEnd) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
              [
                roofX0, y0, zStart,
                roofX1, y0, zStart,
                roofX1, y1, zEnd,
                roofX0, y1, zEnd,
              ],
              3,
            ),
          );
          geometry.setIndex([0, 1, 2, 0, 2, 3]);
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, roofMaterial);
          mesh.renderOrder = 7;
          scene.add(mesh);
          return geometry;
        };
        makeSlope(roofY0, z0 - eave0 * pitchTangent, ridgeY, z0 + rise);
        makeSlope(ridgeY, z0 + rise, roofY1, z0 - eave1 * pitchTangent);

        const roofLines = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(roofX0, roofY0, z0 - eave0 * pitchTangent),
            new THREE.Vector3(roofX1, roofY0, z0 - eave0 * pitchTangent),
            new THREE.Vector3(roofX0, ridgeY, z0 + rise),
            new THREE.Vector3(roofX1, ridgeY, z0 + rise),
            new THREE.Vector3(roofX0, roofY1, z0 - eave1 * pitchTangent),
            new THREE.Vector3(roofX1, roofY1, z0 - eave1 * pitchTangent),
          ]),
          roofLineMaterial,
        );
        roofLines.renderOrder = 8;
        scene.add(roofLines);
      }

    });

    renderer.render(scene, camera);
    container._threeRenderer = renderer;
  },
};

window.FloorPlanFacades3D = FloorPlanFacades3D;
