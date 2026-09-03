import re

with open('js/WorldTerrain.js', 'r') as f:
    content = f.read()

# We want to find the section for Apse Sanctuary and replace it.
# We'll also inject byzantineMosaic into the Master Material Palette.

palette_addition = """    const stainedGlassRose = Surfaces.stainedGlassRose();
    const byzantineMosaic = Surfaces.byzantineMosaic(12.0); // Add mosaic
"""

content = content.replace("    const stainedGlassRose = Surfaces.stainedGlassRose();", palette_addition)

apse_start = "// Apse Sanctuary & High Celestial Altar (North End at z = -38)"
apse_end = "g.add(apseAltar);"

# Extract the content to replace
idx_start = content.find(apse_start)
idx_end = content.find(apse_end) + len(apse_end)

if idx_start != -1 and idx_end != -1:
    new_apse = """// Apse Sanctuary & High Celestial Altar (North End at z = -38)
    const apseAltar = new THREE.Group();
    apseAltar.position.set(0, 2.0, -38);

    // Breathtaking Byzantine Mosaic Apse Half-Dome (Cul-de-four)
    const apseDomeGeo = new THREE.SphereGeometry(11, 32, 16, Math.PI, Math.PI, 0, Math.PI / 2);
    const apseDome = new THREE.Mesh(apseDomeGeo, byzantineMosaic);
    apseDome.position.set(0, 25.0, -3.5);
    apseDome.material.side = THREE.BackSide; // Viewable from inside
    apseAltar.add(apseDome);

    // Mosaic Apse Floor
    const apseFloorGeo = new THREE.CircleGeometry(11, 32, Math.PI, Math.PI);
    const apseFloor = new THREE.Mesh(apseFloorGeo, byzantineMosaic);
    apseFloor.rotation.x = -Math.PI / 2;
    apseFloor.position.set(0, 0.02, -3.5);
    apseFloor.receiveShadow = true;
    apseAltar.add(apseFloor);

    // Grand Triumphal Arch framing the apse
    const archGeo = new THREE.TorusGeometry(11.2, 0.6, 16, 48, Math.PI);
    const triumphalArch = new THREE.Mesh(archGeo, darkStone);
    triumphalArch.position.set(0, 25.0, 0);
    apseAltar.add(triumphalArch);

    const altarStep1 = new THREE.Mesh(new THREE.BoxGeometry(16, 0.45, 9), marble);
    altarStep1.position.y = 0.22;
    apseAltar.add(altarStep1);

    const altarStep2 = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.45, 7), marble);
    altarStep2.position.y = 0.67;
    apseAltar.add(altarStep2);

    // Intricate High Altar Table
    const altarTable = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.3, 2.8), marble);
    altarTable.position.set(0, 1.55, 0);
    altarTable.castShadow = true;
    apseAltar.add(altarTable);

    // Gold trim on Altar
    const altarTrimGeo = new THREE.BoxGeometry(8.3, 0.1, 2.9);
    const altarTrim = new THREE.Mesh(altarTrimGeo, gold);
    altarTrim.position.set(0, 2.15, 0);
    apseAltar.add(altarTrim);

    // Carved Gilded Reredos Screen behind Altar (Magnificent detail)
    const reredosGeo = new THREE.BoxGeometry(11.2, 9.5, 0.8);
    const reredos = new THREE.Mesh(reredosGeo, gold);
    reredos.position.set(0, 5.65, -3.2); 
    reredos.castShadow = true;
    apseAltar.add(reredos);

    // Radiant Celestial Starburst Beacon above Altar
    const altarStarburst = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 2), gold);
    altarStarburst.position.set(0, 14.0, -2.4);
    apseAltar.add(altarStarburst);

    const altarLight = new THREE.PointLight(0xfff0cc, 6.2, 90);
    altarLight.position.set(0, 14.0, -2.4);
    apseAltar.add(altarLight);

    // Stained Glass Reflections (Colorful ambient light pools on the floor)
    const sgLight1 = new THREE.PointLight(0xff3366, 2.5, 30);
    sgLight1.position.set(-8, 3.0, 10);
    apseAltar.add(sgLight1);
    
    const sgLight2 = new THREE.PointLight(0x3366ff, 2.5, 30);
    sgLight2.position.set(8, 3.0, 10);
    apseAltar.add(sgLight2);

    const sgLight3 = new THREE.PointLight(0x33cc33, 2.0, 40);
    sgLight3.position.set(0, 4.0, -10);
    apseAltar.add(sgLight3);

    g.add(apseAltar);"""
    
    content = content[:idx_start] + new_apse + content[idx_end:]

with open('js/WorldTerrain.js', 'w') as f:
    f.write(content)
