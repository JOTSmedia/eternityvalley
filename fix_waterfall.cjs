const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

// Replace primary waterfall mesh
code = code.replace(
  /g\.add\(new THREE\.Mesh\(buildChuteRibbon\(fallCurve, 20, 48, 140\), waterfallMat\)\);/,
  `const primaryFall = new THREE.Mesh(buildChuteRibbon(fallCurve, 20, 48, 140), waterfallMat);
    primaryFall.renderOrder = 1;
    g.add(primaryFall);`
);

// Replace veil mesh
code = code.replace(
  /veilMesh\.position\.z \+= 0\.35;\n\s*g\.add\(veilMesh\);/,
  `veilMesh.position.z += 0.35;
    veilMesh.renderOrder = 2;
    g.add(veilMesh);`
);

// Replace thin sheet mesh
code = code.replace(
  /thinSheet\.position\.z \+= 1\.2;\n\s*g\.add\(thinSheet\);/,
  `thinSheet.position.z += 1.2;
    thinSheet.renderOrder = 3;
    g.add(thinSheet);`
);

fs.writeFileSync('js/world3d.js', code);
