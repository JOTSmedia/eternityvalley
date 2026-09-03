const fs = require('fs');
const path = '/Users/bethrooney/Desktop/JOTS.MEDIA_AG/clients/ETERNITY VALLEY/js/WorldTerrain.js';
let content = fs.readFileSync(path, 'utf8');

const buttressesCode = `
    // MAGNIFICENT UPGRADES - Buttresses, Stonework, Statues, Gargoyles
    (function(targetGroup) {
        const _weatheredStone = typeof material === 'function' ? material('agedCaenLimestone', { repeat: 16.0, color: 0x6e6556, roughness: 0.95, metalness: 0.05, normalScale: 2.5, aoMapIntensity: 2.0 }) : new THREE.MeshStandardMaterial({color: 0x6e6556, roughness: 0.95, metalness: 0.05});
        const _statueMat = typeof material === 'function' ? material('honedCarraraMarble', { repeat: 2.0, color: 0xe0e0e0, roughness: 0.3, metalness: 0.1 }) : new THREE.MeshStandardMaterial({color: 0xe0e0e0, roughness: 0.3});
        const _gargoyleMat = typeof material === 'function' ? material('darkBasalt', { repeat: 3.0, color: 0x333333, roughness: 0.8, metalness: 0.1, normalScale: 3.0 }) : new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.8});
        
        // Flying Buttresses
        const _buttressGeo = new THREE.CylinderGeometry(0.8, 1.2, 18, 6);
        const _buttressArcGeo = new THREE.TorusGeometry(8, 0.8, 8, 12, Math.PI / 2);
        const _buttressMesh = new THREE.InstancedMesh(_buttressGeo, _weatheredStone, 24);
        const _buttressArcMesh = new THREE.InstancedMesh(_buttressArcGeo, _weatheredStone, 24);
        let _dummy = new THREE.Object3D();
        
        let _idx = 0;
        for(let i=0; i<12; i++) {
            let zPos = -30 + i * 6;
            _dummy.position.set(-20, 10, zPos);
            _dummy.rotation.set(0, 0, -Math.PI / 8);
            _dummy.updateMatrix();
            _buttressMesh.setMatrixAt(_idx, _dummy.matrix);
            
            _dummy.position.set(-16, 12, zPos);
            _dummy.rotation.set(0, 0, Math.PI);
            _dummy.updateMatrix();
            _buttressArcMesh.setMatrixAt(_idx, _dummy.matrix);
            _idx++;
            
            _dummy.position.set(20, 10, zPos);
            _dummy.rotation.set(0, 0, Math.PI / 8);
            _dummy.updateMatrix();
            _buttressMesh.setMatrixAt(_idx, _dummy.matrix);
            
            _dummy.position.set(16, 12, zPos);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            _buttressArcMesh.setMatrixAt(_idx, _dummy.matrix);
            _idx++;
        }
        
        // Statues and Gargoyles
        const _statueGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
        const _gargoyleGeo = new THREE.BoxGeometry(0.8, 0.8, 1.2);
        
        const _statueMesh = new THREE.InstancedMesh(_statueGeo, _statueMat, 40);
        const _gargoyleMesh = new THREE.InstancedMesh(_gargoyleGeo, _gargoyleMat, 40);
        
        for(let i=0; i<40; i++) {
            let angle = (i / 40) * Math.PI * 2;
            let r = 22;
            _dummy.position.set(Math.cos(angle)*r, 18, Math.sin(angle)*r);
            _dummy.rotation.set(0, angle, 0);
            _dummy.updateMatrix();
            _statueMesh.setMatrixAt(i, _dummy.matrix);
            
            _dummy.position.set(Math.cos(angle)*(r+1), 20, Math.sin(angle)*(r+1));
            _dummy.updateMatrix();
            _gargoyleMesh.setMatrixAt(i, _dummy.matrix);
        }
        
        targetGroup.add(_buttressMesh);
        targetGroup.add(_buttressArcMesh);
        targetGroup.add(_statueMesh);
        targetGroup.add(_gargoyleMesh);
    })(GROUP_VAR);
`;

function injectAfterString(content, searchStr, varName) {
    let insertPos = content.indexOf(searchStr);
    if (insertPos === -1) {
        console.log("Could not find " + searchStr);
        return content;
    }
    insertPos += searchStr.length;
    let before = content.substring(0, insertPos);
    let after = content.substring(insertPos);
    
    return before + "\n" + buttressesCode.replace(/GROUP_VAR/g, varName) + "\n" + after;
}

// 1. Cathedral is already done because the previous script succeeded for Cathedral! Wait, the previous script succeeded for Cathedral?
// Let's check if MAGNIFICENT UPGRADES is in the file.
let occurrences = (content.match(/MAGNIFICENT UPGRADES/g) || []).length;
if (occurrences > 0) {
    console.log("MAGNIFICENT UPGRADES already present " + occurrences + " times.");
}

// Let's clean up existing MAGNIFICENT UPGRADES to be safe and re-apply cleanly.
let newContent = content.split('// MAGNIFICENT UPGRADES - Buttresses, Stonework, Statues, Gargoyles')[0];
// Actually it's better to just do replacements on a fresh read if it wasn't there. 
// The previous run of fix_buildings.cjs ONLY succeeded for Cathedral, wait no, it said:
// Could not find return statement in /_universalCathedral...
// Wait, the *first* script (fix_buildings.js) didn't execute because of ES module error.
// The *second* script failed with "Could not find matching regex" for everything EXCEPT Cathedral. 
// Let's check occurrences of MAGNIFICENT UPGRADES.
