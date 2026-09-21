const FloorPlanGeometryDomain = {
  normalizeGeometryAtFloor(plan, data, floorConfig) {
    const previousHeight = plan.currentFloorHeight;
    plan.currentFloorHeight = Number(floorConfig?.h ?? 0);
    try {
      return plan.normalizeGeometry(data);
    } finally {
      plan.currentFloorHeight = previousHeight;
    }
  },

  addSpanningStairs(plan, config, floorConfig) {
    const floors = config.floors ?? [config];
    const existingStairs = (floorConfig.rooms ?? [])
      .filter((room) => room.classes?.split(/\s+/).includes("stair-flight"))
      .map((room) => plan.normalizeGeometry(room));
    const currentHeight = plan.currentFloorHeight;

    floors.forEach((sourceFloor) => {
      (sourceFloor.rooms ?? [])
        .filter((room) => room.classes?.split(/\s+/).includes("stair-flight"))
        .forEach((stair) => {
          const geometry = plan.normalizeGeometryAtFloor(stair, sourceFloor);
          if (
            geometry.h <= 0 ||
            currentHeight < geometry.z0 ||
            currentHeight > geometry.z1
          )
            return;
          const alreadyVisible = existingStairs.some((existing) => {
            const overlapWidth = Math.max(
              0,
              Math.min(existing.x + existing.w, geometry.x + geometry.w) -
                Math.max(existing.x, geometry.x),
            );
            const overlapLength = Math.max(
              0,
              Math.min(existing.y + existing.l, geometry.y + geometry.l) -
                Math.max(existing.y, geometry.y),
            );
            const overlapArea = overlapWidth * overlapLength;
            const smallerArea = Math.min(
              existing.w * existing.l,
              geometry.w * geometry.l,
            );
            return smallerArea > 0 && overlapArea / smallerArea >= 0.95;
          });
          if (alreadyVisible) return;

          plan.addRoom({
            ...stair,
            derived: true,
            pos: [geometry.x, geometry.y, geometry.z0],
            size: [geometry.w, geometry.l, geometry.h],
          });
        });
    });
  },

  normalizeGeometry(plan, data) {
    if (data?.type && data.size === undefined && plan.itemTypes?.[data.type]) {
      const itemType = plan.itemTypes[data.type];
      data = {
        ...itemType,
        ...data,
        size: data.size ?? itemType.size,
        classes: data.classes ?? itemType.classes,
        label: data.label ?? itemType.label,
        title: data.title ?? itemType.title ?? itemType.label,
      };
    }
    const isStair = data.classes?.split(/\s+/).includes("stair-flight");
    if (data.inset !== undefined && data.outset !== undefined) {
      throw new Error("Uma geometria não pode combinar inset e outset");
    }
    if (Array.isArray(data.from) || Array.isArray(data.to)) {
      if (data.inset !== undefined || data.outset !== undefined) {
        throw new Error("Inset/outset não pode ser combinado com from/to");
      }
      if (
        !Array.isArray(data.from) ||
        !Array.isArray(data.to) ||
        (data.from.length !== 2 && data.from.length !== 3) ||
        (data.to.length !== 2 && data.to.length !== 3)
      ) {
        throw new Error(
          "A geometria precisa ter from e to como [x, y] ou [x, y, z]",
        );
      }

      const fromValues = data.from.map((value) => plan.resolve(value));
      const localOrigin = {
        x0: fromValues[0],
        y0: fromValues[1],
        z0: fromValues[2] ?? plan.currentFloorHeight,
      };
      const toValues = data.to.map((value) => plan.resolve(value, localOrigin));
      const [fromX, fromY] = fromValues;
      const [toX, toY] = toValues;
      const fromZ = plan.resolve(fromValues[2] ?? plan.currentFloorHeight);
      const toZ = plan.resolve(toValues[2] ?? fromZ);
      const w = Math.abs(toX - fromX);
      const l = Math.abs(toY - fromY);
      if (
        ![fromX, fromY, toX, toY, fromZ, toZ].every(Number.isFinite) ||
        (w === 0 && l === 0)
      ) {
        throw new Error(
          "A geometria precisa usar coordenadas numéricas diferentes",
        );
      }

      const horizontal = w >= l;
      return {
        ...data,
        x: Math.min(fromX, toX),
        y: Math.min(fromY, toY),
        w,
        l,
        z0: Math.min(fromZ, toZ),
        z1: Math.max(fromZ, toZ),
        h: Math.abs(toZ - fromZ),
        ...(isStair
          ? {
              stairDirection: (horizontal ? toX < fromX : toY < fromY)
                ? "reverse"
                : "forward",
              stairRise: toZ > fromZ ? "up" : toZ < fromZ ? "down" : "flat",
            }
          : {}),
      };
    }

    if (data.rectangle !== undefined) {
      if (!Array.isArray(data.rectangle) || data.rectangle.length !== 4) {
        throw new Error("Rectangle precisa ter [x0, y0, x1, y1]");
      }
      if (
        data.inset !== undefined ||
        data.outset !== undefined ||
        data.pos !== undefined ||
        data.size !== undefined ||
        data.x !== undefined ||
        data.y !== undefined ||
        data.w !== undefined ||
        data.l !== undefined
      ) {
        throw new Error(
          "Rectangle não pode ser combinado com outra definição geométrica",
        );
      }

      const x0Value = plan.resolve(data.rectangle[0]);
      const y0Value = plan.resolve(data.rectangle[1]);
      const rectangleOrigin = {
        x0: x0Value,
        y0: y0Value,
        z0: plan.resolve(data.z0 ?? plan.currentFloorHeight),
      };
      const x1Value = plan.resolve(data.rectangle[2], rectangleOrigin);
      const y1Value = plan.resolve(data.rectangle[3], rectangleOrigin);
      if (![x0Value, y0Value, x1Value, y1Value].every(Number.isFinite)) {
        throw new Error("Rectangle precisa usar valores numéricos");
      }
      if (x1Value === x0Value || y1Value === y0Value) {
        throw new Error(
          "Rectangle precisa ter largura e altura diferentes de zero",
        );
      }

      const z0 = rectangleOrigin.z0;
      const h = plan.resolve(data.h ?? 0);
      if (![z0, h].every(Number.isFinite) || h < 0) {
        throw new Error("A elevação precisa ter z0 numérico e h não negativo");
      }
      return {
        ...data,
        x: Math.min(x0Value, x1Value),
        y: Math.min(y0Value, y1Value),
        w: Math.abs(x1Value - x0Value),
        l: Math.abs(y1Value - y0Value),
        z0,
        z1: z0 + h,
        h,
      };
    }

    if (data.inset !== undefined) {
      if (
        !Array.isArray(data.inset) ||
        ![3, 5].includes(data.inset.length)
      ) {
        throw new Error(
          "Inset precisa ter [id, dx, dy] ou [id, left, top, right, bottom]",
        );
      }

      const [referenceId, leftValue, topValue, rightValue = leftValue, bottomValue = topValue] = data.inset;
      const reference = plan.references.get(String(referenceId));
      if (!reference)
        throw new Error(`Unknown geometric reference: ${referenceId}`);

      const left = plan.resolve(leftValue);
      const top = plan.resolve(topValue);
      const right = plan.resolve(rightValue);
      const bottom = plan.resolve(bottomValue);
      const baseWidth = reference.w();
      const baseLength = reference.l();
      if (![left, top, right, bottom, baseWidth, baseLength].every(Number.isFinite)) {
        throw new Error(`Inset precisa usar valores numéricos: ${referenceId}`);
      }
      if (
        !(
          left >= 0 &&
          top >= 0 &&
          right >= 0 &&
          bottom >= 0 &&
          left + right < baseWidth &&
          top + bottom < baseLength
        )
      ) {
        throw new Error(
          `Inset deve ser não negativo e preservar largura e comprimento de ${referenceId}`,
        );
      }

      const z0 = reference.z0 ? reference.z0() : plan.currentFloorHeight;
      const h = reference.h ? reference.h() : 0;
      return {
        ...data,
        x: reference.x0() + left,
        y: reference.y0() + top,
        w: baseWidth - left - right,
        l: baseLength - top - bottom,
        z0,
        z1: z0 + h,
        h,
      };
    }

    if (data.outset !== undefined) {
      if (
        !Array.isArray(data.outset) ||
        ![3, 5].includes(data.outset.length)
      ) {
        throw new Error(
          "Outset precisa ter [id, dx, dy] ou [id, left, top, right, bottom]",
        );
      }

      const [referenceId, leftValue, topValue, rightValue = leftValue, bottomValue = topValue] = data.outset;
      const reference = plan.references.get(String(referenceId));
      if (!reference)
        throw new Error(`Unknown geometric reference: ${referenceId}`);

      const left = plan.resolve(leftValue);
      const top = plan.resolve(topValue);
      const right = plan.resolve(rightValue);
      const bottom = plan.resolve(bottomValue);
      const baseWidth = reference.w();
      const baseLength = reference.l();
      if (![left, top, right, bottom, baseWidth, baseLength].every(Number.isFinite)) {
        throw new Error(
          `Outset precisa usar valores numéricos: ${referenceId}`,
        );
      }
      if ([left, top, right, bottom].some((value) => value < 0)) {
        throw new Error("Outset deve ser não negativo");
      }

      const z0 = reference.z0 ? reference.z0() : plan.currentFloorHeight;
      const h = reference.h ? reference.h() : 0;
      return {
        ...data,
        x: reference.x0() - left,
        y: reference.y0() - top,
        w: baseWidth + left + right,
        l: baseLength + top + bottom,
        z0,
        z1: z0 + h,
        h,
      };
    }

    const [xValue, yValue, zValue] = data.pos ?? [data.x, data.y, data.z0];
    const [wValue, lValue, hValue] = data.size ?? [data.w, data.l, data.h];

    if ([xValue, yValue, wValue, lValue].some((value) => value === undefined)) {
      throw new Error("A figure needs pos/size or x/y/w/l values");
    }

    const z0 = plan.resolve(zValue ?? plan.currentFloorHeight);
    const h = plan.resolve(hValue ?? 0);
    if (![z0, h].every(Number.isFinite) || h < 0) {
      throw new Error("A elevação precisa ter z0 numérico e h não negativo");
    }

    return {
      ...data,
      x: plan.resolve(xValue),
      y: plan.resolve(yValue),
      w: plan.resolve(wValue),
      l: plan.resolve(lValue),
      z0,
      z1: z0 + h,
      h,
    };
  },

  normalizeWalls(plan, walls) {
    const sides = ["top", "right", "bottom", "left"];
    const normalized = Object.fromEntries(sides.map((side) => [side, "solid"]));

    if (walls === undefined) return normalized;
    if (Array.isArray(walls)) {
      sides.forEach((side) => {
        normalized[side] = "open";
      });
      walls.forEach((side) => {
        if (!sides.includes(side))
          throw new Error(`Invalid wall side: ${side}`);
        normalized[side] = "solid";
      });
      return normalized;
    }

    if (typeof walls === "string") {
      if (!["solid", "open", "virtual"].includes(walls)) {
        throw new Error(
          `Invalid wall state "${walls}". Use "solid", "open" or "virtual".`,
        );
      }
      sides.forEach((side) => {
        normalized[side] = walls;
      });
      return normalized;
    }

    if (typeof walls !== "object" || walls === null) {
      throw new Error("Walls must be an array or an object");
    }

    Object.entries(walls).forEach(([side, state]) => {
      if (!sides.includes(side)) throw new Error(`Invalid wall side: ${side}`);
      if (!["solid", "open", "virtual"].includes(state)) {
        throw new Error(
          `Invalid wall state "${state}". Use "solid", "open" or "virtual".`,
        );
      }
      normalized[side] = state;
    });
    return normalized;
  },
};

window.FloorPlanGeometryDomain = FloorPlanGeometryDomain;
