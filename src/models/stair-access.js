// Required access footprints; clearance beneath the stair is a separate analysis.
const FloorPlanStairAccess = {
  generate(connectivity, { depth = 1.2 } = {}) {
    if (!Number.isFinite(depth) || depth <= 0)
      throw new Error("stair_access_depth precisa ser um número positivo em metros");
    const definitions = [];
    for (const node of connectivity.nodes) for (const end of node.ends) {
      const connected = connectivity.edges.some((edge) =>
        (edge.a === node.key && edge.aEnd === end.role)
        || (edge.b === node.key && edge.bEnd === end.role));
      if (connected) continue;
      const horizontal = end.axis === "y";
      const outward = horizontal
        ? (Math.abs(end.start.x - node.bounds.x) < 1e-7 ? -1 : 1)
        : (Math.abs(end.start.y - node.bounds.y) < 1e-7 ? -1 : 1);
      const offset = (point) => ({ ...point,
        x: point.x + (horizontal ? outward * depth : 0),
        y: point.y + (horizontal ? 0 : outward * depth) });
      for (const floorId of end.floorIds) definitions.push({
        ownerId: node.ownerId, ruleId: JSON.stringify(["stair-access", node.partId, end.role]),
        floorId, category: "circulation",
        required: [[{ ...end.start }, { ...end.end }, offset(end.end), offset(end.start)]],
      });
    }
    return FloorPlanDerivedZones.collect(definitions);
  },
};
window.FloorPlanStairAccess = FloorPlanStairAccess;
