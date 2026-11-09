const FloorPlanMetrics = {
  bounds(plan, { includeItems = false } = {}) {
    const elements = includeItems
      ? [...plan.roomElements, ...plan.itemElements]
      : plan.roomElements;
    if (elements.length === 0) return null;

    const x0 = Math.min(...elements.map((element) => element.x0()));
    const y0 = Math.min(...elements.map((element) => element.y0()));
    const x1 = Math.max(...elements.map((element) => element.x1()));
    const y1 = Math.max(...elements.map((element) => element.y1()));
    return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
  },

  buildingReferenceBounds(plan) {
    const referenceRooms = plan.model?.floors?.[0]?.rooms ?? [];
    const geometries = referenceRooms
      .map((room) =>
        room.id && plan.roomDefinitions?.has(room.id)
          ? plan.getRoomGeometry(room.id)
          : null,
      )
      .filter(Boolean);
    if (!geometries.length) return this.bounds(plan);

    const x0 = Math.min(...geometries.map((geometry) => geometry.x0()));
    const y0 = Math.min(...geometries.map((geometry) => geometry.y0()));
    const x1 = Math.max(...geometries.map((geometry) => geometry.x1()));
    const y1 = Math.max(...geometries.map((geometry) => geometry.y1()));
    return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
  },

  calculateRoomArea(plan) {
    return this.calculateUnionArea(
      plan.roomElements.flatMap((room) => room.geometryParts),
    );
  },

  calculateUnionArea(rectangles) {
    return FloorPlanModel.calculateUnionArea(rectangles);
  },

  calculateNetRoomArea(plan, room) {
    return FloorPlanModel.calculateNetRoomArea(
      room,
      plan.roomElements,
      plan.itemElements,
    );
  },

  subtractRectangles(rectangle, cutters) {
    let fragments = [
      { x: rectangle.x, y: rectangle.y, w: rectangle.w, l: rectangle.l },
    ];
    cutters.forEach((cutter) => {
      fragments = fragments.flatMap((fragment) => {
        const x0 = Math.max(fragment.x, cutter.x);
        const y0 = Math.max(fragment.y, cutter.y);
        const x1 = Math.min(fragment.x + fragment.w, cutter.x + cutter.w);
        const y1 = Math.min(fragment.y + fragment.l, cutter.y + cutter.l);
        if (x1 <= x0 || y1 <= y0) return [fragment];
        return [
          { x: fragment.x, y: fragment.y, w: fragment.w, l: y0 - fragment.y },
          {
            x: fragment.x,
            y: y1,
            w: fragment.w,
            l: fragment.y + fragment.l - y1,
          },
          { x: fragment.x, y: y0, w: x0 - fragment.x, l: y1 - y0 },
          { x: x1, y: y0, w: fragment.x + fragment.w - x1, l: y1 - y0 },
        ].filter((part) => part.w > 1e-9 && part.l > 1e-9);
      });
    });
    return fragments;
  },

  fragmentWalls(fragment, source, sourceWalls) {
    const epsilon = 1e-9;
    const same = (first, second) => Math.abs(first - second) <= epsilon;
    return {
      top: same(fragment.y, source.y) ? sourceWalls.top : "open",
      right: same(fragment.x + fragment.w, source.x + source.w)
        ? sourceWalls.right
        : "open",
      bottom: same(fragment.y + fragment.l, source.y + source.l)
        ? sourceWalls.bottom
        : "open",
      left: same(fragment.x, source.x) ? sourceWalls.left : "open",
    };
  },

  formatMeters(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  },

  formatFixed(value) {
    return Number(value).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  },

  roofTypeLabel(type) {
    return { gable: "duas águas", shed: "uma água" }[type] || type || "—";
  },

  roofOrientationLabel(orientation) {
    return (
      { longitudinal: "longitudinal", transverse: "transversal" }[
        orientation
      ] ||
      orientation ||
      "—"
    );
  },
};

window.FloorPlanMetrics = FloorPlanMetrics;
