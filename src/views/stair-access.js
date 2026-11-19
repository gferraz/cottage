const FloorPlanStairAccessView = {
  render(plan) {
    for (const zone of plan.derivedZones ?? []) {
      if (plan.selectedFloorIds ? !plan.selectedFloorIds.has(String(zone.floorId))
        : !plan.showAllFloors && zone.floorId !== (plan.currentFloorId ?? null)) continue;
      const points = zone.required.flat();
      const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y));
      const w = Math.max(...points.map((p) => p.x)) - x;
      const l = Math.max(...points.map((p) => p.y)) - y;
      const element = plan.add({ pos: [x, y, points[0].z], size: [w, l, 0],
        classes: "reference-zone stair-access-zone", showLabel: false });
      element.dataset.stairAccessOwner = zone.ownerId;
      element.dataset.floorId = zone.floorId ?? "";
      element.setAttribute("aria-label", "Acesso requerido da escada");
      element.title = "Acesso requerido da escada — paredes e obstáculos ainda não analisados";
    }
  },

  updateVisibility(plan) {
    plan.root.querySelectorAll(".stair-access-zone").forEach((element) => {
      const ownerId = element.dataset.stairAccessOwner;
      const rooms = [...plan.roomElements, ...plan.stairElements]
        .filter((room) => room.dataset.id === ownerId);
      const visible = rooms.some((room) => !room.classList.contains("layer-hidden")
        && !room.classList.contains("plan-hidden") && room.geometryParts.some((part) => {
          const source = part.element ?? room;
          return !source.classList.contains("layer-hidden") && !source.classList.contains("plan-hidden");
        }));
      element.classList.toggle("layer-hidden", !visible);
    });
  },
};
window.FloorPlanStairAccessView = FloorPlanStairAccessView;
