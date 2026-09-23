/* Experimental architectural facade renderer.
 * It consumes normalized FloorPlan geometry and delegates each architectural
 * element group to a focused renderer in this directory.
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
            ...plan.normalizeParts(definition.parts).filter(isStairFlight),
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
    (plan.independentWalls || new Map()).forEach((wall) => {
      drawingBounds.x0 = Math.min(drawingBounds.x0, wall.x0());
      drawingBounds.x1 = Math.max(drawingBounds.x1, wall.x1());
      drawingBounds.z0 = Math.min(drawingBounds.z0, wall.z0);
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
        const z0 = roof.z0 === undefined
          ? FloorPlanRoofs.baseCeilingZ(plan, base, 0)
          : plan.resolve(roof.z0);
        const rise = (baseSpan / 2) * Math.tan((pitch * Math.PI) / 180);
        const x0 = baseX0 - overhang0;
        const x1 = baseX1 + overhang1;
        if (finite(x0, x1, z0, rise)) {
          drawingBounds.x0 = Math.min(drawingBounds.x0, x0);
          drawingBounds.x1 = Math.max(drawingBounds.x1, x1);
          drawingBounds.z1 = Math.max(drawingBounds.z1, z0 + rise);
        }
      } catch {
        // Invalid roof geometry is reported by the regular roof validator.
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
    const centerZ = (drawingBounds.z0 + drawingBounds.z1) / 2 - 0.8;
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
    camera.lookAt((roomBounds.x0 + roomBounds.x1) / 2, 0, centerZ);

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
    const wallLineMaterial = new THREE.LineBasicMaterial({ color: "#30302d" });
    const roofMaterial = new THREE.MeshBasicMaterial({
      color: "#b45c3d",
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const roofLineMaterial = new THREE.LineBasicMaterial({ color: "#8c432d" });
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
    FloorPlan3DSite.render(context);
    FloorPlan3DWalls.render(context);
    FloorPlan3DElements.render(context);
    FloorPlan3DRoofs.render(context);

    renderer.render(scene, camera);
    container._threeRenderer = renderer;
  },
};

window.FloorPlanFacades3D = FloorPlanFacades3D;
