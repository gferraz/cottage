const FloorPlan3DElements = {
  render({ plan, THREE, scene, stairFlights, wallMaterial, wallLineMaterial, finite, reportInvalid }) {
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

      const stepCount = Math.max(1, Math.round(height / 0.16));
      const stepRun = run / stepCount;
      const stepRise = height / stepCount;
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
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(...dimensions),
          wallMaterial,
        );
        step.position.set(...center);
        step.userData.domainId = stair.id;
        step.userData.stepIndex = index;
        scene.add(step);
      }
    });

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
        railing.position.set(x + width / 2, y + length / 2, z0 + height / 2);
        railing.renderOrder = 5;
        scene.add(railing);
      });
  },
};
