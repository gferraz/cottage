const FloorPlan3DRoofs = {
  render({
    plan, THREE, scene, roofMaterial, roofLineMaterial,
    finite, reportInvalid,
  }) {
    (plan.allRoofs || []).forEach((roof) => {
      if (roof.type !== "gable") return;
      const baseDefinition = roof.base ?? roof;
      const floor = FloorPlanRoofs.floorForRoof(plan, roof, baseDefinition);
      let base;
      try {
        base = FloorPlanRoofs.resolveBase(plan, baseDefinition, floor);
      } catch {
        return;
      }
      if (!base) return;
      const pitch = Number(roof.pitch);
      if (!Number.isFinite(pitch)) return;
      const baseX0 = Number(base.x0());
      const baseX1 = Number(base.x1());
      const baseY0 = Number(base.y0());
      const baseY1 = Number(base.y1());
      const [eave0, eave1] = FloorPlanRoofs.overhangPair(roof.eave);
      const [rake0, rake1] = FloorPlanRoofs.overhangPair(roof.rake);
      const span = roof.orientation === "longitudinal" ? baseX1 - baseX0 : baseY1 - baseY0;
      const rise = (span / 2) * Math.tan((pitch * Math.PI) / 180);
      const pitchTangent = Math.tan((pitch * Math.PI) / 180);
      const z0 = roof.z0 === undefined
        ? FloorPlanRoofs.baseCeilingZ(plan, base, 0, floor)
        : plan.resolve(roof.z0);
      if (!finite(baseX0, baseX1, baseY0, baseY1, span, rise, z0) || span <= 0 || rise < 0) {
        reportInvalid("telhado", roof.id);
        return;
      }

      if (roof.orientation === "longitudinal") {
        this.renderLongitudinal({
          THREE, scene, baseX0, baseX1, baseY0, baseY1,
          eave0, eave1, rake0, rake1, rise, pitchTangent, z0,
          roofMaterial, roofLineMaterial,
        });
      } else {
        this.renderTransverse({
          THREE, scene, baseX0, baseX1, baseY0, baseY1, eave0, eave1, rake0,
          rake1, rise, pitchTangent, z0, roofMaterial, roofLineMaterial,
        });
      }
    });
  },

  renderLongitudinal({
    THREE, scene, baseX0, baseX1, baseY0, baseY1,
    eave0, eave1, rake0, rake1, rise, pitchTangent, z0,
    roofMaterial, roofLineMaterial,
  }) {
    const roofX0 = baseX0 - eave0;
    const roofX1 = baseX1 + eave1;
    const roofY0 = baseY0 - rake0;
    const roofY1 = baseY1 + rake1;
    const ridgeX = (baseX0 + baseX1) / 2;
    const makeSlope = (x0, z0AtEave, x1, z1AtRidge) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            x0, roofY0, z0AtEave,
            x1, roofY0, z1AtRidge,
            x1, roofY1, z1AtRidge,
            x0, roofY1, z0AtEave,
          ],
          3,
        ),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, roofMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = 7;
      scene.add(mesh);
    };
    makeSlope(roofX0, z0 - eave0 * pitchTangent, ridgeX, z0 + rise);
    makeSlope(ridgeX, z0 + rise, roofX1, z0 - eave1 * pitchTangent);
    [roofY0, roofY1].forEach((y) => {
      const rakeEdge = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(roofX0, y, z0 - eave0 * pitchTangent),
          new THREE.Vector3(ridgeX, y, z0 + rise),
          new THREE.Vector3(roofX1, y, z0 - eave1 * pitchTangent),
        ]),
        roofLineMaterial,
      );
      rakeEdge.renderOrder = 8;
      scene.add(rakeEdge);
    });
  },

  renderTransverse({
    THREE, scene, baseX0, baseX1, baseY0, baseY1, eave0, eave1, rake0, rake1,
    rise, pitchTangent, z0, roofMaterial, roofLineMaterial,
  }) {
    const roofX0 = baseX0 - rake0;
    const roofX1 = baseX1 + rake1;
    const roofY0 = baseY0 - eave0;
    const roofY1 = baseY1 + eave1;
    const ridgeY = (baseY0 + baseY1) / 2;
    const makeSlope = (y0, zStart, y1, zEnd) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            roofX0, y0, zStart,
            roofX1, y0, zStart,
            roofX1, y1, zEnd,
            roofX0, y1, zEnd,
          ],
          3,
        ),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, roofMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = 7;
      scene.add(mesh);
    };
    makeSlope(roofY0, z0 - eave0 * pitchTangent, ridgeY, z0 + rise);
    makeSlope(ridgeY, z0 + rise, roofY1, z0 - eave1 * pitchTangent);
    const roofLines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(roofX0, roofY0, z0 - eave0 * pitchTangent),
        new THREE.Vector3(roofX1, roofY0, z0 - eave0 * pitchTangent),
        new THREE.Vector3(roofX0, ridgeY, z0 + rise),
        new THREE.Vector3(roofX1, ridgeY, z0 + rise),
        new THREE.Vector3(roofX0, roofY1, z0 - eave1 * pitchTangent),
        new THREE.Vector3(roofX1, roofY1, z0 - eave1 * pitchTangent),
      ]),
      roofLineMaterial,
    );
    roofLines.renderOrder = 8;
    scene.add(roofLines);
  },
};
