const FloorPlanLayers = {
  isLayerVisible(layer, cutoff) {
    return cutoff === "above-zero" ? layer > 0 : cutoff === null || layer <= cutoff;
  },

  updateOverlaps(plan) {
    const rooms = [...plan.roomElements, ...plan.stairElements];
    // Projected stairs belong to another floor; their layer graph has already
    // been resolved against the source rooms in the prepared project.
    const localRooms = rooms.filter(room => room.dataset.spanningStair !== "true");
    const analysis = FloorPlanOverlapAnalysis.analyze({
      rooms: localRooms.map((room) => ({
        id: room.dataset.id,
        label: room.dataset.label,
        floorId: room.dataset.floorId,
        overlapTargets: room.allowedOverlaps,
        overlayTargets: room.allowedOverlays,
        parts: room.geometryParts.map((part) => ({
          id: part.id, x: part.x, y: part.y, w: part.w, l: part.l,
          overlapTargets: part.overlapTargets,
          overlayTargets: part.overlayTargets,
        })),
      })),
      items: plan.itemElements.map((item) => ({
        id: item.dataset.id,
        overlayTargets: item.allowedOverlays,
      })),
    });
    plan.errors = [
      ...plan.errors.filter((error) => !["collision", "overlap"].includes(error.category)),
      ...analysis.errors,
    ];
    rooms.forEach((room) => {
      const projected = room.dataset.spanningStair === "true";
      const index = localRooms.indexOf(room);
      room.classList.remove("room-overlap", "room-overlap-above", "room-overlap-below");
      if (analysis.collidingRooms.has(index)) room.classList.add("room-overlap");
      room.geometryParts.forEach((part) => {
        const key = FloorPlanOverlapAnalysis.partKey(room.dataset.id, part.id);
        if (!key) return;
        const layer = (projected ? plan.stairSourceLayers?.get(key) : analysis.layers.get(key)) ?? 0;
        const element = part.element || room;
        element.dataset.layer = String(layer);
        element.style.setProperty("--layer", layer);
      });
      room.dataset.layer = String(projected
        ? Math.max(0, ...room.geometryParts.map(part => plan.stairSourceLayers?.get(
          FloorPlanOverlapAnalysis.partKey(room.dataset.id, part.id)) ?? 0))
        : analysis.roomLayers[index]);
    });
    plan.itemElements.forEach((item) => {
      if (!item.dataset.id) return;
      const layer = analysis.layers.get(item.dataset.id) ?? 0;
      item.dataset.layer = String(layer);
      item.style.setProperty("--layer", layer);
    });
    plan.maxLayer = Math.max(analysis.maxLayer, ...rooms.map(room => Number(room.dataset.layer)));
    plan.updateLayerVisibility();
    return analysis;
  },

  cycleLayer(plan) {
    // Recompute the graph on demand so the control remains usable after a
    // floor change or after objects are added programmatically.
    if (!(plan.maxLayer > 0)) plan.updateOverlaps();
    if (!(plan.maxLayer > 0)) {
      return;
    }
    plan.layerCutoff =
      plan.layerCutoff === null || plan.layerCutoff === "above-zero"
        ? plan.maxLayer - 1 : plan.layerCutoff - 1;
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
          !this.isLayerVisible(layer, cutoff),
        );
      });
    window.FloorPlanStairHeadroomView?.updateVisibility(plan);
    window.FloorPlanStairAccessView?.updateVisibility(plan);
    if (plan.layerOptions) {
      const visible = Boolean(plan.currentConfig && plan.maxLayer > 0);
      const container = plan.layerOptions.closest(".layer-selector");
      container?.toggleAttribute("hidden", !visible);
      if (visible && plan.layerOptions.childElementCount !== plan.maxLayer + 2) {
        plan.layerOptions.replaceChildren();
        const options = [
          { value: "all", label: "Todas" },
          { value: "above-zero", label: "Acima da camada 0" },
        ];
        for (let layer = 0; layer < plan.maxLayer; layer += 1) {
          options.push({ value: String(layer), label: `Camada ${layer}` });
        }
        options.forEach(({ value, label: text }) => {
          const label = document.createElement("label");
          label.className = "floor-option";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "layer-selection";
          input.value = value;
          input.checked = value === String(cutoff ?? "all");
          const caption = document.createElement("span");
          caption.textContent = text;
          label.append(input, caption);
          plan.layerOptions.append(label);
        });
      }
      plan.layerOptions.querySelectorAll("input").forEach((input) => {
        input.checked = input.value === String(cutoff ?? "all");
      });
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
    if (plan.showAllFloors) {
      if (plan.multiFloorSwitch) {
        plan.multiFloorSwitch.hidden = true;
        plan.multiFloorSwitch.closest(".visibility-switch")?.setAttribute("hidden", "");
      }
      plan.updateVisibilityHeading();
      return;
    }
    const config = plan.currentConfig;
    const activeFloor =
      floorConfig ||
      config?.floors?.find((floor) => floor.id === plan.currentFloorId) ||
      config;
    const floors = config?.floors ?? [config];
    const activeHeight = Number(activeFloor?.z0 ?? 0);
    const lowerFloors = floors
      .filter((floor) => floor && Number(floor.z0 ?? 0) < activeHeight)
      .sort((first, second) => Number(second.z0 ?? 0) - Number(first.z0 ?? 0));
    const canShow = plan.multiFloorMode && lowerFloors.length > 0;
    if (canShow) {
      let covered = plan.roomElements.flatMap((room) => room.geometryParts);
      const stairAlreadyProjected = Boolean(
        plan.projectionLayer?.querySelector(".stair-flight"),
      );
      const activeFloorId = activeFloor?.id;
      const verticalOpeningGeometries = [];
      const verticalOpenings = FloorPlanOpenings.collect(activeFloor)
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
        plan.currentFloorHeight = Number(floor.z0 ?? 0);
        try {
          [...(floor.rooms ?? []), ...(plan.allStairs ?? [])
            .filter((entry) => (entry.floorId ?? null) === (floor.id ?? null))
            .filter((entry) => !plan.invalidRoomIds?.has(entry.id))
        .map((entry) => entry.stair)].forEach((definition) => {
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

          (window.FloorPlanElements?.items(plan, floor) ?? floor.items ?? []).forEach((item) => {
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
    if (plan.multiFloorSwitch) {
      plan.multiFloorSwitch.hidden = !lowerFloors.length;
      plan.multiFloorSwitch.checked = plan.multiFloorMode && lowerFloors.length > 0;
      plan.multiFloorSwitch.closest(".visibility-switch")?.toggleAttribute("hidden", !lowerFloors.length);
    }
    plan.updateVisibilityHeading();
  },
};

window.FloorPlanLayers = FloorPlanLayers;
