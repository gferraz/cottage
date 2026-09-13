class FloorPlanLegend {
  static floorRows(floors, roomDefinitions, roomReferences, unionArea) {
    return floors.map((floor) => {
      const rooms = (floor.rooms ?? [])
        .filter((room) => roomDefinitions.get(room.id) === room)
        .map((room) => roomReferences.get(room.id))
        .filter(Boolean);
      const baseRooms = (floor.rooms ?? [])
        .filter((room) => room.overlaps === undefined && roomDefinitions.get(room.id) === room)
        .map((room) => roomReferences.get(room.id))
        .filter(Boolean);
      const dimensionRooms = baseRooms.length ? baseRooms : rooms;
      return {
        label: floor.label || floor.id || "Piso",
        count: rooms.length,
        width: dimensionRooms.length ? Math.max(...dimensionRooms.map((room) => room.x1())) - Math.min(...dimensionRooms.map((room) => room.x0())) : 0,
        height: dimensionRooms.length ? Math.max(...dimensionRooms.map((room) => room.y1())) - Math.min(...dimensionRooms.map((room) => room.y0())) : 0,
        area: unionArea((baseRooms.length ? baseRooms : rooms).flatMap((room) => room.geometryParts || []))
      };
    });
  }
}
