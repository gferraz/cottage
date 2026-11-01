class FloorPlan {
  /**
   * Cria a fachada da planta e conecta os elementos da interface.
   * @param {Object} options Opções e referências aos elementos HTML da aplicação.
   * @param {HTMLElement} options.root Elemento que recebe o desenho da planta.
   * @param {Object|null} [options.catalog] Catálogo de tipos e cores reutilizáveis.
   * @param {number} [options.scale=56] Escala inicial em pixels por metro.
   */
  constructor({ root, catalog = null, terrainLayer = null, guidesLayer = null, facadeLayer = null, secondaryFacadeLayer = null, facade3dLayer = null, facade3dCameraControls = null, solarSeasonSelect = null, solarTimeDisplay = null, solarTimePrevious = null, solarTimeNext = null, viewportSummary = null, titleElement = null, floorOptions = null, roomList = null, itemList = null, roofList = null, floorSummary = null, roomCountSummary = null, summary = null, usefulAreaSummary = null, boundsSummary = null, terrainSummary = null, openingList = null, windowList = null, naturalList = null, errorList = null, downloadButton = null, markdownButton = null, dxfButton = null, multiFloorSwitch = null, roofSwitch = null, roofOnlySwitch = null, visibilityHeading = null, jsonInput = null, layerOptions = null, scale = 56 }) {
    this.root = root;
    this.catalog = catalog || window.FloorPlanCatalog || { colors: {}, items: {}, openings: {} };
    this.terrainLayer = terrainLayer;
    this.guidesLayer = guidesLayer;
    this.facadeLayer = facadeLayer;
    this.secondaryFacadeLayer = secondaryFacadeLayer;
    this.facade3dLayer = facade3dLayer;
    this.facade3dCameraControls = facade3dCameraControls;
    this.facade3dCamera = { azimuthStep: 0, elevation: 30, zoom: 1 };
    this.solarSeasonSelect = solarSeasonSelect;
    this.solarTimeDisplay = solarTimeDisplay;
    this.solarTimePrevious = solarTimePrevious;
    this.solarTimeNext = solarTimeNext;
    this.solarSeason = solarSeasonSelect?.value || "equinox";
    this.solarTime = solarTimeDisplay?.value || solarTimeDisplay?.textContent || "15:00";
    this.viewportSummary = viewportSummary;
    this.titleElement = titleElement;
    this.floorOptions = floorOptions;
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
    this.multiFloorSwitch = multiFloorSwitch;
    this.roofSwitch = roofSwitch;
    this.roofOnlySwitch = roofOnlySwitch;
    this.visibilityHeading = visibilityHeading;
    this.jsonInput = jsonInput;
    this.layerOptions = layerOptions;
    this.roomArea = 0;
    this.roomCount = 0;
    this.rooms = new Map();
    this.roomReferences = new Map();
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
    this.showAllFloors = false;
    this.currentFloorHeight = 0;
    this.currentSourceText = null;
    this.model = null;
    this.itemTypes = {};
    this.roomDefinitions = new Map();
    this.walls = new Map();
    this.roomGeometryCache = new Map();
    this.roomGeometryStack = new Set();
    this.partReferenceStack = [];
    this.partOwners = new Map();
    this.globalObjectIds = new Set();
    this.validZoneIds = new Set();
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
    this.showRoofs = false;
    this.showOnlyRoofs = false;

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
    [downloadButton, markdownButton, dxfButton].forEach((button) => {
      if (button) button.hidden = true;
    });
    if (multiFloorSwitch) {
      multiFloorSwitch.hidden = true;
      multiFloorSwitch.closest(".visibility-switch")?.toggleAttribute("hidden", true);
      multiFloorSwitch.checked = false;
      multiFloorSwitch.addEventListener("change", () => {
        this.multiFloorMode = multiFloorSwitch.checked;
        this.renderMultiFloorUnderlay();
      });
    }
    if (roofSwitch) {
      roofSwitch.hidden = true;
      roofSwitch.closest(".visibility-switch")?.toggleAttribute("hidden", true);
      roofSwitch.checked = false;
      roofSwitch.addEventListener("change", () => {
        this.showRoofs = roofSwitch.checked;
        if (!this.showRoofs) {
          this.showOnlyRoofs = false;
          if (this.roofOnlySwitch) this.roofOnlySwitch.checked = false;
        }
        this.updateRoofVisibility();
        if (this.currentConfig) this.renderFacade3D();
      });
    }
    if (roofOnlySwitch) {
      roofOnlySwitch.checked = false;
      roofOnlySwitch.addEventListener("change", () => {
        this.showOnlyRoofs = roofOnlySwitch.checked;
        if (this.showOnlyRoofs) {
          this.showRoofs = true;
          if (this.roofSwitch) this.roofSwitch.checked = true;
          this.updateRoofVisibility();
        }
        if (this.currentConfig) this.renderFacade3D();
      });
    }
    if (layerOptions) {
      layerOptions.closest(".layer-selector")?.toggleAttribute("hidden", true);
      layerOptions.addEventListener("change", (event) => {
        this.layerCutoff = event.target.value === "all"
          ? null
          : Number(event.target.value);
        this.updateLayerVisibility();
      });
    }
    if (floorOptions) {
      floorOptions.closest(".floor-selector")?.toggleAttribute("hidden", true);
      floorOptions.addEventListener("change", (event) => {
        const floors = this.currentConfig?.floors;
        if (!Array.isArray(floors)) return;
        if (event.target.value === "__all_floors__") {
          this.showAllFloors = true;
          this.renderFacade3D();
          return;
        }
        this.showAllFloors = false;
        const activeFloor = floors.findIndex(
          (floorConfig) => String(floorConfig.id) === event.target.value,
        );
        if (activeFloor >= 0) {
          this.load(
            { ...this.currentConfig, activeFloor },
            { preservePresentation: true },
          );
        }
      });
    }
    if (solarSeasonSelect) {
      solarSeasonSelect.addEventListener("change", () => {
        this.solarSeason = solarSeasonSelect.value;
        this.updateSolarTimeControls();
        if (this.currentConfig) this.renderFacade3D();
      });
    }
    if (facade3dCameraControls) {
      facade3dCameraControls.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-camera-action]");
        if (button) this.adjustFacade3DCamera(button.dataset.cameraAction);
      });
    }
    this.solarTimePrevious?.addEventListener("click", () => this.adjustSolarTime(-1));
    this.solarTimeNext?.addEventListener("click", () => this.adjustSolarTime(1));
    if (jsonInput) {
      jsonInput.addEventListener("change", async (event) => {
        const [file] = event.target.files;
        if (!file) return;

        try {
          await this.loadFile(file);
        } catch (error) {
          const details = error.stack ? `\n\n${error.stack}` : "";
          alert(`Não foi possível carregar a planta: ${error.message}${details}`);
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

  /**
   * Adiciona uma definição ao modelo e à representação visual.
   * @param {Object} data Definição de cômodo, item, zona ou abertura.
   * @returns {Object|null} Elemento criado, quando a definição produz um elemento.
   */
  add(data) {
    return FloorPlanDom.add(this, data);
  }

  /**
   * Adiciona um cômodo retangular ou composto por partes.
   * @param {Object} room Definição com `id` e geometria (`pos`/`size` ou `parts`).
   * @returns {Object|null} Elemento visual do cômodo.
   */
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

  renderWallsForFloor(floorConfig) {
    const roomIds = new Set((floorConfig.rooms ?? []).map((room) => room.id));
    this.walls.forEach((wall) => {
      if (!wall.sourceRoomIds.some((roomId) => roomIds.has(roomId))) return;
      const element = this.add({
        id: wall.id,
        pos: wall.pos,
        size: wall.size,
        classes: `plan-wall${wall.state === "virtual" ? " plan-wall-virtual" : ""}`,
      });
      if (element) {
        element.dataset.id = wall.id;
        const sourceLayers = this.roomElements
          .filter((room) => wall.sourceRoomIds.includes(room.dataset.id))
          .map((room) => Number(room.dataset.layer ?? 0));
        const layer = sourceLayers.length ? Math.min(...sourceLayers) : 0;
        element.dataset.layer = String(layer);
        element.style.setProperty("--layer", layer);
      }
    });
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

  registerRoofReferences(config) {
    return FloorPlanReferences.registerRoofReferences(this, config);
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

  renderFacades(facades = []) {
    return FloorPlanFacades.render(this, facades);
  }

  renderFacade3D() {
    return window.FloorPlanFacades3D?.render(this, { direction: "front" });
  }

  availableSolarHours() {
    const fallbackHours = Array.from({ length: 13 }, (_, index) => index + 6);
    if (!this.currentConfig || !window.FloorPlan3DSun?.position) return fallbackHours;
    const hours = [];
    let hasSolarPosition = false;
    for (let hour = 0; hour < 24; hour += 1) {
      const time = `${String(hour).padStart(2, "0")}:00`;
      const position = window.FloorPlan3DSun.position(
        {
          ...this.currentConfig,
          solar: {
            ...this.currentConfig.solar,
            season: this.solarSeason,
            time,
          },
        },
        this.terrainReference,
      );
      if (position) hasSolarPosition = true;
      if (position?.elevation > 0) hours.push(hour);
    }
    return hasSolarPosition ? hours : fallbackHours;
  }

  updateSolarTimeControls() {
    const hours = this.availableSolarHours();
    const currentHour = Number.parseInt(this.solarTime?.split(":")[0], 10);
    let selectedIndex = hours.indexOf(currentHour);
    if (selectedIndex < 0 && hours.length) {
      selectedIndex = hours.reduce((closest, hour, index) =>
        Math.abs(hour - currentHour) < Math.abs(hours[closest] - currentHour)
          ? index
          : closest,
      0);
      this.solarTime = `${String(hours[selectedIndex]).padStart(2, "0")}:00`;
    }
    if (this.solarTimeDisplay) this.solarTimeDisplay.textContent = this.solarTime;
    if (this.solarTimePrevious) {
      this.solarTimePrevious.disabled = selectedIndex <= 0;
    }
    if (this.solarTimeNext) {
      this.solarTimeNext.disabled = selectedIndex < 0 || selectedIndex >= hours.length - 1;
    }
  }

  adjustSolarTime(direction) {
    const hours = this.availableSolarHours();
    if (!hours.length) return;
    const currentHour = Number.parseInt(this.solarTime?.split(":")[0], 10);
    const currentIndex = hours.indexOf(currentHour);
    const startIndex = currentIndex < 0
      ? hours.reduce((closest, hour, index) =>
        Math.abs(hour - currentHour) < Math.abs(hours[closest] - currentHour)
          ? index
          : closest,
      0)
      : currentIndex;
    const nextIndex = Math.max(0, Math.min(hours.length - 1, startIndex + direction));
    if (nextIndex === startIndex && currentIndex >= 0) return;
    this.solarTime = `${String(hours[nextIndex]).padStart(2, "0")}:00`;
    this.updateSolarTimeControls();
    if (this.currentConfig) this.renderFacade3D();
  }

  adjustFacade3DCamera(action) {
    const camera = this.facade3dCamera;
    if (!camera) return;
    if (action === "azimuth-left") camera.azimuthStep = (camera.azimuthStep + 23) % 24;
    else if (action === "azimuth-right") camera.azimuthStep = (camera.azimuthStep + 1) % 24;
    else if (action === "elevation-up") camera.elevation = Math.min(90, camera.elevation + 15);
    else if (action === "elevation-down") camera.elevation = Math.max(0, camera.elevation - 15);
    else if (action === "zoom-in") camera.zoom = Math.min(2.5, camera.zoom * 1.25);
    else if (action === "zoom-out") camera.zoom = Math.max(0.65, camera.zoom / 1.25);
    else return;
    this.facade3dLayer?._updateFacadeCamera?.();
  }

  renderRoofs(roofs = []) {
    return FloorPlanRoofs.render(this, roofs);
  }

  updateRoofVisibility() {
    this.root.querySelectorAll(".roof-plan").forEach((roof) => {
      roof.classList.toggle("roof-hidden", !this.showRoofs);
    });
    FloorPlanFacades.updateRoofVisibility(this);
    this.updateVisibilityHeading();
  }

  updateVisibilityHeading() {
    const hasSwitch = Boolean(
      (this.roofSwitch && !this.roofSwitch.hidden) ||
      (this.multiFloorSwitch && !this.multiFloorSwitch.hidden),
    );
    this.visibilityHeading?.toggleAttribute("hidden", !hasSwitch);
  }
  resolveExpression(expression, localOrigin = null) {
    return FloorPlanGeometry.resolveExpression.call(this, expression, localOrigin);
  }

  resolve(value, localOrigin = null) {
    return FloorPlanGeometry.resolve.call(this, value, localOrigin);
  }

  /**
   * Adiciona um item físico, como escada, cama ou lareira.
   * @param {Object} item Definição do item e sua geometria.
   * @returns {Object|null} Elemento visual criado.
   */
  addItem(item) {
    return FloorPlanElements.addItem(this, item);
  }

  resolveItemType(item) {
    return FloorPlanElements.resolveItemType(this, item);
  }

  /**
   * Adiciona uma zona de referência, que pode ser virtual.
   * @param {Object} zone Definição da zona.
   * @returns {Object|null} Elemento visual criado.
   */
  addZone(zone) {
    return FloorPlanElements.addZone(this, zone);
  }

  addZones(zones) {
    return FloorPlanElements.addZones(this, zones);
  }

  /**
   * Adiciona uma passagem entre uma parede e outro cômodo ou o exterior.
   * @param {Object} opening Definição com `from`, `to`, `type` e dimensões opcionais.
   * @returns {Object|null} Elemento visual da passagem.
   */
  addOpening(opening) {
    return FloorPlanOpenings.addOpening(this, opening);
  }

  roomOpenings(floorConfig) {
    return FloorPlanOpenings.roomOpenings(this, floorConfig);
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

  /**
   * Adiciona uma janela. O destino é opcional quando a janela dá para o exterior.
   * @param {Object} window Definição da janela, incluindo `from` e, opcionalmente, `to`.
   * @returns {Object|null} Elemento visual da janela.
   */
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
    return FloorPlanOpenings.wallSegment(this, room, wall);
  }
  /**
   * Calcula os limites geométricos dos elementos da planta corrente.
   * @param {Object} [options] Opções do cálculo.
   * @param {boolean} [options.includeItems=false] Inclui itens nos limites.
   * @returns {{x0:number,y0:number,x1:number,y1:number,w:number,h:number}} Limites calculados.
   */
  bounds({ includeItems = false } = {}) {
    return FloorPlanMetrics.bounds(this, { includeItems });
  }

  /**
   * Calcula os limites da construção, sem incluir terreno e referências auxiliares.
   * @returns {{x0:number,y0:number,x1:number,y1:number,w:number,h:number}|null} Limites ou `null`.
   */
  buildingReferenceBounds() {
    return FloorPlanMetrics.buildingReferenceBounds(this);
  }

  calculateRoomArea() {
    return FloorPlanMetrics.calculateRoomArea(this);
  }

  calculateNetRoomArea(room) {
    return FloorPlanMetrics.calculateNetRoomArea(this, room);
  }

  subtractRectangles(rectangle, cutters) {
    return FloorPlanMetrics.subtractRectangles(rectangle, cutters);
  }

  fragmentWalls(fragment, source, sourceWalls) {
    return FloorPlanMetrics.fragmentWalls(fragment, source, sourceWalls);
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
    this.roomReferences.clear();
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
  }

  /**
   * Carrega uma configuração JSON e renderiza todos os seus dados.
   * @param {Object} config Configuração da planta, incluindo pisos e objetos.
   * @param {Object} [options] Opções para preservar estado de apresentação.
   * @param {boolean} [options.preservePresentation=false] Mantém o estado de apresentação atual.
   * @returns {FloorPlan} A própria instância, para encadeamento.
   */
  load(config, { preservePresentation = false } = {}) {
    this.references ??= new Map();
    this.rooms ??= new Map();
    this.roomReferences ??= new Map();
    this.roomDefinitions ??= new Map();
    this.roomGeometryCache ??= new Map();
    this.roomGeometryStack ??= new Set();
    this.partOwners ??= new Map();
    this.globalObjectIds ??= new Set();
    this.validZoneIds ??= new Set();
    this.model = FloorPlanModel.fromConfig(config);
    this.currentConfig = config;
    document.querySelector("#empty-state")?.setAttribute("hidden", "");
    document.querySelector("#plan-workspace")?.removeAttribute("hidden");
    document.body?.classList.remove("page-empty");
    document.body?.classList.add("page-has-plan");
    if (!preservePresentation) {
      this.showAllFloors = false;
      this.showOnlyRoofs = false;
      this.facade3dCamera = { azimuthStep: 0, elevation: 30, zoom: 1 };
      this.solarSeason = config.solar?.season ?? "equinox";
      this.solarTime = config.solar?.time ?? "15:00";
    }
    if (this.solarSeasonSelect) {
      const availableSeason = [...this.solarSeasonSelect.options].some(
        (option) => option.value === this.solarSeason,
      );
      this.solarSeasonSelect.value = availableSeason ? this.solarSeason : "equinox";
      this.solarSeason = this.solarSeasonSelect.value;
    }
    this.updateSolarTimeControls();
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
    this.currentFloorHeight = Number(floorConfig.z0 ?? 0);
    if (!Number.isFinite(this.currentFloorHeight)) {
      throw new Error("floor.z0 precisa ser numérico");
    }
    if (this.floorOptions) {
      this.floorOptions.replaceChildren();
      if (config.floors?.length) {
        config.floors.forEach((availableFloor, floorIndex) => {
          const optionId = `floor-option-${availableFloor.id || floorIndex}`;
          const label = document.createElement("label");
          label.className = "floor-option";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "floor-selection";
          input.value = String(availableFloor.id || "");
          input.id = optionId;
          input.checked = !this.showAllFloors && String(availableFloor.id) === String(this.currentFloorId);
          const text = document.createElement("span");
          text.textContent = availableFloor.label || availableFloor.id || "Pavimento";
          label.append(input, text);
          this.floorOptions.append(label);
        });
        if (config.floors.length > 1) {
          const label = document.createElement("label");
          label.className = "floor-option";
          label.title = "Mostrar todos os pisos na perspectiva 3D";
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "floor-selection";
          input.value = "__all_floors__";
          input.id = "floor-option-all";
          input.checked = this.showAllFloors;
          const text = document.createElement("span");
          text.textContent = "Todos os pisos";
          label.append(input, text);
          this.floorOptions.append(label);
        }
        this.floorOptions.closest(".floor-selector")?.toggleAttribute("hidden", config.floors.length < 2);
      } else {
        this.floorOptions.closest(".floor-selector")?.toggleAttribute("hidden", true);
      }
    }
    const title = config.title || "Estudo da planta";
    if (this.titleElement) this.titleElement.textContent = title;
    if (typeof document !== "undefined") document.title = title;
    document.querySelector("#project-overview")?.removeAttribute("hidden");
    this.clear();
    this.prepareRoomReferences(config);
    this.validateInactiveFloorFeatures(config, floorIndex);
    this.prepareGlobalLists(config);
    try {
      this.renderTerrain(config.terrain);
    } catch (error) {
      this.errors.push({ category: "presentation", message: error.message });
    }
    const invalidRoomIds = this.invalidRoomIds ?? new Set();
    const validRooms = (floorConfig.rooms ?? []).filter((room) => room.id
      && this.roomDefinitions.get(room.id) === room
      && !invalidRoomIds.has(room.id));
    this.addRooms(validRooms);
    this.addSpanningStairs(config, floorConfig);
    this.updateOverlaps();
    this.renderWallsForFloor(floorConfig);
    FloorPlanWalls.renderIndependentWalls(this);
    this.addVisibleVerticalOpenings(config, floorConfig);
    const validZoneIds = this.validZoneIds ?? new Set();
    this.addZones(this.visibleZones(config, floorConfig).filter((zone) => validZoneIds.has(zone.id)));
    (floorConfig.items ?? []).forEach((item, index) => {
      try {
        this.addItem(item);
      } catch (error) {
        this.errors.push({ index, opening: item, category: "item", message: error.message });
      }
    });
    this.updateOverlaps();
    [...(floorConfig.openings ?? []), ...this.roomOpenings(floorConfig)].forEach((opening, index) => {
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
    const visibleRoofs = this.visibleRoofs(config, floorConfig);
    this.renderRoofs(visibleRoofs);
    if (this.roofSwitch) {
      const hasRoofs = visibleRoofs.length > 0;
      this.roofSwitch.hidden = !hasRoofs;
      this.roofSwitch.checked = this.showRoofs;
      this.roofSwitch.closest(".visibility-switch")?.toggleAttribute("hidden", !hasRoofs);
    }
    this.updateRoofVisibility();
    if (this.roofOnlySwitch) {
      const hasRoofs = this.allRoofs.length > 0;
      this.roofOnlySwitch.checked = this.showOnlyRoofs;
      this.roofOnlySwitch.disabled = !hasRoofs;
      this.roofOnlySwitch.closest(".visibility-switch")?.toggleAttribute("hidden", !hasRoofs);
    }
    this.renderGuides(this.visibleGuides(config, floorConfig));
    const defaultFacades = [
      { id: "front", label: "Fachada frontal", direction: "front" },
      { id: "rear", label: "Fachada posterior", direction: "rear" },
      { id: "left", label: "Fachada lateral esquerda", direction: "left" },
      { id: "right", label: "Fachada lateral direita", direction: "right" },
    ];
    const facades = config.facades ?? defaultFacades;
    this.renderFacades(facades);
    if (this.facade3dLayer) {
      this.facade3dLayer.closest(".facade-3d-section")?.toggleAttribute("hidden", false);
      try {
        this.renderFacade3D();
      } catch (error) {
        const detail = error?.stack || error?.message || String(error);
        this.errors.push({
          category: "presentation",
          message: `Falha ao renderizar a fachada 3D: ${detail}`,
        });
        this.facade3dLayer.replaceChildren();
        const message = document.createElement("pre");
        message.className = "facade-3d-error";
        message.textContent = `Falha ao renderizar a fachada 3D:\n${detail}`;
        this.facade3dLayer.append(message);
      }
    }
    this.updateSummary();
    [this.downloadButton, this.markdownButton, this.dxfButton].forEach(
      (button) => {
        if (button) button.hidden = false;
      },
    );
    return this;
  }

  /**
   * Lê um arquivo JSON selecionado pelo usuário e carrega sua configuração.
   * @param {File} file Arquivo JSON local.
   * @returns {Promise<FloorPlan>} A instância após o carregamento.
   */
  async loadFile(file) {
    const sourceText = await file.text();
    const config = FloorPlanParser.parse(sourceText);
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
  /**
   * Gera a representação ASCII do piso corrente.
   * @returns {string} Layout textual da planta.
   */
  asciiLayout() {
    return FloorPlanTextExport.asciiLayout(this);
  }

  markdownText(value) {
    return FloorPlanTextExport.markdownText(this, value);
  }

  downloadMarkdownLegacy(filename = "planta-terrea-layout.md") {
    return FloorPlanTextExport.downloadMarkdownLegacy(this, filename);
  }

  /**
   * Gera e baixa o layout textual em Markdown.
   * @param {string} [filename="planta-layout.md"] Nome do arquivo baixado.
   * @returns {void} Inicia o download no navegador.
   */
  downloadMarkdown(filename = "planta-layout.md") {
    return FloorPlanTextExport.downloadMarkdown(this, filename);
  }
  /**
   * Gera e baixa uma cópia HTML portátil da planta atual.
   * @param {string} [filename="planta-terrea-gerada.html"] Nome do arquivo baixado.
   * @returns {Promise<void>} Conclusão da preparação e do download.
   */
  async downloadHtml(filename = "planta-terrea-gerada.html") {
    return FloorPlanHtmlExport.downloadHtml(this, filename);
  }

}

window.FloorPlan = FloorPlan;
