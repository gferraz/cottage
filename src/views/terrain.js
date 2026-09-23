const FloorPlanTerrain = {
  clear(plan) {
    plan.terrainLayer?.replaceChildren();
    plan.guidesLayer?.replaceChildren();
    plan.root.style.removeProperty("--plan-offset-x");
    plan.root.style.removeProperty("--plan-offset-y");
    plan.root.style.removeProperty("--building-offset-x");
    plan.root.style.removeProperty("--building-offset-y");
    plan.terrainArea = 0;
    plan.terrainDimensions = null;
    plan.terrainReference = null;
  },

  applyBuildingPlacement(plan, building = null) {
    const position = building?.position;
    if (!position) return;
    const anchor = building.anchor || "terrain.front-start";
    if (!["terrain.front-start", "bounds.top-left"].includes(anchor)) {
      throw new Error(`Unsupported building anchor: ${building.anchor}`);
    }

    const localX = Number(position.x);
    const localY = Number(position.y);
    if (![localX, localY].every(Number.isFinite)) {
      throw new Error("Building position needs numeric x and y values");
    }

    const planOffsetX =
      Number.parseFloat(
        getComputedStyle(plan.root).getPropertyValue("--plan-offset-x"),
      ) || 0;
    const planOffsetY =
      Number.parseFloat(
        getComputedStyle(plan.root).getPropertyValue("--plan-offset-y"),
      ) || 0;
    const anchorPoint =
      anchor === "terrain.front-start"
        ? plan.terrainReference?.frontStart || {
            x: planOffsetX,
            y: planOffsetY,
          }
        : { x: planOffsetX, y: planOffsetY };
    const targetX = anchorPoint.x + localX;
    const targetY = anchorPoint.y + localY;

    const bounds = plan.buildingReferenceBounds();
    if (!bounds) return;
    plan.root.style.setProperty("--building-offset-x", targetX - bounds.x0);
    plan.root.style.setProperty("--building-offset-y", targetY - bounds.y0);
  },

  render(plan, terrain) {
    this.clear(plan);
    if (
      !plan.terrainLayer ||
      !terrain?.corners ||
      !terrain.boundary_order?.length
    )
      return;

    const order = terrain.boundary_order;
    const corners = order.map((id) => {
      const point = terrain.corners[id];
      if (!point) throw new Error(`Unknown terrain corner: ${id}`);
      return {
        id,
        easting: Number(point.easting),
        northing: Number(point.northing),
        z: Number(point.z ?? 0),
      };
    });
    const first = corners[0];
    const second = corners[1];
    const frontEasting = second.easting - first.easting;
    const frontNorthing = second.northing - first.northing;
    const frontLength = Math.hypot(frontEasting, frontNorthing);
    const ux = frontEasting / frontLength;
    const uy = frontNorthing / frontLength;
    let vx = -uy;
    let vy = ux;
    const centroid = corners.reduce(
      (sum, point) => ({
        easting: sum.easting + point.easting,
        northing: sum.northing + point.northing,
      }),
      { easting: 0, northing: 0 },
    );
    centroid.easting /= corners.length;
    centroid.northing /= corners.length;
    const toCentroidEasting = centroid.easting - first.easting;
    const toCentroidNorthing = centroid.northing - first.northing;
    if (toCentroidEasting * vx + toCentroidNorthing * vy < 0) {
      vx *= -1;
      vy *= -1;
    }
    const normalizeAzimuth = (degrees) => (degrees + 360) % 360;
    const gridBearing = (easting, northing) =>
      normalizeAzimuth((Math.atan2(easting, northing) * 180) / Math.PI);
    const frontGridAzimuth = gridBearing(frontEasting, frontNorthing);
    const frontSegment = terrain.segments?.find(
      (segment) =>
        (segment.from === first.id && segment.to === second.id) ||
        (segment.from === second.id && segment.to === first.id),
    );
    const frontTrueAzimuth = frontSegment
      ? normalizeAzimuth(
          Number(frontSegment.azimuth_deg) +
            (frontSegment.from === first.id ? 0 : 180),
        )
      : frontGridAzimuth;
    const convergence = frontTrueAzimuth - frontGridAzimuth;

    const localCorners = corners.map((point) => {
      const easting = point.easting - first.easting;
      const northing = point.northing - first.northing;
      return {
        ...point,
        x: easting * ux + northing * uy,
        y: easting * vx + northing * vy,
      };
    });
    const minX = Math.min(...localCorners.map((point) => point.x));
    const minY = Math.min(...localCorners.map((point) => point.y));
    const maxX = Math.max(...localCorners.map((point) => point.x));
    const maxY = Math.max(...localCorners.map((point) => point.y));
    const terrainPadding = 2;
    const offsetX = -minX + terrainPadding;
    const offsetY = -minY + terrainPadding;
    localCorners.forEach((point) => {
      point.x += offsetX;
      point.y += offsetY;
    });
    const width = maxX - minX;
    const height = maxY - minY;
    plan.terrainDimensions = { width, height };
    plan.root.style.setProperty("--plan-offset-x", offsetX);
    plan.root.style.setProperty("--plan-offset-y", offsetY);
    plan.root.style.setProperty("--building-offset-x", offsetX);
    plan.root.style.setProperty("--building-offset-y", offsetY);
    const edgeMean = (edge, coordinate) => {
      const points = (edge ?? [])
        .map((id) => localCorners.find((point) => point.id === id))
        .filter(Boolean);
      return points.length
        ? points.reduce((sum, point) => sum + point[coordinate], 0) / points.length
        : null;
    };
    const frontEdge = terrain.front?.edge ?? order.slice(0, 2);
    const rearEdge = terrain.rear?.edge ?? order.slice(-2);
    plan.terrainReference = {
      frontStart: { x: offsetX, y: offsetY },
      frontY: edgeMean(frontEdge, "y"),
      rearY: edgeMean(rearEdge, "y"),
      frontZ: edgeMean(frontEdge, "z"),
      rearZ: edgeMean(rearEdge, "z"),
      localXAxisAzimuth: normalizeAzimuth(gridBearing(ux, uy) + convergence),
      localYAxisAzimuth: normalizeAzimuth(gridBearing(vx, vy) + convergence),
    };
    plan.updateTerrainViewport();
    plan.terrainLayer.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const svg = "http://www.w3.org/2000/svg";
    const create = (name, attributes = {}) => {
      const element = document.createElementNS(svg, name);
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
      return element;
    };
    const pointString = localCorners
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    plan.terrainLayer.append(
      create("polygon", { points: pointString, class: "terrain-boundary" }),
    );

    const shoelace = localCorners.reduce((sum, point, index) => {
      const next = localCorners[(index + 1) % localCorners.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    plan.terrainArea = Math.abs(shoelace) / 2;

    localCorners.forEach((point) => {
      plan.terrainLayer.append(
        create("circle", {
          cx: point.x,
          cy: point.y,
          r: 0.12,
          class: "terrain-point",
        }),
      );
      const label = create("text", {
        x: point.x + 0.18,
        y: point.y - 0.18,
        class: "terrain-label",
      });
      label.textContent = point.id;
      plan.terrainLayer.append(label);
    });

    const segmentByPair = new Map(
      (terrain.segments ?? []).map((segment) => [
        `${segment.from}-${segment.to}`,
        segment,
      ]),
    );
    localCorners.forEach((point, index) => {
      const next = localCorners[(index + 1) % localCorners.length];
      plan.terrainLayer.append(
        create("line", {
          x1: point.x,
          y1: point.y,
          x2: next.x,
          y2: next.y,
          class: "terrain-segment",
        }),
      );
      const segment = segmentByPair.get(`${point.id}-${next.id}`);
      if (segment) {
        const label = create("text", {
          x: (point.x + next.x) / 2,
          y: (point.y + next.y) / 2 - 0.12,
          class: "terrain-side-label",
        });
        label.textContent = `${Number(segment.distance).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m`;
        plan.terrainLayer.append(label);
      }
    });

    const addSideLabel = (side) => {
      const fallback = side === "front" ? order.slice(0, 2) : order.slice(-2);
      const [fromId, toId] = terrain[side]?.edge ?? fallback;
      const from = localCorners.find((point) => point.id === fromId);
      const to = localCorners.find((point) => point.id === toId);
      const sideData = terrain[side];
      if (!from || !to || !sideData?.label) return;
      const label = create("text", {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 + (side === "front" ? -0.35 : 0.45),
        class: "terrain-side-label",
      });
      label.textContent = sideData.label;
      plan.terrainLayer.append(label);
    };
    addSideLabel("front");
    addSideLabel("rear");

    const northLength = Math.hypot(uy, vy);
    const northX = uy / northLength;
    const northY = vy / northLength;
    const northBaseX = width - 2.4;
    const northBaseY = 2.5;
    const compassRose = create("image", {
      class: "terrain-compass-rose",
      href: document
        .querySelector("#terrain-compass-rose-data")
        ?.content.textContent.trim(),
      x: northBaseX - 1.5,
      y: northBaseY - 1.8,
      width: 3,
      height: 3.6,
      preserveAspectRatio: "xMidYMid meet",
      transform: `rotate(${(Math.atan2(northX, -northY) * 180) / Math.PI} ${northBaseX} ${northBaseY})`,
    });
    plan.terrainLayer.append(compassRose);
  },
};

window.FloorPlanTerrain = FloorPlanTerrain;
