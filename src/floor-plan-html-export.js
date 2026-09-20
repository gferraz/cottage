const FloorPlanHtmlExport = {
  async downloadHtml(plan, filename = "planta-terrea-gerada.html") {
    if (!plan.currentConfig) {
      alert("Carregue uma planta antes de exportar o HTML.");
      return;
    }

    const sourceConfig = plan.currentConfig;
    const floors = sourceConfig.floors ?? [sourceConfig];
    const originalFloorIndex = Math.max(
      0,
      floors.findIndex((floor) => floor.id === plan.currentFloorId),
    );
    const originalMultiFloorMode = plan.multiFloorMode;
    const floorSnapshots = [];

    // Capture one rendered diagram per floor. The exported file is static, so
    // the snapshots are assembled without carrying the application scripts.
    try {
      plan.multiFloorMode = false;
      for (let floorIndex = 0; floorIndex < floors.length; floorIndex += 1) {
        plan.load({ ...sourceConfig, activeFloor: floorIndex });
        const livePlan = document.querySelector("#floor-plan");
        if (!livePlan) throw new Error("A área da planta não foi encontrada.");
        floorSnapshots.push({
          label:
            floors[floorIndex].label ||
            floors[floorIndex].id ||
            `Piso ${floorIndex + 1}`,
          element: livePlan.cloneNode(true),
        });
      }
    } finally {
      plan.multiFloorMode = originalMultiFloorMode;
      plan.load({ ...sourceConfig, activeFloor: originalFloorIndex });
      plan.multiFloorMode = originalMultiFloorMode;
      plan.renderMultiFloorUnderlay();
    }

    const exportedDocument = document.cloneNode(true);
    const exportedPlan = exportedDocument.querySelector("#floor-plan");

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
        section.append(snapshot);
        stack.append(section);
      });
      exportedPlan.replaceWith(stack);
    }

    exportedDocument
      .querySelectorAll(
        ".plan-controls, #json-file, #load-json, #layer-button, #download-html, #download-markdown, #download-dxf, #show-roofs, #show-multi-floor, #floor-select, .floor-selector, .visibility-heading, .visibility-switch, #plan-status, #terrain-compass-rose-data",
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
    const embeddedCss = document
      .querySelector("#portable-export-css")
      ?.content.textContent.trim();
    const themeLink = document.querySelector(
      'link[href*="floor-plan-theme.css"]',
    );
    const themeCss = themeLink?.sheet
      ? [...themeLink.sheet.cssRules].map((rule) => rule.cssText).join("\n")
      : "";
    const styles = embeddedCss ? [embeddedCss, themeCss] : [];
    if (!embeddedCss) {
      for (const link of stylesheetLinks) {
        const sheet = link.sheet;
        if (!sheet) {
          fallbackLinks.push(link);
          continue;
        }
        try {
          styles.push(...[...sheet.cssRules].map((rule) => rule.cssText));
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
