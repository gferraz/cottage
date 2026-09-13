class FloorPlanModel {
  static fromText(sourceText) {
    return this.fromConfig(JSON.parse(sourceText));
  }

  static fromConfig(config) {
    const floors = config.floors ?? [config];
    const viewport = config.viewport ?? { size: [20, 20], origin: [-4.25, -4.25] };
    return {
      config,
      floors,
      viewport,
      rooms: floors.flatMap((floor) => (floor.rooms ?? []).map((room) => ({
        room,
        floorId: floor.id ?? null,
        floorLabel: floor.label ?? null
      })))
    };
  }
}
