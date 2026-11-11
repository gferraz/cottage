const FloorPlan3DElements = {
  heightMaterial(plan, THREE, baseMaterial, stair, z) {
    if (!stair.stairGradient) return baseMaterial;
    const styles = getComputedStyle(plan.root);
    const opaque = (value) => value.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, "rgb($1,$2,$3)");
    const low = new THREE.Color(opaque(styles.getPropertyValue("--theme-circulation").trim()));
    const high = new THREE.Color(opaque(styles.getPropertyValue("--theme-roof-gradient-dark").trim()));
    const ratio = 1 - FloorPlanGeometry.stairGradientRatio(z, stair.stairGradient);
    const material = baseMaterial.clone();
    // Match the sRGB interpolation used by color-mix in the plan view.
    material.color.copy(low.convertLinearToSRGB().lerp(high.convertLinearToSRGB(), ratio).convertSRGBToLinear());
    return material;
  },

  renderItems({ plan, THREE, scene, wallMaterial, finite, reportInvalid }) {
    (plan.allItems ?? []).forEach((item) => {
      const classes = String(item.classes || "").split(/\s+/);
      if (classes.includes("railing")) return;
      const kind = ["queen-bed", "twin-bed", "car", "table", "washing-machine", "three-seat-sofa", "armchair", "fireplace"]
        .find((name) => item.type === name || classes.includes(name));
      const defaults = { car: 1.45, table: 0.75, fireplace: 1.8 };
      const x = Number(item.x), y = Number(item.y), w = Number(item.w), l = Number(item.l);
      const z0 = Number(item.z0 ?? 0);
      const configuredHeight = Number(item.h ?? Number(item.z1) - z0);
      const h = configuredHeight > 0 ? configuredHeight : (defaults[kind] ?? 0.6);
      const rotation = Number(item.rotation ?? 0);
      if (!finite(x, y, w, l, z0, h, rotation) || w <= 0 || l <= 0 || h <= 0 || configuredHeight < 0) {
        reportInvalid("item", item.id || item.title || item.label);
        return;
      }
      const material = wallMaterial.clone();
      if (item.color) {
        const color = plan.themeFillColor(item.color).replace(/var\((--[\w-]+)\)/g,
          (_match, property) => getComputedStyle(plan.root).getPropertyValue(property).trim());
        const rgba = color.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
        material.color.set(rgba ? `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})` : color);
        if (rgba) {
          material.opacity *= Number(rgba[4]);
          material.transparent = material.opacity < 1;
        }
      }
      const detailMaterial = (color) => {
        const result = material.clone();
        result.color.set(color);
        return result;
      };
      const light = detailMaterial("#e9e2d6");
      const dark = detailMaterial("#44494b");
      const glass = detailMaterial("#8ba3af");
      const group = new THREE.Group();
      group.position.set(x + w / 2, y + l / 2, z0);
      group.rotation.z = rotation * Math.PI / 180;
      group.userData.domainId = item.id || "";
      group.userData.itemType = item.type || kind || "generic";
      group.name = item.label || item.title || item.id || "Item";
      // Fractions of the configured envelope keep every detail within its size.
      const box = (sx, sy, sz, cx, cy, cz, fill = material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * sx, l * sy, h * sz), fill);
        mesh.position.set(w * cx, l * cy, h * cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.domainId = item.id || "";
        group.add(mesh);
      };
      if (kind === "queen-bed" || kind === "twin-bed") {
        box(1, 1, 0.45, 0, 0, 0.225);
        box(0.96, 0.96, 0.4, 0, 0, 0.65, light);
        box(0.8, 0.2, 0.15, 0, -0.33, 0.925, light);
      } else if (kind === "car") {
        box(0.9, 1, 0.48, 0, 0, 0.36);
        box(0.76, 0.48, 0.4, 0, -0.03, 0.8, glass);
        for (const cx of [-0.45, 0.45]) for (const cy of [-0.32, 0.32]) box(0.1, 0.16, 0.26, cx, cy, 0.13, dark);
      } else if (kind === "table") {
        if (classes.includes("round-table")) {
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h * 0.1, 48), material);
          top.rotation.x = Math.PI / 2;
          top.scale.set(w, 1, l);
          top.position.set(0, 0, h * 0.95);
          top.castShadow = true;
          top.receiveShadow = true;
          top.userData.domainId = item.id || "";
          group.add(top);
        } else {
          box(1, 1, 0.1, 0, 0, 0.95);
        }
        for (const cx of (classes.includes("round-table") ? [-0.28, 0.28] : [-0.42, 0.42])) for (const cy of (classes.includes("round-table") ? [-0.28, 0.28] : [-0.4, 0.4])) box(0.08, 0.08, 0.9, cx, cy, 0.45);
      } else if (kind === "three-seat-sofa" || kind === "armchair") {
        box(1, 1, 0.45, 0, 0, 0.225);
        box(1, 0.16, 0.55, 0, -0.42, 0.725);
        for (const cx of [-0.44, 0.44]) box(0.12, 0.84, 0.35, cx, 0.08, 0.625);
      } else {
        box(1, 1, 1, 0, 0, 0.5);
        if (kind === "washing-machine") box(0.55, 0.015, 0.55, 0, -0.4925, 0.5, glass);
        if (kind === "fireplace") box(0.72, 0.015, 0.5, 0, -0.4925, 0.35, dark);
      }
      scene.add(group);
    });
  },

  render({ plan, THREE, scene, stairFlights, stairLandings = [], wallMaterial, wallLineMaterial, finite, reportInvalid }) {
    stairFlights.forEach((stair) => {
      const x = Number(stair.x);
      const y = Number(stair.y);
      const width = Number(stair.w);
      const length = Number(stair.l);
      const z0 = Number(stair.z0);
      const height = Number(stair.h);
      const axis = stair.stairAxis || (width >= length ? "horizontal" : "vertical");
      const run = axis === "horizontal" ? width : length;
      if (
        !finite(x, y, width, length, z0, height, run) ||
        width <= 0 || length <= 0 || height <= 0 || run <= 0
      ) {
        reportInvalid("lance de escada", stair.id);
        return;
      }

      let steps;
      try {
        steps = FloorPlanGeometry.stairSteps({ ...stair, stairAxis: axis });
      } catch (error) {
        reportInvalid("lance de escada", stair.id);
        return;
      }
      const { treads: stepCount, run: stepRun, rise: stepRise } = steps;
      const ascendsWithIncreasingAxis =
        (stair.stairDirection !== "reverse") === (stair.stairRise !== "down");
      for (let index = 0; index < stepCount; index += 1) {
        const offset = ascendsWithIncreasingAxis
          ? index * stepRun
          : run - (index + 1) * stepRun;
        const stepHeight = (index + 1) * stepRise;
        const dimensions = axis === "horizontal"
          ? [stepRun, length, stepHeight]
          : [width, stepRun, stepHeight];
        const center = axis === "horizontal"
          ? [x + offset + stepRun / 2, y + length / 2, z0 + stepHeight / 2]
          : [x + width / 2, y + offset + stepRun / 2, z0 + stepHeight / 2];
        // Keep the space below the flight open. The underside follows the
        // same ideal inclined plane used to limit walls, without a guessed
        // structural thickness.
        const faces = FloorPlanWalls.boxFaces(
          center[0] - dimensions[0] / 2, center[1] - dimensions[1] / 2, z0,
          center[0] + dimensions[0] / 2, center[1] + dimensions[1] / 2, z0 + stepHeight,
        );
        const solid = FloorPlanWalls.clipSolid(faces,
          FloorPlanWalls.stairUndersidePlane(stair).map((value) => -value));
        const vertices = [];
        solid.forEach((face) => {
          for (let i = 1; i < face.length - 1; i++) vertices.push(...face[0], ...face[i], ...face[i + 1]);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        const step = new THREE.Mesh(geometry, this.heightMaterial(plan, THREE, wallMaterial, stair, z0 + stepHeight));
        step.castShadow = true;
        step.receiveShadow = true;
        step.userData.domainId = stair.id;
        step.userData.stepIndex = index;
        scene.add(step);
      }
    });

    if (stairLandings.length) {
      stairLandings.forEach((landing) => {
        const { x, y, w, l, z0 } = landing;
        if (!finite(x, y, w, l, z0) || w <= 0 || l <= 0) {
          reportInvalid("patamar de escada", landing.id);
          return;
        }
        const landingMaterial = this.heightMaterial(plan, THREE, wallMaterial, landing, z0).clone();
        landingMaterial.side = THREE.DoubleSide;
        if (landing.color && !landing.stairGradient) {
          const color = plan.themeFillColor(landing.color).replace(
            /var\((--[\w-]+)\)/g,
            (_match, property) => getComputedStyle(plan.root).getPropertyValue(property).trim(),
          );
          const rgba = color.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
          landingMaterial.color.set(rgba ? `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})` : color);
          if (rgba) {
            landingMaterial.opacity *= Number(rgba[4]);
            landingMaterial.transparent = landingMaterial.opacity < 1;
          }
        }
        const surface = new THREE.Mesh(
          new THREE.PlaneGeometry(w, l),
          landingMaterial,
        );
        surface.position.set(x + w / 2, y + l / 2, z0);
        surface.castShadow = true;
        surface.receiveShadow = true;
        surface.userData.domainId = landing.id;
        scene.add(surface);
      });
    }

    (plan.allItems || [])
      .filter((item) => String(item.classes || "").split(/\s+/).includes("railing"))
      .forEach((item) => {
        const x = Number(item.x);
        const y = Number(item.y);
        const width = Number(item.w);
        const height = Number(item.h ?? item.z1 - item.z0);
        const z0 = Number(item.z0 ?? 0);
        const length = Number(item.l ?? item.length ?? item.w);
        if (!finite(x, y, width, length, height, z0) || width <= 0 || length <= 0 || height <= 0) return;
        const railing = new THREE.Mesh(
          new THREE.BoxGeometry(width, length, height),
          wallLineMaterial,
        );
        railing.castShadow = true;
        railing.receiveShadow = true;
        railing.position.set(x + width / 2, y + length / 2, z0 + height / 2);
        railing.rotation.z = (Number(item.rotation ?? 0) * Math.PI) / 180;
        railing.renderOrder = 5;
        scene.add(railing);
      });
  },
};
