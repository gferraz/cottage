class FloorPlanValidation {
  static collectRoomDefinitions(model) {
    const definitions = new Map();
    const errors = [];
    model.rooms.forEach(({ room }) => {
      if (!room.id) {
        errors.push({ category: "room", opening: room, message: "Cômodo sem id global" });
      } else if (definitions.has(room.id)) {
        errors.push({ category: "room", id: room.id, opening: room, message: `ID de cômodo duplicado: ${room.id}` });
      } else {
        definitions.set(room.id, room);
      }
    });
    return { definitions, errors };
  }
}
