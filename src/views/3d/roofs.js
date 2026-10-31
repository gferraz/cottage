const FloorPlan3DRoofs = {
  render({ plan, THREE, scene, roofMaterial, roofLineMaterial }) {
    FloorPlanRoofs.intersectingSurfaces(plan).forEach(({ roof, polygons }) => {
      if (!polygons.length) return;
      const vertices = [];
      polygons.forEach((polygon) => {
        for (let i = 1; i < polygon.length - 1; i += 1) {
          vertices.push(...polygon[0], ...polygon[i], ...polygon[i + 1]);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, roofMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.domainId = roof.id || "";
      mesh.renderOrder = 7;
      scene.add(mesh);
      const lines = new THREE.BufferGeometry();
      lines.setAttribute("position", new THREE.Float32BufferAttribute(
        FloorPlanRoofs.surfaceEdges(polygons).flat(), 3,
      ));
      const outline = new THREE.LineSegments(lines, roofLineMaterial);
      outline.renderOrder = 8;
      scene.add(outline);
    });
  },
};
