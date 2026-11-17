// Declarative layers and nominal XY overlaps. This is not a physical 3D
// collision detector. Inputs and results contain no elements or view state.
const FloorPlanOverlapAnalysis = {
  partKey(roomId, partId) {
    return partId && roomId ? `${roomId}.${partId}` : roomId;
  },

  analyze({ rooms = [], items = [] }) {
    const errors = [];
    const pieces = rooms.flatMap((room, roomIndex) => room.parts.map((part) => ({
      roomIndex,
      roomId: room.id,
      label: room.label,
      floorId: room.floorId,
      part,
      key: this.partKey(room.id, part.id),
      overlapTargets: part.overlapTargets ?? room.overlapTargets ?? [],
      overlayTargets: part.overlayTargets ?? room.overlayTargets ?? [],
    })));
    const nodes = [...pieces, ...items.map((item) => ({
      key: item.id,
      overlayTargets: item.overlayTargets ?? [],
    }))].filter((node) => node.key);
    const nodesByKey = new Map(nodes.map((node) => [node.key, node]));
    const nodesByRoom = new Map();
    pieces.forEach((piece) => {
      if (!nodesByRoom.has(piece.roomId)) nodesByRoom.set(piece.roomId, []);
      nodesByRoom.get(piece.roomId).push(piece);
    });
    const targetNodes = (target) => nodesByKey.has(target)
      ? [nodesByKey.get(target)] : nodesByRoom.get(target) ?? [];
    const edges = new Map(nodes.map((node) => [node.key, []]));
    nodes.forEach((node) => node.overlayTargets.forEach((target) => {
      const matches = targetNodes(target);
      if (!matches.length) {
        errors.push({ category: "overlap", id: node.key,
          message: `Referência de sobreposição inexistente: ${target}` });
      }
      matches.forEach((targetNode) => edges.get(node.key).push(targetNode.key));
    }));
    const layers = new Map();
    const visiting = new Set();
    const calculateLayer = (key) => {
      if (layers.has(key)) return layers.get(key);
      if (visiting.has(key)) {
        errors.push({ category: "overlap", id: key,
          message: `Ciclo de camadas detectado envolvendo ${key}` });
        return 0;
      }
      visiting.add(key);
      const layer = edges.get(key).reduce((highest, target) =>
        Math.max(highest, calculateLayer(target) + 1), 0);
      visiting.delete(key);
      layers.set(key, layer);
      return layer;
    };
    nodes.forEach((node) => calculateLayer(node.key));

    const collidingRooms = new Set();
    const collisionKeys = new Set();
    const targetMatches = (targets, target) => targets.includes(target.key) || targets.includes(target.roomId);
    const epsilon = 1e-9;
    for (let index = 0; index < pieces.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < pieces.length; otherIndex += 1) {
        const first = pieces[index], second = pieces[otherIndex];
        if (first.floorId && second.floorId && first.floorId !== second.floorId) continue;
        const width = Math.min(first.part.x + first.part.w, second.part.x + second.part.w)
          - Math.max(first.part.x, second.part.x);
        const length = Math.min(first.part.y + first.part.l, second.part.y + second.part.l)
          - Math.max(first.part.y, second.part.y);
        if (!(width > epsilon && length > epsilon)) continue;
        if (targetMatches(first.overlapTargets, second) || targetMatches(second.overlapTargets, first)) continue;
        collidingRooms.add(first.roomIndex);
        collidingRooms.add(second.roomIndex);
        const firstId = first.roomId || first.label || "elemento";
        const secondId = second.roomId || second.label || "elemento";
        const key = [firstId, secondId].sort().join(" / ");
        if (collisionKeys.has(key)) continue;
        collisionKeys.add(key);
        errors.push({ category: "collision", id: key,
          message: `Sobreposição entre ${firstId} e ${secondId}` });
      }
    }
    return {
      layers,
      roomLayers: rooms.map((room) => Math.max(...room.parts.map((part) =>
        layers.get(this.partKey(room.id, part.id)) ?? 0))),
      maxLayer: Math.max(0, ...layers.values()),
      collidingRooms,
      errors,
    };
  },
};

window.FloorPlanOverlapAnalysis = FloorPlanOverlapAnalysis;
