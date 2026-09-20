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
      const min = Math.min(...coordinates);
      const max = Math.max(...coordinates);
      const width = Math.max(max - min, 1);
      const padding = 0.5;
      const svg = document.createElementNS(svgNamespace, "svg");
      svg.classList.add("facade-view");
      svg.setAttribute("viewBox", `0 0 ${(width + padding * 2) * scale} ${(floorHeight + padding * 2) * scale}`);
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
      svg.append(defs);
      const grid = document.createElementNS(svgNamespace, "rect");
      grid.setAttribute("width", "100%");
      grid.setAttribute("height", "100%");
      grid.setAttribute("fill", `url(#facade-grid-${index + 1})`);
      grid.classList.add("facade-grid");
      svg.append(grid);

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
            const divider = document.createElementNS(svgNamespace, "line");
            divider.setAttribute("x1", `${(start - min + padding) * scale}`);
            divider.setAttribute("x2", `${(start - min + padding + featureWidth) * scale}`);
            divider.setAttribute("y1", `${(floorHeight - z0 - height / 2 + padding) * scale}`);
            divider.setAttribute("y2", divider.getAttribute("y1"));
            divider.classList.add("facade-window-divider");
            svg.append(divider);
          }
        });

      svg.querySelectorAll(".facade-railing").forEach((railing) => {
        svg.append(railing);
      });

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
