const fs = require('fs');
const path = '/Users/bethrooney/Desktop/JOTS.MEDIA_AG/clients/ETERNAL VALLEY/js/WorldTerrain.js';
let content = fs.readFileSync(path, 'utf8');

// Helper function to insert code before the return statement of a function
function injectBeforeReturn(content, functionRegex, codeToInject) {
    let match = content.match(functionRegex);
    if (!match) {
        console.log("Could not find function matching " + functionRegex);
        return content;
    }
    
    let startIndex = match.index;
    // Find the end of the function block (naive but works if we just look for 'return group;' or 'return g;' near the end)
    let endSearchArea = content.substring(startIndex, startIndex + 50000); 
    
    // We will look for `return g;` or `return templeGroup;` etc.
    let returnMatch = endSearchArea.match(/return\s+(g|templeGroup|group|bridgeGroup|gateGroup);\s*\}/);
    if (!returnMatch) {
         console.log("Could not find return statement in " + functionRegex);
         return content;
    }
    
    let returnIndex = startIndex + returnMatch.index;
    
    let before = content.substring(0, returnIndex);
    let after = content.substring(returnIndex);
    
    return before + "\n" + codeToInject + "\n" + after;
}

const buttressesCode = `
    // MAGNIFICENT UPGRADES
    const weatheredStone = material('agedCaenLimestone', { repeat: 16.0, color: 0x6e6556, roughness: 0.95, metalness: 0.05, normalScale: 2.5, aoMapIntensity: 2.0 });
    const statueMat = material('honedCarraraMarble', { repeat: 2.0, color: 0xe0e0e0, roughness: 0.3, metalness: 0.1 });
    const gargoyleMat = material('darkBasalt', { repeat: 3.0, color: 0x333333, roughness: 0.8, metalness: 0.1, normalScale: 3.0 });
    
    // Flying Buttresses
    const buttressGeo = new THREE.CylinderGeometry(0.8, 1.2, 18, 6);
    const buttressArcGeo = new THREE.TorusGeometry(8, 0.8, 8, 12, Math.PI / 2);
    const buttressMesh = new THREE.InstancedMesh(buttressGeo, weatheredStone, 24);
    const buttressArcMesh = new THREE.InstancedMesh(buttressArcGeo, weatheredStone, 24);
    let dummy = new THREE.Object3D();
    
    let idx = 0;
    for(let i=0; i<12; i++) {
        let zPos = -30 + i * 6;
        // Left side
        dummy.position.set(-20, 10, zPos);
        dummy.rotation.set(0, 0, -Math.PI / 8);
        dummy.updateMatrix();
        buttressMesh.setMatrixAt(idx, dummy.matrix);
        
        dummy.position.set(-16, 12, zPos);
        dummy.rotation.set(0, 0, Math.PI);
        dummy.updateMatrix();
        buttressArcMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
        
        // Right side
        dummy.position.set(20, 10, zPos);
        dummy.rotation.set(0, 0, Math.PI / 8);
        dummy.updateMatrix();
        buttressMesh.setMatrixAt(idx, dummy.matrix);
        
        dummy.position.set(16, 12, zPos);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        buttressArcMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
    }
    
    // Statues and Gargoyles
    const statueGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 8); // Placeholder for statue
    const gargoyleGeo = new THREE.BoxGeometry(0.8, 0.8, 1.2); // Placeholder for gargoyle
    
    const statueMesh = new THREE.InstancedMesh(statueGeo, statueMat, 40);
    const gargoyleMesh = new THREE.InstancedMesh(gargoyleGeo, gargoyleMat, 40);
    
    for(let i=0; i<40; i++) {
        let angle = (i / 40) * Math.PI * 2;
        let r = 22;
        dummy.position.set(Math.cos(angle)*r, 18, Math.sin(angle)*r);
        dummy.rotation.set(0, angle, 0);
        dummy.updateMatrix();
        statueMesh.setMatrixAt(i, dummy.matrix);
        
        dummy.position.set(Math.cos(angle)*(r+1), 20, Math.sin(angle)*(r+1));
        dummy.updateMatrix();
        gargoyleMesh.setMatrixAt(i, dummy.matrix);
    }
`;

// 1. Cathedral
let modified = injectBeforeReturn(content, /_universalCathedral\s*\(\)\s*\{/, buttressesCode.replace(/g\.add/g, 'g.add').replace(/\/\/ MAGNIFICENT UPGRADES/g, 'g.add(buttressMesh); g.add(buttressArcMesh); g.add(statueMesh); g.add(gargoyleMesh);'));

// 2. Temple of Baal
modified = injectBeforeReturn(modified, /_buildTempleOfBaal\s*\(\)\s*\{|2\. THE MONUMENTAL TEMPLE OF BAAL/, buttressesCode.replace(/g\.add/g, 'templeGroup.add').replace(/\/\/ MAGNIFICENT UPGRADES/g, 'templeGroup.add(buttressMesh); templeGroup.add(buttressArcMesh); templeGroup.add(statueMesh); templeGroup.add(gargoyleMesh);'));

// 3. Plaza
modified = injectBeforeReturn(modified, /_plaza\s*\(\)\s*\{/, buttressesCode.replace(/g\.add/g, 'g.add').replace(/\/\/ MAGNIFICENT UPGRADES/g, 'g.add(buttressMesh); g.add(buttressArcMesh); g.add(statueMesh); g.add(gargoyleMesh);'));

// 4. Rainbow Bridge
modified = injectBeforeReturn(modified, /_rainbowBridge\s*\(\)\s*\{/, buttressesCode.replace(/g\.add/g, 'g.add').replace(/\/\/ MAGNIFICENT UPGRADES/g, 'g.add(buttressMesh); g.add(buttressArcMesh); g.add(statueMesh); g.add(gargoyleMesh);'));

// 5. Gatehouse (Arc de Triomphe / Brandenburg Gate)
modified = injectBeforeReturn(modified, /_buildClassicalGateway\s*\(\)\s*\{|Soaring Classical Gateway Proportions/, buttressesCode.replace(/g\.add/g, 'g.add').replace(/\/\/ MAGNIFICENT UPGRADES/g, 'g.add(buttressMesh); g.add(buttressArcMesh); g.add(statueMesh); g.add(gargoyleMesh);'));

fs.writeFileSync(path, modified);
console.log("Modifications complete.");
