const floor = new FloorPlan({
  root: document.querySelector("#floor-plan"),
  catalog: window.FloorPlanCatalog,
  terrainLayer: document.querySelector("#terrain-layer"),
  guidesLayer: document.querySelector("#guides-layer"),
  facadeLayer: document.querySelector("#facade-list"),
  secondaryFacadeLayer: document.querySelector("#secondary-facade-list"),
  facade3dLayer: document.querySelector("#facade-3d-list"),
  facade3dCameraControls: document.querySelector("#facade-3d-camera-controls"),
  solarSeasonSelect: document.querySelector("#solar-season"),
  solarTimeDisplay: document.querySelector("#solar-time"),
  solarTimePrevious: document.querySelector("#solar-time-previous"),
  solarTimeNext: document.querySelector("#solar-time-next"),
  viewportSummary: document.querySelector("#viewport-summary"),
  titleElement: document.querySelector("#project-title"),
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
  headroomSwitch: document.querySelector("#show-headroom"),
  jsonInput: document.querySelector("#json-file"),
  layerOptions: document.querySelector("#layer-options"),
  visibilityHeading: document.querySelector(".visibility-heading"),
  scale: 56,
});

window.floor = floor;

const exampleButtons = [...document.querySelectorAll("[data-load-example]")];
exampleButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const labels = exampleButtons.map((control) => control.textContent);
    exampleButtons.forEach((control) => {
      control.disabled = true;
      control.textContent = "Carregando exemplo…";
      control.setAttribute("aria-busy", "true");
    });
    try {
      const filename = "cottage-ferraz-cesar-2-level-floors.json5";
      const response = await fetch(
        `https://raw.githubusercontent.com/gferraz/cottage/refs/heads/main/${filename}`,
        { cache: "no-cache", signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await floor.loadFile(new File([await response.text()], filename));
    } catch (error) {
      alert(`Não foi possível carregar a planta exemplo. Verifique sua conexão e tente novamente. (${error.message})`);
    } finally {
      exampleButtons.forEach((control, index) => {
        control.disabled = false;
        control.textContent = labels[index];
        control.removeAttribute("aria-busy");
      });
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.repeat || event.isComposing ||
    !(event.key === "/" || event.code === "Slash" || event.code === "NumpadDivide")
  ) return;

  event.preventDefault();
  document.querySelector("#json-file").click();
}, { capture: true });

async function loadJsonFromCommandLine() {
  const encoded = window.location.hash.startsWith("#json=")
    ? window.location.hash.slice("#json=".length)
    : "";
  if (!encoded) return;

  try {
    await Promise.all([window.FloorPlanWindowLibraryReady, window.FloorPlanItemLibraryReady]);
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
