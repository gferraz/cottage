const floor = new FloorPlan({
  root: document.querySelector("#floor-plan"),
  catalog: window.FloorPlanCatalog,
  terrainLayer: document.querySelector("#terrain-layer"),
  guidesLayer: document.querySelector("#guides-layer"),
  facadeLayer: document.querySelector("#facade-list"),
  secondaryFacadeLayer: document.querySelector("#secondary-facade-list"),
  facade3dLayer: document.querySelector("#facade-3d-list"),
  viewportSummary: document.querySelector("#viewport-summary"),
  titleElement: document.querySelector("h1"),
  floorOptions: document.querySelector("#floor-options"),
  roomList: document.querySelector("#room-list"),
  itemList: document.querySelector("#item-list"),
  roofList: document.querySelector("#roof-list"),
  floorSummary: document.querySelector("#floor-summary"),
  roomCountSummary: document.querySelector("#room-count-summary"),
  summary: document.querySelector("#area-summary"),
  boundsSummary: document.querySelector("#plan-bounds"),
  terrainSummary: document.querySelector("#terrain-summary"),
  openingList: document.querySelector("#opening-list"),
  windowList: document.querySelector("#window-list"),
  naturalList: document.querySelector("#natural-list"),
  errorList: document.querySelector("#item-errors"),
  downloadButton: document.querySelector("#download-html"),
  markdownButton: document.querySelector("#download-markdown"),
  dxfButton: document.querySelector("#download-dxf"),
  multiFloorSwitch: document.querySelector("#show-multi-floor"),
  roofSwitch: document.querySelector("#show-roofs"),
  jsonInput: document.querySelector("#json-file"),
  layerOptions: document.querySelector("#layer-options"),
  visibilityHeading: document.querySelector(".visibility-heading"),
  scale: 56,
});

window.floor = floor;

function loadJsonFromCommandLine() {
  const encoded = window.location.hash.startsWith("#json=")
    ? window.location.hash.slice("#json=".length)
    : "";
  if (!encoded) return;

  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    floor.load(FloorPlanParser.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    const details = error.stack ? `\n\n${error.stack}` : "";
    alert(`Não foi possível carregar a planta: ${error.message}${details}`);
  }
}

loadJsonFromCommandLine();
