const FloorPlanGeometry = {
  itemDefinition: Symbol("item-definition"),

  context(plan) {
    return plan.resolutionContext ?? Object.freeze({
      floorZ: plan.currentFloorHeight,
      floorId: plan.currentFloorId ?? null,
      itemReferences: Boolean(plan.itemReferenceContext),
      roomBoundsCache: plan.itemRoomBoundsCache,
      partScopes: plan.partReferenceStack ?? [],
    });
  },

  // A synchronous resolution facade shares model maps, but never changes the
  // caller's floor, reference policy or local scopes. Legacy method names stay
  // readable while consumers migrate to the explicit context contract.
  inContext(plan, overrides) {
    const context = Object.freeze({ ...this.context(plan), ...overrides });
    return Object.create(plan.resolutionOwner ?? plan, {
      resolutionContext: { value: context },
      resolutionOwner: { value: plan.resolutionOwner ?? plan },
      currentFloorHeight: { value: context.floorZ },
      currentFloorId: { value: context.floorId },
      itemReferenceContext: { value: context.itemReferences },
      itemRoomBoundsCache: { value: context.roomBoundsCache },
      partReferenceStack: { value: context.partScopes },
    });
  },

  // Existing lazy references close over the original plan. Bridge that legacy
  // boundary with one context pointer, rather than mutating individual fields.
  // Do not use this synchronous bridge for presentation or asynchronous work.
  withReferenceContext(plan, context, calculate) {
    const owner = plan.resolutionOwner ?? plan;
    if (owner.resolutionContext === context) return calculate();
    const descriptor = Object.getOwnPropertyDescriptor(owner, "resolutionContext");
    if (descriptor?.writable) {
      owner.resolutionContext = context;
      try {
        return calculate();
      } finally {
        owner.resolutionContext = descriptor.value;
      }
    }
    Object.defineProperty(owner, "resolutionContext", { value: context, writable: true, configurable: true });
    try {
      return calculate();
    } finally {
      if (descriptor) Object.defineProperty(owner, "resolutionContext", descriptor);
      else delete owner.resolutionContext;
    }
  },

  // Reference definitions must resolve in their own context, never in the
  // context of the item that happens to be reading them.
  referenceFor(plan, id, reference) {
    if (!reference) return reference;
    const context = this.context(plan);
    const nominalContext = context.itemReferences
      ? Object.freeze({ ...context, itemReferences: false }) : context;
    return new Proxy(reference, {
      get(target, key) {
        const value = FloorPlanGeometry.withReferenceContext(plan,
          nominalContext, () => Reflect.get(target, key, target));
        if (typeof value !== "function") return value;
        return (...args) => {
          if (context.itemReferences && plan.roomDefinitions?.has(id) &&
              ["x0", "x1", "xc", "y0", "y1", "yc", "w", "l", "area"].includes(key)) {
            let bounds = context.roomBoundsCache?.get(id);
            if (!bounds) {
              const nominalPlan = FloorPlanGeometry.inContext(plan, { itemReferences: false });
              bounds = FloorPlanWalls.itemRoomBounds(nominalPlan, id);
              context.roomBoundsCache?.set(id, bounds);
            }
            return bounds[key]();
          }
          return FloorPlanGeometry.withReferenceContext(plan,
            nominalContext, () => value.apply(target, args));
        };
      },
    });
  },
  stairSteps(stair) {
    const risers = stair.risers ?? Math.max(1, Math.round(stair.h / 0.16));
    if (!Number.isInteger(risers) || risers < 2 && stair.risers !== undefined) {
      throw new Error("O número de espelhos precisa ser um inteiro maior ou igual a 2");
    }
    const treads = stair.risers === undefined ? risers : risers - 1;
    const run = stair.stairAxis === "horizontal" ? stair.w : stair.l;
    return { risers, treads, rise: stair.h / risers, run: run / treads };
  },

  stairGradientRange(floorZ, parts) {
    return {
      base: Math.min(floorZ, ...parts.map((part) => part.z0)),
      top: Math.max(floorZ, ...parts.map((part) => part.z1)),
    };
  },

  stairGradientRatio(z, range) {
    const span = range.top - range.base;
    return span > 0 ? Math.max(0, Math.min(1, (z - range.base) / span)) : 0;
  },

  resolveExpression(expression, localOrigin = null) {
    const tokens = [];
    const tokenPattern = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][\w.-]*)|([()+\-*/]))/i;
    let source = expression;
    while (source.length > 0) {
      const match = source.match(tokenPattern);
      if (!match) throw new Error(`Invalid geometric expression: ${expression}`);
      tokens.push(match[1] ?? match[2]);
      source = source.slice(match[0].length);
    }

    let index = 0;
    const primary = () => {
      const token = tokens[index++];
      if (token === "+") return primary();
      if (token === "-") return -primary();
      if (token === "(") {
        const result = addSubtract();
        if (tokens[index++] !== ")") throw new Error(`Invalid geometric expression: ${expression}`);
        return result;
      }
      if (!token || ["+", "-", "*", "/", ")"].includes(token)) {
        throw new Error(`Invalid geometric expression: ${expression}`);
      }
      return this.resolve(token, localOrigin);
    };
    const multiplyDivide = () => {
      let result = primary();
      while (["*", "/"].includes(tokens[index])) {
        const operator = tokens[index++];
        const operand = primary();
        if (operator === "/" && operand === 0) throw new Error("Division by zero in geometric expression");
        result = operator === "*" ? result * operand : result / operand;
      }
      return result;
    };
    const addSubtract = () => {
      let result = multiplyDivide();
      while (["+", "-"].includes(tokens[index])) {
        const operator = tokens[index++];
        const operand = multiplyDivide();
        result += operator === "+" ? operand : -operand;
      }
      return result;
    };

    const result = addSubtract();
    if (index !== tokens.length || !Number.isFinite(result)) {
      throw new Error(`Invalid geometric expression: ${expression}`);
    }
    return result;
  },

  resolve(value, localOrigin = null) {
    if (typeof value === "number") return value;

    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }

    if (typeof value === "object" && value !== null) {
      return this.resolve(value.from, localOrigin) + Number(value.delta ?? 0);
    }

    const reference = String(value).trim();
    if (localOrigin && ["x0", "y0", "z0"].includes(reference)) {
      return localOrigin[reference];
    }
    if (/[()]/.test(reference) || /^[+-]/.test(reference) || reference.includes("*") || reference.includes("/") || /\s[+-]\s/.test(reference)
      || /^(?:x0|y0|z0)\s*[+-]/.test(reference)) {
      return this.resolveExpression(reference, localOrigin);
    }

    const partMatch = reference.match(
      /^([\w-]+)\.([\w-]+)\.(x|x0|x1|xc|y|y0|y1|yc|z0|z1|zc|w|l|h|area)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/
    );
    if (partMatch) {
      const [, roomId, partId, method, operator, amount] = partMatch;
      const room = FloorPlanGeometry.referenceFor(this, roomId,
        FloorPlanGeometry.context(this).partScopes.at(-1)?.get(roomId) || this.references.get(roomId));
      if (!room) {
        throw new Error(
          `Unknown room reference: ${roomId} in geometric expression "${reference}"`,
        );
      }
      const part = room.partReferences?.get(partId);
      if (!part) throw new Error(`Unknown part reference: ${roomId}.${partId}`);
      const offset = amount ? Number(amount) : 0;
      const resolvedMethod = { x: "x0", y: "y0" }[method] || method;
      return part[resolvedMethod]() + (operator === "-" ? -offset : offset);
    }

    const match = reference.match(
      /^([\w-]+)\.(x|x0|x1|xc|y|y0|y1|yc|z0|z1|zc|w|l|h|area)(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/
    );
    if (!match) throw new Error(`Invalid geometric reference: ${value}`);

    const [, roomId, method, operator, amount] = match;
    const room = FloorPlanGeometry.referenceFor(this, roomId,
      FloorPlanGeometry.context(this).partScopes.at(-1)?.get(roomId) || this.references.get(roomId));
    if (!room) {
      throw new Error(
        `Unknown room reference: ${roomId} in geometric expression "${reference}"`,
      );
    }

    const offset = amount ? Number(amount) : 0;
    const resolvedMethod = { x: "x0", y: "y0" }[method] || method;
    return room[resolvedMethod]() + (operator === "-" ? -offset : offset);
  }
};

window.FloorPlanGeometry = FloorPlanGeometry;
