const FloorPlanFacades = {
  updateRoofVisibility(plan) {
    [plan.facadeLayer, plan.secondaryFacadeLayer].forEach((layer) => {
      layer?.querySelectorAll(".facade-roof, .facade-roof-eave, .facade-roof-ridge, .facade-roof-label")
        .forEach((element) => element.classList.toggle("roof-hidden", !plan.showRoofs));
    });
  },


  render(plan, facades = []) {
    if (!plan.facadeLayer) return;
    plan.facadeLayer.replaceChildren();
    plan.secondaryFacadeLayer?.replaceChildren();
    const frontFacades = facades.filter(
      (facade) => (facade.direction || "front") === "front",
    );
    const secondaryFacades = facades.filter(
      (facade) => (facade.direction || "front") !== "front",
    );
    const frontSection = plan.facadeLayer.closest(".facade-section");
    const secondarySection = plan.secondaryFacadeLayer
      ?.closest(".facade-section");
    if (frontSection && frontSection === secondarySection) {
      frontSection.toggleAttribute("hidden", facades.length === 0);
    } else {
      frontSection?.toggleAttribute("hidden", frontFacades.length === 0);
      secondarySection?.toggleAttribute("hidden", secondaryFacades.length === 0);
    }
    if (facades.length === 0) return;

    const svgNamespace = "http://www.w3.org/2000/svg";
    const scale =
      Number.parseFloat(
        getComputedStyle(plan.root).getPropertyValue("--m"),
      ) || 56;
    const floorConfigs = plan.currentConfig?.floors ?? [plan.currentConfig];
    const previousFloorHeight = plan.currentFloorHeight;
    const normalizePartsAtFloor = (parts, floorConfig) => {
      const floorHeight = Number(floorConfig?.z0 ?? 0);
      plan.currentFloorHeight = floorHeight;
      try {
        return plan.normalizeParts(parts);
      } finally {
        plan.currentFloorHeight = previousFloorHeight;
      }
    };
    const rooms = floorConfigs.flatMap((floorConfig) =>
      (floorConfig?.rooms ?? []).flatMap((definition) => {
        try {
          const floorIndex = floorConfigs.indexOf(floorConfig);
          const floorZ0 = Number(floorConfig?.z0 ?? 0);
          const nextFloorZ0 = Number(floorConfigs[floorIndex + 1]?.z0);
          const wallMaxHeight = Number(floorConfig?.wall_max_height ?? 0);
          const defaultWallHeight = Number.isFinite(nextFloorZ0)
            ? Math.min(Math.max(0, nextFloorZ0 - floorZ0), wallMaxHeight)
            : wallMaxHeight;
          const parts = definition.parts?.length
            ? normalizePartsAtFloor(definition.parts, floorConfig)
            : null;
          const geometry = parts?.length
            ? {
                x: Math.min(...parts.map((part) => part.x)),
                y: Math.min(...parts.map((part) => part.y)),
                w:
                  Math.max(...parts.map((part) => part.x + part.w)) -
                  Math.min(...parts.map((part) => part.x)),
                l:
                  Math.max(...parts.map((part) => part.y + part.l)) -
                  Math.min(...parts.map((part) => part.y)),
                z0: Math.min(...parts.map((part) => part.z0)),
                z1: Math.max(...parts.map((part) => part.z1)),
              }
            : (() => {
                const floorHeight = Number(floorConfig?.z0 ?? 0);
                plan.currentFloorHeight = floorHeight;
                try {
                  return plan.normalizeGeometry(definition);
                } finally {
                  plan.currentFloorHeight = previousFloorHeight;
                }
              })();
          const facadeGeometry =
            geometry.z1 > geometry.z0
              ? geometry
              : {
                  ...geometry,
                  z1: geometry.z0 + defaultWallHeight,
                  h: defaultWallHeight,
                };
          const walls = plan.normalizeWalls(definition.walls);
          const room = {
            dataset: {
              id: definition.id || "",
              label: definition.label || definition.id || "",
            },
            geometryParts: parts?.map((part) => ({
              ...part,
              sourceWalls: definition.parts.find((source) => source.id === part.id)?.walls,
            })) ?? [facadeGeometry],
            x0: () => facadeGeometry.x,
            x1: () => facadeGeometry.x + facadeGeometry.w,
            y0: () => facadeGeometry.y,
            y1: () => facadeGeometry.y + facadeGeometry.l,
            z0: () => facadeGeometry.z0,
            z1: () => facadeGeometry.z1,
            w: () => facadeGeometry.w,
            l: () => facadeGeometry.l,
            wallState: (side) => walls[side],
            querySelector: () => null,
          };
          room.facadeFloorId = floorConfig?.id ?? null;
          room.facadeFloorZ0 = Number(floorConfig?.z0 ?? 0);
          return [room];
        } catch {
          return [];
        }
      }),
    );
    const floorHeight = Math.max(
      ...rooms.map((room) => room.z1()),
      3,
    );

    const roofLimits = FloorPlanWalls.roofLimits(plan);

    facades.forEach((facade, index) => {
      const direction = facade.direction || "front";
      const side = ["left", "right"].includes(direction);
      const facadeWall =
        direction === "front"
          ? "top"
          : direction === "rear"
            ? "bottom"
            : direction === "left"
              ? "left"
              : "right";
      const facadeAxis = side ? "x" : "y";
      const facadeEdge =
        direction === "front" || direction === "left" ? "min" : "max";
      const facadeDatumRooms = rooms.filter((room) =>
        !String(
          plan.roomDefinitions?.get(String(room.dataset.id || ""))?.classes || "",
        ).split(/\s+/).includes("stair-flight"),
      );
      const edgeValues = (facadeDatumRooms.length ? facadeDatumRooms : rooms).map((room) =>
        facadeAxis === "x"
          ? facadeEdge === "min"
            ? room.x0()
            : room.x1()
          : facadeEdge === "min"
            ? room.y0()
            : room.y1(),
      );
      const edge = facadeEdge === "min" ? Math.min(...edgeValues) : Math.max(...edgeValues);
      const facadeRooms = rooms.filter((room) => {
        const roomEdge =
          facadeAxis === "x"
            ? facadeEdge === "min"
              ? room.x0()
              : room.x1()
            : facadeEdge === "min"
              ? room.y0()
              : room.y1();
        return Math.abs(roomEdge - edge) < 0.01;
      });
      const facadeDepth = Number(facade.depth ?? (side ? Infinity : 3));
      const projectedRooms = rooms.filter((room) => {
        const near = side ? room.x0() : room.y0();
        const far = side ? room.x1() : room.y1();
        const withinDepth = facadeEdge === "min"
          ? near <= edge + facadeDepth
          : far >= edge - facadeDepth;
        const wallState = room.wallState?.(facadeWall);
        return withinDepth || wallState === "solid" || wallState === "virtual";
      });
      const surfaceRooms = projectedRooms.flatMap((room) => {
        const roomId = String(room.dataset.id || "");
        const definition = plan.roomDefinitions?.get(roomId);
        if (definition?.parts?.length) {
          return room.geometryParts
            .filter((part, partIndex) => {
              const partDefinition = definition.parts[partIndex];
              const walls = plan.normalizeWalls(
                part.sourceWalls ?? partDefinition.walls ?? definition.walls,
              );
              const state = walls[facadeWall];
              return state === "solid" || state === "virtual";
            })
            .map((part) => ({ room, geometry: part, compoundPart: true }));
        }
        const state = room.wallState?.(facadeWall) ?? "solid";
        return state === "solid" || state === "virtual"
          ? [{ room, geometry: room, compoundPart: false }]
          : [];
      });
      const depthDirection = facadeEdge === "min" ? 1 : -1;
      const roomFacadeDepth = (room) =>
        side
          ? facadeEdge === "min"
            ? room.x0()
            : room.x1()
          : facadeEdge === "min"
            ? room.y0()
            : room.y1();
      const roomFacadeSpan = (room) =>
        side ? [room.y0(), room.y1()] : [room.x0(), room.x1()];
      const roofFacadeDepth = (geometry) =>
        side
          ? facadeEdge === "min"
            ? geometry.baseX0
            : geometry.baseX1
          : facadeEdge === "min"
            ? geometry.baseY0
            : geometry.baseY1;
      const roofFacadeSpan = (geometry) =>
        side
          ? [geometry.baseY0, geometry.baseY1]
          : [geometry.baseX0, geometry.baseX1];
      const isAtOrInFront = (candidateDepth, referenceDepth) =>
        facadeEdge === "min"
          ? candidateDepth <= referenceDepth + 0.01
          : candidateDepth >= referenceDepth - 0.01;
      const isStrictlyInFront = (candidateDepth, referenceDepth) =>
        facadeEdge === "min"
          ? candidateDepth < referenceDepth - 0.01
          : candidateDepth > referenceDepth + 0.01;
      projectedRooms.sort((first, second) => {
        const firstDepth = roomFacadeDepth(first);
        const secondDepth = roomFacadeDepth(second);
        return depthDirection * (firstDepth - secondDepth);
      });
      const roomDepthOrder = new Map(
        projectedRooms.map((room, roomIndex) => [room, roomIndex]),
      );
      surfaceRooms.sort(
        (first, second) =>
          roomDepthOrder.get(first.room) - roomDepthOrder.get(second.room),
      );
      const roomsCoveredByCloserRoom = new Set();
      surfaceRooms.forEach(({ room }) => {
        const roomId = String(room.dataset.id || "");
        const [roomStart, roomEnd] = roomFacadeSpan(room);
        const roomDepth = roomFacadeDepth(room);
        const roomZ0 = room.z0();
        const roomZ1 = room.z1();
        const isCovered = surfaceRooms.some(({ room: other }) => {
          if (other === room) return false;
          const [otherStart, otherEnd] = roomFacadeSpan(other);
          const otherDepth = roomFacadeDepth(other);
          const overlapsHeight =
            Math.min(roomZ1, other.z1()) - Math.max(roomZ0, other.z0()) >
            0.001;
          const coversAxis =
            otherStart <= roomStart + 0.01 &&
            otherEnd >= roomEnd - 0.01;
          const isCloser = isStrictlyInFront(otherDepth, roomDepth);
          return overlapsHeight && coversAxis && isCloser;
        });
        if (isCovered) roomsCoveredByCloserRoom.add(roomId);
      });
      const coordinates = projectedRooms.flatMap((room) =>
        side ? [room.y0(), room.y1()] : [room.x0(), room.x1()],
      );
      if (coordinates.length === 0) return;
      const facadeMin = Math.min(...coordinates);
      const facadeMax = Math.max(...coordinates);
      const roofGeometry = (roof) => {
        let base;
        let floor;
        try {
          const baseDefinition = roof.base ?? roof;
          floor = FloorPlanRoofs.floorForRoof(plan, roof, baseDefinition);
          base = FloorPlanRoofs.resolveBase(plan, baseDefinition, floor);
        } catch {
          return null;
        }
        if (!base || !["longitudinal", "transverse"].includes(roof.orientation)) {
          return null;
        }
        const longitudinal = roof.orientation === "longitudinal";
        const [eave0, eave1] = FloorPlanRoofs.overhangPair(roof.eave);
        const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
        const pitch = Number(roof.pitch);
        const baseSpan = longitudinal ? base.w() : base.l();
        const baseZ1 = FloorPlanRoofs.baseCeilingZ(plan, base, 0, floor);
        const rise = (baseSpan / 2) * Math.tan((pitch * Math.PI) / 180);
        const z0 =
          roof.z0 !== undefined
            ? plan.resolve(roof.z0)
            : baseZ1;
        return {
          longitudinal,
          x0: base.x0() - (longitudinal ? eave0 : rake0),
          x1: base.x1() + (longitudinal ? eave1 : rake1),
          y0: base.y0() - (longitudinal ? rake0 : eave0),
          y1: base.y1() + (longitudinal ? rake1 : eave1),
          baseX0: base.x0(),
          baseX1: base.x1(),
          baseY0: base.y0(),
          baseY1: base.y1(),
          eave0,
          eave1,
          pitch,
          z0,
          baseZ1,
          rise,
          baseSpan,
          pitchTangent: Math.tan((pitch * Math.PI) / 180),
        };
      };
      const roofs = plan.allRoofs ?? [];
      const facadeRoofs = [...roofs].sort((first, second) => {
        const firstGeometry = roofGeometry(first);
        const secondGeometry = roofGeometry(second);
        const firstDepth = firstGeometry
          ? side
            ? facadeEdge === "min"
              ? firstGeometry.x0
              : firstGeometry.x1
            : facadeEdge === "min"
              ? firstGeometry.y0
              : firstGeometry.y1
          : 0;
        const secondDepth = secondGeometry
          ? side
            ? facadeEdge === "min"
              ? secondGeometry.x0
              : secondGeometry.x1
            : facadeEdge === "min"
              ? secondGeometry.y0
              : secondGeometry.y1
          : 0;
        return depthDirection * (firstDepth - secondDepth);
      });
      const roofReachesFacade = (geometry) => {
        if (!geometry) return false;
        const roofNear = side ? geometry.x0 : geometry.y0;
        const roofFar = side ? geometry.x1 : geometry.y1;
        const reachesFacadeDepth =
          facadeEdge === "min"
            ? roofNear <= edge + facadeDepth
            : roofFar >= edge - facadeDepth;
        // A setback roof must remain visible when it limits a projected wall;
        // otherwise that wall appears to end without any roof above it.
        const coversProjectedWall = surfaceRooms.some(({ geometry: roomGeometry, compoundPart }) => {
          const x0 = compoundPart ? roomGeometry.x : roomGeometry.x0();
          const x1 = compoundPart ? roomGeometry.x + roomGeometry.w : roomGeometry.x1();
          const y0 = compoundPart ? roomGeometry.y : roomGeometry.y0();
          const y1 = compoundPart ? roomGeometry.y + roomGeometry.l : roomGeometry.y1();
          const coordinate = side
            ? facadeEdge === "min" ? x0 : x1
            : facadeEdge === "min" ? y0 : y1;
          const [roofStart, roofEnd] = roofFacadeSpan(geometry);
          const start = side ? y0 : x0;
          const end = side ? y1 : x1;
          return coordinate >= roofNear - 0.01 && coordinate <= roofFar + 0.01 &&
            Math.min(end, roofEnd) - Math.max(start, roofStart) > 0.001;
        });
        if (!reachesFacadeDepth && !coversProjectedWall) return false;
        return rooms.some((room) => {
          const roomNear = side ? room.x0() : room.y0();
          const roomFar = side ? room.x1() : room.y1();
          return (
            Math.min(roofFar, roomFar) - Math.max(roofNear, roomNear) >
            0.001
          );
        });
      };
      const roofIsInFrontAtBase = (geometry) => {
        if (!geometry) return false;
        const roofStart = side ? geometry.baseY0 : geometry.baseX0;
        const roofEnd = side ? geometry.baseY1 : geometry.baseX1;
        const roofDepth = roofFacadeDepth(geometry);
        return rooms.some((room) => {
          const wallState = room.wallState?.(facadeWall) ?? "solid";
          if (wallState !== "solid" && wallState !== "virtual") return false;
          const [roomStart, roomEnd] = roomFacadeSpan(room);
          const overlapsAxis =
            Math.min(roofEnd, roomEnd) - Math.max(roofStart, roomStart) > 0.001;
          if (!overlapsAxis) return false;
          const roomDepth = side
            ? facadeEdge === "min"
              ? room.x0()
              : room.x1()
            : facadeEdge === "min"
              ? room.y0()
              : room.y1();
          return isAtOrInFront(roofDepth, roomDepth);
        });
      };
      const roofElementSelector =
        ".facade-roof, .facade-roof-eave, .facade-roof-ridge, .facade-roof-label";
      facadeRoofs.forEach((roof) => {
        if (roof.type !== "gable") return;
        const longitudinal = roof.orientation === "longitudinal";
        const isVisible = longitudinal ? !side : side;
        if (!isVisible) return;
        const geometry = roofGeometry(roof);
        if (!roofReachesFacade(geometry)) return;
        const span = longitudinal
          ? [geometry.x0, geometry.x1]
          : [geometry.y0, geometry.y1];
        coordinates.push(...span);
      });
      const rawMin = Math.min(...coordinates);
      const max = Math.max(...coordinates);
      const padding = 0.5;
      const frontAligned = direction === "front";
      const viewportOriginX = Number(plan.viewport?.origin?.[0] ?? 0);
      const buildingOffsetX =
        Number.parseFloat(
          getComputedStyle(plan.root).getPropertyValue("--building-offset-x"),
        ) || 0;
      const horizontalOrigin = frontAligned
        ? viewportOriginX - buildingOffsetX
        : rawMin - padding;
      // Keep the existing local-coordinate expressions while changing only
      // their origin for the front elevation. The padding is already added
      // by those expressions, so do not include it in the origin twice.
      const min = frontAligned ? horizontalOrigin + padding : rawMin;
      const width = Math.max(max - rawMin, 1);
      const roofTop = facadeRoofs.reduce((highest, roof) => {
        if (roof.type !== "gable") return highest;
        const geometry = roofGeometry(roof);
        return roofReachesFacade(geometry)
          ? Math.max(highest, (geometry?.z0 ?? 0) + (geometry?.rise ?? 0))
          : highest;
      }, 0);
      // floorHeight is an absolute Z reference. The roof rise used by the
      // viewport must therefore be only the part that extends above it, not
      // the roof's full rise from its own base.
      const roofRise = Math.max(0, roofTop - floorHeight);
      const roofDrop = facadeRoofs.reduce((lowest, roof) => {
        if (roof.type !== "gable") return lowest;
        const isVisible =
          roof.orientation === "longitudinal" ? !side : side;
        const geometry = roofGeometry(roof);
        if (!isVisible || !roofReachesFacade(geometry)) return lowest;
        return Math.max(
          lowest,
          Math.max(geometry.eave0, geometry.eave1) *
            Math.tan((geometry.pitch * Math.PI) / 180),
        );
      }, 0);
      const viewWidth = frontAligned
        ? Number(plan.viewport?.size?.[0] ?? width + padding * 2) * scale
        : (width + padding * 2) * scale;
      const viewY = -roofRise * scale;
      const dimensionGap = 0.35;
      const viewHeight =
        (floorHeight + padding * 2 + roofRise + roofDrop + dimensionGap) * scale;
      const svg = document.createElementNS(svgNamespace, "svg");
      svg.classList.add("facade-view");
      svg.setAttribute("width", `${viewWidth}`);
      svg.setAttribute("height", `${viewHeight}`);
      svg.setAttribute(
        "viewBox",
        `0 ${viewY} ${viewWidth} ${viewHeight}`,
      );
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", facade.label || `Fachada ${index + 1}`);

      const defs = document.createElementNS(svgNamespace, "defs");
      const pattern = document.createElementNS(svgNamespace, "pattern");
      pattern.setAttribute("id", `facade-grid-${index + 1}`);
      if (frontAligned) {
        pattern.setAttribute("x", `${-viewportOriginX * scale}`);
      }
      pattern.setAttribute("width", `${scale / 2}`);
      pattern.setAttribute("height", `${scale / 2}`);
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      const gridPath = document.createElementNS(svgNamespace, "path");
      gridPath.setAttribute("d", `M ${scale / 2} 0 L 0 0 0 ${scale / 2}`);
      gridPath.setAttribute(
        "stroke",
        getComputedStyle(plan.root).getPropertyValue("--theme-grid").trim() ||
          "rgba(0, 0, 0, 0.08)",
      );
      gridPath.setAttribute("stroke-width", "1");
      gridPath.setAttribute("fill", "none");
      pattern.append(gridPath);
      defs.append(pattern);
      const dimensionMarker = document.createElementNS(svgNamespace, "marker");
      dimensionMarker.setAttribute("id", `facade-dimension-arrow-${index + 1}`);
      dimensionMarker.setAttribute("markerWidth", "6");
      dimensionMarker.setAttribute("markerHeight", "6");
      dimensionMarker.setAttribute("refX", "3");
      dimensionMarker.setAttribute("refY", "3");
      dimensionMarker.setAttribute("orient", "auto-start-reverse");
      dimensionMarker.setAttribute("markerUnits", "userSpaceOnUse");
      const dimensionArrow = document.createElementNS(svgNamespace, "path");
      dimensionArrow.setAttribute("d", "M 0 0 L 6 3 L 0 6 z");
      dimensionArrow.setAttribute(
        "fill",
        getComputedStyle(plan.root).getPropertyValue("--theme-label").trim() ||
          "#263746",
      );
      dimensionMarker.append(dimensionArrow);
      defs.append(dimensionMarker);
      svg.append(defs);
      const grid = document.createElementNS(svgNamespace, "rect");
      grid.setAttribute("x", "0");
      grid.setAttribute("y", `${viewY}`);
      grid.setAttribute("width", `${viewWidth}`);
      grid.setAttribute("height", `${viewHeight}`);
      grid.setAttribute("fill", `url(#facade-grid-${index + 1})`);
      grid.classList.add("facade-grid");
      svg.append(grid);

      const dimensionStroke =
        getComputedStyle(plan.root).getPropertyValue("--theme-label").trim() ||
        "#263746";
      const dimensionY =
        (floorHeight + padding + roofDrop + dimensionGap) * scale;
      const dimensionX0 = (facadeMin - min + padding) * scale;
      const dimensionX1 = (facadeMax - min + padding) * scale;
      const horizontalDimension = document.createElementNS(svgNamespace, "line");
      horizontalDimension.setAttribute("x1", `${dimensionX0}`);
      horizontalDimension.setAttribute("x2", `${dimensionX1}`);
      horizontalDimension.setAttribute("y1", `${dimensionY}`);
      horizontalDimension.setAttribute("y2", `${dimensionY}`);
      horizontalDimension.setAttribute("stroke", dimensionStroke);
      horizontalDimension.setAttribute("stroke-width", "1");
      horizontalDimension.setAttribute(
        "marker-start",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      horizontalDimension.setAttribute(
        "marker-end",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      svg.append(horizontalDimension);

      const horizontalLabel = document.createElementNS(svgNamespace, "text");
      horizontalLabel.textContent = `${plan.formatMeters(facadeMax - facadeMin)}m`;
      horizontalLabel.setAttribute("x", `${(dimensionX0 + dimensionX1) / 2}`);
      horizontalLabel.setAttribute("y", `${dimensionY - 0.08 * scale}`);
      horizontalLabel.setAttribute("text-anchor", "middle");
      horizontalLabel.setAttribute("fill", dimensionStroke);
      horizontalLabel.setAttribute("font-size", "8");
      svg.append(horizontalLabel);

      if (frontAligned && plan.terrainReference) {
        const terrain = plan.currentConfig?.terrain;
        const boundary = terrain?.boundary_order ?? [];
        const [fromId, toId] = boundary;
        const from = terrain?.corners?.[fromId];
        const to = terrain?.corners?.[toId];
        const frontSegment = terrain?.segments?.find(
          (segment) => segment.from === fromId && segment.to === toId,
        );
        const terrainLength = Number(
          frontSegment?.distance ??
            (from && to
              ? Math.hypot(
                  Number(to.easting) - Number(from.easting),
                  Number(to.northing) - Number(from.northing),
                )
              : NaN),
        );
        const terrainStartX = Number(plan.terrainReference.frontStart.x);
        if (Number.isFinite(terrainStartX) && terrainLength > 0) {
          const terrainDimensionY = dimensionY + 0.45 * scale;
          const terrainLine = document.createElementNS(svgNamespace, "line");
          terrainLine.classList.add("facade-terrain-front");
          terrainLine.setAttribute(
            "x1",
            `${(terrainStartX - viewportOriginX) * scale}`,
          );
          terrainLine.setAttribute(
            "x2",
            `${(terrainStartX + terrainLength - viewportOriginX) * scale}`,
          );
          terrainLine.setAttribute("y1", `${terrainDimensionY}`);
          terrainLine.setAttribute("y2", `${terrainDimensionY}`);
          terrainLine.setAttribute(
            "stroke",
            getComputedStyle(plan.root)
              .getPropertyValue("--theme-terrain-boundary")
              .trim() || "#55724d",
          );
          terrainLine.setAttribute("stroke-width", "1.5");
          svg.append(terrainLine);
        }
      }

      const verticalDimension = document.createElementNS(svgNamespace, "line");
      const verticalDimensionX = frontAligned
        ? (facadeMax - min + padding + 0.22) * scale
        : (padding + width + 0.22) * scale;
      const verticalDimensionY0 = (padding - roofRise) * scale;
      // The vertical cota measures from the highest visible point down to
      // the facade base, not to the separate horizontal dimension line.
      const verticalDimensionY1 = (floorHeight + padding) * scale;
      verticalDimension.setAttribute("x1", `${verticalDimensionX}`);
      verticalDimension.setAttribute("x2", `${verticalDimensionX}`);
      verticalDimension.setAttribute("y1", `${verticalDimensionY0}`);
      verticalDimension.setAttribute("y2", `${verticalDimensionY1}`);
      verticalDimension.setAttribute("stroke", dimensionStroke);
      verticalDimension.setAttribute("stroke-width", "1");
      verticalDimension.setAttribute(
        "marker-start",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      verticalDimension.setAttribute(
        "marker-end",
        `url(#facade-dimension-arrow-${index + 1})`,
      );
      svg.append(verticalDimension);

      const verticalLabel = document.createElementNS(svgNamespace, "text");
      verticalLabel.textContent = `${plan.formatMeters(floorHeight + roofRise)}m`;
      verticalLabel.setAttribute("x", `${verticalDimensionX + 0.16 * scale}`);
      verticalLabel.setAttribute("y", `${(verticalDimensionY0 + verticalDimensionY1) / 2}`);
      verticalLabel.setAttribute("text-anchor", "middle");
      verticalLabel.setAttribute("fill", dimensionStroke);
      verticalLabel.setAttribute("font-size", "8");
      verticalLabel.setAttribute(
        "transform",
        `rotate(-90 ${verticalDimensionX + 0.16 * scale} ${(verticalDimensionY0 + verticalDimensionY1) / 2})`,
      );
      svg.append(verticalLabel);

      facadeRoofs.forEach((roof) => {
        if (roof.type !== "gable") return;
        const longitudinal = roof.orientation === "longitudinal";
        const geometry = roofGeometry(roof);
        if (!roofReachesFacade(geometry)) return;
        const roofIsInFront = roofIsInFrontAtBase(geometry);
        const existingRoofElements = new Set(
          svg.querySelectorAll(roofElementSelector),
        );
        const markRoofElements = () => {
          svg.querySelectorAll(roofElementSelector).forEach((element) => {
            if (!existingRoofElements.has(element)) {
              element.dataset.roofInFront = String(roofIsInFront);
            }
          });
        };
        const {
          x0,
          x1,
          y0,
          y1,
          z0: roofZ0,
          rise,
          baseX0,
          baseX1,
          baseY0,
          baseY1,
          eave0,
          eave1,
          pitch,
        } = geometry;
        const roofSpan = longitudinal ? [x0, x1] : [y0, y1];
        const baseSpan = longitudinal ? [baseX0, baseX1] : [baseY0, baseY1];
        const roofStart = roofSpan[0];
        const roofEnd = roofSpan[1];
        const baseStart = baseSpan[0];
        const baseEnd = baseSpan[1];
        const ridge = (roofStart + roofEnd) / 2;
        const baseRidge = (baseStart + baseEnd) / 2;
        const pitchTangent = Math.tan((pitch * Math.PI) / 180);
        const baseY = (floorHeight - roofZ0 + padding) * scale;
        const eaveStartY = baseY + eave0 * pitchTangent * scale;
        const eaveEndY = baseY + eave1 * pitchTangent * scale;
        const roofWidth = longitudinal ? geometry.x1 - geometry.x0 : geometry.y1 - geometry.y0;
        const roofLength = longitudinal ? geometry.y1 - geometry.y0 : geometry.x1 - geometry.x0;
        const isVisibleOnFacade = longitudinal ? !side : side;
        if (longitudinal && !side) {
          const ridgeCoordinate =
            (floorHeight - roofZ0 - rise + padding) * scale;
          const appendRoofLine = (start, startY, end, endY) => {
            const line = document.createElementNS(svgNamespace, "line");
            line.setAttribute("x1", `${(start - min + padding) * scale}`);
            line.setAttribute("y1", `${startY}`);
            line.setAttribute("x2", `${(end - min + padding) * scale}`);
            line.setAttribute("y2", `${endY}`);
            line.classList.add("facade-roof-eave");
            svg.append(line);
          };
          appendRoofLine(baseStart, baseY, baseRidge, ridgeCoordinate);
          appendRoofLine(baseEnd, baseY, baseRidge, ridgeCoordinate);

          if (roof.label || roof.id) {
            const labelX = (baseRidge - min + padding) * scale;
            const roofLabel = document.createElementNS(svgNamespace, "text");
            roofLabel.setAttribute("x", `${labelX}`);
            roofLabel.setAttribute("y", `${ridgeCoordinate - 3}`);
            roofLabel.setAttribute("text-anchor", "start");
            roofLabel.classList.add("facade-roof-label");
            const roofTitle = document.createElementNS(svgNamespace, "tspan");
            roofTitle.textContent = roof.label || roof.id;
            roofTitle.setAttribute("x", `${labelX}`);
            roofTitle.classList.add("facade-roof-label-title");
            const roofDetails = document.createElementNS(svgNamespace, "tspan");
            roofDetails.textContent = `l: ${plan.formatMeters(roofLength)}m w: ${plan.formatMeters(roofWidth)}m h: ${plan.formatMeters(rise)}m`;
            roofDetails.setAttribute("x", `${labelX}`);
            roofDetails.setAttribute("dy", "1.2em");
            roofDetails.classList.add("facade-roof-label-details");
            roofLabel.append(roofTitle, roofDetails);
            svg.append(roofLabel);
          }
          markRoofElements();
          return;
        }
        if (!isVisibleOnFacade) {
          const ridgeLine = document.createElementNS(svgNamespace, "line");
          const ridgeStart = side ? y0 : x0;
          const ridgeEnd = side ? y1 : x1;
          const ridgeCoordinate =
            (floorHeight - roofZ0 - rise + padding) * scale;
          const eaveCoordinate =
            (floorHeight - roofZ0 + padding) * scale;
          const roofSurface = document.createElementNS(
            svgNamespace,
            "polygon",
          );
          roofSurface.setAttribute(
            "points",
            [
              `${(ridgeStart - min + padding) * scale},${ridgeCoordinate}`,
              `${(ridgeEnd - min + padding) * scale},${ridgeCoordinate}`,
              `${(ridgeEnd - min + padding) * scale},${eaveCoordinate}`,
              `${(ridgeStart - min + padding) * scale},${eaveCoordinate}`,
            ].join(" "),
          );
          roofSurface.classList.add("facade-roof");
          svg.append(roofSurface);
          ridgeLine.setAttribute(
            "x1",
            `${(ridgeStart - min + padding) * scale}`,
          );
          ridgeLine.setAttribute(
            "x2",
            `${(ridgeEnd - min + padding) * scale}`,
          );
          ridgeLine.setAttribute("y1", `${ridgeCoordinate}`);
          ridgeLine.setAttribute("y2", `${ridgeCoordinate}`);
          ridgeLine.setAttribute(
            "stroke",
            getComputedStyle(plan.root)
              .getPropertyValue("--theme-roof-line")
              .trim() || "rgba(112, 55, 35, 0.9)",
          );
          ridgeLine.setAttribute("stroke-width", "1.5");
          ridgeLine.classList.add("facade-roof-ridge");
          svg.append(ridgeLine);

          const eaveLine = document.createElementNS(svgNamespace, "line");
          eaveLine.setAttribute(
            "x1",
            `${(ridgeStart - min + padding) * scale}`,
          );
          eaveLine.setAttribute(
            "x2",
            `${(ridgeEnd - min + padding) * scale}`,
          );
          eaveLine.setAttribute("y1", `${eaveCoordinate}`);
          eaveLine.setAttribute("y2", `${eaveCoordinate}`);
          eaveLine.setAttribute(
            "stroke",
            getComputedStyle(plan.root)
              .getPropertyValue("--theme-roof-line")
              .trim() || "rgba(112, 55, 35, 0.9)",
          );
          eaveLine.setAttribute("stroke-width", "1.5");
          eaveLine.classList.add("facade-roof-eave");
          svg.append(eaveLine);

          if (roof.label || roof.id) {
            const ridgeLabelX =
              ((ridgeStart + ridgeEnd) / 2 - min + padding) * scale;
            const ridgeLabelY = ridgeCoordinate - 3;
            const roofLabel = document.createElementNS(svgNamespace, "text");
            roofLabel.setAttribute("x", `${ridgeLabelX}`);
            roofLabel.setAttribute("y", `${ridgeLabelY}`);
            roofLabel.setAttribute("text-anchor", "middle");
            roofLabel.classList.add("facade-roof-label");

            const roofTitle = document.createElementNS(svgNamespace, "tspan");
            roofTitle.textContent = roof.label || roof.id;
            roofTitle.setAttribute("x", `${ridgeLabelX}`);
            roofTitle.classList.add("facade-roof-label-title");

            const roofDetails = document.createElementNS(svgNamespace, "tspan");
            roofDetails.textContent = `l: ${plan.formatMeters(roofLength)}m w: ${plan.formatMeters(roofWidth)}m h: ${plan.formatMeters(rise)}m`;
            roofDetails.setAttribute("x", `${ridgeLabelX}`);
            roofDetails.setAttribute("dy", "1.2em");
            roofDetails.classList.add("facade-roof-label-details");

            roofLabel.append(roofTitle, roofDetails);
            svg.append(roofLabel);
          }
          markRoofElements();
          return;
        }
        const polygon = document.createElementNS(svgNamespace, "polygon");
        const points = [
          `${(baseStart - min + padding) * scale},${baseY}`,
          `${(baseRidge - min + padding) * scale},${(floorHeight - roofZ0 - rise + padding) * scale}`,
          `${(baseEnd - min + padding) * scale},${baseY}`,
        ].join(" ");
        polygon.setAttribute("points", points);
        polygon.classList.add("facade-roof");
        svg.append(polygon);

        [
          [baseStart, baseY, roofStart, eaveStartY],
          [baseEnd, baseY, roofEnd, eaveEndY],
        ].forEach(([start, startY, end, endY]) => {
          const eaveLine = document.createElementNS(svgNamespace, "line");
          eaveLine.setAttribute("x1", `${(start - min + padding) * scale}`);
          eaveLine.setAttribute("y1", `${startY}`);
          eaveLine.setAttribute("x2", `${(end - min + padding) * scale}`);
          eaveLine.setAttribute("y2", `${endY}`);
          eaveLine.classList.add("facade-roof-eave");
          svg.append(eaveLine);
        });

        if (roof.label || roof.id) {
          const ridgeX = (baseRidge - min + padding) * scale;
          const baseY = (floorHeight - roofZ0 + padding) * scale;
          const ridgeY = (floorHeight - roofZ0 - rise + padding) * scale;
          const labelX = ridgeX;
          const labelY = longitudinal
            ? ridgeY - 3
            : ridgeY - 0.18 * scale;
          const roofLabel = document.createElementNS(svgNamespace, "text");
          roofLabel.setAttribute("x", `${labelX}`);
          roofLabel.setAttribute("y", `${labelY}`);
          roofLabel.setAttribute("text-anchor", longitudinal ? "start" : "middle");
          if (longitudinal) {
            const angle =
              (Math.atan2(baseY - ridgeY, (baseEnd - baseRidge) * scale) * 180) /
              Math.PI;
            roofLabel.setAttribute(
              "transform",
              `rotate(${angle} ${labelX} ${labelY})`,
            );
          }
          roofLabel.classList.add("facade-roof-label");

          const roofTitle = document.createElementNS(svgNamespace, "tspan");
          roofTitle.textContent = roof.label || roof.id;
          roofTitle.setAttribute("x", `${labelX}`);
          roofTitle.classList.add("facade-roof-label-title");

          const roofDetails = document.createElementNS(svgNamespace, "tspan");
          roofDetails.textContent = `l: ${plan.formatMeters(roofLength)}m w: ${plan.formatMeters(roofWidth)}m h: ${plan.formatMeters(rise)}m`;
          roofDetails.setAttribute("x", `${labelX}`);
          roofDetails.setAttribute("dy", "1.2em");
          roofDetails.classList.add("facade-roof-label-details");

          roofLabel.append(roofTitle, roofDetails);
          svg.append(roofLabel);
        }
        markRoofElements();
      });

      const facadeWalls = [facadeWall];
      const facadeRoomIds = new Set(
        projectedRooms.map((room) => String(room.dataset.id || "")),
      );
      const outdoorRoomIds = new Set(
        [...(plan.roomDefinitions?.entries() ?? [])]
          .filter(([, room]) =>
            String(room.classes || "").split(/\s+/).includes("outdoor"),
          )
          .map(([id]) => String(id)),
      );
      const facadeOpenings = [
        ...(plan.allOpenings.length ? plan.allOpenings : plan.openings),
        ...(plan.allWindows.length ? plan.allWindows : plan.windows),
      ].filter(
        (opening) =>
          (opening.to === "exterior" ||
            outdoorRoomIds.has(String(opening.to || "").split(".")[0])) &&
          facadeWalls.includes(opening.wall) &&
          facadeRoomIds.has(String(opening.roomId || "")),
      );
      const facadeItems = plan.allItems.length
        ? plan.allItems
        : plan.itemElements;
      const itemValue = (item, property) =>
        typeof item[property] === "function" ? item[property]() : item[property];
      facadeItems
        .filter((item) =>
          item.classList
            ? item.classList.contains("railing")
            : String(item.classes || "").split(/\s+/).includes("railing"),
        )
        .filter((item) => {
          const itemX = itemValue(item, "x");
          const itemY = itemValue(item, "y");
          const itemW = itemValue(item, "w");
          const itemL = itemValue(item, "l");
          const near = side ? itemX : itemY;
          const far = side ? itemX + itemW : itemY + itemL;
          const atEdge =
            side
              ? near <= edge + 0.1 && far >= edge - 0.1
              : facadeEdge === "min"
                ? near <= edge + 0.1
                : far >= edge - 0.1;
          const parallel = side ? itemL >= itemW : itemW >= itemL;
          return atEdge && parallel;
        })
        .forEach((item) => {
          const itemStart = side ? itemValue(item, "y") : itemValue(item, "x");
          const itemEnd = itemStart + (side ? itemValue(item, "l") : itemValue(item, "w"));
          const cuts = facadeOpenings
            .filter((opening) => opening.type === "opening")
            .map((opening) => {
              const start = side ? opening.y : opening.x;
              return [start, start + Number(opening.w ?? 0)];
            })
            .filter(
              ([start, end]) =>
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                start < itemEnd &&
                end > itemStart,
            )
            .sort(([first], [second]) => first - second);
          const fragmentEnds = [
            itemStart,
            ...cuts.flatMap(([start, end]) => [
              Math.max(itemStart, start),
              Math.min(itemEnd, end),
            ]),
            itemEnd,
          ];
          const z0 = itemValue(item, "z0");
          const height = itemValue(item, "h");
          for (let fragmentIndex = 0; fragmentIndex < fragmentEnds.length - 1; fragmentIndex += 2) {
            const start = fragmentEnds[fragmentIndex];
            const end = fragmentEnds[fragmentIndex + 1];
            if (end - start <= 0.01) continue;
            const railing = document.createElementNS(svgNamespace, "rect");
            railing.setAttribute("x", `${(start - min + padding) * scale}`);
            railing.setAttribute(
              "y",
              `${(floorHeight - z0 - height + padding) * scale}`,
            );
            railing.setAttribute("width", `${(end - start) * scale}`);
            railing.setAttribute("height", `${height * scale}`);
            railing.classList.add("facade-railing");
            railing.dataset.id = item.dataset?.id || item.id || "";
            svg.append(railing);
          }
        });

      const sectionPath = (start, end, from, to, baseStart, baseEnd, top, roofOnly = false) => {
        const polygons = FloorPlanWalls.roofSection(
          [[0, baseStart], [1, baseEnd], [1, top], [0, top]], from, to, roofLimits, roofOnly,
        );
        const path = polygons.map((polygon) => polygon.map(([t, z], i) =>
          `${i ? "L" : "M"}${(start + (end - start) * t - min + padding) * scale},${(floorHeight - z + padding) * scale}`,
        ).join(" ") + " Z").join(" ");
        return { path, polygons };
      };
      const roomSection = (room, geometry, compoundPart, start, end, base, top) => {
        const value = (property) => compoundPart
          ? property === "x0" ? geometry.x : property === "x1" ? geometry.x + geometry.w
            : property === "y0" ? geometry.y : geometry.y + geometry.l
          : geometry[property]();
        const depth = side
          ? facadeEdge === "min" ? value("x0") : value("x1")
          : facadeEdge === "min" ? value("y0") : value("y1");
        const roomId = String(room.dataset.id || "");
        const wall = [...(plan.walls?.values() ?? [])].find((candidate) =>
          candidate.sourceSides?.some((source) => source.roomId === roomId && source.side === facadeWall));
        const polygons = FloorPlanWalls.wallElevation({
          from: side ? [depth, start] : [start, depth],
          to: side ? [depth, end] : [end, depth],
          thickness: wall?.thickness ?? Number(plan.catalog.walls?.thickness ?? 0.12),
          baseStart: base, baseEnd: base, top,
        }, roofLimits, side);
        const path = polygons.map((polygon) => polygon.map(([coordinate, z], i) =>
          `${i ? "L" : "M"}${(coordinate - min + padding) * scale},${(floorHeight - z + padding) * scale}`,
        ).join(" ") + " Z").join(" ");
        return { path, polygons };
      };

      const roofBehindRoom = (room) => {
        const [roomStart, roomEnd] = roomFacadeSpan(room);
        const roomDepth = roomFacadeDepth(room);
        return facadeRoofs.some((roof) => {
          if (roof.type !== "gable") return false;
          const geometry = roofGeometry(roof);
          if (!geometry || !roofReachesFacade(geometry)) return false;
          const [roofStart, roofEnd] = roofFacadeSpan(geometry);
          const overlapsAxis =
            Math.min(roomEnd, roofEnd) - Math.max(roomStart, roofStart) >
            0.001;
          return (
            overlapsAxis &&
            isStrictlyInFront(roomDepth, roofFacadeDepth(geometry))
          );
        });
      };

      surfaceRooms.forEach(({ room, geometry, compoundPart }) => {
        if (!roofBehindRoom(room)) return;
        const start = compoundPart
          ? side
            ? geometry.y
            : geometry.x
          : side
            ? room.y0()
            : room.x0();
        const end = compoundPart
          ? side
            ? geometry.y + geometry.l
            : geometry.x + geometry.w
          : side
            ? room.y1()
            : room.x1();
        const z0 = compoundPart ? geometry.z0 : room.z0();
        const z1 = compoundPart ? geometry.z1 : room.z1();
        const occluder = document.createElementNS(svgNamespace, "path");
        occluder.setAttribute("d", roomSection(room, geometry, compoundPart, start, end, z0, z1).path);
        occluder.classList.add("facade-occluder");
        svg.append(occluder);
      });

      surfaceRooms.forEach(({ room, geometry, compoundPart }) => {
        if (
          !compoundPart &&
          roomsCoveredByCloserRoom.has(String(room.dataset.id || ""))
        ) {
          return;
        }
        const start = compoundPart
          ? side
            ? geometry.y
            : geometry.x
          : side
            ? geometry.y0()
            : geometry.x0();
        const end = side
          ? compoundPart
            ? geometry.y + geometry.l
            : geometry.y1()
          : compoundPart
            ? geometry.x + geometry.w
            : geometry.x1();
        const z0 = compoundPart ? geometry.z0 : geometry.z0();
        const height = Math.max(
          (compoundPart ? geometry.z1 : geometry.z1()) - z0,
          0,
        );
        const section = roomSection(room, geometry, compoundPart, start, end, z0, z0 + height);
        if (!section.polygons.length) return;
        const tops = section.polygons.flat().map(([, z]) => z);
        const topStart = Math.max(...tops);
        const topStartY = (floorHeight - topStart + padding) * scale;
        const rect = document.createElementNS(svgNamespace, "path");
        rect.setAttribute("d", section.path);
        rect.classList.add("facade-room");
        rect.dataset.id = compoundPart
          ? `${room.dataset.id || ""}.${geometry.id || "part"}`
          : room.dataset.id || "";
        svg.append(rect);

        const roomLabel = compoundPart
          ? ""
          : room.querySelector(".room-label")?.textContent?.trim() ||
            room.dataset.label?.trim();
        if (roomLabel) {
          const label = document.createElementNS(svgNamespace, "text");
          const labelX = (start - min + padding + 0.12) * scale;
          const displayedHeight = Math.max(0, topStart - z0);
          const labelY = topStartY + 0.22 * scale;
          label.setAttribute("x", `${labelX}`);
          label.setAttribute("y", `${labelY}`);
          label.setAttribute("text-anchor", "start");
          label.classList.add("facade-room-label");
          const title = document.createElementNS(svgNamespace, "tspan");
          title.textContent = roomLabel;
          title.setAttribute("x", `${labelX}`);
          title.classList.add("facade-room-label-title");
          const dimensions = document.createElementNS(svgNamespace, "tspan");
          dimensions.textContent = `${plan.formatMeters(end - start)}m × ${plan.formatMeters(displayedHeight)}m`;
          dimensions.setAttribute("x", `${labelX}`);
          dimensions.setAttribute("dy", "1.2em");
          dimensions.classList.add("facade-room-label-details");
          label.append(title, dimensions);
          svg.append(label);
        }

      });

      const terrainElevationAt = (y) => {
        const profile = plan.terrainReference;
        if (
          !profile ||
          ![profile.frontY, profile.rearY, profile.frontZ, profile.rearZ].every(Number.isFinite) ||
          profile.frontY === profile.rearY
        ) return null;
        const offset = Number.parseFloat(
          getComputedStyle(plan.root).getPropertyValue("--building-offset-y"),
        ) || 0;
        const progress = Math.max(0, Math.min(1,
          (y + offset - profile.frontY) / (profile.rearY - profile.frontY),
        ));
        return profile.frontZ + progress * (profile.rearZ - profile.frontZ);
      };
      const projectedIndependentWalls = [];
      plan.independentWalls?.forEach((wall) => {
        const points = wall.path?.points ?? [];
        points.slice(0, -1).forEach(([x0, y0], segmentIndex) => {
          const [x1, y1] = points[segmentIndex + 1];
          const dx = x1 - x0;
          const dy = y1 - y0;
          const length = Math.hypot(dx, dy);
          if (length <= 1e-9) return;
          const projectedLength = side ? Math.abs(dy) : Math.abs(dx);
          if (projectedLength <= 1e-7) return;
          const depth = side ? (x0 + x1) / 2 : (y0 + y1) / 2;
          const inFacadeDepth = facadeEdge === "min"
            ? depth <= edge + facadeDepth
            : depth >= edge - facadeDepth;
          if (!inFacadeDepth) return;
          const start = side ? Math.min(y0, y1) : Math.min(x0, x1);
          const end = side ? Math.max(y0, y1) : Math.max(x0, x1);
          const startPoint = side
            ? y0 <= y1 ? [x0, y0] : [x1, y1]
            : x0 <= x1 ? [x0, y0] : [x1, y1];
          const endPoint = side
            ? y0 <= y1 ? [x1, y1] : [x0, y0]
            : x0 <= x1 ? [x1, y1] : [x0, y0];
          const startBase = wall.base === "terrain"
            ? terrainElevationAt(startPoint[1])
            : wall.baseZ;
          const endBase = wall.base === "terrain"
            ? terrainElevationAt(endPoint[1])
            : wall.baseZ;
          if (![startBase, endBase, wall.topZ].every(Number.isFinite)) return;
          projectedIndependentWalls.push({ wall, segmentIndex, depth, start, end, startBase, endBase, startPoint, endPoint });
        });
      });
      projectedIndependentWalls
        .sort((first, second) => facadeEdge === "min"
          ? second.depth - first.depth
          : first.depth - second.depth)
        .forEach(({ wall, segmentIndex, start, end, startBase, endBase, startPoint, endPoint }) => {
          const polygons = FloorPlanWalls.wallElevation({
            from: startPoint, to: endPoint, thickness: wall.thickness,
            baseStart: startBase, baseEnd: endBase, top: wall.topZ,
            roofOnly: wall.top === "roof",
          }, roofLimits, side);
          if (!polygons.length) return;
          const path = polygons.map((polygon) => polygon.map(([coordinate, z], i) =>
            `${i ? "L" : "M"}${(coordinate - min + padding) * scale},${(floorHeight - z + padding) * scale}`,
          ).join(" ") + " Z").join(" ");
          const face = document.createElementNS(svgNamespace, "path");
          face.setAttribute("d", path);
          face.classList.add("facade-independent-wall");
          face.dataset.wallId = wall.id;
          face.dataset.segment = String(segmentIndex);
          face.style.fill = wall.color
            ? plan.themeFillColor(wall.color)
            : getComputedStyle(plan.root)
                .getPropertyValue("--theme-wall-fill").trim() || "#f7f7f4";
          face.style.stroke = getComputedStyle(plan.root)
            .getPropertyValue("--theme-wall").trim() || "#222";
          face.style.strokeWidth = "1.5";
          svg.append(face);
        });

      const foregroundRoofSelector =
        ".facade-roof, .facade-roof-eave, .facade-roof-ridge, .facade-roof-label";
      svg.querySelectorAll(foregroundRoofSelector).forEach((element) => {
        if (element.dataset.roofInFront === "true") svg.append(element);
      });

      facadeOpenings
        .forEach((opening) => {
          const start = side ? opening.y : opening.x;
          const z0 = Number(opening.z0 ?? 0);
          const height = Number(opening.h ?? opening.z1 - z0);
          const featureWidth = Number(opening.w ?? 0.8);
          if (![start, z0, height, featureWidth].every(Number.isFinite)) return;
          const depth = side ? opening.x : opening.y;
          const clipId = `facade-${index}-opening-${svg.querySelectorAll("clipPath").length}`;
          const clip = document.createElementNS(svgNamespace, "clipPath");
          clip.id = clipId;
          const clipShape = document.createElementNS(svgNamespace, "path");
          clipShape.setAttribute("d", sectionPath(start, start + featureWidth,
            side ? [depth, start] : [start, depth],
            side ? [depth, start + featureWidth] : [start + featureWidth, depth],
            z0, z0, z0 + height).path);
          clip.append(clipShape);
          svg.append(clip);
          const featureGroup = document.createElementNS(svgNamespace, "g");
          featureGroup.setAttribute("clip-path", `url(#${clipId})`);
          svg.append(featureGroup);
          const rect = document.createElementNS(svgNamespace, "rect");
          rect.setAttribute("x", `${(start - min + padding) * scale}`);
          rect.setAttribute("y", `${(floorHeight - z0 - height + padding) * scale}`);
          rect.setAttribute("width", `${featureWidth * scale}`);
          rect.setAttribute("height", `${height * scale}`);
          rect.classList.add(
            opening.type === "window" ? "facade-window" : "facade-opening",
          );
          rect.dataset.id = opening.id || "";
          rect.setAttribute("aria-label", opening.type || "opening");
          const title = document.createElementNS(svgNamespace, "title");
          title.textContent = `${opening.type || "Abertura"}: ${opening.id || "sem id"}`;
          rect.append(title);
          featureGroup.append(rect);
          if (opening.type === "window") {
            const windowX = (start - min + padding) * scale;
            const windowY = (floorHeight - z0 - height + padding) * scale;
            const windowWidth = featureWidth * scale;
            const windowHeight = height * scale;
            for (let division = 1; division < 4; division += 1) {
              const vertical = document.createElementNS(svgNamespace, "line");
              const verticalX = windowX + (windowWidth * division) / 4;
              vertical.setAttribute("x1", `${verticalX}`);
              vertical.setAttribute("x2", `${verticalX}`);
              vertical.setAttribute("y1", `${windowY}`);
              vertical.setAttribute("y2", `${windowY + windowHeight}`);
              vertical.setAttribute(
                "stroke",
                getComputedStyle(plan.root).getPropertyValue("--theme-window-line").trim() || "#a7adb3",
              );
              vertical.setAttribute("stroke-width", "1");
              featureGroup.append(vertical);

              const horizontal = document.createElementNS(svgNamespace, "line");
              const horizontalY = windowY + (windowHeight * division) / 4;
              horizontal.setAttribute("x1", `${windowX}`);
              horizontal.setAttribute("x2", `${windowX + windowWidth}`);
              horizontal.setAttribute("y1", `${horizontalY}`);
              horizontal.setAttribute("y2", `${horizontalY}`);
              horizontal.setAttribute(
                "stroke",
                getComputedStyle(plan.root).getPropertyValue("--theme-window-line").trim() || "#a7adb3",
              );
              horizontal.setAttribute("stroke-width", "1");
              featureGroup.append(horizontal);
            }
          }
        });

      svg.querySelectorAll(".facade-railing").forEach((railing) => {
        svg.append(railing);
      });

      if (frontAligned && plan.terrainReference) {
        const profile = plan.terrainReference;
        const buildingOffsetY = Number.parseFloat(
          getComputedStyle(plan.root).getPropertyValue("--building-offset-y"),
        ) || 0;
        const profileValues = [
          profile.frontY,
          profile.rearY,
          profile.frontZ,
          profile.rearZ,
        ];
        if (
          profileValues.every(Number.isFinite) &&
          profile.rearY !== profile.frontY
        ) {
          const siteY = edge + buildingOffsetY;
          const progress = Math.max(
            0,
            Math.min(
              1,
              (siteY - profile.frontY) / (profile.rearY - profile.frontY),
            ),
          );
          const terrainZ =
            profile.frontZ + progress * (profile.rearZ - profile.frontZ);
          const terrainY = (floorHeight - terrainZ + padding) * scale;
          const profileLine = document.createElementNS(svgNamespace, "line");
          profileLine.classList.add("facade-terrain-profile");
          profileLine.setAttribute(
            "x1",
            `${(facadeMin - min + padding) * scale}`,
          );
          profileLine.setAttribute(
            "x2",
            `${(facadeMax - min + padding) * scale}`,
          );
          profileLine.setAttribute("y1", `${terrainY}`);
          profileLine.setAttribute("y2", `${terrainY}`);
          profileLine.setAttribute(
            "stroke",
            getComputedStyle(plan.root)
              .getPropertyValue("--theme-terrain-boundary")
              .trim() || "#55724d",
          );
          profileLine.setAttribute("stroke-width", "2");
          svg.append(profileLine);
        }
      }

      if (direction === "front") {
        // Looking at the front reverses the plan's horizontal axis. Keep text
        // readable while reflecting every geometric layer in the same frame.
        const drawing = document.createElementNS(svgNamespace, "g");
        drawing.classList.add("facade-front-projection");
        drawing.setAttribute("transform", `translate(${viewWidth} 0) scale(-1 1)`);
        svg.querySelectorAll("text").forEach((label) => {
          const x = Number(label.getAttribute("x") ?? 0);
          const transform = label.getAttribute("transform") || "";
          label.setAttribute("transform", `${transform} translate(${2 * x} 0) scale(-1 1)`.trim());
          const anchor = label.getAttribute("text-anchor") || "start";
          if (anchor !== "middle") label.setAttribute("text-anchor", anchor === "start" ? "end" : "start");
        });
        [...svg.children].forEach((element) => {
          if (element !== defs) drawing.append(element);
        });
        svg.append(drawing);
      }

      const figure = document.createElement("figure");
      figure.className = "facade-view-container";
      const title = document.createElement("figcaption");
      title.textContent = facade.label || `Fachada ${direction}`;
      figure.append(title, svg);
      const target =
        direction === "front"
          ? plan.facadeLayer
          : plan.secondaryFacadeLayer || plan.facadeLayer;
      target.append(figure);
    });
    this.updateRoofVisibility(plan);
  },
};

window.FloorPlanFacades = FloorPlanFacades;
