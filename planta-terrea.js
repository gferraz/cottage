const floor = new FloorPlan({
  root: document.querySelector("#floor-plan"),
  roomList: document.querySelector("#room-list"),
  roomCountSummary: document.querySelector("#room-count-summary"),
  summary: document.querySelector("#area-summary"),
  boundsSummary: document.querySelector("#plan-bounds"),
  downloadButton: document.querySelector("#download-html"),
  jsonInput: document.querySelector("#json-file"),
  reloadButton: document.querySelector("#reload-json"),
  scale: 56
});

window.floor = floor;
