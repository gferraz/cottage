const FloorPlan3DRoofs = {
  render({
    plan, THREE, scene, direction, roofMaterial, roofLineMaterial,
    wallMaterial, windowMaterial, doorMaterial, externalOpenings, facadeSide,
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
          plan, THREE, scene, direction, roof, base, baseX0, baseX1, baseY0, baseY1,
          eave0, eave1, rake0, rake1, span, rise, pitch, pitchTangent, z0,
          roofMaterial, roofLineMaterial, wallMaterial, windowMaterial, doorMaterial,
          externalOpenings, facadeSide, finite, reportInvalid,
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
    plan, THREE, scene, direction, roof, base, baseX0, baseX1, baseY0, baseY1,
    eave0, eave1, rake0, rake1, rise, pitch, pitchTangent, z0,
    roofMaterial, roofLineMaterial, wallMaterial, windowMaterial, doorMaterial,
    externalOpenings, facadeSide, finite, reportInvalid,
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

    const shape = new THREE.Shape();
    shape.moveTo(base.x0(), z0);
    shape.lineTo(ridgeX, z0 + rise);
    shape.lineTo(baseX1, z0);
    shape.closePath();
    const roofWall = direction === "front" ? "top" : "bottom";
    const gableRidgeX = (baseX0 + baseX1) / 2;
    const roofOpeningCandidates = [
      ...externalOpenings.filter((opening) => {
        const part = opening.void || opening;
        const openingX = Number(part.x);
        const openingZ = Number(part.z0);
        return opening.wall === roofWall &&
          finite(openingX, openingZ, part.w, part.h) &&
          openingX >= baseX0 && openingX + Number(part.w) <= baseX1 && openingZ >= z0;
      }),
      ...(Array.isArray(roof.openings) ? roof.openings : []).map((opening) => {
        const openingWidth = Number(opening.w ?? 0.9);
        const openingHeight = Number(opening.h ?? 1.5);
        const offset = opening.dx === undefined
          ? (baseX1 - baseX0 - openingWidth) / 2
          : plan.resolve(opening.dx);
        return {
          ...opening,
          wall: roofWall,
          void: {
            x: baseX0 + offset,
            z0: opening.z0 === undefined
              ? z0 + Math.max(0, (rise - openingHeight) / 2)
              : plan.resolve(opening.z0),
            w: openingWidth,
            h: openingHeight,
          },
        };
      }),
    ];
    roofOpeningCandidates.forEach((opening) => {
      const part = opening.void || opening;
      const holeX = Number(part.x);
      const holeZ = Number(part.z0);
      const holeWidth = Number(part.w);
      const holeHeight = Number(part.h);
      const roofTop = z0 + rise -
        Math.abs(holeX + holeWidth / 2 - gableRidgeX) * Math.tan((pitch * Math.PI) / 180);
      if (!finite(holeX, holeZ, holeWidth, holeHeight, roofTop) || holeX < 0 || holeZ < z0 ||
        holeWidth <= 0 || holeHeight <= 0 || holeZ + holeHeight > roofTop) {
        reportInvalid("recorte do frontão", opening.id);
        return;
      }
      const hole = new THREE.Path();
      hole.moveTo(holeX, holeZ);
      hole.lineTo(holeX + holeWidth, holeZ);
      hole.lineTo(holeX + holeWidth, holeZ + holeHeight);
      hole.lineTo(holeX, holeZ + holeHeight);
      hole.closePath();
      shape.holes.push(hole);
    });
    const geometry = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = direction === "front" ? baseY0 - 0.08 : baseY1 + 0.08;
    mesh.renderOrder = 3;
    scene.add(mesh);
    const wallOutline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(baseX0, mesh.position.y - 0.01, z0),
        new THREE.Vector3(ridgeX, mesh.position.y - 0.01, z0 + rise),
        new THREE.Vector3(baseX1, mesh.position.y - 0.01, z0),
        new THREE.Vector3(baseX0, mesh.position.y - 0.01, z0),
      ]),
      roofLineMaterial,
    );
    wallOutline.renderOrder = 4;
    scene.add(wallOutline);
    roofOpeningCandidates.forEach((opening) => {
      if (!opening.element && !opening.type) return;
      const part = opening.element || opening.void || opening;
      const openingX = Number(part.x);
      const openingZ = Number(part.z0);
      const openingWidth = Number(part.w);
      const openingHeight = Number(part.h);
      if (!finite(openingX, openingZ, openingWidth, openingHeight) || openingWidth <= 0 || openingHeight <= 0) return;
      const feature = new THREE.Mesh(
        new THREE.BoxGeometry(openingWidth, 0.04, openingHeight),
        opening.type === "window" ? windowMaterial : doorMaterial,
      );
      feature.position.set(
        openingX + openingWidth / 2,
        direction === "front" ? baseY0 - 0.025 : baseY1 + 0.025,
        openingZ + openingHeight / 2,
      );
      feature.renderOrder = 9;
      scene.add(feature);
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
