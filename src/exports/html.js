const FloorPlanHtmlExport = {
  captureFloorViews(plan, capture) {
    const floors = plan.currentConfig.floors ?? [plan.currentConfig];
    const original = {
      activeFloor: Math.max(0, floors.findIndex((floor) => floor.id === plan.currentFloorId)),
      showAllFloors: plan.showAllFloors,
      multiFloorMode: plan.multiFloorMode,
      layerCutoff: plan.layerCutoff,
    };
    try {
      plan.multiFloorMode = false;
      return floors.map((floor, activeFloor) => {
        plan.renderView({ activeFloor, showAllFloors: false });
        return capture(floor, activeFloor);
      });
    } finally {
      plan.multiFloorMode = original.multiFloorMode;
      try {
        plan.renderView({ activeFloor: original.activeFloor, showAllFloors: original.showAllFloors });
      } finally {
        plan.multiFloorMode = original.multiFloorMode;
        plan.layerCutoff = original.layerCutoff;
        plan.updateLayerVisibility();
        plan.renderMultiFloorUnderlay();
      }
    }
  },

  namespaceSvgReferences(root, namespace) {
    root.querySelectorAll("svg").forEach((svg) => {
      const ids = new Map();
      svg.querySelectorAll("[id]").forEach((element) => {
        const originalId = element.id;
        const namespacedId = `${namespace}-${originalId}`;
        ids.set(originalId, namespacedId);
        element.id = namespacedId;
      });
      if (ids.size === 0) return;
      svg.querySelectorAll("*").forEach((element) => {
        [...element.attributes].forEach((attribute) => {
          let value = attribute.value;
          ids.forEach((namespacedId, originalId) => {
            value = value
              .replaceAll(`url(#${originalId})`, `url(#${namespacedId})`)
              .replaceAll(`#${originalId}`, `#${namespacedId}`);
          });
          if (value !== attribute.value) {
            element.setAttribute(attribute.name, value);
          }
        });
      });
    });
  },

  async downloadHtml(plan, filename = "planta-terrea-gerada.html") {
    if (!plan.currentConfig) {
      alert("Carregue uma planta antes de exportar o HTML.");
      return;
    }

    const hasFacade3DCanvas = Boolean(
      plan.facade3dLayer?.querySelector("canvas.facade-3d-canvas"),
    );
    const facade3DImage = hasFacade3DCanvas
      ? plan.facade3dLayer._captureFacadeImage?.()
      : null;
    if (hasFacade3DCanvas && !facade3DImage?.startsWith("data:image/png;base64,")) {
      throw new Error("Não foi possível capturar a perspectiva 3D para o HTML.");
    }

    // Capture one rendered diagram per floor. The exported file is static, so
    // the snapshots are assembled without carrying the application scripts.
    const floorSnapshots = this.captureFloorViews(plan, (floor, floorIndex) => {
      const livePlan = document.querySelector("#floor-plan");
      if (!livePlan) throw new Error("A área da planta não foi encontrada.");
      return {
        label: floor.label || floor.id || `Piso ${floorIndex + 1}`,
        element: livePlan.cloneNode(true),
      };
    });

    const exportedDocument = document.cloneNode(true);
    const exportedPlan = exportedDocument.querySelector("#floor-plan");
    const exportedFacade3D = exportedDocument.querySelector("#facade-3d-section");

    if (exportedFacade3D && facade3DImage) {
      const canvas = exportedFacade3D.querySelector("canvas.facade-3d-canvas");
      const image = exportedDocument.createElement("img");
      image.className = "facade-3d-canvas facade-3d-export-image";
      image.src = facade3DImage;
      image.alt = "Perspectiva 3D da casa com a posição solar selecionada";
      if (canvas?.width) image.width = canvas.width;
      if (canvas?.height) image.height = canvas.height;
      canvas?.replaceWith(image);
      exportedFacade3D.hidden = false;
    } else {
      exportedFacade3D?.remove();
    }

    if (exportedPlan) {
      const stack = exportedDocument.createElement("div");
      stack.className = "floor-export-stack";
      floorSnapshots.forEach(({ label, element }, index) => {
        const section = exportedDocument.createElement("section");
        section.className = "floor-export-section";
        const heading = exportedDocument.createElement("h2");
        heading.textContent = label;
        section.append(heading);
        const snapshot = exportedDocument.importNode(element, true);
        snapshot.id = `floor-plan-export-${index + 1}`;
        FloorPlanHtmlExport.namespaceSvgReferences(
          snapshot,
          `floor-${index + 1}`,
        );
        section.append(snapshot);
        stack.append(section);
      });
      exportedPlan.replaceWith(stack);
    }

    exportedDocument
      .querySelectorAll(
        ".plan-controls, .solar-controls, .facade-3d-controls, #json-file, #load-json, #layer-button, #download-html, #download-markdown, #download-dxf, #show-roofs, #show-multi-floor, #floor-select, .floor-selector, .visibility-heading, .visibility-switch, #terrain-compass-rose-data",
      )
      .forEach((element) => {
        element.remove();
      });
    exportedDocument.querySelectorAll("script").forEach((script) => {
      script.remove();
    });

    const stylesheetLinks = [
      ...document.querySelectorAll('link[rel="stylesheet"]'),
    ];
    const fallbackLinks = [];
    const styles = [];
    for (const link of stylesheetLinks) {
      const sheet = link.sheet;
      if (!sheet) {
        fallbackLinks.push(link);
        continue;
      }
      try {
        styles.push([...sheet.cssRules].map((rule) => rule.cssText).join("\n"));
      } catch {
        try {
          const response = await fetch(link.href);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          styles.push(await response.text());
        } catch {
          fallbackLinks.push(link);
        }
      }
    }
    exportedDocument.querySelector("#portable-export-css")?.remove();
    exportedDocument
      .querySelectorAll('link[rel="stylesheet"]')
      .forEach((link) => {
        link.remove();
      });
    if (styles.length > 0) {
      const style = exportedDocument.createElement("style");
      style.textContent = styles.join("\n");
      exportedDocument.head.append(style);
    }
    fallbackLinks.forEach((link) => {
      const fallback = exportedDocument.createElement("link");
      fallback.rel = "stylesheet";
      fallback.href = new URL(link.getAttribute("href"), document.baseURI).href;
      exportedDocument.head.append(fallback);
    });

    const html = `<!doctype html>\n${exportedDocument.documentElement.outerHTML}`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
};

window.FloorPlanHtmlExport = FloorPlanHtmlExport;
