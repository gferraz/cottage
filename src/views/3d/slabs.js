const FloorPlanSlabs = {
  collect(plan) {
    const floors = plan.currentConfig?.floors ?? [plan.currentConfig];
    return floors.flatMap((floor, index) => {
      if (!floor) return [];
      const rectangles = (floor.rooms ?? []).flatMap((room) => {
        const isStair = (entry) => /\bstair-(flight|landing)\b/.test(entry.classes ?? "");
        if (isStair(room) || (room.parts?.length && room.parts.every(isStair))) return [];
        return plan.getRoomGeometry(room.id)?.geometryParts ?? [];
      }).filter(({ x, y, w, l }) => [x, y, w, l].every(Number.isFinite) && w > 0 && l > 0);
      // Partition the union so adjacent/overlapping rooms never stack concrete.
      const parts = FloorPlanGeometryOperations.partitionRectangles(rectangles);
      return (floor.slabs ?? [{ id: `slab-${floor.id ?? index}`, label: `Laje — ${floor.label || floor.id || "Piso"}`, thickness: 0.15 }]).map((definition) => {
        const thickness = Number(definition.thickness ?? 0.15);
        if (!Number.isFinite(thickness) || thickness <= 0) throw new Error("A espessura da laje deve ser positiva.");
        return { ...definition, key: `${floor.id ?? index}:${definition.id}`, floorId: floor.id,
          label: definition.label || definition.id || "Laje", thickness, z: Number(floor.z0 ?? 0), parts };
      });
    });
  },

  updateList(plan) {
    const target = document.querySelector("#slab-list");
    if (!target) return;
    target.replaceChildren();
    for (const slab of plan.allSlabs ?? []) {
      if (plan.selectedFloorIds && !plan.selectedFloorIds.has(slab.floorId)) continue;
      const label = document.createElement("label");
      label.className = "slab-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !plan.hiddenSlabs.has(slab.key);
      input.addEventListener("change", () => {
        if (input.checked) plan.hiddenSlabs.delete(slab.key);
        else plan.hiddenSlabs.add(slab.key);
        plan.renderFacade3D();
      });
      const text = document.createElement("span");
      text.textContent = slab.label;
      const details = document.createElement("small");
      details.textContent = `Cota ${plan.formatMeters(slab.z)} m · espessura ${plan.formatMeters(slab.thickness)} m`;
      text.append(details);
      label.append(input, text);
      target.append(label);
    }
  },

  render({ plan, THREE, scene }) {
    const material = new THREE.MeshLambertMaterial({ color: "#c9c5ba" });
    for (const slab of plan.allSlabs ?? []) {
      if (plan.selectedFloorIds && !plan.selectedFloorIds.has(slab.floorId)) continue;
      if (plan.hiddenSlabs?.has(slab.key) || (plan.visibleFloor && slab.floorId !== plan.visibleFloor.id)) continue;
      const group = new THREE.Group();
      group.name = slab.label;
      group.userData.domainId = slab.key;
      for (const part of slab.parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(part.w, part.l, slab.thickness), material);
        mesh.position.set(part.x + part.w / 2, part.y + part.l / 2, slab.z - slab.thickness / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      scene.add(group);
    }
  },
};
window.FloorPlanSlabs = FloorPlanSlabs;
