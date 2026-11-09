const FloorPlanValidation = {
  isReservedId(id) {
    return ["x0", "y0", "z0"].includes(
      String(id ?? "")
        .trim()
        .toLowerCase(),
    );
  },

  roofOpeningSurfaceError(roof, from) {
    const reference = String(from ?? "").trim();
    const prefix = `${roof.id}.`;
    const surface = roof.id && reference.startsWith(prefix)
      ? reference.slice(prefix.length)
      : reference;
    const surfaces = roof.type === "shed"
      ? [roof.slope ?? (roof.orientation === "longitudinal" ? "right" : "bottom")]
      : roof.type === "gable"
      ? roof.orientation === "longitudinal"
        ? ["left", "right"]
        : roof.orientation === "transverse" ? ["top", "bottom"] : []
      : [];
    if (surfaces.includes(surface)) return null;
    return `Não é possível colocar a abertura na superfície "${reference || "não informada"}" do telhado "${roof.label || roof.id || "sem id"}": essa superfície não existe. Os fechamentos verticais dos telhados não são criados automaticamente; defina uma parede no projeto e vincule a abertura a ela.`;
  },

  validateRoofOpenings(config) {
    const roofs = config.floors
      ? [...(config.roofs ?? []), ...config.floors.flatMap((floor) => floor.roofs ?? [])]
      : config.roofs ?? [];
    return roofs.flatMap((roof) => [
      ...(roof.openings ?? []),
      ...(roof.windows ?? []).map((opening) => ({ ...opening, type: "window" })),
    ].flatMap((opening, index) => {
      const message = this.roofOpeningSurfaceError(roof, opening.from);
      return message ? [{
        category: opening.type === "window" ? "window" : "opening",
        id: opening.id || `${roof.id || "telhado"}-opening-${index + 1}`,
        opening,
        message,
      }] : [];
    }));
  },

  validateFloors(config) {
    const floors = config.floors ?? [config];
    const errors = [];
    floors.forEach((floor, index) => {
      const label = floor.id || `piso ${index + 1}`;
      const z0 = Number(floor.z0);
      const wallMaxHeight = Number(floor.ceiling_height ?? floor.wall_max_height);
      if (!Number.isFinite(z0)) {
        errors.push({ category: "floor", id: floor.id, opening: floor, message: `${label}: z0 precisa ser numérico` });
      }
      if (!Number.isFinite(wallMaxHeight) || wallMaxHeight <= 0) {
        errors.push({ category: "floor", id: floor.id, opening: floor, message: `${label}: ceiling_height precisa ser positivo` });
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

window.FloorPlanValidation = FloorPlanValidation;
