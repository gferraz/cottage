/* Experimental architectural facade renderer.
 * It consumes normalized FloorPlan geometry and delegates each architectural
 * element group to a focused renderer in this directory.
 */
const FloorPlanFacades3D = {
  floorView(plan) {
    const floors = plan.currentConfig?.floors;
    if (!floors?.length || plan.showAllFloors) return plan;
    const index = Math.max(0, floors.findIndex((floor) => floor.id === plan.currentFloorId));
    const floor = floors[index];
    const z0 = Number(floor.z0);
    const z1 = index + 1 < floors.length ? Number(floors[index + 1].z0) : Infinity;
    const inFloor = (entry) => entry.floorId === floor.id;
    const clipWall = (wall) => {
      const bottom = Math.max(Number(wall.z0), z0);
      const top = Math.min(Number(wall.z1), z1);
      if (top - bottom <= 1e-9) return [];
      return [{ ...wall, z0: bottom, z1: top, h: top - bottom,
        from: [wall.from[0], wall.from[1], bottom],
        to: [wall.to[0], wall.to[1], bottom],
        ...(wall.pos ? { pos: [wall.pos[0], wall.pos[1], bottom], size: [wall.size[0], wall.size[1], top - bottom] } : {}),
      }];
    };
    const view = Object.create(plan);
    view.allRooms = (plan.allRooms ?? []).filter(inFloor);
    view.allItems = (plan.allItems ?? []).filter(inFloor);
    view.allOpenings = (plan.allOpenings ?? []).filter(inFloor);
    view.allWindows = (plan.allWindows ?? []).filter(inFloor);
    view.wallRenderParts = (plan.wallRenderParts ?? []).flatMap(clipWall);
    view.independentWalls = new Map([...(plan.independentWalls ?? [])].flatMap(([id, wall]) => {
      const bottom = Math.max(wall.z0, z0), top = Math.min(wall.topZ, z1);
      return top - bottom > 1e-9 ? [[id, { ...wall, z0: bottom, topZ: top }]] : [];
    }));
    view.visibleFloor = floor;
    view.visibleFloorRange = [z0, z1];
    return view;
  },

  render(plan, { direction = "front" } = {}) {
    plan = this.floorView(plan);
    const container = plan.facade3dLayer;
    if (!container) return;
    container._threeRenderer?.dispose();
    container._threeRenderer = null;
    container._updateFacadeCamera = null;
    container._captureFacadeImage = null;
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
    const finite = (...values) => values.every(Number.isFinite);
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
      return terrainProfile.frontZ +
        progress * (terrainProfile.rearZ - terrainProfile.frontZ);
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
      })
      .filter(Boolean);

    const stairFlights = [];
    const stairLandings = [];
    floors.filter((floor) => !plan.visibleFloor || floor === plan.visibleFloor).forEach((floor) => {
      (floor?.rooms ?? []).forEach((definition) => {
        if (isStairFlight(definition)) {
          stairFlights.push(plan.normalizeGeometryAtFloor(definition, floor));
        }
        if (String(definition.classes || "").split(/\s+/).includes("stair-landing")) {
          stairLandings.push(plan.normalizeGeometryAtFloor(definition, floor));
        }
        if (!Array.isArray(definition.parts)) return;
        const previousHeight = plan.currentFloorHeight;
        plan.currentFloorHeight = Number(floor?.z0 ?? 0);
        try {
          const parts = plan.normalizeParts(definition.parts);
          stairFlights.push(...parts.filter(isStairFlight));
          stairLandings.push(...parts.filter((part) =>
            String(part.classes || "").split(/\s+/).includes("stair-landing"),
          ));
        } finally {
          plan.currentFloorHeight = previousHeight;
        }
      });
    });

    if (plan.visibleFloorRange) {
      const [bottom, top] = plan.visibleFloorRange;
      for (const parts of [stairFlights, stairLandings]) {
        for (let i = parts.length - 1; i >= 0; i -= 1) {
          const part = parts[i];
          if (part.z0 >= top || part.z1 < bottom) parts.splice(i, 1);
        }
      }
    }

    if (!rooms.length) {
      container.textContent = "Nenhum cômodo disponível para este piso.";
      return;
    }

    const roomBounds = rooms.reduce(
      (bounds, room) => ({
        x0: Math.min(bounds.x0, room.x0()),
        x1: Math.max(bounds.x1, room.x1()),
        y0: Math.min(bounds.y0, room.y0()),
        y1: Math.max(bounds.y1, room.y1()),
        z0: Math.min(bounds.z0, room.z0()),
        z1: Math.max(bounds.z1, room.z1()),
      }),
      { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity },
    );
    const drawingBounds = { ...roomBounds };
    (plan.independentWalls || new Map()).forEach((wall) => {
      drawingBounds.x0 = Math.min(drawingBounds.x0, wall.x0());
      drawingBounds.x1 = Math.max(drawingBounds.x1, wall.x1());
      drawingBounds.z0 = Math.min(drawingBounds.z0, wall.z0);
      drawingBounds.z1 = Math.max(drawingBounds.z1, wall.topZ);
      drawingBounds.y0 = Math.min(drawingBounds.y0, wall.y0());
      drawingBounds.y1 = Math.max(drawingBounds.y1, wall.y1());
    });
    [...stairFlights, ...stairLandings].forEach((stair) => {
      drawingBounds.x0 = Math.min(drawingBounds.x0, Number(stair.x));
      drawingBounds.x1 = Math.max(drawingBounds.x1, Number(stair.x) + Number(stair.w));
      drawingBounds.z0 = Math.min(drawingBounds.z0, Number(stair.z0));
      drawingBounds.z1 = Math.max(drawingBounds.z1, Number(stair.z1));
      drawingBounds.y0 = Math.min(drawingBounds.y0, Number(stair.y));
      drawingBounds.y1 = Math.max(drawingBounds.y1, Number(stair.y) + Number(stair.l));
    });
    (plan.showRoofs ? plan.allRoofs || [] : []).forEach((roof) => {
      if (roof.type !== "gable") return;
      try {
        const baseDefinition = roof.base ?? roof;
        const floor = FloorPlanRoofs.floorForRoof(plan, roof, baseDefinition);
        const base = FloorPlanRoofs.resolveBase(plan, baseDefinition, floor);
        const longitudinal = roof.orientation === "longitudinal";
        const [overhang0, overhang1] = FloorPlanRoofs.overhangPair(
          longitudinal ? roof.eave : roof.rake,
        );
        const baseX0 = Number(base.x0());
        const baseX1 = Number(base.x1());
        const baseY0 = Number(base.y0());
        const baseY1 = Number(base.y1());
        const baseSpan = longitudinal
          ? baseX1 - baseX0
          : baseY1 - baseY0;
        const pitch = Number(roof.pitch);
        const z0 = roof.z0 === undefined
          ? FloorPlanRoofs.baseCeilingZ(plan, base, 0, floor)
          : plan.resolve(roof.z0);
        const pitchTangent = Math.tan((pitch * Math.PI) / 180);
        const rise = (baseSpan / 2) * Math.tan((pitch * Math.PI) / 180);
        const x0 = baseX0 - overhang0;
        const x1 = baseX1 + overhang1;
        const [depthOverhang0, depthOverhang1] = FloorPlanRoofs.overhangPair(
          longitudinal ? roof.rake : roof.eave,
        );
        const y0 = baseY0 - depthOverhang0;
        const y1 = baseY1 + depthOverhang1;
        const [slopeOverhang0, slopeOverhang1] = FloorPlanRoofs.overhangPair(roof.eave);
        if (finite(x0, x1, y0, y1, z0, rise, pitchTangent)) {
          drawingBounds.x0 = Math.min(drawingBounds.x0, x0);
          drawingBounds.x1 = Math.max(drawingBounds.x1, x1);
          drawingBounds.y0 = Math.min(drawingBounds.y0, y0);
          drawingBounds.y1 = Math.max(drawingBounds.y1, y1);
          drawingBounds.z0 = Math.min(
            drawingBounds.z0,
            z0 - Math.max(slopeOverhang0, slopeOverhang1) * pitchTangent,
          );
          drawingBounds.z1 = Math.max(drawingBounds.z1, z0 + rise);
        }
      } catch {
        // Invalid roof geometry is reported by the regular roof validator.
      }
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#faf9f4");
    const aspect = width / height;
    const halfX = (drawingBounds.x1 - drawingBounds.x0) / 2;
    const halfY = (drawingBounds.y1 - drawingBounds.y0) / 2;
    const halfZ = (drawingBounds.z1 - drawingBounds.z0) / 2;
    const centerX = (drawingBounds.x0 + drawingBounds.x1) / 2;
    const centerY = (drawingBounds.y0 + drawingBounds.y1) / 2;
    const centerZ = (drawingBounds.z0 + drawingBounds.z1) / 2;
    scene.scale.x = -1;
    scene.position.x = centerX * 2;
    const camera = new THREE.OrthographicCamera(
      -1,
      1,
      1 / aspect,
      -1 / aspect,
      0.1,
      Math.max(200, Math.hypot(halfX, halfY, halfZ) * 8),
    );
    const cameraState = plan.facade3dCamera ?? {
      azimuthStep: 0,
      elevation: 30,
      zoom: 1,
    };
    const orbitRadius = Math.max(12, Math.hypot(halfX, halfY, halfZ) * 3);
    const positionCamera = () => {
      const azimuth = (cameraState.azimuthStep * Math.PI) / 12;
      const elevationDegrees = cameraState.elevation;
      const elevation = elevationDegrees * (Math.PI / 180);
      const sinAzimuth = Math.sin(azimuth);
      const cosAzimuth = Math.cos(azimuth);
      const sinElevation = Math.sin(elevation);
      const cosElevation = Math.cos(elevation);
      if (elevationDegrees === 90) {
        camera.up.set(-sinAzimuth, cosAzimuth, 0);
      } else {
        camera.up.set(0, 0, 1);
      }
      const horizontalRadius = orbitRadius * cosElevation;
      camera.position.set(
        centerX + horizontalRadius * sinAzimuth,
        centerY - horizontalRadius * cosAzimuth,
        centerZ + orbitRadius * sinElevation,
      );
      camera.zoom = cameraState.zoom;
      camera.lookAt(centerX, centerY, centerZ);
      const rightX = cosAzimuth;
      const rightY = sinAzimuth;
      const upX = -sinAzimuth * sinElevation;
      const upY = cosAzimuth * sinElevation;
      const projectedHalfWidth =
        Math.abs(rightX) * halfX + Math.abs(rightY) * halfY;
      const projectedHalfHeight =
        Math.abs(upX) * halfX +
        Math.abs(upY) * halfY +
        Math.abs(cosElevation) * halfZ;
      const viewHeight = Math.max(
        projectedHalfHeight * 2.2,
        (projectedHalfWidth * 2.2) / aspect,
        0.1,
      );
      const viewWidth = viewHeight * aspect;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
    };
    positionCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.domElement.className = "facade-3d-canvas";
    renderer.domElement.setAttribute("aria-label", "Modelo arquitetônico 3D; use as setas e os controles de zoom");
    renderer.domElement.tabIndex = 0;
    container.append(renderer.domElement);

    const wallMaterial = new THREE.MeshLambertMaterial({
      color: plan.themeFillColor("desejo-ambar"),
      side: THREE.DoubleSide,
    });
    const wallLineMaterial = new THREE.LineBasicMaterial({ color: "#30302d" });
    const roofMaterial = new THREE.MeshLambertMaterial({
      color: "#b45c3d",
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const roofLineMaterial = new THREE.LineBasicMaterial({ color: "#8c432d" });
    const windowMaterial = new THREE.MeshLambertMaterial({
      color: "#b9d5e5",
      transparent: true,
      opacity: 0.40,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const doorMaterial = new THREE.MeshLambertMaterial({
      color: "#8b6b4f",
      side: THREE.DoubleSide,
    });
    const terrainMaterial = new THREE.MeshLambertMaterial({
      color: "#9dbb8b",
      side: THREE.DoubleSide,
    });
    const solarConfig = {
      ...plan.currentConfig,
      solar: {
        ...plan.currentConfig.solar,
        season: plan.solarSeason ?? plan.currentConfig.solar?.season ?? "equinox",
        time: plan.solarTime ?? plan.currentConfig.solar?.time ?? "15:00",
      },
    };
    const solarPosition = FloorPlan3DSun.position(
      solarConfig,
      plan.terrainReference,
    );
    FloorPlan3DSun.addToScene({
      THREE,
      scene,
      position: solarPosition,
      bounds: {
        x0: roomBounds.x0,
        x1: roomBounds.x1,
        y0: Math.min(...rooms.map((room) => room.y0())),
        y1: Math.max(...rooms.map((room) => room.y1())),
        z0: drawingBounds.z0,
        z1: drawingBounds.z1,
      },
    });
    const outdoorIds = new Set(
      [...(plan.roomDefinitions?.entries() ?? [])]
        .filter(([, room]) => String(room.classes || "").split(/\s+/).includes("outdoor"))
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
    [...(plan.allOpenings || []), ...(plan.allWindows || [])].forEach((opening) => {
      if (!opening.wallId) return;
      const features = openingsByWall.get(opening.wallId) || [];
      features.push(opening);
      openingsByWall.set(opening.wallId, features);
    });

    const context = {
      plan,
      direction,
      facadeSide,
      THREE,
      scene,
      rooms,
      stairFlights,
      stairLandings,
      terrainProfile: hasTerrainProfile ? terrainProfile : null,
      buildingOffsetY,
      terrainElevationAt,
      externalOpenings,
      openingsByWall,
      wallMaterial,
      wallLineMaterial,
      roofMaterial,
      roofLineMaterial,
      windowMaterial,
      doorMaterial,
      terrainMaterial,
      finite,
      reportInvalid,
    };
    if (!plan.showOnlyRoofs) {
      FloorPlan3DSite.render(context);
      FloorPlan3DWalls.render(context);
      FloorPlan3DElements.render(context);
      FloorPlan3DElements.renderItems(context);
    }
    if (plan.showRoofs || plan.showOnlyRoofs) FloorPlan3DRoofs.render(context);

    const updateCamera = () => {
      positionCamera();
      renderer.render(scene, camera);
      plan.facade3dCameraControls?.querySelectorAll("button[data-camera-action]").forEach((button) => {
        button.disabled =
          (button.dataset.cameraAction === "elevation-up" && cameraState.elevation === 90) ||
          (button.dataset.cameraAction === "elevation-down" && cameraState.elevation === 0) ||
          (button.dataset.cameraAction === "zoom-in" && cameraState.zoom >= 2.5) ||
          (button.dataset.cameraAction === "zoom-out" && cameraState.zoom <= 0.65);
      });
    };
    container._updateFacadeCamera = updateCamera;
    container._captureFacadeImage = () => {
      updateCamera();
      return renderer.domElement.toDataURL("image/png");
    };
    renderer.domElement.addEventListener("keydown", (event) => {
      const keyboardActions = {
        ArrowLeft: "azimuth-left",
        ArrowRight: "azimuth-right",
        ArrowUp: "elevation-up",
        ArrowDown: "elevation-down",
        "+": "zoom-in",
        "=": "zoom-in",
        "-": "zoom-out",
        "_": "zoom-out",
      };
      const action = keyboardActions[event.key];
      if (!action) return;
      event.preventDefault();
      plan.adjustFacade3DCamera(action);
    });
    updateCamera();
    container._threeRenderer = renderer;
  },
};

window.FloorPlanFacades3D = FloorPlanFacades3D;
