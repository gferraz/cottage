const FloorPlanElements = {
  nightstandSource: Symbol("nightstand-source"),

  items(plan, floor) {
    return (floor.items ?? []).flatMap((item) => {
      const nightstand = item.nightstand ?? plan.itemTypes?.[item.type]?.nightstand;
      if (nightstand === undefined) return [item];
      const definition = plan.itemTypes?.[item.type];
      const classes = String(item.classes ?? definition?.classes ?? "").split(/\s+/);
      const side = nightstand?.side ?? definition?.nightstand?.side ?? (classes.includes("twin-bed") ? "right" : "both");
      const sides = side === "none" ? [] : side === "both" ? ["left", "right"] : [side];
      return [item, ...sides.map((side) => ({
        ...(item.id ? { id: `${item.id}-nightstand-${side}` } : {}),
        [this.nightstandSource]: { bed: item, side, floor },
      }))];
    });
  },

  resolveNightstand(plan, { bed, side, floor }, id) {
    const definition = this.resolveItemType(plan, bed);
    const geometry = plan.normalizeGeometryAtFloor(definition, floor);
    const w = plan.resolve(definition.nightstand.w);
    const angle = geometry.rotation * Math.PI / 180;
    // Rotate each square's center around the bed's center, just like the bed.
    const dx = (side === "left" ? -1 : 1) * (geometry.w + w) / 2;
    const dy = (w - geometry.l) / 2;
    return {
      ...(id ? { id } : {}),
      label: "Criado-mudo",
      title: `Criado-mudo — ${definition.title || definition.label || "Cama"}`,
      classes: "furniture storage nightstand",
      color: "furniture",
      pos: [
        geometry.x + geometry.w / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - w / 2,
        geometry.y + geometry.l / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - w / 2,
        geometry.z0,
      ],
      size: [w, w, geometry.h],
      rotation: geometry.rotation,
      overlaps: definition.overlaps,
      overlays: definition.overlays,
    };
  },
  addItem(plan, item) {
    const resolvedItem = plan.resolveItemType(item);
    const element = plan.add({ ...resolvedItem, showLabel: true });
    element.allowedOverlaps = plan.normalizeOverlapTargets(
      resolvedItem.overlaps,
    );
    element.allowedOverlays = plan.normalizeOverlapTargets(
      resolvedItem.overlays,
    );
    plan.itemElements.push(element);
    if (resolvedItem.id && !FloorPlanValidation.isReservedId(resolvedItem.id)) {
      element.dataset.id = resolvedItem.id;
      plan.references.set(resolvedItem.id, element);
    }
    return element;
  },

  resolveItemType(plan, item) {
    if (item[this.nightstandSource]) {
      return this.resolveNightstand(plan, item[this.nightstandSource], item.id);
    }
    if (!item.type && item.nightstand === undefined) return item;
    const definition = item.type ? plan.itemTypes?.[item.type] : {};
    if (!definition) throw new Error(`Unknown item type: ${item.type}`);
    const result = {
      ...definition,
      ...item,
      size: item.size ?? definition.size,
      classes: item.classes ?? definition.classes,
      label: item.label ?? definition.label,
      title: item.title ?? definition.title ?? definition.label,
    };
    if (result.nightstand !== undefined) {
      const classes = String(result.classes || "").split(/\s+/);
      if (!["queen-bed", "twin-bed"].some((type) => classes.includes(type))) {
        throw new Error("Nightstand só pode ser usado em camas");
      }
      const settings = result.nightstand;
      if (!settings || typeof settings !== "object" || Array.isArray(settings)
        || Object.keys(settings).some((key) => !["w", "side"].includes(key))) {
        throw new Error("Nightstand aceita { w?: largura, side?: left | right | both | none }");
      }
      if (settings.side !== undefined && !["left", "right", "both", "none"].includes(settings.side)) {
        throw new Error("Nightstand.side precisa ser left, right, both ou none");
      }
      if (settings.side === "none" && settings.w === undefined) return result;
      const w = settings.w === undefined
        ? definition.nightstand?.w ?? (classes.includes("twin-bed") ? 0.4 : 0.5)
        : settings.w;
      const width = plan.resolve(w);
      if (!Number.isFinite(width) || width <= 0) {
        throw new Error("Nightstand.w precisa ser positivo");
      }
      result.nightstand = { ...settings, w };
    }
    return result;
  },

  addZone(plan, zone) {
    const element = plan.add({
      ...zone,
      showLabel: true,
      classes: `${zone.classes || ""} reference-zone`.trim(),
    });
    if (zone.color)
      element.style.setProperty(
        "--zone-line-color",
        plan.themeColor(zone.color),
      );
    element.dataset.id = zone.id;
    element.dataset.label = zone.label || zone.id;
    element.allowedOverlaps = [];
    plan.zoneElements.push(element);
    if (zone.id) plan.references.set(zone.id, element);
    return element;
  },

  addZones(plan, zones) {
    let pending = [...zones];
    while (pending.length) {
      const next = [];
      let added = 0;
      pending.forEach((zone, index) => {
        try {
          plan.addZone(zone);
          added += 1;
        } catch (error) {
          if (error.message.startsWith("Unknown room reference:"))
            next.push(zone);
          else
            plan.errors.push({
              index,
              id: zone.id,
              opening: zone,
              category: "zone",
              message: error.message,
            });
        }
      });
      if (!added) {
        next.forEach((zone) => {
          plan.errors.push({
            id: zone.id,
            opening: zone,
            category: "zone",
            message:
              "Não foi possível resolver as referências geométricas da zona",
          });
        });
        break;
      }
      pending = next;
    }
  },
};

window.FloorPlanElements = FloorPlanElements;
