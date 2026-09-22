const FloorPlanValidation = {
  isReservedId(id) {
    return ["x0", "y0", "z0"].includes(
      String(id ?? "")
        .trim()
        .toLowerCase(),
    );
  },

  validateFloors(config) {
    const floors = config.floors ?? [config];
    const errors = [];
    floors.forEach((floor, index) => {
      const label = floor.id || `piso ${index + 1}`;
      const z0 = Number(floor.z0);
      const wallMaxHeight = Number(floor.wall_max_height);
      if (!Number.isFinite(z0)) {
        errors.push({ category: "floor", id: floor.id, opening: floor, message: `${label}: z0 precisa ser numérico` });
      }
      if (!Number.isFinite(wallMaxHeight) || wallMaxHeight <= 0) {
        errors.push({ category: "floor", id: floor.id, opening: floor, message: `${label}: wall_max_height precisa ser positivo` });
      }
      if (index > 0 && Number.isFinite(z0)) {
        const previousZ0 = Number(floors[index - 1].z0);
        if (Number.isFinite(previousZ0) && z0 <= previousZ0) {
          errors.push({ category: "floor", id: floor.id, opening: floor, message: `${label}: z0 precisa ser superior ao piso anterior` });
        }
      }
    });
    return errors;
  },

  collectRoomDefinitions(model) {
    const definitions = new Map();
    const errors = [];
    model.rooms.forEach(({ room }) => {
      const reservedPart = (room.parts ?? []).find(
        (part) => part.id && FloorPlanValidation.isReservedId(part.id),
      );
      if (!room.id) {
        errors.push({
          category: "room",
          opening: room,
          message: "Cômodo sem id global",
        });
      } else if (FloorPlanValidation.isReservedId(room.id)) {
        errors.push({
          category: "room",
          id: room.id,
          opening: room,
          message: `ID reservado: ${room.id}`,
        });
      } else if (reservedPart) {
        errors.push({
          category: "room",
          id: room.id,
          opening: room,
          message: `Parte com ID reservado: ${reservedPart.id}`,
        });
      } else if (definitions.has(room.id)) {
        errors.push({
          category: "room",
          id: room.id,
          opening: room,
          message: `ID de cômodo duplicado: ${room.id}`,
        });
      } else {
        definitions.set(room.id, room);
      }
      (room.parts ?? []).forEach((part) => {
        if (part.id && FloorPlanValidation.isReservedId(part.id)) {
          errors.push({
            category: "room",
            id: `${room.id || "cômodo"}.${part.id}`,
            opening: room,
            message: `ID reservado: ${part.id}`,
          });
        }
      });
    });
    return { definitions, errors };
  },
};
