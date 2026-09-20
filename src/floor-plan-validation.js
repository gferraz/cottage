const FloorPlanValidation = {
  isReservedId(id) {
    return ["x0", "y0", "z0"].includes(String(id ?? "").trim().toLowerCase());
  },

  collectRoomDefinitions(model) {
    const definitions = new Map();
    const errors = [];
    model.rooms.forEach(({ room }) => {
      const reservedPart = (room.parts ?? []).find((part) => part.id && FloorPlanValidation.isReservedId(part.id));
      if (!room.id) {
        errors.push({ category: "room", opening: room, message: "Cômodo sem id global" });
      } else if (FloorPlanValidation.isReservedId(room.id)) {
        errors.push({ category: "room", id: room.id, opening: room, message: `ID reservado: ${room.id}` });
      } else if (reservedPart) {
        errors.push({ category: "room", id: room.id, opening: room, message: `Parte com ID reservado: ${reservedPart.id}` });
      } else if (definitions.has(room.id)) {
        errors.push({ category: "room", id: room.id, opening: room, message: `ID de cômodo duplicado: ${room.id}` });
      } else {
        definitions.set(room.id, room);
      }
      (room.parts ?? []).forEach((part) => {
        if (part.id && FloorPlanValidation.isReservedId(part.id)) {
          errors.push({ category: "room", id: `${room.id || "cômodo"}.${part.id}`, opening: room, message: `ID reservado: ${part.id}` });
        }
      });
    });
    return { definitions, errors };
  }
};
