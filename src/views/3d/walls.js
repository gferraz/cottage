const FloorPlan3DWalls = {
  render(context) {
    this.renderIndependent(context);
    this.renderRoomWalls(context);
  },

  renderIndependent({
    plan, THREE, scene, wallMaterial, wallLineMaterial, windowMaterial,
    doorMaterial, openingsByWall, terrainElevationAt, finite, reportInvalid,
  }) {
    (plan.independentWalls || new Map()).forEach((wall) => {
      const { points } = wall.path;
      const independentWallMaterial = new THREE.MeshBasicMaterial({
        color: wall.color ? plan.themeFillColor(wall.color) : wallMaterial.color,
        side: THREE.DoubleSide,
      });
      for (let index = 0; index < points.length - 1; index += 1) {
        const [x0, y0] = points[index];
        const [x1, y1] = points[index + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const length = Math.hypot(dx, dy);
        let baseStart = wall.base === "terrain" ? terrainElevationAt(y0) : wall.baseZ;
        let baseEnd = wall.base === "terrain" ? terrainElevationAt(y1) : wall.baseZ;
        if (
          !finite(x0, y0, x1, y1, length, wall.topZ, wall.thickness) ||
          !Number.isFinite(baseStart) ||
          !Number.isFinite(baseEnd) ||
          length <= 1e-9 ||
          wall.thickness <= 0
        ) {
          reportInvalid("parede independente", wall.id);
          continue;
        }
        const originalBaseStart = baseStart;
        const originalBaseEnd = baseEnd;
        let start = 0;
        let end = length;
        if (baseStart >= wall.topZ && baseEnd >= wall.topZ) continue;
        if (baseStart >= wall.topZ) {
          start = length * (wall.topZ - baseStart) / (baseEnd - baseStart);
          baseStart = wall.topZ;
        } else if (baseEnd >= wall.topZ) {
          end = length * (wall.topZ - baseStart) / (baseEnd - baseStart);
          baseEnd = wall.topZ;
        }
        const segmentLength = end - start;
        if (segmentLength <= 1e-9) continue;
        const ux = dx / length;
        const uy = dy / length;
        const nx = -uy;
        const ny = ux;
        const startBaseZ = originalBaseStart + (originalBaseEnd - originalBaseStart) * start / length;
        const endBaseZ = originalBaseStart + (originalBaseEnd - originalBaseStart) * end / length;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(segmentLength, endBaseZ - startBaseZ);
        shape.lineTo(segmentLength, wall.topZ - startBaseZ);
        shape.lineTo(0, wall.topZ - startBaseZ);
        shape.closePath();
        const segmentOpenings = (openingsByWall.get(wall.id) || [])
          .filter((opening) => opening.wallSegment === index);
        segmentOpenings.forEach((opening) => {
          const part = opening.void || opening;
          const horizontal = Math.abs(dx) >= Math.abs(dy);
          const openingStart = horizontal ? Number(part.x) : Number(part.y);
          const wallStart = horizontal ? x0 : y0;
          const openingDistance = dx < -1e-9 || (!horizontal && dy < -1e-9)
            ? wallStart - openingStart - Number(part.w)
            : openingStart - wallStart;
          const holeX = openingDistance - start;
          const baseAtOpening = originalBaseStart +
            (originalBaseEnd - originalBaseStart) * openingDistance / length;
          const holeZ = Number(part.z0) - baseAtOpening;
          const holeWidth = Number(part.w);
          const holeHeight = Number(part.h);
          if (
            !finite(holeX, holeZ, holeWidth, holeHeight) ||
            holeX < 0 || holeZ < 0 || holeWidth <= 0 || holeHeight <= 0 ||
            holeX + holeWidth > segmentLength ||
            baseAtOpening + holeZ + holeHeight > wall.topZ + 1e-7
          ) {
            reportInvalid("recorte de parede independente", opening.id);
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
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: wall.thickness,
          bevelEnabled: false,
        });
        const matrix = new THREE.Matrix4().set(
          ux, 0, nx, x0 + ux * start - nx * wall.thickness / 2,
          uy, 0, ny, y0 + uy * start - ny * wall.thickness / 2,
          0, 1, 0, startBaseZ,
          0, 0, 0, 1,
        );
        geometry.applyMatrix4(matrix);
        const mesh = new THREE.Mesh(geometry, independentWallMaterial);
        mesh.userData.domainId = wall.id;
        mesh.userData.pathSegment = index;
        mesh.renderOrder = 1;
        scene.add(mesh);
        scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), wallLineMaterial));
        segmentOpenings.forEach((opening) => {
          if (!opening.element) return;
          const part = opening.element;
          const horizontal = Math.abs(dx) >= Math.abs(dy);
          const openingStart = horizontal ? Number(part.x) : Number(part.y);
          const wallStart = horizontal ? x0 : y0;
          const openingDistance = dx < -1e-9 || (!horizontal && dy < -1e-9)
            ? wallStart - openingStart - Number(part.w)
            : openingStart - wallStart;
          const centerDistance = openingDistance + Number(part.w) / 2;
          const feature = new THREE.Mesh(
            new THREE.BoxGeometry(Number(part.w), 0.035, Number(part.h)),
            part.type === "window" ? windowMaterial : doorMaterial,
          );
          feature.position.set(
            x0 + ux * centerDistance - nx * wall.thickness * 0.52,
            y0 + uy * centerDistance - ny * wall.thickness * 0.52,
            Number(part.z0) + Number(part.h) / 2,
          );
          feature.rotation.z = Math.atan2(dy, dx);
          feature.renderOrder = 9;
          scene.add(feature);
        });
      }
    });
  },

  renderRoomWalls({
    plan, THREE, scene, wallMaterial, wallLineMaterial, windowMaterial,
    doorMaterial, openingsByWall, finite, reportInvalid,
  }) {
    plan.walls.forEach((wall) => {
      const [x0, y0, z0] = wall.pos;
      const [width, depth, height] = wall.size;
      const alongX = wall.axis === "x";
      const length = alongX ? width : depth;
      if (!finite(x0, y0, z0, width, depth, height, length) || length <= 0 || height <= 0) {
        reportInvalid("parede", wall.id);
        return;
      }

      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(length, 0);
      shape.lineTo(length, height);
      shape.lineTo(0, height);
      shape.closePath();
      (openingsByWall.get(wall.id) || []).forEach((opening) => {
        const part = opening.void || opening;
        const holeStart = alongX ? Number(part.x) : Number(part.y);
        const wallStart = alongX ? wall.from[0] : wall.from[1];
        const holeX = holeStart - wallStart;
        const holeZ = Number(part.z0) - z0;
        const holeWidth = Number(part.w);
        const holeHeight = Number(part.h);
        if (
          !finite(holeX, holeZ, holeWidth, holeHeight) ||
          holeWidth <= 0 ||
          holeHeight <= 0 ||
          holeX < 0 ||
          holeZ < 0 ||
          holeX + holeWidth > length ||
          holeZ + holeHeight > height
        ) {
          reportInvalid("recorte de parede", opening.id);
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

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: alongX ? depth : width,
        bevelEnabled: false,
      });
      const transform = alongX
        ? new THREE.Matrix4().set(
            1, 0, 0, x0,
            0, 0, -1, y0 + depth,
            0, 1, 0, z0,
            0, 0, 0, 1,
          )
        : new THREE.Matrix4().set(
            0, 0, 1, x0,
            1, 0, 0, y0,
            0, 1, 0, z0,
            0, 0, 0, 1,
          );
      geometry.applyMatrix4(transform);
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.userData.domainId = wall.id;
      scene.add(mesh);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        wallLineMaterial,
      );
      scene.add(outline);

      (openingsByWall.get(wall.id) || []).forEach((opening) => {
        if (!opening.element) return;
        const part = opening.element;
        const feature = new THREE.Mesh(
          new THREE.BoxGeometry(
            alongX ? Number(part.w) : 0.04,
            alongX ? 0.04 : Number(part.w),
            Number(part.h),
          ),
          part.type === "window" ? windowMaterial : doorMaterial,
        );
        feature.position.set(
          alongX ? Number(part.x) + Number(part.w) / 2 : wall.from[0],
          alongX ? wall.from[1] : Number(part.y) + Number(part.w) / 2,
          Number(part.z0) + Number(part.h) / 2,
        );
        feature.renderOrder = 9;
        scene.add(feature);
      });
    });
  },
};
