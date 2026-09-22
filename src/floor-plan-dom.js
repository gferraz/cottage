const FloorPlanDom = {
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
      stairDirection = "forward",
      stairRise = h > 0 ? "up" : "flat",
    } = normalized;
    const element = document.createElement("div");
    element.className = `plan-item plan-generated${room ? " room" : ""}${classes ? ` ${classes}` : ""}${visible === false ? " plan-hidden" : ""}`;
    if (data.color)
      element.style.backgroundColor = plan.themeFillColor(data.color);
    element.style.setProperty("--x", x);
    element.style.setProperty("--y", y);
    element.style.setProperty("--w", w);
    element.style.setProperty("--l", l);
    element.style.setProperty("--z0", z0);
    element.style.setProperty("--z1", z1);
    element.style.setProperty("--h", h);
    element.dataset.z0 = String(z0);
    element.dataset.z1 = String(z1);
    element.dataset.height = String(h);
    if (classes.split(/\s+/).includes("stair-flight")) {
      element.dataset.stairAxis = w >= l ? "horizontal" : "vertical";
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
    const { container = plan.root } = room;
    const parts = room.parts?.length
      ? plan.normalizeParts(room.parts)
      : undefined;
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
        }
      : {};
    const roomData = parts?.length
      ? {
          ...room,
          pos: [geometry.x, geometry.y],
          size: [geometry.w, geometry.l],
        }
      : room;
    const element = plan.add({ ...roomData, room: true, container });
    if (derived) {
      element.dataset.derived = "true";
      if (room.classes?.split(/\s+/).includes("stair-flight"))
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
      element.partReferences = new Map(
        parts.map((part) => [
          part.id,
          {
            x0: () => part.x,
            x1: () => part.x + part.w,
            xc: () => part.x + part.w / 2,
            y0: () => part.y,
            y1: () => part.y + part.l,
            yc: () => part.y + part.l / 2,
            z0: () => part.z0,
            z1: () => part.z1,
            zc: () => (part.z0 + part.z1) / 2,
            h: () => part.h,
            w: () => part.w,
            l: () => part.l,
            area: () => part.w * part.l,
          },
        ]),
      );
      element.partReferences.forEach((reference, partId) =>
        FloorPlanGeometryBox.attach(reference, { label: partId }),
      );
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
        partElement.x0 = () => Number(part.x);
        partElement.x1 = () => Number(part.x) + Number(part.w);
        partElement.y0 = () => Number(part.y);
        partElement.y1 = () => Number(part.y) + Number(part.l);
        partElement.z0 = () => Number(part.z0);
        partElement.z1 = () => Number(part.z1);
        partElement.w = () => Number(part.w);
        partElement.l = () => Number(part.l);
        partElement.h = () => Number(part.h);
        partElement.area = () => Number(part.w) * Number(part.l);
        FloorPlanGeometryBox.attach(partElement, { label: part.id });
        const partColor = part.color ?? room.color;
        if (partColor)
          partElement.style.backgroundColor = plan.themeFillColor(partColor);
        if (partClasses.split(/\s+/).includes("stair-flight")) {
          partElement.dataset.stairAxis =
            part.w >= part.l ? "horizontal" : "vertical";
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
    if (!derived) plan.roomElements.push(element);
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
    if (!derived) {
      plan.updateOverlaps();
      plan.roomArea += element.area();
      plan.roomCount += 1;
      plan.updateSummary();
    }
    return element;
  },
};

window.FloorPlanDom = FloorPlanDom;
