// Nominal contacts are candidates for access, not proof of obstacle-free passage.
const FloorPlanStairConnectivity = {
  analyze(parts, floors, epsilon = 1e-7) {
    const nodes = [], diagnostics = [];
    for (const part of parts) {
      const classes = (part.classes ?? "").split(/\s+/);
      const kind = classes.includes("stair-flight") ? "flight"
        : classes.includes("stair-landing") ? "landing" : null;
      if (!kind) continue;
      const key = JSON.stringify([part.ownerId, part.id]);
      if (![part.x, part.y, part.w, part.l, part.z0, part.z1].every(Number.isFinite)
        || part.w <= 0 || part.l <= 0 || part.z1 < part.z0
        || (part.rotation ?? 0) !== 0
        || (kind === "flight" && (part.z1 <= part.z0
          || !["horizontal", "vertical"].includes(part.stairAxis)))
        || (kind === "landing" && Math.abs(part.z1 - part.z0) > epsilon)) {
        diagnostics.push({ key, reason: "unsupported-geometry" });
        continue;
      }
      if (nodes.some((node) => node.key === key)) {
        diagnostics.push({ key, reason: "duplicate-part" });
        continue;
      }
      const node = { key, ownerId: part.ownerId, partId: part.id, floorId: part.floorId,
        kind, bounds: { x: part.x, y: part.y, w: part.w, l: part.l, z: part.z0 }, ends: [] };
      if (kind === "flight") {
        const horizontal = part.stairAxis === "horizontal";
        const increasing = (part.stairDirection !== "reverse") === (part.stairRise !== "down");
        node.ends = ["lower", "upper"].map((role) => {
          const high = (role === "upper") === increasing;
          const z = role === "lower" ? part.z0 : part.z1;
          const cross = horizontal ? part.l : part.w;
          const width = part.stairType === "solid-flared"
            ? part.stepWidths[role === "lower" ? 0 : part.stepWidths.length - 1] : cross;
          const inset = (cross - width) / 2;
          const x = part.x + (horizontal && high ? part.w : 0) + (horizontal ? 0 : inset);
          const y = part.y + (!horizontal && high ? part.l : 0) + (horizontal ? inset : 0);
          return { role, z, axis: horizontal ? "y" : "x",
            start: { x, y, z }, end: { x: x + (horizontal ? 0 : width),
              y: y + (horizontal ? width : 0), z },
            floorIds: floors.filter((floor) => Math.abs(Number(floor.z0 ?? 0) - z) <= epsilon)
              .map((floor) => floor.id ?? null) };
        });
      }
      nodes.push(node);
    }
    const edges = [];
    const overlap = (a, b, c, d) => Math.min(b, d) - Math.max(a, c) > epsilon;
    const touches = (end, landing) => {
      const b = landing.bounds;
      if (Math.abs(end.z - b.z) > epsilon) return false;
      return end.axis === "y"
        ? (Math.abs(end.start.x - b.x) <= epsilon || Math.abs(end.start.x - b.x - b.w) <= epsilon)
          && overlap(end.start.y, end.end.y, b.y, b.y + b.l)
        : (Math.abs(end.start.y - b.y) <= epsilon || Math.abs(end.start.y - b.y - b.l) <= epsilon)
          && overlap(end.start.x, end.end.x, b.x, b.x + b.w);
    };
    nodes.forEach((a, index) => nodes.slice(index + 1).forEach((b) => {
      for (const end of a.ends) {
        if (b.kind === "landing" && touches(end, b)) edges.push({ a: a.key, aEnd: end.role, b: b.key });
        for (const other of b.ends) {
          const fixed = end.axis === "y" ? "x" : "y";
          const axis = end.axis;
          if (end.role !== other.role && end.axis === other.axis
            && Math.abs(end.z - other.z) <= epsilon
            && Math.abs(end.start[fixed] - other.start[fixed]) <= epsilon
            && overlap(end.start[axis], end.end[axis], other.start[axis], other.end[axis]))
            edges.push({ a: a.key, aEnd: end.role, b: b.key, bEnd: other.role });
        }
      }
      if (a.kind === "landing") for (const end of b.ends)
        if (touches(end, a)) edges.push({ a: a.key, b: b.key, bEnd: end.role });
      if (a.kind === "landing" && b.kind === "landing") {
        const p = a.bounds, q = b.bounds;
        if (Math.abs(p.z - q.z) <= epsilon && (
          ((Math.abs(p.x + p.w - q.x) <= epsilon || Math.abs(q.x + q.w - p.x) <= epsilon)
            && overlap(p.y, p.y + p.l, q.y, q.y + q.l)) ||
          ((Math.abs(p.y + p.l - q.y) <= epsilon || Math.abs(q.y + q.l - p.y) <= epsilon)
            && overlap(p.x, p.x + p.w, q.x, q.x + q.w)))) edges.push({ a: a.key, b: b.key });
      }
    }));
    return { nodes, edges, diagnostics };
  },
};
window.FloorPlanStairConnectivity = FloorPlanStairConnectivity;
