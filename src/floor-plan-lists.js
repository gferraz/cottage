const FloorPlanLists = {
  updateSummary(plan) {
    plan.roomElements.forEach((room) => {
      room.netArea = plan.calculateNetRoomArea(room);
    });
    plan.roomArea = plan.roomElements.reduce(
      (total, room) => total + room.netArea,
      0,
    );
    if (plan.roomCountSummary) {
      plan.roomCountSummary.textContent = `Total de cômodos: ${plan.roomCount}`;
    }
    if (plan.summary) {
      plan.summary.textContent = `Área total: ${plan.formatMeters(plan.roomArea)}m²`;
    }
    if (plan.boundsSummary) {
      const bounds = plan.bounds();
      plan.boundsSummary.textContent = bounds
        ? `Dimensões máximas: ${plan.formatMeters(bounds.width)}m × ${plan.formatMeters(bounds.height)}m`
        : "Dimensões máximas: —";
    }
    if (plan.terrainSummary) {
      plan.terrainSummary.textContent =
        plan.terrainArea > 0
          ? `Área calculada do terreno: ${plan.formatMeters(plan.terrainArea)}m²`
          : "Área calculada do terreno: —";
    }
    plan.updateRoomList();
    plan.updateFloorSummary();
    plan.updateItemList();
    plan.updateRoofList();
    plan.updateOpeningList();
    plan.updateWindowList();
    plan.updateNaturalList();
    plan.updateErrorList();
  },

  updateRoomList(plan) {
    if (!plan.roomList) return;

    plan.roomList.replaceChildren();
    const header = document.createElement("div");
    header.className = "room-list-header";
    [
      "Cômodo",
      "Largura (m)",
      "Comprimento (m)",
      "Bruta (m²)",
      "Útil (m²)",
    ].forEach((text) => {
      const cell = document.createElement("span");
      cell.textContent = text;
      header.append(cell);
    });
    plan.roomList.append(header);
    const rooms = plan.allRooms.length
      ? plan.allRooms
      : plan.roomElements.map((reference) => ({
          id: reference.dataset.id,
          label: reference.dataset.label,
          reference,
        }));
    rooms.forEach((roomEntry, index) => {
      const room = roomEntry.reference || roomEntry;
      const activeRoom = plan.roomElements.find(
        (candidate) => candidate.dataset.id === roomEntry.id,
      );
      const item = document.createElement("div");
      item.className = "room-list-item";

      const label = document.createElement("span");
      label.textContent = `${index + 1}. ${roomEntry.label || room.dataset.label || "Cômodo"}${roomEntry.floorLabel ? ` (${roomEntry.floorLabel})` : ""}`;

      const grossArea = document.createElement("span");
      grossArea.textContent = plan.formatFixed(room.area());

      const netArea = document.createElement("span");
      netArea.textContent = plan.formatFixed(
        activeRoom?.netArea ?? room.area(),
      );

      const width = document.createElement("span");
      width.textContent = plan.formatFixed(room.w());

      const height = document.createElement("span");
      height.textContent = plan.formatFixed(room.l());

      item.append(label, width, height, grossArea, netArea);
      plan.roomList.append(item);
    });
  },

  updateFloorSummary(plan) {
    if (!plan.floorSummary) return;
    const floors = plan.model?.floors ?? [
      { id: null, label: "Planta", rooms: [] },
    ];
    const rows = FloorPlanModel.floorRows(
      floors,
      plan.roomDefinitions,
      plan.roomReferences,
    );
    const total = {
      label: "Total geral",
      count: rows.reduce((sum, row) => sum + row.count, 0),
      width: rows.length ? Math.max(...rows.map((row) => row.width)) : 0,
      height: rows.length ? Math.max(...rows.map((row) => row.height)) : 0,
      area: rows.reduce((sum, row) => sum + row.area, 0),
    };
    const terrain = plan.terrainDimensions
      ? {
          label: "Terreno",
          count: "—",
          width: plan.terrainDimensions.width,
          height: plan.terrainDimensions.height,
          area: plan.terrainArea,
        }
      : null;
    const table = document.createElement("table");
    table.className = "floor-summary-table";
    table.innerHTML =
      "<thead><tr><th>Local</th><th>Cômodos</th><th>Largura máx.</th><th>Comprimento máx.</th><th>Área</th></tr></thead>";
    const body = document.createElement("tbody");
    [...rows, total, ...(terrain ? [terrain] : [])].forEach((row) => {
      const tr = document.createElement("tr");
      if (row === total) tr.className = "floor-summary-total";
      [
        row.label,
        row.count,
        plan.formatFixed(row.width),
        plan.formatFixed(row.height),
        plan.formatFixed(row.area),
      ].forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        cell.textContent =
          index > 1 ? `${value} ${index === 4 ? "m²" : "m"}` : value;
        tr.append(cell);
      });
      body.append(tr);
    });
    table.append(body);
    plan.floorSummary.replaceChildren(table);
  },

  updateItemList(plan) {
    if (!plan.itemList) return;

    plan.itemList.replaceChildren();
    if (plan.allItems.length === 0) {
      plan.itemList.textContent = "Nenhum item carregado.";
      return;
    }
    plan.allItems.forEach((item, index) => {
      const entry = document.createElement("div");
      entry.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = `${index + 1}. ${item.label || item.title || "Item"}`;
      const details = document.createElement("span");
      details.textContent = `${plan.formatMeters(item.w)}m × ${plan.formatMeters(item.l)}m${item.floorLabel ? ` — ${item.floorLabel}` : ""}`;
      entry.append(title, details);
      plan.itemList.append(entry);
    });
  },

  updateRoofList(plan) {
    if (!plan.roofList) return;

    plan.roofList.replaceChildren();
    if (plan.allRoofs.length === 0) {
      plan.roofList.textContent = "Nenhum telhado carregado.";
      return;
    }

    plan.allRoofs.forEach((roof, index) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = `${index + 1}. ${roof.label || roof.id || "Telhado"}`;
      const details = document.createElement("span");
      const base = plan.references.get(String(roof.base));
      const pitch = Number(roof.pitch);
      const eave = Number(roof.eave ?? 0);
      const rake = Number(roof.rake ?? 0);
      if (!base || !Number.isFinite(pitch)) {
        details.textContent = `base: ${roof.base || "—"}${roof.floorLabel ? ` — ${roof.floorLabel}` : ""}`;
      } else {
        const longitudinal = roof.orientation === "longitudinal";
        const baseWidth = base.w();
        const baseLength = base.l();
        const roofWidth = baseWidth + 2 * (longitudinal ? eave : rake);
        const roofLength = baseLength + 2 * (longitudinal ? rake : eave);
        const ridgeLength = longitudinal ? roofLength : roofWidth;
        const rise =
          ((longitudinal ? baseWidth : baseLength) / 2) *
          Math.tan((pitch * Math.PI) / 180);
        const baseSpan = longitudinal ? baseWidth : baseLength;
        const slopeLength = Math.hypot(baseSpan / 2 + eave, rise);
        const roofSurfaceArea = 2 * slopeLength * ridgeLength;
        const baseElevation =
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : base.z1
              ? base.z1()
              : 0;
        details.textContent = `Tipo: ${plan.roofTypeLabel(roof.type)} — Cumeeira: ${plan.roofOrientationLabel(roof.orientation)} (${plan.formatMeters(ridgeLength)}m) — ${plan.formatMeters(roofWidth)}m × ${plan.formatMeters(roofLength)}m — Cota base: ${plan.formatMeters(baseElevation)}m — Altura: ${plan.formatMeters(rise)}m — Superfície: ${plan.formatMeters(roofSurfaceArea)}m² — Inclinação: ${plan.formatMeters(pitch)}° — Beiral: ${plan.formatMeters(eave)}m — Empena: ${plan.formatMeters(rake)}m${roof.floorLabel ? ` — ${roof.floorLabel}` : ""}`;
      }
      item.append(title, details);
      plan.roofList.append(item);
    });
  },

  updateOpeningList(plan) {
    if (!plan.openingList) return;

    plan.openingList.replaceChildren();
    const openings = plan.allOpenings.length ? plan.allOpenings : plan.openings;
    if (openings.length === 0) {
      plan.openingList.textContent = "Nenhuma passagem carregada.";
      return;
    }

    openings.forEach((opening) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";

      const title = document.createElement("strong");
      title.textContent = opening.id;

      const details = document.createElement("span");
      const from =
        plan.rooms.get(opening.roomId)?.dataset.label || opening.roomId;
      const to =
        opening.to === "exterior"
          ? "EXTERIOR"
          : plan.rooms.get(opening.to)?.dataset.label || opening.to;
      details.textContent = `${opening.type} — ${from} → ${to} (${plan.formatMeters(opening.w)}m)${opening.floorLabel ? ` — ${opening.floorLabel}` : ""}`;

      item.append(title, details);
      plan.openingList.append(item);
    });
  },

  updateWindowList(plan) {
    if (!plan.windowList) return;

    plan.windowList.replaceChildren();
    const windows = plan.allWindows.length ? plan.allWindows : plan.windows;
    if (windows.length === 0) {
      plan.windowList.textContent = "Nenhuma janela carregada.";
      return;
    }

    windows.forEach((window) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = window.id;
      const details = document.createElement("span");
      const from =
        plan.rooms.get(window.roomId)?.dataset.label || window.roomId;
      const to =
        window.to === "exterior"
          ? "EXTERIOR"
          : plan.rooms.get(window.to)?.dataset.label || window.to;
      details.textContent = `${from} → ${to} (${plan.formatMeters(window.w)}m)${window.floorLabel ? ` — ${window.floorLabel}` : ""}`;
      item.append(title, details);
      plan.windowList.append(item);
    });
  },

  findNaturalCommunications(plan) {
    const communications = [];
    const pairs = [
      ["right", "left", "vertical"],
      ["bottom", "top", "horizontal"],
    ];
    for (let index = 0; index < plan.roomElements.length; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < plan.roomElements.length;
        otherIndex += 1
      ) {
        const first = plan.roomElements[index];
        const second = plan.roomElements[otherIndex];

        for (const [firstSide, secondSide, orientation] of pairs) {
          if (
            first.wallState(firstSide) === "solid" ||
            second.wallState(secondSide) === "solid"
          )
            continue;

          const firstSegment = plan.wallSegment(first, firstSide);
          const secondSegment = plan.wallSegment(second, secondSide);
          if (
            Math.abs(firstSegment.coordinate - secondSegment.coordinate) >= 1e-9
          )
            continue;

          const start = Math.max(firstSegment.start, secondSegment.start);
          const end = Math.min(firstSegment.end, secondSegment.end);
          if (end <= start) continue;

          const firstId = first.dataset.id || `room-${index + 1}`;
          const secondId = second.dataset.id || `room-${otherIndex + 1}`;
          communications.push({
            id: `${firstId}-${secondId}`,
            firstId,
            secondId,
            firstLabel: first.dataset.label || firstId,
            secondLabel: second.dataset.label || secondId,
            orientation,
            length: end - start,
          });
        }
      }
    }

    return communications;
  },

  updateNaturalList(plan) {
    if (!plan.naturalList) return;

    plan.naturalCommunications = plan.findNaturalCommunications();
    plan.naturalList.replaceChildren();
    if (plan.naturalCommunications.length === 0) {
      plan.naturalList.textContent = "Nenhuma comunicação natural detectada.";
      return;
    }

    plan.naturalCommunications.forEach((communication) => {
      const item = document.createElement("div");
      item.className = "natural-list-item";

      const title = document.createElement("strong");
      title.textContent = communication.id;

      const details = document.createElement("span");
      details.textContent = `abertura sem parede — ${communication.firstLabel} → ${communication.secondLabel} (${plan.formatMeters(communication.length)}m)`;

      item.append(title, details);
      plan.naturalList.append(item);
    });
  },

  updateErrorList(plan) {
    if (!plan.errorList) return;

    plan.errorList.replaceChildren();
    if (plan.errors.length === 0) {
      plan.errorList.textContent = "Nenhum erro.";
      return;
    }

    plan.errors.forEach(
      ({ index, id, opening, category = "opening", message }) => {
        const item = document.createElement("div");
        item.className = "error-list-item";
        const labels = {
          window: "Janela",
          item: "Item",
          room: "Cômodo",
          presentation: "Apresentação",
          opening: "Passagem",
          collision: "Colisão",
          overlap: "Sobreposição",
          zone: "Zona",
          object: "Objeto",
          guide: "Guia",
          floor: "Piso",
        };
        const name = id || (index === undefined ? "" : ` ${index + 1}`);
        item.textContent = `${labels[category] || "Erro"}${name ? ` ${name}` : ""}: ${message} `;
        const source = document.createElement("code");
        if (opening !== undefined) source.textContent = JSON.stringify(opening);
        item.append(source);
        plan.errorList.append(item);
      },
    );
  },
};

window.FloorPlanLists = FloorPlanLists;
