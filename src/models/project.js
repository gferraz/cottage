// Prepare one project revision independently of any rendered view.
const FloorPlanProject = {
  prepare(plan, source) {
    const model = FloorPlanModel.fromConfig(source);
    const config = model.config;
    plan.preparedProject = null;
    plan.model = model;
    plan.currentConfig = config;
    plan.currentFloorHeight ??= 0;
    plan.partReferenceStack ??= [];
    for (const key of ["references", "rooms", "roomReferences", "roomDefinitions",
      "roomGeometryCache", "partOwners"]) plan[key] ??= new Map();
    for (const key of ["roomGeometryStack", "globalObjectIds", "validZoneIds", "invalidRoomIds"])
      plan[key] ??= new Set();
    plan.errors = [];
    plan.warnings = model.warnings;
    plan.itemTypes = { ...(plan.catalog.items ?? {}), ...(config["item-types"] ?? {}) };
    plan.prepareRoomReferences(config);
    const floorErrors = new Map(model.floors.map((floor) =>
      [floor, FloorPlanReferences.collectFloorFeatureErrors(plan, floor)]));
    plan.prepareGlobalLists(config);
    plan.allSlabs = FloorPlanSlabs.collect(plan);
    FloorPlanHeadroom.prepare(plan);
    FloorPlanCommunications.prepare(plan);
    const stairParts = [...plan.allRooms, ...(plan.allStairs ?? [])].filter((room) => !plan.invalidRoomIds.has(room.id))
      .flatMap((room) => plan.getRoomGeometry(room.id).normalizedParts);
    plan.stairConnectivity = FloorPlanStairConnectivity.analyze(stairParts, model.floors);
    plan.stairSourceLayers = FloorPlanStairHeadroom.sourceLayers(plan);
    plan.derivedZones = FloorPlanStairAccess.generate(plan.stairConnectivity,
      { depth: config.stair_access_depth ?? 1.2 });
    plan.stairHeadroomResults = FloorPlanStairHeadroom.analyze(stairParts, model.floors,
      [...FloorPlanRoofGeometry.intersectingSurfaces(plan),
        ...FloorPlanHeadroomAnalysis.slabSurfaces(plan.allSlabs)]);
    plan.preparedProject = {
      model,
      references: new Map(plan.references),
      rooms: new Map(plan.rooms),
      errors: [...plan.errors],
      warnings: model.warnings,
      floorErrors,
    };
    return plan.preparedProject;
  },

  restoreReferences(plan) {
    const prepared = plan.preparedProject;
    for (const key of ["references", "rooms"]) {
      plan[key].clear();
      prepared[key].forEach((value, id) => plan[key].set(id, value));
    }
  },

  viewErrors(prepared, floor, showAllFloors) {
    // Visible features still report detailed errors through their renderer.
    // Reuse validation for inactive floors without duplicating those messages.
    return [...prepared.errors, ...(!showAllFloors
      ? [...prepared.floorErrors].flatMap(([candidate, errors]) => candidate === floor ? [] : errors)
      : [])];
  },
};

window.FloorPlanProject = FloorPlanProject;
