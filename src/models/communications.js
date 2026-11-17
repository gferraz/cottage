// Natural XY communications between nominal room boundaries. Explicit doors,
// windows, vertical openings and navigability are separate concerns.
const FloorPlanCommunications = {
  analyze(rooms, walls = []) {
    const communications = [];
    const pairs = [
      ["right", "left", "vertical"],
      ["left", "right", "vertical"],
      ["bottom", "top", "horizontal"],
      ["top", "bottom", "horizontal"],
    ];
    for (let index = 0; index < rooms.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < rooms.length;
        otherIndex += 1
      ) {
        const first = rooms[index];
        const second = rooms[otherIndex];
        const firstFloor = first.floor;
        const secondFloor = second.floor;
        if (firstFloor && secondFloor && firstFloor.id !== secondFloor.id) continue;

        for (const [firstSide, secondSide, orientation] of pairs) {
          if (
            first.boundaries[firstSide].state === "solid" ||
            second.boundaries[secondSide].state === "solid"
          )
            continue;

          const firstSegment = first.boundaries[firstSide];
          const secondSegment = second.boundaries[secondSide];
          if (
            Math.abs(firstSegment.coordinate - secondSegment.coordinate) >= 1e-9
          )
            continue;

          const start = Math.max(firstSegment.start, secondSegment.start);
          const end = Math.min(firstSegment.end, secondSegment.end);
          if (end <= start) continue;

          const firstId = first.id || `room-${index + 1}`;
          const secondId = second.id || `room-${otherIndex + 1}`;
          let gaps = [[start, end]];
          const epsilon = 1e-9;
          const floorZ = Number(firstFloor?.z0 ?? first.z0 ?? 0);
          for (const wall of walls) {
            if (wall.scopeFloorId && firstFloor && wall.scopeFloorId !== firstFloor.id) continue;
            // Somente paredes que alcançam o piso fecham a passagem em planta.
            if (wall.z0 > floorZ + epsilon || wall.z1 <= floorZ + epsilon) continue;
            const points = wall.points ?? [];
            for (let segment = 0; segment < points.length - 1; segment += 1) {
              const from = points[segment];
              const to = points[segment + 1];
              const along = orientation === "vertical" ? 1 : 0;
              const across = 1 - along;
              if (Math.abs(from[across] - to[across]) > epsilon ||
                Math.abs(from[across] - firstSegment.coordinate) > Math.max(epsilon, (wall.thickness ?? 0) / 2)) continue;
              const wallStart = Math.min(from[along], to[along]);
              const wallEnd = Math.max(from[along], to[along]);
              gaps = gaps.flatMap(([a, b]) => {
                if (wallEnd <= a + epsilon || wallStart >= b - epsilon) return [[a, b]];
                return [[a, Math.min(b, wallStart)], [Math.max(a, wallEnd), b]]
                  .filter(([left, right]) => right - left > epsilon);
              });
            }
          }
          const length = gaps.reduce((total, [a, b]) => total + b - a, 0);
          if (length <= epsilon) continue;
          communications.push({
            id: `${firstId}-${secondId}`,
            firstId,
            secondId,
            firstLabel: first.label || firstId,
            secondLabel: second.label || secondId,
            orientation,
            length,
            floorId: firstFloor?.id ?? null,
            z0: floorZ,
            coordinate: firstSegment.coordinate,
            firstSide,
            secondSide,
            segments: gaps.map(([a, b]) => ({
              from: orientation === "vertical" ? [firstSegment.coordinate, a, floorZ] : [a, firstSegment.coordinate, floorZ],
              to: orientation === "vertical" ? [firstSegment.coordinate, b, floorZ] : [b, firstSegment.coordinate, floorZ],
              length: b - a,
            })),
          });
        }
      }
    }

    return communications;
  },

  fromReferences(plan, references) {
    const sides = ["top", "right", "bottom", "left"];
    const rooms = references.map((reference) => {
      const floor = plan.roomFloorConfigs?.get(reference.dataset.id);
      return {
        id: reference.dataset.id,
        label: reference.dataset.label,
        floor: floor ? { id: floor.id, z0: floor.z0 } : null,
        z0: reference.z0?.() ?? 0,
        boundaries: Object.fromEntries(sides.map((side) => [side, {
          ...plan.wallSegment(reference, side),
          state: reference.wallState(side),
        }])),
      };
    });
    const walls = [...(plan.independentWalls?.values() ?? [])].map((wall) => ({
      points: wall.path?.points ?? [],
      z0: wall.z0, z1: wall.z1,
      thickness: wall.thickness,
      scopeFloorId: wall.scopeFloorId,
    }));
    return this.analyze(rooms, walls);
  },

  prepare(plan) {
    const references = plan.allRooms.filter((room) => !plan.invalidRoomIds?.has(room.id))
      .map((room) => room.reference);
    plan.communicationResults = this.fromReferences(plan, references);
    plan.naturalCommunications = plan.communicationResults;
    return plan.communicationResults;
  },
};

window.FloorPlanCommunications = FloorPlanCommunications;
