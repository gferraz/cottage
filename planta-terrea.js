const floor = new FloorPlan({
  root: document.querySelector("#floor-plan"),
  terrainLayer: document.querySelector("#terrain-layer"),
  titleElement: document.querySelector("h1"),
  roomList: document.querySelector("#room-list"),
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
