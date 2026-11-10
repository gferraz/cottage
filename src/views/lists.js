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
    this.updateProjectOverview(plan);
    this.updateTechnicalSections(plan);
  },

  updateTechnicalSections(plan) {
    const root = document.querySelector("#technical-floor-sections");
    if (!root) return;
    root.replaceChildren();
    const floors = plan.model?.floors ?? [
      { id: null, label: plan.currentConfig?.label || "Planta", rooms: [] },
    ];
    const floorRows = FloorPlanModel.floorRows(
      floors,
      plan.roomDefinitions,
      plan.roomReferences,
    );
    const groups = [
      ["rooms", "Cômodos"],
      ["items", "Itens"],
      ["roofs", "Telhados"],
      ["openings", "Passagens"],
      ["windows", "Janelas"],
      ["natural", "Comunicações naturais"],
    ];
    const renderers = {
      rooms: (target, floor) => this.updateRoomList(plan, target, floor),
      items: (target, floor) => this.updateItemList(plan, target, floor),
      roofs: (target, floor) => this.updateRoofList(plan, target, floor),
      openings: (target, floor) => this.updateOpeningList(plan, target, floor),
      windows: (target, floor) => this.updateWindowList(plan, target, floor),
      natural: (target, floor) => this.updateNaturalList(plan, target, floor),
    };

    floors.forEach((floor, index) => {
      const section = document.createElement("section");
      section.className = "technical-floor-section";
      section.setAttribute("aria-labelledby", `technical-floor-${index + 1}-title`);
      const heading = document.createElement("h3");
      heading.id = `technical-floor-${index + 1}-title`;
      heading.textContent = `05.${index + 1} — ${floor.label || floor.id || "Piso"}`;
      section.append(heading);

      const row = floorRows[index];
      const floorRooms = plan.allRooms.filter((room) => room.floorId === floor.id);
      const grossAreaTotal = floorRooms.reduce(
        (total, room) => total + room.reference.area(),
        0,
      );
      const summary = document.createElement("p");
      summary.className = "technical-floor-summary";
      summary.textContent = `${row?.count ?? 0} cômodos · área bruta somada: ${plan.formatFixed(grossAreaTotal)} m² · envelope: ${plan.formatFixed(row?.width ?? 0)} × ${plan.formatFixed(row?.height ?? 0)} m`;
      section.append(summary);

      const categories = document.createElement("div");
      categories.className = "technical-floor-categories";
      groups.forEach(([key, label]) => {
        const card = document.createElement("section");
        card.className = `technical-category technical-category-${key}`;
        const title = document.createElement("h4");
        title.textContent = label;
        const list = document.createElement("div");
        list.className = "technical-category-list";
        card.append(title, list);
        categories.append(card);
        renderers[key](list, floor);
      });
      section.append(categories);
      root.append(section);
    });

    if (plan.errors.length) {
      const errors = document.createElement("section");
      errors.className = "technical-global-errors";
      const heading = document.createElement("h3");
      heading.textContent = "Itens com erro";
      const list = document.createElement("div");
      errors.append(heading, list);
      this.updateErrorList(plan, list);
      root.append(errors);
    }
  },

  updateProjectOverview(plan) {
    const config = plan.currentConfig ?? {};
    const floors = config.floors ?? [
      { id: config.id, label: config.label, rooms: config.rooms ?? [] },
    ];
    const floorRows = FloorPlanModel.floorRows(
      floors,
      plan.roomDefinitions,
      plan.roomReferences,
    );
    const area = floorRows.reduce((total, row) => total + row.area, 0);
    const style =
      config.style ??
      config.architectural_style ??
      config.metadata?.style ??
      config.project?.style;
    document.querySelector(".project-facts")?.classList.toggle("has-style", Boolean(style));
    const styleFact = document.querySelector("#project-style-fact");
    if (styleFact) {
      styleFact.hidden = !style;
      document.querySelector("#project-style").textContent = style || "";
    }
    const description =
      config.summary ??
      config.description ??
      config.metadata?.summary ??
      config.metadata?.description ??
      config.project?.summary ??
      config.project?.description;
    const descriptionElement = document.querySelector("#project-description");
    if (descriptionElement) {
      descriptionElement.textContent = description || "";
      descriptionElement.hidden = !description;
    }
    const terrainFact = document.querySelector("#project-terrain-fact");
    const hasTerrainArea = plan.terrainArea > 0;
    if (terrainFact) terrainFact.hidden = !hasTerrainArea;
    const terrainAreaElement = document.querySelector("#project-terrain-area");
    if (terrainAreaElement) {
      terrainAreaElement.textContent = hasTerrainArea
        ? `${plan.formatMeters(plan.terrainArea)} m²`
        : "—";
    }
    const coordinates = Array.isArray(config.coordinates)
      ? config.coordinates.filter(Boolean).join(" · ")
      : typeof config.coordinates === "string"
        ? config.coordinates
        : [config.coordinates?.latitude ?? config.coordinates?.lat, config.coordinates?.longitude ?? config.coordinates?.lon]
          .filter(Boolean)
          .join(" · ");
    const coordinatesFact = document.querySelector("#project-coordinates-fact");
    if (coordinatesFact) coordinatesFact.hidden = !coordinates;
    const coordinatesElement = document.querySelector("#project-coordinates");
    if (coordinatesElement) {
      coordinatesElement.textContent = coordinates || "—";
      if (coordinates) {
        coordinatesElement.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
      } else {
        coordinatesElement.removeAttribute("href");
      }
    }
    document.querySelector("#project-area").textContent =
      `${plan.formatMeters(area)} m²`;
    document.querySelector("#project-floor-count").textContent =
      String(floors.length);
    document.querySelector("#project-floor-labels").textContent = floors
      .map((floor) => floor.label || floor.id)
      .filter(Boolean)
      .join(" · ");

    const categoryLabels = {
      social: "Social",
      intimate: "Íntimo",
      service: "Serviço",
      circulation: "Circulação",
      outdoor: "Externo",
      work: "Trabalho",
      other: "Outros",
    };
    const categoryForRoom = (room) => {
      const explicit = String(room.category ?? room.type ?? "").toLowerCase();
      if (categoryLabels[explicit]) return explicit;
      const tokens = new Set(String(room.classes ?? "").toLowerCase().split(/\s+/));
      const id = String(room.id ?? "").toLowerCase();
      if (tokens.has("outdoor") || tokens.has("porch") || tokens.has("terrace")) return "outdoor";
      if (tokens.has("circulation") || /^(hall|corridor|stairs|stair)/.test(id)) return "circulation";
      if (tokens.has("office") || id === "office") return "work";
      if (["living", "dining", "kitchen", "playroom"].some((token) => tokens.has(token)) || /^(living|dining|kitchen|playroom)/.test(id)) return "social";
      if (["master", "bedroom", "closet"].some((token) => tokens.has(token)) || /^(master|bedroom|closet|prayer-room|vestibule)/.test(id)) return "intimate";
      if (tokens.has("service") || /^(garage|laundry|pantry|mudroom)/.test(id)) return "service";
      if (tokens.has("wet") || /^(powder|bathroom)/.test(id)) return "service";
      return "other";
    };
    const counts = new Map();
    floors.forEach((floor) => {
      (floor.rooms ?? []).forEach((room) => {
        if (!room.id || plan.roomDefinitions.get(room.id) !== room) return;
        if (String(room.classes ?? "").split(/\s+/).includes("stair-flight")) return;
        const category = categoryForRoom(room);
        counts.set(category, (counts.get(category) ?? 0) + 1);
      });
    });
    const roomTypes = document.querySelector("#project-room-types");
    roomTypes?.replaceChildren();
    [...counts.entries()]
      .sort((first, second) =>
        categoryLabels[first[0]].localeCompare(categoryLabels[second[0]], "pt-BR"),
      )
      .forEach(([category, count]) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = categoryLabels[category];
        const value = document.createElement("strong");
        value.textContent = String(count).padStart(2, "0");
        item.append(label, value);
        roomTypes?.append(item);
      });
  },

  updateRoomList(plan, target = plan.roomList, floor = null) {
    if (!target) return;

    target.replaceChildren();
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
    target.append(header);
    const rooms = (plan.allRooms.length
      ? plan.allRooms
      : plan.roomElements.map((reference) => ({
          id: reference.dataset.id,
          label: reference.dataset.label,
          reference,
        }))).filter((entry) => !floor || entry.floorId === floor.id);
    let grossTotal = 0;
    let netTotal = 0;
    rooms.forEach((roomEntry, index) => {
      const room = roomEntry.reference || roomEntry;
      const activeRoom = plan.roomElements.find(
        (candidate) => candidate.dataset.id === roomEntry.id,
      );
      const item = document.createElement("div");
      item.className = "room-list-item";

      const label = document.createElement("span");
      label.textContent = `${index + 1}. ${roomEntry.label || room.dataset.label || "Cômodo"}`;

      const grossArea = document.createElement("span");
      const netArea = document.createElement("span");
      const roomGrossArea = room.area();
      const roomNetArea = activeRoom?.netArea ?? roomGrossArea;
      grossTotal += roomGrossArea;
      netTotal += roomNetArea;
      grossArea.textContent = plan.formatFixed(roomGrossArea);
      netArea.textContent = plan.formatFixed(roomNetArea);

      const width = document.createElement("span");
      width.textContent = plan.formatFixed(room.w());

      const height = document.createElement("span");
      height.textContent = plan.formatFixed(room.l());

      item.append(label, width, height, grossArea, netArea);
      target.append(item);
    });
    if (floor && rooms.length) {
      const total = document.createElement("div");
      total.className = "room-list-item room-list-total";
      ["Total do piso", "—", "—", plan.formatFixed(grossTotal), plan.formatFixed(netTotal)].forEach((value) => {
        const cell = document.createElement("span");
        cell.textContent = value;
        total.append(cell);
      });
      target.append(total);
    }
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

  updateItemList(plan, target = plan.itemList, floor = null) {
    if (!target) return;

    target.replaceChildren();
    const items = plan.allItems.filter((item) => !floor || item.floorId === floor.id);
    if (items.length === 0) {
      target.textContent = "Nenhum item carregado.";
      return;
    }
    items.forEach((item, index) => {
      const entry = document.createElement("div");
      entry.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = `${index + 1}. ${item.label || item.title || "Item"}`;
      const details = document.createElement("span");
      const rotation = Number(item.rotation ?? 0);
      details.textContent = `${plan.formatMeters(item.w)}m × ${plan.formatMeters(item.l)}m${rotation ? ` · Rotação: ${plan.formatMeters(rotation)}°` : ""}`;
      entry.append(title, details);
      target.append(entry);
    });
  },

  updateRoofList(plan, target = plan.roofList, floor = null) {
    if (!target) return;

    target.replaceChildren();
    const roofs = plan.allRoofs.filter((roof) => !floor || roof.floorId === floor.id);
    if (roofs.length === 0) {
      target.textContent = "Nenhum telhado carregado.";
      return;
    }

    const scroll = document.createElement("div");
    scroll.className = "roof-schedule-scroll";
    const table = document.createElement("table");
    table.className = "roof-schedule-table";
    const headings = [
      "Telhado",
      "Tipo",
      "Cumeeira / borda alta",
      "Dimensões (m)",
      "Cota base (m)",
      "Altura (m)",
      "Superfície (m²)",
      "Inclinação",
      "Beiral (m)",
      "Empena (m)",
    ];
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    headings.forEach((label) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headingRow.append(cell);
    });
    head.append(headingRow);
    table.append(head);
    const body = document.createElement("tbody");

    roofs.forEach((roof, index) => {
      const row = document.createElement("tr");
      const title = document.createElement("th");
      title.scope = "row";
      title.textContent = `${index + 1}. ${roof.label || roof.id || "Telhado"}`;
      let base;
      let roofFloor = floor;
      try {
        roofFloor ??= FloorPlanRoofs.floorForRoof(plan, roof, roof.base ?? roof);
        base = FloorPlanRoofs.resolveBase(plan, roof.base ?? roof, roofFloor);
      } catch {
        base = null;
      }
      const pitch = Number(roof.pitch);
      const [eave0, eave1] = FloorPlanRoofs.eavePair(roof);
      const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
      let values = [
        plan.roofTypeLabel(roof.type),
        plan.roofOrientationLabel(roof.orientation),
        "—",
        "—",
        "—",
        "—",
        Number.isFinite(pitch) ? `${plan.formatMeters(pitch)}°` : "—",
        FloorPlanRoofs.formatOverhang(plan, FloorPlanRoofs.eavePair(roof)),
        FloorPlanRoofs.formatOverhang(plan, roof.rake),
      ];
      if (base && Number.isFinite(pitch)) {
        const longitudinal = roof.orientation === "longitudinal";
        const baseWidth = base.w();
        const baseLength = base.l();
        const roofWidth =
          baseWidth + (longitudinal ? eave0 + eave1 : rake0 + rake1);
        const roofLength =
          baseLength + (longitudinal ? rake0 + rake1 : eave0 + eave1);
        const ridgeLength = longitudinal ? roofLength : roofWidth;
        const rise =
          ((longitudinal ? baseWidth : baseLength) / (roof.type === "shed" ? 1 : 2)) *
          Math.tan((pitch * Math.PI) / 180);
        const baseSpan = longitudinal ? baseWidth : baseLength;
        const slopeA = longitudinal ? eave0 : rake0;
        const slopeB = longitudinal ? eave1 : rake1;
        const roofSurfaceArea = roof.eaves?.pitch !== undefined
          ? FloorPlanRoofs.surfaceArea(roof, baseSpan, ridgeLength)
          : roof.type === "shed"
          ? roofWidth * roofLength / Math.cos(pitch * Math.PI / 180)
          : (Math.hypot(baseSpan / 2 + slopeA, rise) +
            Math.hypot(baseSpan / 2 + slopeB, rise)) *
          ridgeLength;
        const baseElevation =
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : base.z1
              ? base.z1()
              : 0;
        values = [
          plan.roofTypeLabel(roof.type),
          FloorPlanRoofs.axisLabel(plan, roof, ridgeLength),
          `${plan.formatMeters(roofWidth)} × ${plan.formatMeters(roofLength)}`,
          plan.formatMeters(baseElevation),
          plan.formatMeters(rise),
          plan.formatMeters(roofSurfaceArea),
          `${plan.formatMeters(pitch)}°${roof.eaves?.pitch !== undefined ? ` / beiral ${plan.formatMeters(FloorPlanRoofs.eavePitch(roof))}°` : ""}`,
          FloorPlanRoofs.formatOverhang(plan, FloorPlanRoofs.eavePair(roof)),
          FloorPlanRoofs.formatOverhang(plan, roof.rake),
        ];
      }
      row.append(title);
      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    scroll.append(table);
    target.append(scroll);
  },

  updateOpeningList(plan, target = plan.openingList, floor = null) {
    if (!target) return;

    target.replaceChildren();
    const openings = (plan.allOpenings.length ? plan.allOpenings : plan.openings)
      .filter((opening) => !floor || opening.floorId === floor.id);
    if (openings.length === 0) {
      target.textContent = "Nenhuma passagem carregada.";
      return;
    }

    openings.forEach((opening) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";

      const title = document.createElement("strong");
      title.textContent = opening.id;

      const details = document.createElement("span");
      const from =
        plan.roomDefinitions.get(opening.roomId)?.label || opening.roomId;
      const to =
        opening.to === "exterior"
          ? "EXTERIOR"
          : plan.roomDefinitions.get(opening.to)?.label || opening.to;
      details.textContent = `${opening.type} — ${from} → ${to} (${plan.formatMeters(opening.w)}m)`;

      item.append(title, details);
      target.append(item);
    });
  },

  updateWindowList(plan, target = plan.windowList, floor = null) {
    if (!target) return;

    target.replaceChildren();
    const windows = (plan.allWindows.length ? plan.allWindows : plan.windows)
      .filter((window) => !floor || window.floorId === floor.id);
    if (windows.length === 0) {
      target.textContent = "Nenhuma janela carregada.";
      return;
    }

    windows.forEach((window) => {
      const item = document.createElement("div");
      item.className = "opening-list-item";
      const title = document.createElement("strong");
      title.textContent = window.id;
      const details = document.createElement("span");
      const from =
        plan.roomDefinitions.get(window.roomId)?.label || window.roomId;
      const to =
        window.to === "exterior"
          ? "EXTERIOR"
          : plan.roomDefinitions.get(window.to)?.label || window.to;
      details.textContent = `${from} → ${to} (${plan.formatMeters(window.w)}m)`;
      item.append(title, details);
      target.append(item);
    });
  },

  findNaturalCommunications(plan, rooms = plan.roomElements) {
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
        const firstFloor = plan.roomFloorConfigs?.get(first.dataset.id);
        const secondFloor = plan.roomFloorConfigs?.get(second.dataset.id);
        if (firstFloor && secondFloor && firstFloor.id !== secondFloor.id) continue;

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
          let gaps = [[start, end]];
          const epsilon = 1e-9;
          const floorZ = Number(firstFloor?.z0 ?? first.z0?.() ?? 0);
          for (const wall of plan.independentWalls?.values() ?? []) {
            if (wall.scopeFloorId && firstFloor && wall.scopeFloorId !== firstFloor.id) continue;
            // Somente paredes que alcançam o piso fecham a passagem em planta.
            if (wall.z0 > floorZ + epsilon || wall.z1 <= floorZ + epsilon) continue;
            const points = wall.path?.points ?? [];
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
            firstLabel: first.dataset.label || firstId,
            secondLabel: second.dataset.label || secondId,
            orientation,
            length,
          });
        }
      }
    }

    return communications;
  },

  updateNaturalList(plan, target = plan.naturalList, floor = null) {
    if (!target) return;

    const rooms = floor
      ? plan.allRooms.filter((room) => room.floorId === floor.id).map((room) => room.reference)
      : plan.roomElements;
    const communications = this.findNaturalCommunications(plan, rooms);
    if (!floor) plan.naturalCommunications = communications;
    target.replaceChildren();
    if (communications.length === 0) {
      target.textContent = "Nenhuma comunicação natural detectada.";
      return;
    }

    communications.forEach((communication) => {
      const item = document.createElement("div");
      item.className = "natural-list-item";

      const title = document.createElement("strong");
      title.textContent = communication.id;

      const details = document.createElement("span");
      details.textContent = `abertura sem parede — ${communication.firstLabel} → ${communication.secondLabel} (${plan.formatMeters(communication.length)}m)`;

      item.append(title, details);
      target.append(item);
    });
  },

  updateErrorList(plan, target = plan.errorList) {
    if (!target) return;

    target.replaceChildren();
    if (plan.errors.length === 0) {
      target.textContent = "Nenhum erro.";
      return;
    }

    plan.errors.forEach(
      (error) => {
        const { index, id, opening, category = "opening", message } = error;
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
          wall: "Parede",
        };
        const name = id || (index === undefined ? "" : ` ${index + 1}`);
        item.textContent = `${labels[category] || "Erro"}${name ? ` ${name}` : ""}: ${message} `;
        const location = error.location ?? FloorPlanParser.errorLocation(error, plan.currentConfig);
        if (location) {
          const sourceLocation = document.createElement("div");
          sourceLocation.className = "error-source-location";
          sourceLocation.textContent = FloorPlanParser.formatLocation(location);
          item.append(sourceLocation);
        }
        const source = document.createElement("code");
        if (opening !== undefined) source.textContent = JSON.stringify(opening);
        item.append(source);
        target.append(item);
      },
    );
  },
};

window.FloorPlanLists = FloorPlanLists;
