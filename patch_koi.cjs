const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const search = `  _buildKoiMesh() {
    const parts = [];
    // More organic, teardrop-shaped body
    const body = new THREE.SphereGeometry(0.4, 24, 16);
    body.scale(0.5, 0.85, 2.8);
    // Taper the tail end
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        let z = pos.getZ(i);
        if (z < 0) {
            let taper = 1.0 + (z / 1.12);
            pos.setX(i, pos.getX(i) * taper);
            pos.setY(i, pos.getY(i) * taper);
        }
    }
    body.computeVertexNormals();
    parts.push(body);
    
    // Swept, elegant tail fin
    const tailFin = new THREE.ConeGeometry(0.35, 1.2, 4);
    tailFin.rotateX(Math.PI / 2);
    tailFin.rotateZ(Math.PI / 4);
    tailFin.scale(0.1, 1.2, 1);
    tailFin.translate(0, 0, -1.5);
    parts.push(tailFin);

    // Dorsal fin (swept back)
    const dorsal = new THREE.CylinderGeometry(0.01, 0.15, 1.0, 3);
    dorsal.rotateZ(Math.PI / 2);
    dorsal.rotateX(0.2);
    dorsal.translate(0, 0.42, -0.3);
    parts.push(dorsal);

    // Pectoral fins
    const lFin = new THREE.CylinderGeometry(0.01, 0.25, 0.6, 3);
    lFin.rotateX(Math.PI / 2); lFin.rotateZ(-0.5); lFin.rotateY(0.5);
    lFin.translate(-0.35, -0.2, 0.6);
    const rFin = new THREE.CylinderGeometry(0.01, 0.25, 0.6, 3);
    rFin.rotateX(Math.PI / 2); rFin.rotateZ(0.5); rFin.rotateY(-0.5);
    rFin.translate(0.35, -0.2, 0.6);
    parts.push(lFin, rFin);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const lEye = eyeGeo.clone();
    lEye.translate(-0.16, 0.1, 0.9);
    const rEye = eyeGeo.clone();
    rEye.translate(0.16, 0.1, 0.9);
    
    const addColors = (geom, isEye) => {
        const count = geom.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for(let i=0; i<count; i++) {
            colors[i*3] = isEye ? 0 : 1;
            colors[i*3+1] = isEye ? 0 : 1;
            colors[i*3+2] = isEye ? 0 : 1;
        }
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    };
    
    parts.forEach(p => addColors(p, false));
    addColors(lEye, true);
    addColors(rEye, true);
    parts.push(lEye, rEye);
    
    return BufferGeometryUtils.mergeGeometries(parts, false);
  }`;

const replace = `  _buildKoiMesh() {
    const parts = [];
    
    // Organic, realistic teardrop-shaped body
    const body = new THREE.SphereGeometry(0.45, 32, 24);
    body.scale(0.42, 0.75, 2.8);
    const pos = body.attributes.position;
    const uvs = body.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        let z = pos.getZ(i);
        let y = pos.getY(i);
        // Taper the tail smoothly
        if (z < 0) {
            let taper = Math.pow(1.0 + (z / 1.15), 0.85); // curved taper
            pos.setX(i, pos.getX(i) * Math.max(0.05, taper));
            pos.setY(i, y * Math.max(0.08, taper));
        } else {
            // Sharpen the head and snout
            let headTaper = 1.0 - (z / 2.8) * 0.4;
            pos.setX(i, pos.getX(i) * headTaper);
            if (y < 0) pos.setY(i, y * (1.0 - (z / 3.0))); // flat belly
        }
        
        // Custom UV mapping for procedural scales (wrap around)
        // Let's use the object local X, Z for scales
    }
    body.computeVertexNormals();
    parts.push(body);
    
    // Swept, elegant tail fin (flat plane instead of cone)
    const tailFin = new THREE.PlaneGeometry(0.8, 1.2, 4, 4);
    tailFin.rotateY(Math.PI / 2);
    tailFin.translate(0, 0, -1.35);
    const tPos = tailFin.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
        let z = tPos.getZ(i);
        let y = tPos.getY(i);
        // swept back fork shape
        if (z < -1.35) {
            tPos.setZ(i, z - Math.abs(y) * 0.6);
        }
    }
    tailFin.computeVertexNormals();
    parts.push(tailFin);

    // Dorsal fin (swept back)
    const dorsal = new THREE.PlaneGeometry(0.3, 1.4, 4, 4);
    dorsal.rotateY(Math.PI / 2);
    const dPos = dorsal.attributes.position;
    for (let i = 0; i < dPos.count; i++) {
        let z = dPos.getZ(i);
        let y = dPos.getY(i);
        dPos.setY(i, y + 0.5);
        if (z < 0) dPos.setZ(i, z - y * 0.5); // swept back
    }
    dorsal.computeVertexNormals();
    parts.push(dorsal);

    // Pectoral fins (flat)
    const lFin = new THREE.PlaneGeometry(0.8, 0.4, 2, 2);
    lFin.rotateX(Math.PI / 2); lFin.rotateY(-0.4); lFin.rotateZ(0.3);
    lFin.translate(-0.35, -0.15, 0.5);
    const rFin = new THREE.PlaneGeometry(0.8, 0.4, 2, 2);
    rFin.rotateX(Math.PI / 2); rFin.rotateY(0.4); rFin.rotateZ(-0.3);
    rFin.translate(0.35, -0.15, 0.5);
    parts.push(lFin, rFin);

    // Pelvic fins
    const lpFin = new THREE.PlaneGeometry(0.4, 0.2, 2, 2);
    lpFin.rotateX(Math.PI / 2); lpFin.rotateY(-0.3);
    lpFin.translate(-0.15, -0.28, -0.2);
    const rpFin = new THREE.PlaneGeometry(0.4, 0.2, 2, 2);
    rpFin.rotateX(Math.PI / 2); rpFin.rotateY(0.3);
    rpFin.translate(0.15, -0.28, -0.2);
    parts.push(lpFin, rpFin);

    // Eyes (slightly flatter)
    const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
    eyeGeo.scale(1.0, 1.0, 0.6);
    const lEye = eyeGeo.clone();
    lEye.translate(-0.14, 0.1, 0.85);
    const rEye = eyeGeo.clone();
    rEye.translate(0.14, 0.1, 0.85);
    
    const addColors = (geom, isEye, isFin) => {
        const count = geom.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for(let i=0; i<count; i++) {
            if (isEye) {
                colors[i*3] = 0; colors[i*3+1] = 0; colors[i*3+2] = 0;
            } else if (isFin) {
                // Fins are slightly transparent/different color in shader
                colors[i*3] = 0.8; colors[i*3+1] = 0.8; colors[i*3+2] = 0.8;
            } else {
                colors[i*3] = 1; colors[i*3+1] = 1; colors[i*3+2] = 1;
            }
        }
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    };
    
    addColors(body, false, false);
    [tailFin, dorsal, lFin, rFin, lpFin, rpFin].forEach(p => addColors(p, false, true));
    addColors(lEye, true, false);
    addColors(rEye, true, false);
    
    parts.push(lEye, rEye);
    
    return BufferGeometryUtils.mergeGeometries(parts, false);
  }`;

if (!code.includes('_buildKoiMesh')) {
  console.log('Function _buildKoiMesh not found');
} else {
  code = code.replace(search, replace);
  fs.writeFileSync('js/world3d.js', code);
  console.log('Patched geometry');
}
