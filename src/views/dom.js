const FloorPlanDom = {
  configureWallTooltip(plan) {
    let tooltip;
    let activeWall;
    let title;
    const hide = () => {
      if (activeWall) activeWall.title = title;
      activeWall = null;
      if (tooltip) tooltip.hidden = true;
    };
    plan.root.addEventListener("pointermove", (event) => {
      // Room fills and labels can sit above independent knee walls.
      // Inspect the stack under the cursor so those walls remain identifiable.
      const wall = document.elementsFromPoint(event.clientX, event.clientY)
        .find((element) => element.matches(".plan-wall") && plan.root.contains(element));
      if (!wall || plan.pointerPan || event.pointerType === "touch") {
        hide();
        return;
      }
      if (wall !== activeWall) {
        hide();
        title = wall.title;
        if (!title) return;
        if (!tooltip) {
          tooltip = document.createElement("div");
          tooltip.className = "wall-tooltip";
          tooltip.setAttribute("role", "tooltip");
          document.body.append(tooltip);
        }
        activeWall = wall;
        // Restore the native title on exit; avoid two tooltips during hover.
        wall.removeAttribute("title");
        tooltip.textContent = title;
        tooltip.hidden = false;
      }
      tooltip.style.left = `${Math.max(4, Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 4))}px`;
      tooltip.style.top = `${Math.max(4, Math.min(event.clientY + 16, window.innerHeight - tooltip.offsetHeight - 4))}px`;
    });
    plan.root.addEventListener("pointerleave", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
  },

  applyStairGradient(element, geometry, range) {
    const color = (z) => `color-mix(in srgb, var(--theme-circulation), var(--theme-stair-gradient-dark) ${
      ((1 - FloorPlanGeometry.stairGradientRatio(z, range)) * 100).toFixed(4)}%)`;
    let background = color(geometry.z0);
    if (geometry.h > 0) {
      const { treads: count, rise } = FloorPlanGeometry.stairSteps(geometry);
      const increasing = (geometry.stairDirection !== "reverse") === (geometry.stairRise !== "down");
      const stops = Array.from({ length: count }, (_, index) => {
        const step = increasing ? index + 1 : count - index;
        return `${color(geometry.z0 + rise * step)} ${index / count * 100}% ${(index + 1) / count * 100}%`;
      });
      background = `linear-gradient(to ${geometry.stairAxis === "horizontal" ? "right" : "bottom"}, ${stops.join(", ")})`;
      element.style.setProperty("--stair-step", (geometry.stairAxis === "horizontal" ? geometry.w : geometry.l) / count);
    }
    if (geometry.type === "solid-flared") {
      const horizontal = geometry.stairAxis === "horizontal";
      const increasing = (geometry.stairDirection !== "reverse") === (geometry.stairRise !== "down");
      const cross = horizontal ? geometry.l : geometry.w;
      const layers = geometry.steps.widths.map((width, index) => {
        const depth = 100 * (1 - index / geometry.steps.widths.length);
        const size = 100 * width / cross;
        const fill = color(geometry.z0 + geometry.h * (index + 1) / geometry.steps.widths.length);
        return `linear-gradient(${fill}, ${fill}) ${horizontal ? (increasing ? "right center" : "left center") : (increasing ? "center bottom" : "center top")} / ${horizontal ? `${depth}% ${size}%` : `${size}% ${depth}%`} no-repeat`;
      }).reverse();
      const outlines = geometry.steps.widths.map((width, index) => {
        const depth = 100 * (1 - index / geometry.steps.widths.length);
        const size = 100 * width / cross;
        const along = increasing ? 100 - depth : 0;
        const across = (100 - size) / 2;
        return `<rect x="${horizontal ? along : across}" y="${horizontal ? across : along}" width="${horizontal ? depth : size}" height="${horizontal ? size : depth}"/>`;
      }).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><g fill="none" stroke="#28323c" stroke-opacity=".7" stroke-width="1" vector-effect="non-scaling-stroke">${outlines}</g></svg>`;
      background = `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat, ${layers.join(", ")}`;
      element.dataset.stairType = "solid-flared";
      element.style.setProperty("clip-path", "none");
    }
    element.dataset.stairGradient = "height";
    element.style.setProperty("background", background, "important");
  },

  add(plan, data) {
    const {
      label = "",
      classes = "",
      title = "",
      room = false,
      showLabel = false,
      visible = true,
      container = plan.root,
    } = data;
    const normalized = plan.normalizeGeometry(data);
    const {
      x,
      y,
      w,
      l,
      z0,
      z1,
      h,
      rotation = 0,
      stairAxis,
      stairDirection = "forward",
      stairRise = h > 0 ? "up" : "flat",
    } = normalized;
    const element = document.createElement("div");
    element.className = `plan-item plan-generated${room ? " room" : ""}${classes ? ` ${classes}` : ""}${visible === false ? " plan-hidden" : ""}`;
    if (classes.split(/\s+/).includes("round-table")) {
      element.style.borderRadius = "50%";
    }
    if (data.color)
      element.style.backgroundColor = plan.themeFillColor(data.color);
    element.style.setProperty("--x", x);
    element.style.setProperty("--y", y);
    element.style.setProperty("--w", w);
    element.style.setProperty("--l", l);
    element.style.setProperty("--z0", z0);
    element.style.setProperty("--z1", z1);
    element.style.setProperty("--h", h);
    if (rotation) {
      element.style.transform = `rotate(${rotation}deg)`;
      element.style.transformOrigin = "center";
    }
    element.dataset.z0 = String(z0);
    element.dataset.z1 = String(z1);
    element.dataset.height = String(h);
    if (classes.split(/\s+/).includes("stair-flight")) {
      element.dataset.stairAxis = stairAxis;
      element.dataset.stairDirection = stairDirection;
      element.dataset.stairRise = stairRise;
      const elevationTolerance = 1e-9;
      element.dataset.stairFace =
        plan.currentFloorHeight >= z1 - elevationTolerance ? "top" : "bottom";
      if (h > 0) {
        element.style.setProperty(
          "--stair-clearance-stop",
          `${Math.min(100, (2 / h) * 100)}%`,
        );
      }
      const arrow = document.createElement("span");
      arrow.className = "stair-arrow";
      arrow.setAttribute("aria-hidden", "true");
      element.append(arrow);
    }
    if (classes.split(/\s+/).some((name) => ["stair-flight", "stair-landing"].includes(name))) {
      const sourceFloor = plan.roomFloorConfigs?.get(data.id);
      const base = Number(sourceFloor?.z0 ?? plan.currentFloorHeight);
      this.applyStairGradient(element, normalized, FloorPlanGeometry.stairGradientRange(base, [normalized]));
    }
    if (title) element.title = title;
    if (!room && showLabel && (label || title)) {
      const dimensions = `${plan.formatMeters(w)}m × ${plan.formatMeters(l)}m`;
      const itemLabel = String(label || title)
        .replace(
          /\s+\d+(?:[,.]\d+)?\s*m?\s*[×x]\s*\d+(?:[,.]\d+)?\s*m?\s*$/iu,
          "",
        )
        .trim();
      element.dataset.label = itemLabel;
      element.title = `${itemLabel} ${dimensions}`;
    }

    const walls = room ? plan.normalizeWalls(data.walls) : null;
    if (walls) {
      element.walls = walls;
      element.wallState = (side) => walls[side];
      element.hasWall = (side) => walls[side] === "solid";
    }

    element.x0 = () => Number(x);
    element.x1 = () => Number(x) + Number(w);
    element.xc = () => (element.x0() + element.x1()) / 2;
    element.y0 = () => Number(y);
    element.y1 = () => Number(y) + Number(l);
    element.yc = () => (element.y0() + element.y1()) / 2;
    element.z0 = () => Number(z0);
    element.z1 = () => Number(z1);
    element.zc = () => (element.z0() + element.z1()) / 2;
    element.h = () => Number(h);
    element.w = () => Number(w);
    element.l = () => Number(l);
    element.area = () => Number(w) * Number(l);
    FloorPlanGeometryBox.attach(element, { label: data.id || label || "room" });

    if (room) {
      if (data.id) element.dataset.id = data.id;
      element.dataset.label = label;
      if (plan.shouldRenderLabel(w, l)) {
        const roomLabel = document.createElement("span");
        roomLabel.className = "room-label";
        roomLabel.textContent = label;
        element.append(roomLabel);
        const dimensions = document.createElement("small");
        dimensions.textContent = `${plan.formatMeters(w)}m × ${plan.formatMeters(l)}m`;
        element.append(dimensions);

        const area = document.createElement("small");
        area.className = "area";
        area.textContent = `Área: ${plan.formatMeters(element.area())}m²`;
        element.append(area);
      }
    }

    FloorPlanRenderer.append(container, element);
    return element;
  },

  addRoom(plan, room) {
    const derived = room.derived === true;
    const firstClassStair = room.firstClassStair === true;
    const { container = plan.root } = room;
    const resolved = !derived && plan.roomDefinitions?.get(room.id) === room
      ? plan.getRoomGeometry(room.id)
      : FloorPlanGeometryDomain.normalizeRoomGeometry(plan, room);
    const parts = room.parts?.length ? resolved.normalizedParts : undefined;
    const stairParts = parts?.filter((part) => String(part.classes ?? "").split(/\s+/)
      .some((name) => ["stair-flight", "stair-landing"].includes(name))) ?? [];
    const sourceFloor = plan.roomFloorConfigs?.get(room.id);
    const stairGradient = stairParts.length ? FloorPlanGeometry.stairGradientRange(
      Number(sourceFloor?.z0 ?? plan.currentFloorHeight), stairParts) : null;
    const geometry = resolved.nominalGeometry;
    const roomData = parts?.length
      ? {
          ...room,
          pos: [geometry.x, geometry.y, geometry.z0],
          size: [geometry.w, geometry.l, geometry.h],
        }
      : room;
    const element = plan.add({ ...roomData, room: true, container });
    element.normalizedParts = resolved.normalizedParts;
    element.unused = room.unused === true;
    element.nominalGeometry = resolved.nominalGeometry;
    if (derived) {
      element.dataset.derived = "true";
      if (firstClassStair || room.classes?.split(/\s+/).includes("stair-flight"))
        element.dataset.spanningStair = "true";
    }
    element.allowedOverlaps = plan.normalizeOverlapTargets(room.overlaps);
    element.allowedOverlays = plan.normalizeOverlapTargets(room.overlays);
    element.geometryParts = parts?.length
      ? parts.map((part) => ({
          x: part.x,
          y: part.y,
          w: part.w,
          l: part.l,
          id: part.id,
          overlapTargets: plan.normalizeOverlapTargets(
            part.overlaps ?? room.overlaps,
          ),
          overlayTargets: plan.normalizeOverlapTargets(
            part.overlays ?? room.overlays,
          ),
        }))
      : [
          {
            x: element.x0(),
            y: element.y0(),
            w: element.w(),
            l: element.l(),
            id: room.id,
            overlapTargets: element.allowedOverlaps,
            overlayTargets: element.allowedOverlays,
          },
        ];
    if (parts?.length) {
      element.classList.add("compound-room");
      FloorPlanGeometryBox.attach(element, {
        compound: true,
        label: room.id || room.label || "room",
      });
      element.partReferences = new Map(parts.map((part) => [part.id,
        FloorPlanGeometryBox.fromGeometry(part, { label: part.id }),
      ]));
      parts.forEach((part) => {
        const partElement = document.createElement("div");
        const partClasses = part.classes || room.classes || "";
        partElement.className = `room-part${partClasses ? ` ${partClasses}` : ""}`;
        if (part.label && plan.shouldRenderLabel(part.w, part.l)) {
          const partLabel = document.createElement("span");
          partLabel.className = "room-label";
          partLabel.textContent = part.label;
          partElement.append(partLabel);
          const partDimensions = document.createElement("small");
          partDimensions.className = "part-dimensions";
          partDimensions.textContent = `${plan.formatMeters(part.w)}m × ${plan.formatMeters(part.l)}m`;
          partElement.append(partDimensions);
        }
        partElement.style.left = `calc((${part.x} - var(--x)) * var(--m))`;
        partElement.style.top = `calc((${part.y} - var(--y)) * var(--m))`;
        partElement.style.width = `calc(${part.w} * var(--m))`;
        partElement.style.height = `calc(${part.l} * var(--m))`;
        partElement.style.setProperty("--z0", part.z0);
        partElement.style.setProperty("--z1", part.z1);
        partElement.style.setProperty("--h", part.h);
        Object.assign(partElement, FloorPlanGeometryBox.fromGeometry(part, { label: part.id }));
        const partColor = part.color ?? room.color;
        if (partColor)
          partElement.style.backgroundColor = plan.themeFillColor(partColor);
        if (stairGradient && partClasses.split(/\s+/).some((name) => ["stair-flight", "stair-landing"].includes(name))) {
          this.applyStairGradient(partElement, part, stairGradient);
        }
        if (partClasses.split(/\s+/).includes("stair-flight")) {
          partElement.dataset.stairAxis = part.stairAxis;
          partElement.dataset.stairDirection = part.stairDirection || "forward";
          partElement.dataset.stairRise =
            part.stairRise || (part.h > 0 ? "up" : "flat");
          const elevationTolerance = 1e-9;
          partElement.dataset.stairFace =
            plan.currentFloorHeight >= part.z1 - elevationTolerance
              ? "top"
              : "bottom";
          if (part.h > 0) {
            partElement.style.setProperty(
              "--stair-clearance-stop",
              `${Math.min(100, (2 / part.h) * 100)}%`,
            );
          }
          const arrow = document.createElement("span");
          arrow.className = "stair-arrow";
          arrow.setAttribute("aria-hidden", "true");
          partElement.append(arrow);
        }
        const walls = plan.normalizeWalls(part.walls ?? room.walls);
        partElement.walls = walls;
        partElement.dataset.overlapTargets = JSON.stringify(
          plan.normalizeOverlapTargets(part.overlaps ?? room.overlaps),
        );
        partElement.dataset.overlayTargets = JSON.stringify(
          plan.normalizeOverlapTargets(part.overlays ?? room.overlays),
        );
        partElement.dataset.partId = part.id;
        element.geometryParts.find(
          (geometryPart) => geometryPart.id === part.id,
        ).element = partElement;
        element.prepend(partElement);
      });
      element.area = () =>
        parts.reduce((total, part) => total + part.w * part.l, 0);
    }
    const roomDimensions = `${plan.formatMeters(element.w())}m × ${plan.formatMeters(element.l())}m`;
    const roomArea = `Área: ${plan.formatMeters(element.area())}m²`;
    element.title = `${room.label || room.id || "Cômodo"} — ${roomDimensions} — ${roomArea}`;
    const displayedArea = element.querySelector(":scope > .area");
    if (displayedArea) displayedArea.textContent = roomArea;
    if (firstClassStair && container === plan.root) {
      element.dataset.kind = "stair";
      element.querySelectorAll(":scope > .area").forEach((area) => area.remove());
      element.title = `${room.label || room.id || "Escada"} — ${roomDimensions}`;
      plan.stairElements.push(element);
    } else if (!derived) plan.roomElements.push(element);
    else if (
      room.classes?.split(/\s+/).includes("stair-flight") &&
      container === plan.root
    )
      plan.stairElements.push(element);
    if (room.id) element.dataset.id = room.id;
    if (room.id && !derived) {
      plan.rooms.set(room.id, element);
      plan.references.set(room.id, element);
    }
    if (!derived && !firstClassStair) {
      plan.updateOverlaps();
      plan.roomArea += element.area();
      plan.roomCount += 1;
      plan.updateSummary();
    }
    return element;
  },
};

window.FloorPlanDom = FloorPlanDom;
