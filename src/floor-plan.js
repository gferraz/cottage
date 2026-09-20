class FloorPlan {
  constructor({ root, catalog = null, terrainLayer = null, guidesLayer = null, viewportSummary = null, titleElement = null, floorSelect = null, roomList = null, itemList = null, roofList = null, floorSummary = null, roomCountSummary = null, summary = null, usefulAreaSummary = null, boundsSummary = null, terrainSummary = null, openingList = null, windowList = null, naturalList = null, errorList = null, downloadButton = null, markdownButton = null, dxfButton = null, multiFloorButton = null, jsonInput = null, layerButton = null, scale = 56 }) {
    this.root = root;
    this.catalog = catalog || window.FloorPlanCatalog || { colors: {}, items: {}, openings: {} };
    this.terrainLayer = terrainLayer;
    this.guidesLayer = guidesLayer;
    this.viewportSummary = viewportSummary;
    this.titleElement = titleElement;
    this.floorSelect = floorSelect;
    this.roomList = roomList;
    this.itemList = itemList;
    this.roofList = roofList;
    this.floorSummary = floorSummary;
    this.roomCountSummary = roomCountSummary;
    this.summary = summary;
    this.usefulAreaSummary = usefulAreaSummary;
    this.boundsSummary = boundsSummary;
    this.terrainSummary = terrainSummary;
    this.openingList = openingList;
    this.windowList = windowList;
    this.naturalList = naturalList;
    this.errorList = errorList;
    this.downloadButton = downloadButton;
    this.markdownButton = markdownButton;
    this.dxfButton = dxfButton;
    this.multiFloorButton = multiFloorButton;
    this.jsonInput = jsonInput;
    this.layerButton = layerButton;
    this.roomArea = 0;
    this.roomCount = 0;
    this.rooms = new Map();
    this.references = new Map();
    this.roomElements = [];
    this.stairElements = [];
    this.itemElements = [];
    this.zoneElements = [];
    this.openings = [];
    this.windows = [];
    this.naturalCommunications = [];
    this.errors = [];
    this.currentConfig = null;
    this.currentFloorId = null;
    this.currentFloorHeight = 0;
    this.currentSourceText = null;
    this.model = null;
    this.itemTypes = {};
    this.roomDefinitions = new Map();
    this.roomGeometryCache = new Map();
    this.roomGeometryStack = new Set();
    this.partReferenceStack = [];
    this.invalidRoomIds = new Set();
    this.allRooms = [];
    this.allItems = [];
    this.allOpenings = [];
    this.allWindows = [];
    this.allRoofs = [];
    this.terrainArea = 0;
    this.terrainDimensions = null;
    this.terrainReference = null;
    this.theme = { colors: { red: "#c94c4c", blue: "#4d7899", green: "#628b5a", gray: "#777", circulation: "#f5eede", hazel: "var(--theme-hazel)" } };
    this.viewport = { size: [20, 20], origin: [-4.25, -4.25] };
    this.viewportScale = scale;
    this.pointerPan = null;
    this.layerCutoff = null;
    this.projectionLayer = document.createElement("div");
    this.projectionLayer.className = "floor-projection-layer";
    root.prepend(this.projectionLayer);
    this.multiFloorLayer = document.createElement("div");
    this.multiFloorLayer.className = "multi-floor-layer";
    root.prepend(this.multiFloorLayer);
    this.multiFloorMode = false;

    root.style.setProperty("--m", `${scale}px`);
    root.addEventListener("pointerdown", (event) => this.beginViewportPan(event));
    root.addEventListener("pointermove", (event) => this.updateViewportPan(event));
    root.addEventListener("pointerup", (event) => this.endViewportPan(event));
    root.addEventListener("pointercancel", (event) => this.endViewportPan(event));
    root.addEventListener("lostpointercapture", () => { this.pointerPan = null; });
    if (typeof ResizeObserver !== "undefined") {
      this.viewportResizeObserver = new ResizeObserver(() => this.resizeViewport());
      this.viewportResizeObserver.observe(root.parentElement || root);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", () => this.resizeViewport());
    }
    if (downloadButton) downloadButton.addEventListener("click", () => this.downloadHtml());
    if (markdownButton) markdownButton.addEventListener("click", () => this.downloadMarkdown());
    if (dxfButton) dxfButton.addEventListener("click", () => FloorPlanExport.downloadDxf(this));
    if (dxfButton) dxfButton.disabled = true;
    if (multiFloorButton) {
      multiFloorButton.disabled = true;
      multiFloorButton.addEventListener("click", () => {
        this.multiFloorMode = !this.multiFloorMode;
        this.renderMultiFloorUnderlay();
      });
    }
    if (layerButton) {
      layerButton.disabled = true;
      layerButton.addEventListener("click", () => this.cycleLayer());
    }
    if (floorSelect) {
      floorSelect.disabled = true;
      floorSelect.addEventListener("change", () => {
        if (!this.currentConfig?.floors) return;
        const activeFloor = this.currentConfig.floors.findIndex((floorConfig) => floorConfig.id === floorSelect.value);
        if (activeFloor >= 0) this.load({ ...this.currentConfig, activeFloor });
      });
    }
    if (jsonInput) {
      jsonInput.addEventListener("change", async (event) => {
        const [file] = event.target.files;
        if (!file) return;

        try {
          await this.loadFile(file);
        } catch (error) {
          alert(`Não foi possível carregar a planta: ${error.message}`);
        } finally {
          event.target.value = "";
        }
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeprint", () => this.preparePrint());
      window.addEventListener("afterprint", () => this.clearPrintScale());
    }
  }

  configureViewport(viewport) {
    return FloorPlanViewport.configure(this, viewport);
  }

  resizeViewport() {
    return FloorPlanViewport.resize(this);
  }

  updateViewportSummary() {
    return FloorPlanViewport.updateSummary(this);
  }

  beginViewportPan(event) {
    return FloorPlanViewport.beginPan(this, event);
  }

  updateViewportPan(event) {
    return FloorPlanViewport.updatePan(this, event);
  }

  endViewportPan(event) {
    return FloorPlanViewport.endPan(this, event);
  }

  updateTerrainViewport() {
    return FloorPlanViewport.updateTerrain(this);
  }

  themeColor(color) {
    const value = this.theme.colors?.[color];
    return typeof value === "string" ? value : (value?.line || color || "#777");
  }

  themeFillColor(color) {
    const value = this.theme.colors?.[color];
    return typeof value === "string" ? value : (value?.fill || value?.line || color || "transparent");
  }

  normalizeOverlapTargets(value) {
    if (value === undefined) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.map((target) => {
      if (target && typeof target === "object") return String(target.with ?? target.target ?? "").trim();
      return String(target).trim();
    }).filter(Boolean);
  }

  shouldRenderLabel(w, l) {
    return Number(w) >= 1 && Number(l) >= 1;
  }

  add(data) {
    return FloorPlanDom.add(this, data);
  }

  addRoom(room) {
    return FloorPlanDom.addRoom(this, room);
  }
  normalizeGeometryAtFloor(data, floorConfig) {
    return FloorPlanGeometryDomain.normalizeGeometryAtFloor(this, data, floorConfig);
  }

  addSpanningStairs(config, floorConfig) {
    return FloorPlanGeometryDomain.addSpanningStairs(this, config, floorConfig);
  }
  addRooms(rooms) {
    let pending = [...rooms];
    while (pending.length > 0) {
      const next = [];
      let added = 0;

      pending.forEach((room) => {
        try {
          this.addRoom(room);
          added += 1;
        } catch (error) {
          if (error.message.startsWith("Unknown room reference:") || error.message.startsWith("Unknown room reference")) {
            next.push(room);
          } else {
            this.errors.push({ category: "room", id: room.id, opening: room, message: error.message });
          }
        }
      });

      if (added === 0) {
        next.forEach((room) => {
          this.errors.push({
            category: "room",
            id: room.id,
            opening: room,
            message: "Não foi possível resolver as referências geométricas do cômodo"
          });
        });
        break;
      }
      pending = next;
    }
  }

  prepareRoomReferences(config) {
    return FloorPlanReferences.prepareRoomReferences(this, config);
  }

  registerGlobalPartReferences() {
    return FloorPlanReferences.registerGlobalPartReferences(this);
  }

  registerFloorReferences(config) {
    return FloorPlanReferences.registerFloorReferences(this, config);
  }

  registerStaticGuideReferences(config) {
    return FloorPlanReferences.registerStaticGuideReferences(this, config);
  }

  registerStaticZoneReferences(config) {
    return FloorPlanReferences.registerStaticZoneReferences(this, config);
  }

  validateGlobalObjectIds(config) {
    return FloorPlanReferences.validateGlobalObjectIds(this, config);
  }

  visibleZones(config, floorConfig) {
    return FloorPlanReferences.visibleZones(this, config, floorConfig);
  }

  visibleRoofs(config, floorConfig) {
    return FloorPlanReferences.visibleRoofs(this, config, floorConfig);
  }

  visibleGuides(config, floorConfig) {
    return FloorPlanReferences.visibleGuides(this, config, floorConfig);
  }

  validateInactiveFloorFeatures(config, activeFloorIndex) {
    return FloorPlanReferences.validateInactiveFloorFeatures(this, config, activeFloorIndex);
  }

  prepareGlobalLists(config) {
    return FloorPlanReferences.prepareGlobalLists(this, config);
  }

  createRoomReference(id) {
    return FloorPlanReferences.createRoomReference(this, id);
  }

  normalizeParts(parts) {
    return FloorPlanReferences.normalizeParts(this, parts);
  }

  getRoomGeometry(id) {
    return FloorPlanReferences.getRoomGeometry(this, id);
  }
  normalizeGeometry(data) {
    return FloorPlanGeometryDomain.normalizeGeometry(this, data);
  }

  normalizeWalls(walls) {
    return FloorPlanGeometryDomain.normalizeWalls(this, walls);
  }
  clearTerrain() {
    return FloorPlanTerrain.clear(this);
  }

  applyBuildingPlacement(building = null) {
    return FloorPlanTerrain.applyBuildingPlacement(this, building);
  }

  renderTerrain(terrain) {
    return FloorPlanTerrain.render(this, terrain);
  }

  renderGuides(guides = []) {
    return FloorPlanGuides.render(this, guides);
  }

  renderRoofs(roofs = []) {
    return FloorPlanRoofs.render(this, roofs);
  }
  resolveExpression(expression, localOrigin = null) {
    return FloorPlanGeometry.resolveExpression.call(this, expression, localOrigin);
  }

  resolve(value, localOrigin = null) {
    return FloorPlanGeometry.resolve.call(this, value, localOrigin);
  }

  addItem(item) {
    return FloorPlanElements.addItem(this, item);
  }

  resolveItemType(item) {
    return FloorPlanElements.resolveItemType(this, item);
  }

  addZone(zone) {
    return FloorPlanElements.addZone(this, zone);
  }

  addZones(zones) {
    return FloorPlanElements.addZones(this, zones);
  }

  addOpening(opening) {
    return FloorPlanOpenings.addOpening(this, opening);
  }

  isVerticalOpening(opening) {
    return FloorPlanOpenings.isVerticalOpening(this, opening);
  }

  addVerticalOpening(opening, floorConfig = null) {
    return FloorPlanOpenings.addVerticalOpening(this, opening, floorConfig);
  }

  clipProjection(element, geometry, opening) {
    return FloorPlanOpenings.clipProjection(this, element, geometry, opening);
  }

  renderLowerFloorProjection(floors, fromFloor, fromHeight, opening) {
    return FloorPlanOpenings.renderLowerFloorProjection(this, floors, fromFloor, fromHeight, opening);
  }

  addVisibleVerticalOpenings(config, floorConfig) {
    return FloorPlanOpenings.addVisibleVerticalOpenings(this, config, floorConfig);
  }

  addWindow(window) {
    return FloorPlanOpenings.addWindow(this, window);
  }

  renderWallFeature(feature, baseClass) {
    return FloorPlanOpenings.renderWallFeature(this, feature, baseClass);
  }

  normalizeOpening(opening) {
    return FloorPlanOpenings.normalizeOpening(this, opening);
  }

  wallSegment(room, wall) {
    return FloorPlanOpenings.wallSegment(room, wall);
  }
  bounds({ includeItems = false } = {}) {
    return FloorPlanMetrics.bounds(this, { includeItems });
  }

  buildingReferenceBounds() {
    return FloorPlanMetrics.buildingReferenceBounds(this);
  }

  updateOverlaps() {
    return FloorPlanLayers.updateOverlaps(this);
  }

  cycleLayer() {
    return FloorPlanLayers.cycleLayer(this);
  }

  updateLayerVisibility() {
    return FloorPlanLayers.updateLayerVisibility(this);
  }

  renderMultiFloorUnderlay(floorConfig = null) {
    return FloorPlanLayers.renderMultiFloorUnderlay(this, floorConfig);
  }
  clear() {
    FloorPlanRenderer.clearGenerated(this.root);
    this.projectionLayer.replaceChildren();
    this.multiFloorLayer.replaceChildren();
    this.clearTerrain();
    this.rooms.clear();
    this.stairElements = [];
    this.references.clear();
    this.roomElements = [];
    this.itemElements = [];
    this.zoneElements = [];
    this.openings = [];
    this.windows = [];
    this.allRoofs = [];
    this.errors = [];
    this.roomArea = 0;
    this.roomCount = 0;
    this.layerCutoff = null;
    this.maxLayer = 0;
    this.updateSummary();
  }

  load(config) {
    this.model = FloorPlanModel.fromConfig(config);
    this.currentConfig = config;
    this.itemTypes = { ...(this.catalog.items || {}), ...(config["item-types"] || {}) };
    this.theme = {
      ...this.theme,
      ...(config.theme || {}),
      colors: { ...this.theme.colors, ...(this.catalog.colors || {}), ...(config.theme?.colors || {}) }
    };
    this.configureViewport(this.model.viewport);
    const configuredFloorIndex = Number.isInteger(config.activeFloor)
      ? config.activeFloor
      : config.floors?.findIndex((floorConfig) => floorConfig.id === this.currentFloorId);
    const floorIndex = configuredFloorIndex >= 0 ? configuredFloorIndex : 0;
    const floorConfig = config.floors?.[floorIndex] || config;
    this.currentFloorId = floorConfig.id || null;
    this.currentFloorHeight = Number(floorConfig.h ?? 0);
    if (!Number.isFinite(this.currentFloorHeight)) {
      throw new Error("floor.h precisa ser numérico");
    }
    if (this.floorSelect) {
      this.floorSelect.replaceChildren();
      if (config.floors?.length) {
        config.floors.forEach((availableFloor) => {
          const option = document.createElement("option");
          option.value = availableFloor.id || "";
          option.textContent = availableFloor.label || availableFloor.id || "Pavimento";
          this.floorSelect.append(option);
        });
        this.floorSelect.value = this.currentFloorId || "";
        this.floorSelect.disabled = false;
      } else {
        this.floorSelect.disabled = true;
      }
    }
    const title = floorConfig.label ? `${config.title || "Planta"} — ${floorConfig.label}` : config.title;
    if (title) {
      if (this.titleElement) this.titleElement.textContent = title;
      if (typeof document !== "undefined") document.title = title;
    }
    this.clear();
    this.prepareRoomReferences(config);
    this.validateInactiveFloorFeatures(config, floorIndex);
    this.prepareGlobalLists(config);
    try {
      this.renderTerrain(config.terrain);
    } catch (error) {
      this.errors.push({ category: "presentation", message: error.message });
    }
    const validRooms = (floorConfig.rooms ?? []).filter((room) => room.id
      && this.roomDefinitions.get(room.id) === room
      && !this.invalidRoomIds.has(room.id));
    this.addRooms(validRooms);
    this.addSpanningStairs(config, floorConfig);
    this.updateOverlaps();
    this.addVisibleVerticalOpenings(config, floorConfig);
    this.addZones(this.visibleZones(config, floorConfig).filter((zone) => this.validZoneIds.has(zone.id)));
    (floorConfig.items ?? []).forEach((item, index) => {
      try {
        this.addItem(item);
      } catch (error) {
        this.errors.push({ index, opening: item, category: "item", message: error.message });
      }
    });
    this.updateOverlaps();
    (floorConfig.openings ?? []).forEach((opening, index) => {
      if (this.isVerticalOpening(opening)) return;
      try {
        this.addOpening(opening);
      } catch (error) {
        this.errors.push({ index, opening, category: opening.type === "window" ? "window" : "opening", message: error.message });
      }
    });
    (floorConfig.windows ?? []).forEach((window, index) => {
      try {
        this.addWindow(window);
      } catch (error) {
        this.errors.push({ index, opening: window, category: "window", message: error.message });
      }
    });
    this.updateLayerVisibility();
    this.renderMultiFloorUnderlay(floorConfig);
    try {
      this.applyBuildingPlacement(config.building);
    } catch (error) {
      this.errors.push({ category: "presentation", message: error.message });
    }
    this.renderRoofs(this.visibleRoofs(config, floorConfig));
    this.renderGuides(this.visibleGuides(config, floorConfig));
    this.updateSummary();
    if (this.dxfButton) this.dxfButton.disabled = false;
    return this;
  }

  async loadFile(file) {
    const sourceText = await file.text();
    const config = JSON.parse(sourceText);
    this.currentSourceText = sourceText;
    return this.load(config);
  }

  formatMeters(value) {
    return FloorPlanMetrics.formatMeters(value);
  }

  roofTypeLabel(type) {
    return FloorPlanMetrics.roofTypeLabel(type);
  }

  roofOrientationLabel(orientation) {
    return FloorPlanMetrics.roofOrientationLabel(orientation);
  }

  formatFixed(value) {
    return FloorPlanMetrics.formatFixed(value);
  }

  preparePrint() {
    return FloorPlanViewport.preparePrint(this);
  }

  clearPrintScale() {
    return FloorPlanViewport.clearPrintScale(this);
  }

  updateSummary() {
    return FloorPlanLists.updateSummary(this);
  }

  updateRoomList() {
    return FloorPlanLists.updateRoomList(this);
  }

  updateFloorSummary() {
    return FloorPlanLists.updateFloorSummary(this);
  }

  updateItemList() {
    return FloorPlanLists.updateItemList(this);
  }

  updateRoofList() {
    return FloorPlanLists.updateRoofList(this);
  }

  updateOpeningList() {
    return FloorPlanLists.updateOpeningList(this);
  }

  updateWindowList() {
    return FloorPlanLists.updateWindowList(this);
  }

  findNaturalCommunications() {
    return FloorPlanLists.findNaturalCommunications(this);
  }

  updateNaturalList() {
    return FloorPlanLists.updateNaturalList(this);
  }

  updateErrorList() {
    return FloorPlanLists.updateErrorList(this);
  }
  asciiLayout() {
    return FloorPlanTextExport.asciiLayout(this);
  }

  markdownText(value) {
    return FloorPlanTextExport.markdownText(this, value);
  }

  downloadMarkdownLegacy(filename = "planta-terrea-layout.md") {
    return FloorPlanTextExport.downloadMarkdownLegacy(this, filename);
  }

  downloadMarkdown(filename = "planta-layout.md") {
    return FloorPlanTextExport.downloadMarkdown(this, filename);
  }
  async downloadHtml(filename = "planta-terrea-gerada.html") {
    return FloorPlanHtmlExport.downloadHtml(this, filename);
  }

}

window.FloorPlan = FloorPlan;
