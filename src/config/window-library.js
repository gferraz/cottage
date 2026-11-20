window.FloorPlanWindowLibrary = {};
window.FloorPlanWindowLibraryReady = fetch("lib/windows.json5")
  .then((response) => {
    if (!response.ok) throw new Error(`Biblioteca de janelas: HTTP ${response.status}`);
    return response.text();
  })
  .then((source) => {
    window.FloorPlanWindowLibrary = FloorPlanParser.parse(source, {
      filename: "lib/windows.json5",
    });
  });
