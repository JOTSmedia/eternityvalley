/**
 * scratch/desert_expansion.js
 * 
 * Proposed modifications to add the Grand Canyon / Desert biome behind the cathedral.
 * 
 * INTEGRATION INSTRUCTIONS:
 * 
 * 1. In `js/terrain.js` - `terrainHeightBase(x, z)`:
 * Insert this block near the end of `terrainHeightBase`, right before the "Combine initial macro terrain" or right after the "High Alpine Plateau" logic:
 */

  // --- ADD THIS BLOCK TO terrainHeightBase in terrain.js ---
  // 5. Grand Canyon / Desert biome (z <= -1000)
  if (z <= -1000 && z >= -2200) {
    // Carve a meandering canyon channel
    const canyonCenter = Math.sin(z * 0.006) * 220;
    const dCanyon = Math.abs(x - canyonCenter);
    
    // Canyon floor at ~45m, surrounded by stepped mesas up to 240m
    const mesaMacro = fbm(x * 0.004, z * 0.004, 3);
    const mesaTop = 240.0 + mesaMacro * 45.0;
    
    // Create stepped canyon walls
    let wallT = clamp((dCanyon - 80) / 280, 0.0, 1.0);
    // Add terraces to the wall (stepped effect)
    wallT = Math.pow(wallT, 0.8) + Math.sin(wallT * Math.PI * 6) * 0.04; 
    wallT = clamp(wallT, 0.0, 1.0);
    
    const canyonFloor = 45.0 + (fbm(x * 0.015, z * 0.015, 2) - 0.5) * 12.0;
    const canyonH = lerp(canyonFloor, mesaTop, wallT);
    
    const canyonZBlend = sstep(-1000, -1100, z) * sstep(-2200, -2000, z);
    // Fade out canyon at the edges horizontally
    const canyonXBlend = sstep(700, 500, Math.abs(x)); 
    
    h = lerp(h, canyonH, canyonZBlend * canyonXBlend);
  }
  // ---------------------------------------------------------


/**
 * 2. In `js/terrain.js` - DISTRICTS and districtRegions:
 * Expand the real estate to include plots in the new canyon.
 */

// Add to DISTRICTS object:
  desert_canyon: { key: 'desert_canyon', name: 'Grand Canyon Desert', base: 349, color: '#d27d46',
              blurb: 'Deep red rock canyons and towering saguaro cacti behind the waterfall.' },

// Add to DISTRICT_NAMES object:
  desert_canyon: 'Grand Canyon Desert',

// Add to districtRegions() return object:
    desert_canyon: [
      // Adjust rows/cols and starting coords based on the carved canyon space
      { x0: -200, z0: -1800, cols: 6, rows: 6, dx: 50, dz: 56 },
      { x0: 50,   z0: -1700, cols: 5, rows: 5, dx: 52, dz: 54 },
    ],


/**
 * 3. In `js/WorldTerrain.js` - `_terrain()` Pass 2 CPU Vertex Colors:
 * In the loop where terrain colors are determined, add this blend for the canyon.
 */

      // --- ADD THIS TO Pass 2 color logic (inside `for (let i = 0; i < pos.count; i++)` after the existing Alpine/Forest logic) ---
      if (z < -1000 && z > -2200) {
        // Grand Canyon / Desert Biome Blend
        const desertBlend = sstep(-1000, -1100, z) * sstep(-2200, -2000, z);
        
        const canyonSand = new THREE.Color(0xd27d46); 
        const redRock = new THREE.Color(0xa14220); 
        const desertScrub = new THREE.Color(0x737c56); 
        
        // Mix base desert sand with scrub
        const desertBase = canyonSand.clone().lerp(desertScrub, n1 * 0.4);
        
        // Red rock cliffs on steep slopes
        const rockMix = Math.max(0.0, Math.min(1.0, (0.80 - slope) / 0.25));
        const desertTerrain = desertBase.clone().lerp(redRock, rockMix * 0.9);
        
        // Add strata lines to red rock cliffs based on y-height
        const strata = Math.sin(h * 0.8) * 0.5 + 0.5;
        desertTerrain.lerp(new THREE.Color(0xd89566), rockMix * strata * 0.3);
        
        c.lerp(desertTerrain, desertBlend);
      }
      // ---------------------------------------------------------


/**
 * 4. In `js/WorldTerrain.js` - `_terrain()` Fragment Shader (`shader.fragmentShader` replacement):
 * Add the desert shader logic in `#include <map_fragment>` right before `vec3 finalAlbedo = groundBase;`.
 */

          // --- ADD THIS TO shader.fragmentShader `#include <map_fragment>` ---
          // Grand Canyon Desert colors
          float isCanyon = smoothstep(-1000.0, -1100.0, vCustomWorldPosition.z) * smoothstep(-2200.0, -2000.0, vCustomWorldPosition.z);
          if (isCanyon > 0.001) {
            vec3 canyonSand = vec3(0.82, 0.49, 0.27); // Warm orange/red sand
            vec3 redRock = vec3(0.63, 0.26, 0.12); // Sedona red rock
            vec3 desertScrub = vec3(0.45, 0.48, 0.34); // Sage/olive green
            
            // Base desert sand
            vec3 desertBase = mix(canyonSand, desertScrub, grassFine.g * 0.5);
            
            // Red rock cliffs on steep slopes
            vec3 desertTerrain = mix(desertBase, redRock, cliffFactor * 0.95);
            
            // Add strata lines to red rock cliffs based on y-height
            float strata = sin(vCustomWorldPosition.y * 0.8) * 0.5 + 0.5;
            desertTerrain = mix(desertTerrain, vec3(0.85, 0.58, 0.40), cliffFactor * strata * 0.25); // lighter strata bands
            
            groundBase = mix(groundBase, desertTerrain, isCanyon * 0.95);
          }
          // ---------------------------------------------------------


/**
 * 5. In `js/WorldTerrain.js` - `_districtFeatures()`:
 * Add placement logic and mesh generation for Saguaro Cacti.
 */

    // --- ADD THIS TO _districtFeatures() where other arrays are initialized ---
    // ─── Grand Canyon / Desert Biome: Saguaro Cacti & Agave ───
    const canyonCacti = [], canyonAgave = [];
    for (let i = 0; i < 400; i++) {
      if (i % 50 === 0) await yieldMain();
      const x = -600 + rng() * 1200; 
      const z = -2100 + rng() * 1000; // Between -1100 and -2100
      const h = place(x, z, 10);
      if (h === null || h > 220 || h < 45) continue;
      
      // Basic slope check using surrounding heights
      const hx = terrainHeight(x + 2, z);
      const hz = terrainHeight(x, z + 2);
      const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h));
      if (slope > 1.2) continue; // Skip steep cliffs
      
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(0.8 + rng() * 0.8);
      tmp.updateMatrix();
      if (rng() < 0.6) canyonCacti.push(tmp.matrix.clone());
      else canyonAgave.push(tmp.matrix.clone());
    }
    // ---------------------------------------------------------

    // --- ADD THIS TO _districtFeatures() instantiation section at the end ---
    // Saguaro Cacti Geometry
    const saguaroGeo = (() => {
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.3, 0.4, 4.5, 8);
      trunk.translate(0, 2.25, 0);
      parts.push(trunk);
      
      const arm1 = new THREE.CylinderGeometry(0.2, 0.25, 1.8, 8);
      arm1.rotateZ(0.5);
      arm1.translate(0.6, 2.0, 0);
      parts.push(arm1);
      
      const arm1Up = new THREE.CylinderGeometry(0.2, 0.25, 1.5, 8);
      arm1Up.translate(1.0, 3.2, 0);
      parts.push(arm1Up);
      
      const arm2 = new THREE.CylinderGeometry(0.2, 0.25, 1.6, 8);
      arm2.rotateZ(-0.5);
      arm2.translate(-0.6, 2.5, 0);
      parts.push(arm2);
      
      const arm2Up = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8);
      arm2Up.translate(-1.0, 3.5, 0);
      parts.push(arm2Up);

      return safeMerge(parts, false) || parts[0];
    })();
    const cactusMat = new THREE.MeshPhysicalMaterial({ color: 0x476332, roughness: 0.8 });
    inst(saguaroGeo, cactusMat, canyonCacti, 0);

    // Reuse desertAgaveGeo (which is defined for the Desert Bloom area)
    if (typeof desertAgaveGeo !== 'undefined') {
      inst(desertAgaveGeo, Surfaces.foliage(1.2, 0x6e8862), canyonAgave, 0);
    }
    // ---------------------------------------------------------
