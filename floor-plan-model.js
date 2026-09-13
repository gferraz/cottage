class FloorPlanModel {
  static fromText(sourceText) {
    return this.fromConfig(JSON.parse(sourceText));
  }

  static fromConfig(config) {
    const floors = config.floors ?? [config];
    return {
      config,
      floors,
      rooms: floors.flatMap((floor) => (floor.rooms ?? []).map((room) => ({
        room,
        floorId: floor.id ?? null,
        floorLabel: floor.label ?? null
      })))
    };
  }
}
