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
    const facadeSide = direction === "front" ? "top" : "bottom";
    const rooms = (plan.allRooms || [])
      .map((entry) => {
        const reference = plan.getRoomGeometry(entry.id);
        if (!reference) return null;
        const definition = plan.roomDefinitions?.get(entry.id);
        const walls = plan.normalizeWalls(definition?.walls);
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
          wallState: (side) => walls[side],
          x0: () => x0,
          x1: () => x1,
          y0: () => y0,
          y1: () => y1,
          z0: () => z0,
          z1: () => facadeZ1,
        };
      })
      .filter((room) => {
        const wall = room?.wallState(facadeSide);
        return wall === "solid" || wall === "virtual";
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
    const viewHeight = Math.max(contentHeight, contentWidth / aspect);
    const viewWidth = viewHeight * aspect;
    const centerX = (drawingBounds.x0 + drawingBounds.x1) / 2;
    // Leave a little more visual breathing room below the facade baseline.
    const centerZ = (drawingBounds.z0 + drawingBounds.z1) / 2 - 0.8;
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
      direction === "front" ? -100 : 100,
      (roomBounds.z0 + roomBounds.z1) / 2 + 8,
    );
    camera.up.set(0, 0, 1);
    camera.lookAt(
      (roomBounds.x0 + roomBounds.x1) / 2,
      0,
      (roomBounds.z0 + roomBounds.z1) / 2,
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
      side: THREE.DoubleSide,
    });
    const doorMaterial = new THREE.MeshBasicMaterial({
      color: "#8b6b4f",
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
    const facadeOpenings = (roomId, wall) =>
      externalOpenings.filter(
        (opening) =>
          opening.roomId === roomId &&
          opening.wall === wall &&
          !gableOwnedOpeningIds.has(opening.id),
      );

    rooms.forEach((room) => {
      const x0 = Number(room.x0());
      const x1 = Number(room.x1());
      const y = Number(direction === "front" ? room.y0() : room.y1());
      const z0 = Number(room.z0());
      const z1 = Number(room.z1());
      const width = x1 - x0;
      const height = z1 - z0;
      if (!finite(x0, x1, y, z0, z1) || width <= 0 || height <= 0) {
        reportInvalid("cômodo", room.dataset.id);
        return;
      }
      const openingParts = facadeOpenings(room.dataset.id, facadeSide);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(width, 0);
      shape.lineTo(width, height);
      shape.lineTo(0, height);
      shape.closePath();
      openingParts.forEach((opening) => {
        const part = opening.void || opening;
        const holeX = Number(part.x) - x0;
        const holeZ = Number(part.z0) - z0;
        const holeWidth = Number(part.w);
        const holeHeight = Number(part.h);
        if (
          !finite(holeX, holeZ, holeWidth, holeHeight) ||
          holeWidth <= 0 ||
          holeHeight <= 0 ||
          holeX < 0 ||
          holeZ < 0 ||
          holeX + holeWidth > width ||
          holeZ + holeHeight > height
        ) {
          reportInvalid("recorte", opening.id);
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
        depth: 0.12,
        bevelEnabled: false,
      });
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.rotation.x = direction === "front" ? Math.PI / 2 : -Math.PI / 2;
      mesh.position.set(
        x0,
        direction === "front" ? y + 0.06 : y - 0.06,
        z0,
      );
      mesh.userData.domainId = room.dataset.id || "";
      scene.add(mesh);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        wallLineMaterial,
      );
      outline.rotation.copy(mesh.rotation);
      outline.position.copy(mesh.position);
      scene.add(outline);

      openingParts.forEach((opening) => {
        if (!opening.element) return;
        const part = opening.element;
        const element = new THREE.Mesh(
          new THREE.BoxGeometry(Number(part.w), 0.04, Number(part.h)),
          part.type === "window" ? windowMaterial : doorMaterial,
        );
        const outerY = direction === "front" ? y - 0.025 : y + 0.025;
        element.position.set(
          Number(part.x) + Number(part.w) / 2,
          outerY,
          Number(part.z0) + Number(part.h) / 2,
        );
        element.renderOrder = 9;
        scene.add(element);
      });
    });

    (plan.allItems || [])
      .filter((item) => String(item.classes || "").split(/\s+/).includes("railing"))
      .forEach((item) => {
        const x = Number(item.x);
        const y = Number(item.y);
        const width = Number(item.w);
        const height = Number(item.h ?? item.z1 - item.z0);
        const z0 = Number(item.z0 ?? 0);
        const frontDepth = Math.min(...rooms.map((room) => room.y0()));
        if (!finite(x, y, width, height, z0) || width <= 0 || height <= 0) return;
        if (y > frontDepth + 0.15) return;
        const railing = new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.08, height),
          wallLineMaterial,
        );
        railing.position.set(x + width / 2, y - 0.08, z0 + height / 2);
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
