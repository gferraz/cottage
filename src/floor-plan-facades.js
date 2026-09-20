const FloorPlanFacades = {
  render(plan, facades = []) {
    if (!plan.facadeLayer) return;
    plan.facadeLayer.replaceChildren();
    plan.facadeLayer.closest(".facade-section")?.toggleAttribute("hidden", facades.length === 0);
    if (facades.length === 0) return;

    const svgNamespace = "http://www.w3.org/2000/svg";
    const scale = 56;
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
      const projectedRooms = facadeRooms.length > 0 ? facadeRooms : rooms;
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

      projectedRooms.forEach((room) => {
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

        const roomLabel = room.querySelector(".room-label")?.textContent?.trim();
        if (roomLabel) {
          const label = document.createElementNS(svgNamespace, "text");
          label.setAttribute("x", `${((start + end) / 2 - min + padding) * scale}`);
          label.setAttribute("y", `${(floorHeight - z0 - height / 2 + padding) * scale}`);
          label.setAttribute("text-anchor", "middle");
          label.classList.add("facade-room-label");
          label.textContent = roomLabel;
          svg.append(label);
        }
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
