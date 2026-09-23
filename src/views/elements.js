const FloorPlanElements = {
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
    if (!item.type) return item;
    const definition = plan.itemTypes?.[item.type];
    if (!definition) throw new Error(`Unknown item type: ${item.type}`);
    return {
      ...definition,
      ...item,
      type: item.type,
      size: item.size ?? definition.size,
      classes: item.classes ?? definition.classes,
      label: item.label ?? definition.label,
      title: item.title ?? definition.title ?? definition.label,
    };
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
