const FloorPlanTextExport = {
  asciiLayout(plan) {
    const bounds = plan.bounds();
    if (!bounds) return "(nenhum cômodo carregado)";

    const step = 0.25;
    const columns = Math.ceil(bounds.width / step) + 1;
    const rows = Math.ceil(bounds.height / step) + 1;
    const grid = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, () => ({ mask: 0, character: " " })),
    );
    const directions = { north: 1, east: 2, south: 4, west: 8 };
    const column = (value) =>
      Math.max(
        0,
        Math.min(columns - 1, Math.round((value - bounds.x0) / step)),
      );
    const row = (value) =>
      Math.max(0, Math.min(rows - 1, Math.round((value - bounds.y0) / step)));
    const connect = (x, y, direction) => {
      if (x < 0 || x >= columns || y < 0 || y >= rows) return;
      grid[y][x].mask |= direction;
    };
    const remove = (x, y, direction) => {
      if (x < 0 || x >= columns || y < 0 || y >= rows) return;
      grid[y][x].mask &= ~direction;
    };
    const setVirtual = (x, y, character) => {
      if (x < 0 || x >= columns || y < 0 || y >= rows) return;
      if (grid[y][x].mask === 0) grid[y][x].character = character;
    };
    const addHorizontal = (x, y, state) => {
      if (state === "open") return;
      if (state === "virtual") return setVirtual(x, y, "┄");
      connect(x, y, directions.east | directions.west);
    };
    const addVertical = (x, y, state) => {
      if (state === "open") return;
      if (state === "virtual") return setVirtual(x, y, "┆");
      connect(x, y, directions.north | directions.south);
    };
    const glyphs = {
      0: "  ",
      1: "│ ",
      2: "──",
      3: "└─",
      4: "│ ",
      5: "│ ",
      6: "┌─",
      7: "├─",
      8: "─ ",
      9: "┘ ",
      10: "──",
      11: "┴ ",
      12: "┐ ",
      13: "┤ ",
      14: "┬ ",
      15: "┼ ",
    };

    plan.roomElements.forEach((room) => {
      const left = column(room.x0());
      const right = column(room.x1());
      const top = row(room.y0());
      const bottom = row(room.y1());
      const walls = room.walls || {};
      const horizontal = (y, state) => {
        for (let x = left; x <= right; x += 1) addHorizontal(x, y, state);
      };
      const vertical = (x, state) => {
        for (let y = top; y <= bottom; y += 1) addVertical(x, y, state);
      };
      horizontal(top, walls.top);
      horizontal(bottom, walls.bottom);
      vertical(left, walls.left);
      vertical(right, walls.right);

      const label = (
        room.dataset.label ||
        room.dataset.id ||
        "Cômodo"
      ).toUpperCase();
      const labelRow = Math.min(
        bottom - 1,
        Math.max(top + 1, Math.round((top + bottom) / 2)),
      );
      const available = Math.max(0, right - left - 1);
      if (available > 1) {
        const text = label.slice(0, available);
        const start =
          left + 1 + Math.max(0, Math.floor((available - text.length) / 2));
        [...text].forEach((character, index) => {
          if (start + index < right && grid[labelRow][start + index].mask === 0)
            grid[labelRow][start + index].character = character;
        });
      }
    });

    plan.openings.forEach((opening) => {
      const room = plan.rooms.get(opening.roomId);
      if (!room) return;
      const wall = opening.wall;
      const start = opening.position;
      const end = start + opening.w;
      const horizontal = wall === "top" || wall === "bottom";
      const startPoint = horizontal ? room.x0() : room.y0();
      const from = Math.round(
        (startPoint + start - (horizontal ? bounds.x0 : bounds.y0)) / step,
      );
      const to = Math.round(
        (startPoint + end - (horizontal ? bounds.x0 : bounds.y0)) / step,
      );
      const fixed = horizontal
        ? row(wall === "top" ? room.y0() : room.y1())
        : column(wall === "left" ? room.x0() : room.x1());
      for (let position = from; position <= to; position += 1) {
        if (horizontal) {
          grid[fixed][position].mask = 0;
          grid[fixed][position].character = " ";
        } else {
          grid[position][fixed].mask = 0;
          grid[position][fixed].character = " ";
        }
      }
      if (to > from) {
        if (horizontal) {
          remove(from - 1, fixed, directions.east);
          remove(to + 1, fixed, directions.west);
          const inward = wall === "top" ? directions.south : directions.north;
          grid[fixed][from].mask =
            wall === "top"
              ? directions.south | directions.west
              : directions.north | directions.west;
          grid[fixed][to].mask =
            wall === "top"
              ? directions.south | directions.east
              : directions.north | directions.east;
          grid[fixed][from].mask |= inward;
          grid[fixed][to].mask |= inward;
        } else {
          remove(fixed, from - 1, directions.south);
          remove(fixed, to + 1, directions.north);
          const inward = wall === "left" ? directions.east : directions.west;
          grid[from][fixed].mask =
            wall === "left"
              ? directions.north | directions.east
              : directions.north | directions.west;
          grid[to][fixed].mask =
            wall === "left"
              ? directions.south | directions.east
              : directions.south | directions.west;
          grid[from][fixed].mask |= inward;
          grid[to][fixed].mask |= inward;
        }
      }
    });

    return grid
      .map((line) =>
        line
          .map((cell) =>
            cell.mask
              ? glyphs[cell.mask]
              : cell.character === "┄"
                ? "┄┄"
                : cell.character === "┆"
                  ? "┆ "
                  : `${cell.character} `,
          )
          .join("")
          .replace(/ +$/u, ""),
      )
      .join("\n");
  },

  markdownText(plan, value) {
    return String(value ?? "")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ");
  },

  downloadMarkdownLegacy(plan, filename = "planta-terrea-layout.md") {
    if (!plan.currentConfig) {
      alert("Carregue uma planta antes de exportar o layout.");
      return;
    }

    const lines = [
      `# ${plan.currentConfig.title || "Layout da planta térrea"}`,
      "",
      "## Cômodos",
      "",
      "| # | ID | Nome | x | y | Largura | Altura | Área bruta | Área útil | Paredes |",
      "|---:|---|---|---:|---:|---:|---:|---:|---:|---|",
    ];
    const rooms = plan.allRooms.length
      ? plan.allRooms
      : plan.roomElements.map((reference) => ({ reference }));
    rooms.forEach((roomEntry, index) => {
      const room = roomEntry.reference || roomEntry;
      const walls =
        ["top", "right", "bottom", "left"]
          .filter((side) => room.wallState?.(side) === "solid")
          .join(", ") || "—";
      const activeRoom = plan.roomElements.find(
        (candidate) => candidate.dataset.id === roomEntry.id,
      );
      lines.push(
        `| ${index + 1} | ${plan.markdownText(roomEntry.id || room.dataset?.id || "—")} | ${plan.markdownText(roomEntry.label || room.dataset?.label || "Cômodo")}${roomEntry.floorLabel ? ` (${plan.markdownText(roomEntry.floorLabel)})` : ""} | ${plan.formatMeters(room.x0())} | ${plan.formatMeters(room.y0())} | ${plan.formatMeters(room.w())} | ${plan.formatMeters(room.l())} | ${plan.formatMeters(room.area())} | ${plan.formatMeters(activeRoom?.netArea ?? room.area())} | ${walls} |`,
      );
    });

    lines.push(
      "",
      `**Total:** ${plan.roomCount} cômodos · ${plan.formatMeters(plan.roomArea)} m² (área líquida, com descontos de sobreposição)`,
    );
    lines.push(
      "",
      "## Itens",
      "",
      "| # | Nome | x | y | Largura | Altura | Área | Classes | Sobrepõe |",
      "|---:|---|---:|---:|---:|---:|---:|---|---|",
    );
    const items = plan.allItems.length ? plan.allItems : plan.itemElements;
    if (items.length === 0) {
      lines.push("| — | Nenhum item definido |  |  |  |  |  |  |");
    } else {
      items.forEach((item, index) => {
        const classes =
          item.classes ||
          [...(item.classList || [])]
            .filter(
              (className) =>
                !["plan-item", "plan-generated"].includes(className),
            )
            .join(", ") ||
          "—";
        const overlaps =
          item.overlaps || item.allowedOverlaps?.join(", ") || "—";
        const x = item.x0 ? item.x0() : item.x;
        const y = item.y0 ? item.y0() : item.y;
        const w = item.w instanceof Function ? item.w() : item.w;
        const l = item.l instanceof Function ? item.l() : item.l;
        const area = item.area instanceof Function ? item.area() : w * l;
        lines.push(
          `| ${index + 1} | ${plan.markdownText(item.label || item.dataset?.label || item.title || "Item")}${item.floorLabel ? ` (${plan.markdownText(item.floorLabel)})` : ""} | ${plan.formatMeters(x)} | ${plan.formatMeters(y)} | ${plan.formatMeters(w)} | ${plan.formatMeters(l)} | ${plan.formatMeters(area)} | ${plan.markdownText(classes)} | ${plan.markdownText(overlaps)} |`,
        );
      });
    }
    lines.push(
      "",
      "## Passagens",
      "",
      "| ID | De | Para | Tipo | Parede | Posição | Largura | z0 | Altura |",
      "|---|---|---|---|---|---:|---:|---:|---:|",
    );
    const openings = plan.allOpenings.length ? plan.allOpenings : plan.openings;
    if (openings.length === 0) {
      lines.push("| — | Nenhuma passagem definida |  |  |  |  |  |");
    } else {
      openings.forEach((opening) => {
        lines.push(
          `| ${plan.markdownText(opening.id)} | ${plan.markdownText(opening.roomId)} | ${plan.markdownText(opening.to)} | ${plan.markdownText(opening.type)} | ${opening.wall} | ${plan.formatMeters(opening.position)} | ${plan.formatMeters(opening.w)} | ${plan.formatMeters(opening.z0)} | ${plan.formatMeters(opening.h)} |`,
        );
      });
    }

    lines.push(
      "",
      "## Janelas",
      "",
      "| ID | De | Para | Parede | Posição | Largura | z0 | Altura |",
      "|---|---|---|---|---:|---:|---:|---:|",
    );
    const windows = plan.allWindows.length ? plan.allWindows : plan.windows;
    if (windows.length === 0) {
      lines.push("| — | Nenhuma janela definida |  |  |  |  |");
    } else {
      windows.forEach((window) => {
        lines.push(
          `| ${plan.markdownText(window.id)} | ${plan.markdownText(window.roomId)} | ${plan.markdownText(window.to)} | ${window.wall} | ${plan.formatMeters(window.position)} | ${plan.formatMeters(window.w)} | ${plan.formatMeters(window.z0)} | ${plan.formatMeters(window.h)} |`,
        );
      });
    }

    lines.push("", "## Comunicações naturais", "");
    if (plan.naturalCommunications.length === 0) {
      lines.push("Nenhuma comunicação natural detectada.");
    } else {
      plan.naturalCommunications.forEach((communication) => {
        lines.push(
          `- **${plan.markdownText(communication.id)}:** ${plan.markdownText(communication.firstId)} → ${plan.markdownText(communication.secondId)} (${plan.formatMeters(communication.length)} m, orientação ${communication.orientation})`,
        );
      });
    }

    if (plan.errors.length > 0) {
      lines.push(
        "",
        "## Elementos com erro",
        "",
        ...plan.errors.map(({ opening, id, category = "opening", message }) => {
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
          const label = `${labels[category] || "Erro"}${id ? ` ${id}` : ""}`;
          const source =
            opening === undefined
              ? ""
              : ` \`${plan.markdownText(JSON.stringify(opening))}\``;
          return `- **${label}:**${source} ${plan.markdownText(message)}`;
        }),
      );
    }

    lines.push("", "## ASCII art", "", "```text", plan.asciiLayout(), "```");

    FloorPlanExport.downloadText(
      `${lines.join("\n")}\n`,
      filename,
      "text/markdown;charset=utf-8",
    );
  },

  downloadMarkdown(plan, filename = "planta-layout.md") {
    if (!plan.currentConfig) {
      alert("Carregue uma planta antes de exportar o layout.");
      return;
    }

    const lines = [`# ${plan.currentConfig.title || "Layout da planta"}`];
    const floors = plan.model?.floors ?? [
      { id: null, label: "Planta", rooms: [] },
    ];
    const rooms = plan.allRooms.length
      ? plan.allRooms
      : plan.roomElements.map((reference) => ({
          reference,
          floorId: plan.currentFloorId,
        }));
    const items = plan.allItems.length ? plan.allItems : plan.itemElements;
    const openings = plan.allOpenings.length ? plan.allOpenings : plan.openings;
    const windows = plan.allWindows.length ? plan.allWindows : plan.windows;
    const roofs = plan.allRoofs ?? [];
    const floorRows = FloorPlanModel.floorRows(
      floors,
      plan.roomDefinitions,
      plan.roomReferences,
    );

    const appendRoofSection = (heading, roofEntries) => {
      if (roofEntries.length === 0) return;
      lines.push(
        "",
        `### ${heading}`,
        "",
        "| ID | Tipo | Orientação da cumeeira | Largura | Comprimento | Cumeeira | Cota base | Altura | Superfície | Inclinação | Beiral | Empena |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
      );
      roofEntries.forEach((roof) => {
        const metrics = FloorPlanExport.roofMetrics(this, roof);
        if (!metrics) {
          lines.push(
            `| ${plan.markdownText(roof.id || "—")} | geometria inválida |  |  |  |  |  |  |  |  |  |  |`,
          );
          return;
        }
        lines.push(
          `| ${plan.markdownText(roof.id || "—")} | ${plan.markdownText(plan.roofTypeLabel(roof.type))} | ${plan.markdownText(plan.roofOrientationLabel(roof.orientation))} | ${plan.formatMeters(metrics.roofWidth)} | ${plan.formatMeters(metrics.roofLength)} | ${plan.formatMeters(metrics.ridgeLength)} | ${plan.formatMeters(metrics.baseElevation)} | ${plan.formatMeters(metrics.rise)} | ${plan.formatMeters(metrics.surfaceArea)} | ${plan.formatMeters(metrics.pitch)}° | ${plan.formatMeters(metrics.eave)} | ${plan.formatMeters(metrics.rake)} |`,
        );
      });
    };

    appendRoofSection(
      "Telhados globais",
      roofs.filter(
        (roof) => (roof.floorId ?? null) === null && floors.length > 1,
      ),
    );

    floors.forEach((floor, floorIndex) => {
      const floorId = floor.id ?? null;
      const floorName = floor.label || floor.id || `Piso ${floorIndex + 1}`;
      const floorRooms = rooms.filter(
        (entry) => (entry.floorId ?? null) === floorId,
      );
      const floorItems = items.filter(
        (item) => (item.floorId ?? null) === floorId,
      );
      const floorOpenings = openings.filter(
        (opening) => (opening.floorId ?? null) === floorId,
      );
      const floorWindows = windows.filter(
        (window) => (window.floorId ?? null) === floorId,
      );
      const floorRoofs = roofs.filter(
        (roof) => (roof.floorId ?? null) === floorId,
      );

      lines.push("", `## ${plan.markdownText(floorName)}`);
      lines.push(
        "",
        "### Cômodos",
        "",
        "| # | ID | Nome | x | y | Largura | Comprimento | Área bruta | Área útil | Paredes |",
        "|---:|---|---|---:|---:|---:|---:|---:|---:|---|",
      );
      if (floorRooms.length === 0) {
        lines.push("| — | Nenhum cômodo definido |  |  |  |  |  |  |  |  |");
      } else {
        floorRooms.forEach((entry, index) => {
          const room = entry.reference || entry;
          const walls =
            ["top", "right", "bottom", "left"]
              .filter((side) => room.wallState?.(side) === "solid")
              .join(", ") || "—";
          const activeRoom = plan.roomElements.find(
            (candidate) => candidate.dataset.id === entry.id,
          );
          lines.push(
            `| ${index + 1} | ${plan.markdownText(entry.id || room.dataset?.id || "—")} | ${plan.markdownText(entry.label || room.dataset?.label || "Cômodo")} | ${plan.formatMeters(room.x0())} | ${plan.formatMeters(room.y0())} | ${plan.formatMeters(room.w())} | ${plan.formatMeters(room.l())} | ${plan.formatMeters(room.area())} | ${plan.formatMeters(activeRoom?.netArea ?? room.area())} | ${walls} |`,
          );
        });
      }
      const floorArea = floorRows[floorIndex]?.area ?? 0;
      lines.push(
        "",
        `**Total do piso:** ${floorRows[floorIndex]?.count ?? floorRooms.length} cômodos · ${plan.formatMeters(floorArea)} m²`,
      );

      lines.push(
        "",
        "### Itens",
        "",
        "| # | Nome | x | y | Largura | Comprimento | Área | Classes | Sobrepõe |",
        "|---:|---|---:|---:|---:|---:|---:|---|---|",
      );
      if (floorItems.length === 0) {
        lines.push("| — | Nenhum item definido |  |  |  |  |  |  |  |");
      } else {
        floorItems.forEach((item, index) => {
          const classes =
            item.classes ||
            [...(item.classList || [])]
              .filter(
                (className) =>
                  !["plan-item", "plan-generated"].includes(className),
              )
              .join(", ") ||
            "—";
          const overlaps =
            item.overlaps || item.allowedOverlaps?.join(", ") || "—";
          const x = item.x0 ? item.x0() : item.x;
          const y = item.y0 ? item.y0() : item.y;
          const w = item.w instanceof Function ? item.w() : item.w;
          const l = item.l instanceof Function ? item.l() : item.l;
          const area = item.area instanceof Function ? item.area() : w * l;
          lines.push(
            `| ${index + 1} | ${plan.markdownText(item.label || item.dataset?.label || item.title || "Item")} | ${plan.formatMeters(x)} | ${plan.formatMeters(y)} | ${plan.formatMeters(w)} | ${plan.formatMeters(l)} | ${plan.formatMeters(area)} | ${plan.markdownText(classes)} | ${plan.markdownText(overlaps)} |`,
          );
        });
      }

      appendRoofSection("Telhados", floorRoofs);

      lines.push(
        "",
        "### Passagens",
        "",
        "| ID | De | Para | Tipo | Parede | Posição | Largura | z0 | Altura |",
        "|---|---|---|---|---|---:|---:|---:|---:|",
      );
      if (floorOpenings.length === 0) {
        lines.push("| — | Nenhuma passagem definida |  |  |  |  |  |");
      } else {
        floorOpenings.forEach((opening) => {
          lines.push(
            `| ${plan.markdownText(opening.id)} | ${plan.markdownText(opening.roomId)} | ${plan.markdownText(opening.to)} | ${plan.markdownText(opening.type)} | ${opening.wall} | ${plan.formatMeters(opening.position)} | ${plan.formatMeters(opening.w)} | ${plan.formatMeters(opening.z0)} | ${plan.formatMeters(opening.h)} |`,
          );
        });
      }

      lines.push(
        "",
        "### Janelas",
        "",
        "| ID | De | Para | Parede | Posição | Largura | z0 | Altura |",
        "|---|---|---|---|---:|---:|---:|---:|",
      );
      if (floorWindows.length === 0) {
        lines.push("| — | Nenhuma janela definida |  |  |  |  |");
      } else {
        floorWindows.forEach((window) => {
          lines.push(
            `| ${plan.markdownText(window.id)} | ${plan.markdownText(window.roomId)} | ${plan.markdownText(window.to)} | ${window.wall} | ${plan.formatMeters(window.position)} | ${plan.formatMeters(window.w)} | ${plan.formatMeters(window.z0)} | ${plan.formatMeters(window.h)} |`,
          );
        });
      }
    });

    lines.push("", "## Comunicações naturais do piso ativo", "");
    if (plan.naturalCommunications.length === 0) {
      lines.push("Nenhuma comunicação natural detectada.");
    } else {
      plan.naturalCommunications.forEach((communication) => {
        lines.push(
          `- **${plan.markdownText(communication.id)}:** ${plan.markdownText(communication.firstId)} → ${plan.markdownText(communication.secondId)} (${plan.formatMeters(communication.length)} m, orientação ${communication.orientation})`,
        );
      });
    }

    if (plan.errors.length > 0) {
      lines.push(
        "",
        "## Elementos com erro",
        "",
        ...plan.errors.map(({ opening, id, category = "opening", message }) => {
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
          const label = `${labels[category] || "Erro"}${id ? ` ${id}` : ""}`;
          const source =
            opening === undefined
              ? ""
              : ` \`${plan.markdownText(JSON.stringify(opening))}\``;
          return `- **${label}:**${source} ${plan.markdownText(message)}`;
        }),
      );
    }

    lines.push("", "## ASCII art", "", "```text", plan.asciiLayout(), "```");
    FloorPlanExport.downloadText(
      `${lines.join("\n")}\n`,
      filename,
      "text/markdown;charset=utf-8",
    );
  },
};

window.FloorPlanTextExport = FloorPlanTextExport;
