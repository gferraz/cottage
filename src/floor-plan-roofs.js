const FloorPlanRoofs = {
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

    roofs.forEach((roof, index) => {
      try {
        if (roof.type !== "gable")
          throw new Error(`Unsupported roof type: ${roof.type || "undefined"}`);
        if (!roof.base) throw new Error("A gable roof needs a base reference");
        if (!["longitudinal", "transverse"].includes(roof.orientation)) {
          throw new Error(
            'A gable roof orientation must be "longitudinal" or "transverse"',
          );
        }

        const base = plan.references.get(String(roof.base));
        if (!base) throw new Error(`Unknown roof base reference: ${roof.base}`);
        const pitch = Number(roof.pitch);
        if (!(pitch > 0 && pitch < 90))
          throw new Error(
            "A gable roof pitch must be between 0 and 90 degrees",
          );
        const eave = Number(roof.eave ?? 0);
        const rake = Number(roof.rake ?? 0);
        if (![eave, rake].every(Number.isFinite) || eave < 0 || rake < 0) {
          throw new Error("A roof eave and rake must be non-negative numbers");
        }
        const longitudinal = roof.orientation === "longitudinal";
        const x0 = base.x0() - (longitudinal ? eave : rake);
        const x1 = base.x1() + (longitudinal ? eave : rake);
        const y0 = base.y0() - (longitudinal ? rake : eave);
        const y1 = base.y1() + (longitudinal ? rake : eave);
        const z0 =
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : base.z1
              ? base.z1()
              : 0;
        if (!Number.isFinite(z0))
          throw new Error("A cota z0 do telhado precisa ser numérica");
        const radians = (pitch * Math.PI) / 180;
        const baseSpan = longitudinal ? base.w() : base.l();
        const ridgeX = longitudinal ? (x0 + x1) / 2 : x0;
        const ridgeY = longitudinal ? y0 : (y0 + y1) / 2;
        const ridgeEndX = longitudinal ? ridgeX : x1;
        const ridgeEndY = longitudinal ? y1 : ridgeY;
        const ridgeLength = Math.hypot(ridgeEndX - ridgeX, ridgeEndY - ridgeY);
        const rise = (baseSpan / 2) * Math.tan(radians);
        const projectionScale = 1;
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
        const basePx0 = base.x0() + offsetX;
        const basePx1 = base.x1() + offsetX;
        const basePy0 = base.y0() + offsetY;
        const basePy1 = base.y1() + offsetY;
        const pridgex = ridgeX + offsetX;
        const ridgey = ridgeY + offsetY;
        const pridgex2 = ridgeEndX + offsetX;
        const ridgey2 = ridgeEndY + offsetY;

        const polygon = create("polygon", {
          points: `${px0},${py0} ${px1},${py0} ${px1},${py1} ${px0},${py1}`,
          class: "roof-surface",
        });
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

        const projectedRise = rise * projectionScale;
        const endTriangles = longitudinal
          ? [
              `${basePx0},${basePy0} ${basePx1},${basePy0} ${pridgex},${basePy0 - projectedRise}`,
              `${basePx0},${basePy1} ${basePx1},${basePy1} ${pridgex},${basePy1 - projectedRise}`,
            ]
          : [
              `${basePx0},${basePy0} ${basePx0},${basePy1} ${basePx0 - projectedRise},${ridgey}`,
              `${basePx1},${basePy0} ${basePx1},${basePy1} ${basePx1 + projectedRise},${ridgey}`,
            ];
        const triangleElements = endTriangles.map((points) =>
          create("polygon", {
            points,
            class: "roof-slope-triangle",
          }),
        );
        const ridge = create("line", {
          x1: pridgex,
          y1: ridgey,
          x2: pridgex2,
          y2: ridgey2,
          class: "roof-ridge",
        });
        const group = create("g", {
          class: "roof-plan",
          "data-id": roof.id || `roof-${index + 1}`,
        });
        group.dataset.base = String(roof.base);
        group.dataset.orientation = roof.orientation;
        group.dataset.pitch = String(pitch);
        group.dataset.eave = String(eave);
        group.dataset.rake = String(rake);
        group.dataset.baseZ = String(z0);
        group.dataset.ridgeZ = String(z0 + rise);
        group.dataset.projectionScale = String(projectionScale);
        group.append(defs, polygon, ...triangleElements, ridge);
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
