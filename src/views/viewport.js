const FloorPlanViewport = {
  configure(plan, viewport) {
    const size = Array.isArray(viewport?.size)
      ? viewport.size.map(Number)
      : [20, 20];
    const origin = Array.isArray(viewport?.origin)
      ? viewport.origin.map(Number)
      : [-4.25, -4.25];
    if (size.length !== 2 || size.some((value) => !(value > 0))) {
      throw new Error("Viewport size must contain two positive metre values");
    }
    if (
      origin.length !== 2 ||
      origin.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("Viewport origin must contain two numeric metre values");
    }
    plan.viewport = { size, origin };
    plan.root.style.setProperty("--viewport-width", size[0]);
    plan.root.style.setProperty("--viewport-height", size[1]);
    plan.root.style.setProperty("--viewport-origin-x", origin[0]);
    plan.root.style.setProperty("--viewport-origin-y", origin[1]);
    this.resize(plan);
  },

  resize(plan) {
    const [width] = plan.viewport.size;
    const availableWidth =
      plan.root.parentElement?.clientWidth || width * plan.viewportScale;
    plan.viewportScale = Math.max(1, availableWidth / width);
    plan.root.style.setProperty("--m", `${plan.viewportScale}px`);
    this.updateSummary(plan);
  },

  updateSummary(plan) {
    if (!plan.viewportSummary) return;
    const [width, height] = plan.viewport.size;
    const [originX, originY] = plan.viewport.origin;
    plan.viewportSummary.textContent = `Viewport: ${plan.formatMeters(width)}m × ${plan.formatMeters(height)}m · origem (${plan.formatMeters(originX)}, ${plan.formatMeters(originY)})m · escala ${plan.viewportScale.toFixed(2)} px/m`;
  },

  beginPan(plan, event) {
    if (event.button !== 0 || event.target.closest("button, select, input, a"))
      return;
    plan.pointerPan = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: [...plan.viewport.origin],
    };
    plan.root.setPointerCapture(event.pointerId);
    plan.root.classList.add("is-panning");
  },

  updatePan(plan, event) {
    if (!plan.pointerPan || event.pointerId !== plan.pointerPan.id) return;
    const dx = (event.clientX - plan.pointerPan.x) / plan.viewportScale;
    const dy = (event.clientY - plan.pointerPan.y) / plan.viewportScale;
    plan.viewport.origin[0] = plan.pointerPan.origin[0] + dx;
    plan.viewport.origin[1] = plan.pointerPan.origin[1] + dy;
    plan.root.style.setProperty("--viewport-origin-x", plan.viewport.origin[0]);
    plan.root.style.setProperty("--viewport-origin-y", plan.viewport.origin[1]);
    this.updateTerrain(plan);
    this.updateSummary(plan);
  },

  endPan(plan, event) {
    if (plan.pointerPan && (!event || event.pointerId === plan.pointerPan.id)) {
      plan.pointerPan = null;
      plan.root.classList.remove("is-panning");
    }
  },

  updateTerrain(plan) {
    const [width, height] = plan.viewport.size;
    const [originX, originY] = plan.viewport.origin;
    const viewBox = `${originX} ${originY} ${width} ${height}`;
    plan.terrainLayer?.setAttribute("viewBox", viewBox);
    plan.guidesLayer?.setAttribute("viewBox", viewBox);
  },

  preparePrint(plan) {
    const [siteWidth, siteHeight] = plan.viewport.size;
    if (!(siteWidth > 0) || !(siteHeight > 0)) return;

    const mmToPx = 96 / 25.4;
    const printableWidth = 200 * mmToPx;
    const printableHeight = (287 - 24) * mmToPx;
    const maxScale = Math.min(
      printableWidth / siteWidth,
      printableHeight / siteHeight,
    );
    const printScale = Math.max(1, Math.floor(maxScale * 10) / 10);
    plan.root.style.setProperty("--print-m", `${printScale}px`);
    plan.root.dataset.printSplitRequired = "false";
  },

  clearPrintScale(plan) {
    plan.root.style.removeProperty("--print-m");
    delete plan.root.dataset.printSplitRequired;
  },
};

window.FloorPlanViewport = FloorPlanViewport;
