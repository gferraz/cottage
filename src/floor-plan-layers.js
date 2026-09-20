const FloorPlanLayers = {
  updateOverlaps(plan) {
    const rooms = [...plan.roomElements, ...plan.stairElements];
    plan.errors = plan.errors.filter(
      (error) => !["collision", "overlap"].includes(error.category),
    );
    rooms.forEach((room) => {
      room.classList.remove(
        "room-overlap",
        "room-overlap-above",
        "room-overlap-below",
      );
    });

    const pieces = rooms.flatMap((room) =>
      room.geometryParts.map((part) => ({
        room,
        part,
        key:
          part.id && room.dataset.id
            ? `${room.dataset.id}.${part.id}`
            : room.dataset.id,
        overlapTargets: part.overlapTargets ?? room.allowedOverlaps,
        overlayTargets: part.overlayTargets ?? room.allowedOverlays,
      })),
    );
    const itemPieces = plan.itemElements.map((item) => ({
      item,
      key: item.dataset.id,
      overlapTargets: item.allowedOverlaps ?? [],
      overlayTargets: item.allowedOverlays ?? [],
      part: { x: item.x0(), y: item.y0(), w: item.w(), l: item.l() },
    }));
    const nodes = [...pieces, ...itemPieces].filter((piece) => piece.key);
    const nodesByKey = new Map(nodes.map((node) => [node.key, node]));
    const nodesByRoom = new Map();
    pieces.forEach((piece) => {
      const roomId = piece.room.dataset.id;
      if (!nodesByRoom.has(roomId)) nodesByRoom.set(roomId, []);
      nodesByRoom.get(roomId).push(piece);
    });

    const targetNodes = (target) =>
      nodesByKey.has(target)
        ? [nodesByKey.get(target)]
        : (nodesByRoom.get(target) ?? []);
    const targetMatches = (targets, targetPiece) =>
      targets.includes(targetPiece.key) ||
      targets.includes(targetPiece.room?.dataset.id);

    const edges = new Map(nodes.map((node) => [node.key, []]));
    nodes.forEach((node) => {
      node.overlayTargets.forEach((target) => {
        const matches = targetNodes(target);
        if (matches.length === 0) {
          plan.errors.push({
            category: "overlap",
            id: node.key,
            message: `Referência de sobreposição inexistente: ${target}`,
          });
          return;
        }
        matches.forEach((targetNode) => {
          edges.get(node.key).push(targetNode.key);
        });
      });
    });

    const layers = new Map();
    const visiting = new Set();
    const visited = new Set();
    const calculateLayer = (key) => {
      if (layers.has(key)) return layers.get(key);
      if (visiting.has(key)) {
        plan.errors.push({
          category: "overlap",
          id: key,
          message: `Ciclo de camadas detectado envolvendo ${key}`,
        });
        return 0;
      }
      visiting.add(key);
      const layer = edges
        .get(key)
        .reduce(
          (highest, target) => Math.max(highest, calculateLayer(target) + 1),
          0,
        );
      visiting.delete(key);
      visited.add(key);
      layers.set(key, layer);
      return layer;
    };
    nodes.forEach((node) => {
      calculateLayer(node.key);
    });
    const maxLayer = Math.max(0, ...layers.values());
    nodes.forEach((node) => {
      const layer = layers.get(node.key) ?? 0;
      node.layer = layer;
      const element = node.item || node.part.element || node.room;
      element.dataset.layer = String(layer);
      element.style.setProperty("--layer", layer);
    });
    rooms.forEach((room) => {
      room.dataset.layer = String(
        Math.max(
          ...room.geometryParts.map(
            (part) =>
              layers.get(
                part.id && room.dataset.id
                  ? `${room.dataset.id}.${part.id}`
                  : room.dataset.id,
              ) ?? 0,
          ),
        ),
      );
    });
    plan.maxLayer = maxLayer;
    plan.updateLayerVisibility();

    const collisionKeys = new Set();
    const epsilon = 1e-9;
    for (let index = 0; index < pieces.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < pieces.length;
        otherIndex += 1
      ) {
        const first = pieces[index];
        const second = pieces[otherIndex];
        const overlapWidth =
          Math.min(first.part.x + first.part.w, second.part.x + second.part.w) -
          Math.max(first.part.x, second.part.x);
        const overlapHeight =
          Math.min(first.part.y + first.part.l, second.part.y + second.part.l) -
          Math.max(first.part.y, second.part.y);
        const overlaps = overlapWidth > epsilon && overlapHeight > epsilon;
        const firstAbove = targetMatches(first.overlayTargets, second);
        const secondAbove = targetMatches(second.overlayTargets, first);
        const firstAllowed = targetMatches(first.overlapTargets, second);
        const secondAllowed = targetMatches(second.overlapTargets, first);
        const allowed = firstAllowed || secondAllowed;

        if (overlaps && !allowed) {
          first.room.classList.add("room-overlap");
          second.room.classList.add("room-overlap");
          const firstId =
            first.room.dataset.id || first.room.dataset.label || "elemento";
          const secondId =
            second.room.dataset.id || second.room.dataset.label || "elemento";
          const collisionKey = [firstId, secondId].sort().join(" / ");
          if (!collisionKeys.has(collisionKey)) {
            collisionKeys.add(collisionKey);
            plan.errors.push({
              category: "collision",
              id: collisionKey,
              message: `Sobreposição entre ${firstId} e ${secondId}`,
            });
          }
        } else if (overlaps) {
          // Declarative overlaps are intentional: keep both elements with
          // their normal appearance. The layer graph still records which
          // element is above the other for visibility and area calculations.
        }
      }
    }
  },

  cycleLayer(plan) {
    // Recompute the graph on demand so the control remains usable after a
    // floor change or after objects are added programmatically.
    if (!(plan.maxLayer > 0)) plan.updateOverlaps();
    if (!(plan.maxLayer > 0)) {
      if (plan.layerButton) plan.layerButton.textContent = "Sem camadas sobrepostas";
      return;
    }
    plan.layerCutoff =
      plan.layerCutoff === null ? plan.maxLayer - 1 : plan.layerCutoff - 1;
    if (plan.layerCutoff < 0) plan.layerCutoff = null;
    plan.updateLayerVisibility();
  },

  updateLayerVisibility(plan) {
    const cutoff = plan.layerCutoff;
    plan.root
      .querySelectorAll(".plan-generated, [data-layer]")
      .forEach((element) => {
        const sourceRoom = element.dataset.openingRoomId
          ? plan.roomElements.find(
              (room) => room.dataset.id === element.dataset.openingRoomId,
            )
          : null;
        const layer = Number(
          sourceRoom?.dataset.layer ?? element.dataset.layer ?? 0,
        );
        element.classList.toggle(
          "layer-hidden",
          cutoff !== null && layer > cutoff,
        );
      });
    if (plan.layerButton) {
      plan.layerButton.textContent =
        cutoff === null ? "Todas as camadas" : `Mostrar até camada ${cutoff}`;
      plan.layerButton.disabled = !plan.currentConfig;
    }
  },

  calculateRoomArea(plan) {
    return FloorPlanMetrics.calculateRoomArea(plan);
  },

  calculateUnionArea(plan, rectangles) {
    return FloorPlanMetrics.calculateUnionArea(rectangles);
  },

  calculateNetRoomArea(plan, room) {
    return FloorPlanMetrics.calculateNetRoomArea(plan, room);
  },

  subtractRectangles(plan, rectangle, cutters) {
    return FloorPlanMetrics.subtractRectangles(rectangle, cutters);
  },

  fragmentWalls(plan, fragment, source, sourceWalls) {
    return FloorPlanMetrics.fragmentWalls(fragment, source, sourceWalls);
  },

  renderMultiFloorUnderlay(plan, floorConfig = null) {
    if (!plan.multiFloorLayer) return;
    plan.multiFloorLayer.replaceChildren();
    const config = plan.currentConfig;
    const activeFloor =
      floorConfig ||
      config?.floors?.find((floor) => floor.id === plan.currentFloorId) ||
      config;
    const floors = config?.floors ?? [config];
    const activeHeight = Number(activeFloor?.h ?? 0);
    const lowerFloors = floors
      .filter((floor) => floor && Number(floor.h ?? 0) < activeHeight)
      .sort((first, second) => Number(second.h ?? 0) - Number(first.h ?? 0));
    const canShow = plan.multiFloorMode && lowerFloors.length > 0;
    if (canShow) {
      let covered = plan.roomElements.flatMap((room) => room.geometryParts);
      const stairAlreadyProjected = Boolean(
        plan.projectionLayer?.querySelector(".stair-flight"),
      );
      const activeFloorId = activeFloor?.id;
      const verticalOpeningGeometries = [];
      const verticalOpenings = (activeFloor?.openings ?? [])
        .filter((opening) => plan.isVerticalOpening(opening))
        .filter((opening) =>
          [opening.from, opening.to].includes(activeFloorId),
        );
      verticalOpenings.forEach((opening) => {
        try {
          const geometry = plan.normalizeGeometryAtFloor(opening, activeFloor);
          verticalOpeningGeometries.push(geometry);
          covered = covered.flatMap((rectangle) =>
            plan.subtractRectangles(rectangle, [geometry]),
          );
        } catch (error) {
          plan.errors.push({
            opening,
            category: "projection",
            message: `Multi-pisos: ${error.message}`,
          });
        }
      });
      lowerFloors.forEach((floor) => {
        const previousHeight = plan.currentFloorHeight;
        plan.currentFloorHeight = Number(floor.h ?? 0);
        try {
          (floor.rooms ?? []).forEach((definition) => {
            const geometries = definition.parts?.length
              ? plan.normalizeParts(definition.parts)
              : [plan.normalizeGeometry(definition)];
            const {
              from,
              to,
              rectangle,
              inset,
              outset,
              x,
              y,
              w,
              l,
              parts,
              ...fragmentDefinition
            } = definition;
            geometries.forEach((geometry) => {
              const sourceWalls = plan.normalizeWalls(
                geometry.walls ?? definition.walls,
              );
              const isStairFlight = String(
                geometry.classes ?? definition.classes ?? "",
              )
                .split(/\s+/)
                .includes("stair-flight");
              const fragments = isStairFlight
                ? stairAlreadyProjected && verticalOpeningGeometries.length
                  ? verticalOpeningGeometries.reduce(
                      (remaining, opening) =>
                        remaining.flatMap((fragment) =>
                          plan.subtractRectangles(fragment, [opening]),
                        ),
                      [
                        {
                          x: geometry.x,
                          y: geometry.y,
                          w: geometry.w,
                          l: geometry.l,
                        },
                      ],
                    )
                  : [
                      {
                        x: geometry.x,
                        y: geometry.y,
                        w: geometry.w,
                        l: geometry.l,
                      },
                    ]
                : plan.subtractRectangles(geometry, covered);
              fragments.forEach((fragment) => {
                const projected = plan.add({
                  ...fragmentDefinition,
                  id: undefined,
                  label: "",
                  room: true,
                  pos: [fragment.x, fragment.y, geometry.z0],
                  size: [fragment.w, fragment.l, geometry.h],
                  walls: plan.fragmentWalls(fragment, geometry, sourceWalls),
                  classes:
                    `${geometry.classes || definition.classes || ""} floor-projection multi-floor-underlay`.trim(),
                  container: plan.multiFloorLayer,
                });
                projected
                  .querySelectorAll(":scope > .room-label, :scope > small")
                  .forEach((label) => {
                    label.remove();
                  });
              });
            });
          });

          (floor.items ?? []).forEach((item) => {
            const definition = plan.resolveItemType(item);
            const geometry = plan.normalizeGeometry(definition);
            const {
              from,
              to,
              rectangle,
              inset,
              outset,
              x,
              y,
              w,
              l,
              ...fragmentDefinition
            } = definition;
            plan.subtractRectangles(geometry, covered).forEach((fragment) => {
              plan.add({
                ...fragmentDefinition,
                pos: [fragment.x, fragment.y, geometry.z0],
                size: [fragment.w, fragment.l, geometry.h],
                classes:
                  `${definition.classes || ""} floor-projection multi-floor-underlay`.trim(),
                container: plan.multiFloorLayer,
                showLabel: false,
              });
            });
          });
        } catch (error) {
          plan.errors.push({
            category: "projection",
            message: `Multi-pisos: ${error.message}`,
          });
        } finally {
          plan.currentFloorHeight = previousHeight;
        }
      });
    }
    if (plan.multiFloorButton) {
      plan.multiFloorButton.disabled = !lowerFloors.length;
      plan.multiFloorButton.textContent =
        plan.multiFloorMode && lowerFloors.length
          ? "Visão: Multi-pisos"
          : "Visão: Piso atual";
    }
  },
};

window.FloorPlanLayers = FloorPlanLayers;
