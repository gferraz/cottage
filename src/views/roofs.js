const FloorPlanRoofs = {
  eavePair(roof) {
    return FloorPlanRoofGeometry.eavePair(roof);
  },

  eavePitch(roof) {
    return FloorPlanRoofGeometry.eavePitch(roof);
  },

  // Split at the support lines before changing the overhang slope. Each
  // resulting patch has its own clipping volume, including at roof crossings.
  eavePatches(plan, definition) {
    return FloorPlanRoofGeometry.eavePatches(plan, definition);
  },

  surfaceArea(roof, baseSpan, ridgeLength) {
    return FloorPlanRoofGeometry.surfaceArea(roof, baseSpan, ridgeLength);
  },

  axisLabel(plan, roof, length) {
    if (roof.type !== "shed") return `${plan.roofOrientationLabel(roof.orientation)} · ${plan.formatMeters(length)} m`;
    const slope = roof.slope ?? (roof.orientation === "longitudinal" ? "right" : "bottom");
    const direction = { top: "frente", bottom: "fundos", left: "esquerda", right: "direita" }[slope];
    return `Caimento: ${direction} · borda alta: ${plan.formatMeters(length)} m`;
  },

  // z0 é a cota da borda baixa na base, antes do avanço dos beirais.
  shedGeometry(plan, roof, includeEaves = true) {
    return FloorPlanRoofGeometry.shedGeometry(plan, roof, includeEaves);
  },

  clipPolygon(points, plane) {
    return FloorPlanRoofGeometry.clipPolygon(points, plane);
  },

  intersectingSurfaces(plan, roofs = plan.allRoofs ?? []) {
    return FloorPlanRoofGeometry.intersectingSurfaces(plan, roofs);
  },

  // Thickness is vertical: the existing surface remains the wall contact plane.
  solidSurface(polygons, thickness) {
    return FloorPlanRoofGeometry.solidSurface(polygons, thickness);
  },

  surfaceEdges(polygons, boundaryOnly = false) {
    return FloorPlanRoofGeometry.surfaceEdges(polygons, boundaryOnly);
  },

  asGeometryBox(base, label = "roof base") {
    return FloorPlanRoofGeometry.asGeometryBox(base, label);
  },

  floorForRoof(plan, roof, baseDefinition) {
    return FloorPlanRoofGeometry.floorForRoof(plan, roof, baseDefinition);
  },

  baseCeilingZ(plan, base, fallback = 0, floorConfig) {
    return FloorPlanRoofGeometry.baseCeilingZ(plan, base, fallback, floorConfig);
  },

  resolveBase(plan, baseDefinition, floorConfig) {
    return FloorPlanRoofGeometry.resolveBase(plan, baseDefinition, floorConfig);
  },

  overhangPair(value) {
    return FloorPlanRoofGeometry.overhangPair(value);
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
        this.eavePitch(roof);
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
        const [eave0, eave1] = FloorPlanRoofs.eavePair(roof);
        const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
        if (
          ![eave0, eave1, rake0, rake1].every(Number.isFinite) ||
          [eave0, eave1, rake0, rake1].some((value) => value < 0)
        ) {
          throw new Error("A roof eave and rake must be non-negative numbers");
        }
        const z0 = shed ? shed.z0 :
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : FloorPlanRoofs.baseCeilingZ(plan, base);
        if (!Number.isFinite(z0))
          throw new Error("A cota z0 do telhado precisa ser numérica");
        const geometry = shed ?? FloorPlanRoofGeometry.gableGeometry(plan, roof, { base, z0 });
        const { longitudinal, x0, x1, y0, y1, rise, ridgeLength } = geometry;
        const { ridgeX0: ridgeX, ridgeY0: ridgeY, ridgeX1: ridgeEndX, ridgeY1: ridgeEndY } = geometry;
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
        group.dataset.eavePitch = String(this.eavePitch(roof));
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
          if (roof.eaves?.pitch !== undefined) details.textContent += ` — Beiral: ${plan.formatMeters(this.eavePitch(roof))}°`;
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
