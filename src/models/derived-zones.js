// Required regions remain intact; null availability means restrictions have not been analyzed.
const FloorPlanDerivedZones = {
  collect(definitions) {
    const zones = [], keys = new Set();
    for (const definition of definitions) {
      const { ownerId, ruleId, floorId, category, required } = definition;
      const validPolygon = (polygon) => Array.isArray(polygon) && polygon.length >= 3
        && polygon.every((point) => point && [point.x, point.y, point.z].every(Number.isFinite)
          && Math.abs(point.z - polygon[0].z) <= 1e-7)
        && Math.abs(polygon.reduce((area, point, index) => {
          const next = polygon[(index + 1) % polygon.length];
          return area + point.x * next.y - next.x * point.y;
        }, 0)) > 1e-10;
      if (typeof ownerId !== "string" || !ownerId.trim()
        || typeof ruleId !== "string" || !ruleId.trim() || !["comfort", "circulation", "safety"].includes(category)
        || !Array.isArray(required) || !required.length || !required.every(validPolygon))
        throw new Error("Zona derivada precisa de origem, regra, categoria e polígonos XYZ válidos");
      const id = JSON.stringify([ownerId, ruleId, floorId ?? null]);
      if (keys.has(id)) throw new Error(`Zona derivada duplicada: ${id}`);
      keys.add(id);
      zones.push({ id, ownerId, ruleId, floorId: floorId ?? null, category,
        required: structuredClone(required), available: null, interferences: [] });
    }
    return zones;
  },
};
window.FloorPlanDerivedZones = FloorPlanDerivedZones;
