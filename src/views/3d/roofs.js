const FloorPlan3DRoofs = {
  render({ plan, THREE, scene, roofMaterial, roofEdgeMaterial, roofLineMaterial }) {
    FloorPlanRoofGeometry.intersectingSurfaces(plan).forEach(({ roof, polygons }) => {
      if (!polygons.length) return;
      const value = roof.thickness ?? 0.12;
      const resolved = Number(plan.resolve(value));
      const thickness = Number.isFinite(resolved) && resolved >= 0 ? resolved : 0.12;
      const { faces, edges } = FloorPlanRoofGeometry.solidSurface(polygons, thickness);
      const vertices = [];
      const geometry = new THREE.BufferGeometry();
      faces.forEach((polygon, faceIndex) => {
        const start = vertices.length / 3;
        for (let i = 1; i < polygon.length - 1; i += 1) {
          vertices.push(...polygon[0], ...polygon[i], ...polygon[i + 1]);
        }
        // solidSurface orders top, underside, then the vertical edge faces.
        const materialIndex = faceIndex >= polygons.length * 2 ? 1 : 0;
        geometry.addGroup(start, vertices.length / 3 - start, materialIndex);
      });
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, [roofMaterial, roofEdgeMaterial]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.domainId = roof.id || "";
      mesh.renderOrder = 7;
      scene.add(mesh);
      const lines = new THREE.BufferGeometry();
      lines.setAttribute("position", new THREE.Float32BufferAttribute(
        edges.flat(), 3,
      ));
      const outline = new THREE.LineSegments(lines, roofLineMaterial);
      outline.renderOrder = 8;
      scene.add(outline);
    });
  },
};
