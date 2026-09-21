const FloorPlanFacades = {
  render(plan, facades = []) {
    if (!plan.facadeLayer) return;
    plan.facadeLayer.replaceChildren();
    plan.facadeLayer.closest(".facade-section")?.toggleAttribute("hidden", facades.length === 0);
    if (facades.length === 0) return;

    const svgNamespace = "http://www.w3.org/2000/svg";
    const scale =
      Number.parseFloat(
        getComputedStyle(plan.root).getPropertyValue("--m"),
      ) || 56;
    const rooms = plan.roomElements.filter(
      (room) => typeof room.x0 === "function" && typeof room.z0 === "function",
    );
    const floorHeight = Math.max(
      Number(plan.currentFloorHeight) || 0,
      ...rooms.map((room) => room.z1()),
      3,
    );

    facades.forEach((facade, index) => {
      const direction = facade.direction || "front";
      const side = ["left", "right"].includes(direction);
      const facadeWall =
        direction === "front"
          ? "top"
          : direction === "rear"
            ? "bottom"
            : direction === "left"
              ? "left"
              : "right";
      const facadeAxis = side ? "x" : "y";
      const facadeEdge =
        direction === "front" || direction === "left" ? "min" : "max";
      const edgeValues = rooms.map((room) =>
        facadeAxis === "x"
          ? facadeEdge === "min"
            ? room.x0()
            : room.x1()
          : facadeEdge === "min"
            ? room.y0()
            : room.y1(),
      );
      const edge = facadeEdge === "min" ? Math.min(...edgeValues) : Math.max(...edgeValues);
      const facadeRooms = rooms.filter((room) => {
        const roomEdge =
          facadeAxis === "x"
            ? facadeEdge === "min"
              ? room.x0()
              : room.x1()
            : facadeEdge === "min"
              ? room.y0()
              : room.y1();
        return Math.abs(roomEdge - edge) < 0.01;
      });
      const facadeDepth = Number(facade.depth ?? 3);
      const projectedRooms = rooms.filter((room) => {
        const near = side ? room.x0() : room.y0();
        const far = side ? room.x1() : room.y1();
        return facadeEdge === "min"
          ? near <= edge + facadeDepth
          : far >= edge - facadeDepth;
      });
      const surfaceRooms = projectedRooms.filter((room) => {
        const state = room.wallState?.(facadeWall) ?? "solid";
        return state === "solid" || state === "virtual";
      });
      const depthDirection = facadeEdge === "min" ? 1 : -1;
      projectedRooms.sort((first, second) => {
        const firstDepth = side ? first.x0() : first.y0();
        const secondDepth = side ? second.x0() : second.y0();
        return depthDirection * (secondDepth - firstDepth);
      });
      const coordinates = projectedRooms.flatMap((room) =>
        side ? [room.y0(), room.y1()] : [room.x0(), room.x1()],
      );
      if (coordinates.length === 0) return;
      const facadeMin = Math.min(...coordinates);
      const facadeMax = Math.max(...coordinates);
      const roofs = (plan.allRoofs ?? []).filter(
        (roof) => roof.floorId === null || roof.floorId === plan.currentFloorId,
      );
      const roofGeometry = (roof) => {
        let base;
        try {
          base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof);
        } catch {
          return null;
        }
        if (!base || !["longitudinal", "transverse"].includes(roof.orientation)) {
          return null;
        }
        const longitudinal = roof.orientation === "longitudinal";
        const [eave0, eave1] = FloorPlanRoofs.overhangPair(roof.eave);
        const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
        const pitch = Number(roof.pitch);
        const baseSpan = longitudinal ? base.w() : base.l();
        const rise = (baseSpan / 2) * Math.tan((pitch * Math.PI) / 180);
        const z0 =
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : floorHeight;
        return {
          x0: base.x0() - (longitudinal ? eave0 : rake0),
          x1: base.x1() + (longitudinal ? eave1 : rake1),
          y0: base.y0() - (longitudinal ? rake0 : eave0),
          y1: base.y1() + (longitudinal ? rake1 : eave1),
          baseX0: base.x0(),
          baseX1: base.x1(),
          baseY0: base.y0(),
          baseY1: base.y1(),
          eave0,
          eave1,
          pitch,
          z0,
          rise,
        };
      };
      roofs.forEach((roof) => {
        if (roof.type !== "gable") return;
        const longitudinal = roof.orientation === "longitudinal";
        const isVisible = longitudinal ? !side : side;
        if (!isVisible) return;
        const geometry = roofGeometry(roof);
        if (!geometry) return;
        const span = longitudinal
          ? [geometry.x0, geometry.x1]
          : [geometry.y0, geometry.y1];
        coordinates.push(...span);
      });
      const min = Math.min(...coordinates);
      const max = Math.max(...coordinates);
      const width = Math.max(max - min, 1);
      const padding = 0.5;
      const roofRise = roofs.reduce((highest, roof) => {
        if (roof.type !== "gable") return highest;
        const isVisible =
          roof.orientation === "longitudinal" ? !side : side;
        const geometry = roofGeometry(roof);
        return isVisible ? Math.max(highest, geometry?.rise ?? 0) : highest;
      }, 0);
      const roofDrop = roofs.reduce((lowest, roof) => {
        if (roof.type !== "gable") return lowest;
        const isVisible =
          roof.orientation === "longitudinal" ? !side : side;
        const geometry = roofGeometry(roof);
        if (!isVisible || !geometry) return lowest;
        return Math.max(
          lowest,
          Math.max(geometry.eave0, geometry.eave1) *
            Math.tan((geometry.pitch * Math.PI) / 180),
        );
      }, 0);
      const viewWidth = (width + padding * 2) * scale;
      const viewY = -roofRise * scale;
      const viewHeight =
        (floorHeight + padding * 2 + roofRise + roofDrop) * scale;
      const svg = document.createElementNS(svgNamespace, "svg");
      svg.classList.add("facade-view");
      svg.setAttribute(
        "viewBox",
        `0 ${viewY} ${viewWidth} ${viewHeight}`,
      );
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", facade.label || `Fachada ${index + 1}`);

      const defs = document.createElementNS(svgNamespace, "defs");
      const pattern = document.createElementNS(svgNamespace, "pattern");
      pattern.setAttribute("id", `facade-grid-${index + 1}`);
      pattern.setAttribute("width", `${scale / 2}`);
      pattern.setAttribute("height", `${scale / 2}`);
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      const gridPath = document.createElementNS(svgNamespace, "path");
      gridPath.setAttribute("d", `M ${scale / 2} 0 L 0 0 0 ${scale / 2}`);
      gridPath.setAttribute(
        "stroke",
        getComputedStyle(plan.root).getPropertyValue("--theme-grid").trim() ||
          "rgba(0, 0, 0, 0.08)",
      );
      gridPath.setAttribute("stroke-width", "1");
      gridPath.setAttribute("fill", "none");
      pattern.append(gridPath);
      defs.append(pattern);
      const dimensionMarker = document.createElementNS(svgNamespace, "marker");
      dimensionMarker.setAttribute("id", `facade-dimension-arrow-${index + 1}`);
      dimensionMarker.setAttribute("markerWidth", "6");
      dimensionMarker.setAttribute("markerHeight", "6");
      dimensionMarker.setAttribute("refX", "3");
      dimensionMarker.setAttribute("refY", "3");
      dimensionMarker.setAttribute("orient", "auto-start-reverse");
      dimensionMarker.setAttribute("markerUnits", "userSpaceOnUse");
      const dimensionArrow = document.createElementNS(svgNamespace, "path");
      dimensionArrow.setAttribute("d", "M 0 0 L 6 3 L 0 6 z");
      dimensionArrow.setAttribute(
        "fill",
        getComputedStyle(plan.root).getPropertyValue("--theme-label").trim() ||
          "#263746",
      );
      dimensionMarker.append(dimensionArrow);
      defs.append(dimensionMarker);
      svg.append(defs);
      const grid = document.createElementNS(svgNamespace, "rect");
      grid.setAttribute("x", "0");
      grid.setAttribute("y", `${viewY}`);
      grid.setAttribute("width", `${viewWidth}`);
      grid.setAttribute("height", `${viewHeight}`);
      grid.setAttribute("fill", `url(#facade-grid-${index + 1})`);
      grid.classList.add("facade-grid");
      svg.append(grid);

      const dimensionStroke =
        getComputedStyle(plan.root).getPropertyValue("--theme-label").trim() ||
        "#263746";
      const dimensionY = (floorHeight + padding + roofDrop) * scale;
      const dimensionX0 = (facadeMin - min + padding) * scale;
      const dimensionX1 = (facadeMax - min + padding) * scale;
      const horizontalDimension = document.createElementNS(svgNamespace, "line");
      horizontalDimension.setAttribute("x1", `${dimensionX0}`);
      horizontalDimension.setAttribute("x2", `${dimensionX1}`);
      horizontalDimension.setAttribute("y1", `${dimensionY}`);
      horizontalDimension.setAttribute("y2", `${dimensionY}`);
      horizontalDimension.setAttribute("stroke", dimensionStroke);
      horizontalDimension.setAttribute("stroke-width", "1");
      horizontalDimension.setAttribute(
        "marker-start",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      horizontalDimension.setAttribute(
        "marker-end",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      svg.append(horizontalDimension);

      const horizontalLabel = document.createElementNS(svgNamespace, "text");
      horizontalLabel.textContent = `${plan.formatMeters(facadeMax - facadeMin)}m`;
      horizontalLabel.setAttribute("x", `${(dimensionX0 + dimensionX1) / 2}`);
      horizontalLabel.setAttribute("y", `${dimensionY - 0.08 * scale}`);
      horizontalLabel.setAttribute("text-anchor", "middle");
      horizontalLabel.setAttribute("fill", dimensionStroke);
      horizontalLabel.setAttribute("font-size", "8");
      svg.append(horizontalLabel);

      const verticalDimension = document.createElementNS(svgNamespace, "line");
      const verticalDimensionX = (padding + width + 0.22) * scale;
      const verticalDimensionY0 = (padding - roofRise) * scale;
      const verticalDimensionY1 = dimensionY;
      verticalDimension.setAttribute("x1", `${verticalDimensionX}`);
      verticalDimension.setAttribute("x2", `${verticalDimensionX}`);
      verticalDimension.setAttribute("y1", `${verticalDimensionY0}`);
      verticalDimension.setAttribute("y2", `${verticalDimensionY1}`);
      verticalDimension.setAttribute("stroke", dimensionStroke);
      verticalDimension.setAttribute("stroke-width", "1");
      verticalDimension.setAttribute(
        "marker-start",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      verticalDimension.setAttribute(
        "marker-end",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      svg.append(verticalDimension);

      const verticalLabel = document.createElementNS(svgNamespace, "text");
      verticalLabel.textContent = `${plan.formatMeters(floorHeight + roofRise + roofDrop)}m`;
      verticalLabel.setAttribute("x", `${verticalDimensionX + 0.16 * scale}`);
      verticalLabel.setAttribute("y", `${(verticalDimensionY0 + verticalDimensionY1) / 2}`);
      verticalLabel.setAttribute("text-anchor", "middle");
      verticalLabel.setAttribute("fill", dimensionStroke);
      verticalLabel.setAttribute("font-size", "8");
      verticalLabel.setAttribute(
        "transform",
        `rotate(-90 ${verticalDimensionX + 0.16 * scale} ${(verticalDimensionY0 + verticalDimensionY1) / 2})`,
      );
      svg.append(verticalLabel);

      const facadeRoofLabels = [];
      roofs.forEach((roof) => {
        if (roof.type !== "gable") return;
        const longitudinal = roof.orientation === "longitudinal";
        const geometry = roofGeometry(roof);
        if (!geometry) return;
        const {
          x0,
          x1,
          y0,
          y1,
          z0: roofZ0,
          rise,
          baseX0,
          baseX1,
          baseY0,
          baseY1,
          eave0,
          eave1,
          pitch,
        } = geometry;
        const roofSpan = longitudinal ? [x0, x1] : [y0, y1];
        const baseSpan = longitudinal ? [baseX0, baseX1] : [baseY0, baseY1];
        const roofStart = roofSpan[0];
        const roofEnd = roofSpan[1];
        const baseStart = baseSpan[0];
        const baseEnd = baseSpan[1];
        const ridge = (roofStart + roofEnd) / 2;
        const baseRidge = (baseStart + baseEnd) / 2;
        const pitchTangent = Math.tan((pitch * Math.PI) / 180);
        const baseY = (floorHeight - roofZ0 + padding) * scale;
        const eaveStartY = baseY + eave0 * pitchTangent * scale;
        const eaveEndY = baseY + eave1 * pitchTangent * scale;
        const roofWidth = longitudinal ? geometry.x1 - geometry.x0 : geometry.y1 - geometry.y0;
        const roofLength = longitudinal ? geometry.y1 - geometry.y0 : geometry.x1 - geometry.x0;
        const isVisibleOnFacade = longitudinal ? !side : side;
        if (!isVisibleOnFacade) return;
        const polygon = document.createElementNS(svgNamespace, "polygon");
        const points = [
          `${(baseStart - min + padding) * scale},${baseY}`,
          `${(baseRidge - min + padding) * scale},${(floorHeight - roofZ0 - rise + padding) * scale}`,
          `${(baseEnd - min + padding) * scale},${baseY}`,
        ].join(" ");
        polygon.setAttribute("points", points);
        polygon.classList.add("facade-roof");
        svg.append(polygon);

        [
          [baseStart, baseY, roofStart, eaveStartY],
          [baseEnd, baseY, roofEnd, eaveEndY],
        ].forEach(([start, startY, end, endY]) => {
          const eaveLine = document.createElementNS(svgNamespace, "line");
          eaveLine.setAttribute("x1", `${(start - min + padding) * scale}`);
          eaveLine.setAttribute("y1", `${startY}`);
          eaveLine.setAttribute("x2", `${(end - min + padding) * scale}`);
          eaveLine.setAttribute("y2", `${endY}`);
          eaveLine.classList.add("facade-roof-eave");
          svg.append(eaveLine);
        });

        if (roof.label || roof.id) {
          const ridgeX = (baseRidge - min + padding) * scale;
          const baseY = (floorHeight - roofZ0 + padding) * scale;
          const ridgeY = (floorHeight - roofZ0 - rise + padding) * scale;
          const labelX = ridgeX;
          const labelY = longitudinal
            ? ridgeY - 3
            : ridgeY - 0.18 * scale;
          const roofLabel = document.createElementNS(svgNamespace, "text");
          roofLabel.setAttribute("x", `${labelX}`);
          roofLabel.setAttribute("y", `${labelY}`);
          roofLabel.setAttribute("text-anchor", longitudinal ? "start" : "middle");
          if (longitudinal) {
            const angle =
              (Math.atan2(baseY - ridgeY, (baseEnd - baseRidge) * scale) * 180) /
              Math.PI;
            roofLabel.setAttribute(
              "transform",
              `rotate(${angle} ${labelX} ${labelY})`,
            );
          }
          roofLabel.classList.add("facade-roof-label");

          const roofTitle = document.createElementNS(svgNamespace, "tspan");
          roofTitle.textContent = roof.label || roof.id;
          roofTitle.setAttribute("x", `${labelX}`);
          roofTitle.classList.add("facade-roof-label-title");

          const roofDetails = document.createElementNS(svgNamespace, "tspan");
          roofDetails.textContent = `l: ${plan.formatMeters(roofLength)}m w: ${plan.formatMeters(roofWidth)}m h: ${plan.formatMeters(rise)}m`;
          roofDetails.setAttribute("x", `${labelX}`);
          roofDetails.setAttribute("dy", "1.2em");
          roofDetails.classList.add("facade-roof-label-details");

          roofLabel.append(roofTitle, roofDetails);
          facadeRoofLabels.push(roofLabel);
        }
      });

      const facadeWalls = [facadeWall];
      const facadeRoomIds = new Set(
        projectedRooms.map((room) => String(room.dataset.id || "")),
      );
      const facadeOpenings = [...plan.openings, ...plan.windows].filter(
        (opening) =>
          facadeWalls.includes(opening.wall) &&
          facadeRoomIds.has(String(opening.roomId || "")),
      );

      plan.itemElements
        .filter((item) => item.classList.contains("railing"))
        .filter((item) => {
          const near = side ? item.x0() : item.y0();
          const far = side ? item.x1() : item.y1();
          const atEdge =
            facadeEdge === "min"
              ? near <= edge + 0.1
              : far >= edge - 0.1;
          const parallel = side ? item.l() >= item.w() : item.w() >= item.l();
          return atEdge && parallel;
        })
        .forEach((item) => {
          const itemStart = side ? item.y0() : item.x0();
          const itemEnd = itemStart + (side ? item.l() : item.w());
          const cuts = facadeOpenings
            .filter((opening) => opening.type === "opening")
            .map((opening) => {
              const start = side ? opening.y : opening.x;
              return [start, start + Number(opening.w ?? 0)];
            })
            .filter(
              ([start, end]) =>
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                start < itemEnd &&
                end > itemStart,
            )
            .sort(([first], [second]) => first - second);
          const fragmentEnds = [
            itemStart,
            ...cuts.flatMap(([start, end]) => [
              Math.max(itemStart, start),
              Math.min(itemEnd, end),
            ]),
            itemEnd,
          ];
          const z0 = item.z0();
          const height = item.h();
          for (let fragmentIndex = 0; fragmentIndex < fragmentEnds.length - 1; fragmentIndex += 2) {
            const start = fragmentEnds[fragmentIndex];
            const end = fragmentEnds[fragmentIndex + 1];
            if (end - start <= 0.01) continue;
            const railing = document.createElementNS(svgNamespace, "rect");
            railing.setAttribute("x", `${(start - min + padding) * scale}`);
            railing.setAttribute(
              "y",
              `${(floorHeight - z0 - height + padding) * scale}`,
            );
            railing.setAttribute("width", `${(end - start) * scale}`);
            railing.setAttribute("height", `${height * scale}`);
            railing.classList.add("facade-railing");
            railing.dataset.id = item.dataset.id || "";
            svg.append(railing);
          }
        });

      surfaceRooms.forEach((room) => {
        const start = side ? room.y0() : room.x0();
        const end = side ? room.y1() : room.x1();
        const z0 = room.z0();
        const height = Math.max(room.z1() - z0, floorHeight - z0);
        const rect = document.createElementNS(svgNamespace, "rect");
        rect.setAttribute("x", `${(start - min + padding) * scale}`);
        rect.setAttribute("y", `${(floorHeight - z0 - height + padding) * scale}`);
        rect.setAttribute("width", `${(end - start) * scale}`);
        rect.setAttribute("height", `${height * scale}`);
        rect.classList.add("facade-room");
        rect.dataset.id = room.dataset.id || "";
        svg.append(rect);

        const roomLabel =
          room.querySelector(".room-label")?.textContent?.trim() ||
          room.dataset.label?.trim();
        if (roomLabel) {
          const label = document.createElementNS(svgNamespace, "text");
          const labelX = (start - min + padding + 0.12) * scale;
          const labelY = (floorHeight - z0 - height + padding + 0.22) * scale;
          label.setAttribute("x", `${labelX}`);
          label.setAttribute("y", `${labelY}`);
          label.setAttribute("text-anchor", "start");
          label.classList.add("facade-room-label");
          const title = document.createElementNS(svgNamespace, "tspan");
          title.textContent = roomLabel;
          title.setAttribute("x", `${labelX}`);
          title.classList.add("facade-room-label-title");
          const dimensions = document.createElementNS(svgNamespace, "tspan");
          dimensions.textContent = `${plan.formatMeters(end - start)}m × ${plan.formatMeters(height)}m`;
          dimensions.setAttribute("x", `${labelX}`);
          dimensions.setAttribute("dy", "1.2em");
          dimensions.classList.add("facade-room-label-details");
          label.append(title, dimensions);
          svg.append(label);
        }

      });

      facadeOpenings
        .forEach((opening) => {
          const start = side ? opening.y : opening.x;
          const z0 = Number(opening.z0 ?? 0);
          const height = Number(opening.h ?? opening.z1 - z0);
          const featureWidth = Number(opening.w ?? 0.8);
          if (![start, z0, height, featureWidth].every(Number.isFinite)) return;
          const rect = document.createElementNS(svgNamespace, "rect");
          rect.setAttribute("x", `${(start - min + padding) * scale}`);
          rect.setAttribute("y", `${(floorHeight - z0 - height + padding) * scale}`);
          rect.setAttribute("width", `${featureWidth * scale}`);
          rect.setAttribute("height", `${height * scale}`);
          rect.classList.add(
            opening.type === "window" ? "facade-window" : "facade-opening",
          );
          rect.dataset.id = opening.id || "";
          rect.setAttribute("aria-label", opening.type || "opening");
          const title = document.createElementNS(svgNamespace, "title");
          title.textContent = `${opening.type || "Abertura"}: ${opening.id || "sem id"}`;
          rect.append(title);
          svg.append(rect);
          if (opening.type === "window") {
            const windowX = (start - min + padding) * scale;
            const windowY = (floorHeight - z0 - height + padding) * scale;
            const windowWidth = featureWidth * scale;
            const windowHeight = height * scale;
            for (let division = 1; division < 4; division += 1) {
              const vertical = document.createElementNS(svgNamespace, "line");
              const verticalX = windowX + (windowWidth * division) / 4;
              vertical.setAttribute("x1", `${verticalX}`);
              vertical.setAttribute("x2", `${verticalX}`);
              vertical.setAttribute("y1", `${windowY}`);
              vertical.setAttribute("y2", `${windowY + windowHeight}`);
              vertical.setAttribute(
                "stroke",
                getComputedStyle(plan.root).getPropertyValue("--theme-window-line").trim() || "#a7adb3",
              );
              vertical.setAttribute("stroke-width", "1");
              svg.append(vertical);

              const horizontal = document.createElementNS(svgNamespace, "line");
              const horizontalY = windowY + (windowHeight * division) / 4;
              horizontal.setAttribute("x1", `${windowX}`);
              horizontal.setAttribute("x2", `${windowX + windowWidth}`);
              horizontal.setAttribute("y1", `${horizontalY}`);
              horizontal.setAttribute("y2", `${horizontalY}`);
              horizontal.setAttribute(
                "stroke",
                getComputedStyle(plan.root).getPropertyValue("--theme-window-line").trim() || "#a7adb3",
              );
              horizontal.setAttribute("stroke-width", "1");
              svg.append(horizontal);
            }
          }
        });

      svg.querySelectorAll(".facade-railing").forEach((railing) => {
        svg.append(railing);
      });
      facadeRoofLabels.forEach((label) => svg.append(label));

      const figure = document.createElement("figure");
      figure.className = "facade-view-container";
      const title = document.createElement("figcaption");
      title.textContent = facade.label || `Fachada ${direction}`;
      figure.append(title, svg);
      plan.facadeLayer.append(figure);
    });
  },
};

window.FloorPlanFacades = FloorPlanFacades;
