// Render precomputed regions; visibility affects presentation only.
const FloorPlanHeadroomView = {
  appendBands(plan, svg, result, { colors, label, allLabels = false }) {
    result.bands.forEach(({ height, polygons: band, area: bandArea, labelPosition }, index) => {
      const area = index === 0 ? bandArea : result.areas[index - 1].area;
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", band.map(polygon => `M${polygon.map(p => `${p[0]},${p[1]}`).join("L")}Z`).join(" "));
      path.setAttribute("fill", index === 0 ? "rgba(210, 110, 25, 0.24)" : colors[index - 1]);
      const title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = index === 0
        ? `${label}: altura < 1,30 m — ${plan.formatMeters(bandArea)} m²`
        : `${label}: altura ≥ ${plan.formatMeters(height)} m — ${plan.formatMeters(area)} m²`;
      path.append(title);
      svg.append(path);
      if (labelPosition && (allLabels || height < 2.85)) {
        const annotation = document.createElementNS(svg.namespaceURI, "text");
        annotation.setAttribute("class", "headroom-height-label");
        annotation.setAttribute("x", labelPosition[0]);
        annotation.setAttribute("y", labelPosition[1]);
        annotation.textContent = allLabels && height === 0 ? "1,3−" : `${height.toLocaleString("pt-BR")}+`;
        svg.append(annotation);
      }
    });
  },

  render(plan, { results, enabled, colors }) {
    const legend = document.querySelector("#comfort-legend");
    if (legend) legend.hidden = !plan.roomElements.some((room) => enabled(room.dataset.id))
      && !plan.root.querySelector(".stair-headroom-zone:not(.layer-hidden)");
    for (const room of plan.roomElements) {
      room.querySelectorAll(":scope > .headroom-zone").forEach((element) => element.remove());
      const result = results?.get(room.dataset.id);
      if (!result) continue;
      room.comfortAreas = result.areas;
      if (!enabled(room.dataset.id)) continue;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "headroom-zone");
      svg.setAttribute("aria-label", `Altura livre — ${room.dataset.label}`);
      svg.setAttribute("viewBox", `${room.x0()} ${room.y0()} ${room.w()} ${room.l()}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("overflow", "hidden");
      this.appendBands(plan, svg, result, { colors, label: room.dataset.label });
      room.append(svg);
    }
  },
};

window.FloorPlanHeadroomView = FloorPlanHeadroomView;
