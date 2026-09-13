const floor = new FloorPlan({
  root: document.querySelector("#floor-plan"),
  terrainLayer: document.querySelector("#terrain-layer"),
  titleElement: document.querySelector("h1"),
  floorSelect: document.querySelector("#floor-select"),
  roomList: document.querySelector("#room-list"),
  itemList: document.querySelector("#item-list"),
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
  jsonInput: document.querySelector("#json-file"),
  reloadButton: document.querySelector("#reload-json"),
  scale: 56
});

window.floor = floor;

function loadJsonFromCommandLine() {
  const encoded = window.location.hash.startsWith("#json=")
    ? window.location.hash.slice("#json=".length)
    : "";
  if (!encoded) return;

  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    floor.load(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    alert(`Não foi possível carregar a planta: ${error.message}`);
  }
}

loadJsonFromCommandLine();
