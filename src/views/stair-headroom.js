const FloorPlanStairHeadroomView = {
  render(plan) {
    for (const result of plan.stairHeadroomResults ?? []) {
      if (plan.selectedFloorIds ? !plan.selectedFloorIds.has(String(result.floorId))
        : !plan.showAllFloors && result.floorId !== (plan.currentFloorId ?? null)) continue;
      const sourceLayers = (plan.stairConnectivity?.nodes ?? [])
        .filter((node) => node.ownerId === result.ownerId)
        .map((node) => plan.stairSourceLayers?.get(
          FloorPlanOverlapAnalysis.partKey(node.ownerId, node.partId)) ?? 0);
      plan.maxLayer = Math.max(plan.maxLayer, ...sourceLayers);
      const parts = result.parts;
      const x = Math.min(...parts.map((p) => p.x)), y = Math.min(...parts.map((p) => p.y));
      const w = Math.max(...parts.map((p) => p.x + p.w)) - x;
      const l = Math.max(...parts.map((p) => p.y + p.l)) - y;
      const element = plan.add({ pos: [x, y, result.floorZ], size: [w, l, 0],
        classes: "stair-headroom-zone", showLabel: false });
      element.dataset.stairHeadroomOwner = result.ownerId;
      element.dataset.floorId = result.floorId ?? "";
      element.setAttribute("aria-label", "Altura livre sob a escada");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `${x} ${y} ${w} ${l}`);
      svg.setAttribute("preserveAspectRatio", "none");
      FloorPlanHeadroomView.appendBands(plan, svg, result, {
        colors: FloorPlanHeadroom.colors, label: "Sob a escada", allLabels: true,
      });
      element.append(svg);
    }
  },

  isVisible(cutoff, sourceLayers) {
    return cutoff === 0 && sourceLayers.length > 0 && sourceLayers.every((layer) => layer > 0);
  },

  updateVisibility(plan) {
    const nodes = plan.stairConnectivity?.nodes ?? [];
    let anyVisible = false;
    plan.root.querySelectorAll(".stair-headroom-zone").forEach((element) => {
      const ownerId = element.dataset.stairHeadroomOwner;
      const sourceNodes = nodes.filter((node) => node.ownerId === ownerId);
      const rooms = [...plan.roomElements, ...plan.stairElements]
        .filter((room) => room.dataset.id === ownerId);
      const layers = sourceNodes.map((node) => {
        const renderedParts = rooms.flatMap((room) => room.geometryParts
          .filter((part) => part.id === node.partId).map((part) => part.element ?? room));
        // A source on another floor still uses its prepared layer policy.
        return renderedParts.length ? Math.min(...renderedParts.map((part) => Number(part.dataset.layer ?? 0)))
          : plan.stairSourceLayers?.get(FloorPlanOverlapAnalysis.partKey(ownerId, node.partId)) ?? 0;
      });
      const visible = this.isVisible(plan.layerCutoff, layers);
      anyVisible ||= visible;
      element.classList.toggle("layer-hidden", !visible);
    });
    const legend = plan.root.ownerDocument?.querySelector("#comfort-legend");
    if (legend) legend.hidden = !anyVisible && !plan.root.querySelector(".headroom-zone");
  },
};
window.FloorPlanStairHeadroomView = FloorPlanStairHeadroomView;
