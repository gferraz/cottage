const FloorPlanHeadroom = {
  thresholds: [1.3, 2.1, 3],

  enabled(plan, roomId) {
    return plan.roomDefinitions.get(roomId)?.comfort_zones
      ?? plan.roomFloorConfigs.get(roomId)?.comfort_zones
      ?? plan.currentConfig?.comfort_zones ?? true;
  },
  colors: ["rgba(240, 140, 35, 0.14)", "rgba(245, 215, 75, 0.14)", "rgba(255, 255, 255, 0.35)"],

  area(polygon) {
    return FloorPlanGeometryOperations.area(polygon);
  },

  rectangle({ x, y, w, l }) {
    return FloorPlanGeometryOperations.rectangle({ x, y, w, l });
  },

  // Subtract a convex footprint, preserving disjoint convex pieces.
  subtract(polygon, cutter) {
    return FloorPlanGeometryOperations.subtract(polygon, cutter);
  },

  union(polygons) {
    return FloorPlanGeometryOperations.union(polygons);
  },

  calculate(parts, surfaces, floorZ, deductions = [], thresholds = this.thresholds) {
    // Use the same intersected underside polygons as the 3D roof. Thickness
    // grows above this reference surface, as in solidSurface(). Retained lower
    // roofs (clip_intersections: false / rake extensions) also limit clearance.
    const overhead = surfaces.flatMap(entry => entry.polygons)
      .map(polygon => FloorPlanRoofGeometry.clipPolygon(polygon, [0, 0, -1, floorZ + 1e-8]))
      .filter(polygon => this.area(polygon) > 1e-10);
    const footprints = this.union(parts.map(part => this.rectangle(part)));
    return thresholds.map(height => {
      const high = overhead.map(polygon => FloorPlanRoofGeometry.clipPolygon(polygon, [0, 0, -1, floorZ + height]));
      const low = overhead.map(polygon => FloorPlanRoofGeometry.clipPolygon(polygon, [0, 0, 1, -floorZ - height]))
        .filter(polygon => polygon.some(point => point[2] < floorZ + height - 1e-8));
      const candidates = high.flatMap(polygon => footprints.flatMap(footprint => {
        let pieces = [polygon];
        for (let i = 0; i < footprint.length; i += 1) {
          const p = footprint[i], q = footprint[(i + 1) % footprint.length];
          const a = q[1] - p[1], b = p[0] - q[0];
          pieces = pieces.map(piece => FloorPlanRoofGeometry.clipPolygon(piece, [a, b, 0, -a*p[0]-b*p[1]]));
        }
        return pieces.filter(piece => this.area(piece) > 1e-10);
      }));
      let polygons = this.union(candidates);
      for (const cutter of [...low, ...deductions.map(part => this.rectangle(part))])
        polygons = polygons.flatMap(polygon => this.subtract(polygon, cutter));
      return { height, polygons, area: polygons.reduce((sum, polygon) => sum + this.area(polygon), 0) };
    });
  },

  render(plan) {
    const surfaces = FloorPlanRoofGeometry.intersectingSurfaces(plan);
    const enabled = room => this.enabled(plan, room.dataset.id);
    const legend = document.querySelector("#comfort-legend");
    if (legend) legend.hidden = !plan.roomElements.some(enabled);
    for (const room of plan.roomElements) {
      if (!enabled(room)) continue;
      const ids = new Set([room.dataset.id, ...room.geometryParts.map(part => `${room.dataset.id}.${part.id}`)]);
      const deductions = plan.roomElements.filter(other => other !== room && other.dataset.floorId === room.dataset.floorId)
        .flatMap(other => other.geometryParts.filter(part =>
          (part.overlapTargets ?? other.allowedOverlaps ?? []).some(id => ids.has(id))));
      deductions.push(...plan.itemElements.filter(item => item.dataset.floorId === room.dataset.floorId &&
        (item.allowedOverlaps ?? []).some(id => ids.has(id)))
        .map(item => ({ x: item.x0(), y: item.y0(), w: item.w(), l: item.l() })));
      room.comfortAreas = this.calculate(room.geometryParts, surfaces, room.z0(), deductions);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "headroom-zone");
      svg.setAttribute("aria-label", `Altura livre — ${room.dataset.label}`);
      svg.setAttribute("viewBox", `${room.x0()} ${room.y0()} ${room.w()} ${room.l()}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("overflow", "hidden");
      const covered = this.calculate(room.geometryParts, surfaces, room.z0(), deductions, [0])[0];
      const bands = [covered, ...room.comfortAreas];
      bands.forEach(({ height, polygons, area }, index) => {
        // Paint disjoint bands so translucent colors never mix.
        let band = polygons;
        for (const cutter of bands[index + 1]?.polygons ?? [])
          band = band.flatMap(polygon => this.subtract(polygon, cutter));
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", band.map(polygon => `M${polygon.map(p => `${p[0]},${p[1]}`).join("L")}Z`).join(" "));
        path.setAttribute("fill", index === 0 ? "rgba(210, 110, 25, 0.24)" : this.colors[index - 1]);
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = index === 0
          ? `${room.dataset.label}: altura < 1,30 m — ${plan.formatMeters(band.reduce((sum, polygon) => sum + this.area(polygon), 0))} m²`
          : `${room.dataset.label}: altura ≥ ${plan.formatMeters(height)} m — ${plan.formatMeters(area)} m²`;
        path.append(title);
        svg.append(path);
        const largest = band.reduce((best, polygon) =>
          this.area(polygon) > this.area(best) ? polygon : best, []);
        if (largest.length && height < 3) {
          const label = document.createElementNS(svg.namespaceURI, "text");
          label.setAttribute("class", "headroom-height-label");
          label.setAttribute("x", largest.reduce((sum, point) => sum + point[0], 0) / largest.length);
          label.setAttribute("y", largest.reduce((sum, point) => sum + point[1], 0) / largest.length);
          label.textContent = `${height.toLocaleString("pt-BR")}+`;
          svg.append(label);
        }
      });
      room.append(svg);
    }
  },
};
window.FloorPlanHeadroom = FloorPlanHeadroom;
