import re

with open('js/materials.js', 'r') as f:
    content = f.read()

# Add a byzantineMosaic recipe
byzantineMosaic = """
  /** Intricate Byzantine gold and lapis mosaic for cathedral altars and domes. */
  byzantineMosaic(size = 512) {
    const seed = 9283;
    const tilesX = 32, tilesY = 32;
    const h = heightField(size, (x, y, u, v) => {
      const tx = (u * tilesX) % 1;
      const ty = (v * tilesY) % 1;
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty);
      const jDepth = smooth(Math.min(1, joint / 0.15));
      const tileTilt = fbmTile(u * 16, v * 16, 16, 2, seed) * 0.1;
      return jDepth * 0.9 + tileTilt;
    });
    const map = paint(size, (x, y, u, v) => {
      const tcX = Math.floor(u * tilesX);
      const tcY = Math.floor(v * tilesY);
      const tileSeed = seed + tcX * 13 + tcY * 37;
      const tRandom = hash2(tcX, tcY, tileSeed);
      
      const lapis = [24, 48, 128];
      const gold = [212, 175, 55];
      const ivory = [240, 235, 220];
      const ruby = [138, 24, 32];
      
      let base = lapis;
      if (tRandom < 0.4) base = gold;
      else if (tRandom < 0.7) base = ivory;
      else if (tRandom < 0.85) base = ruby;
      
      const stain = Math.pow(fbmTile(u * 3.2, v * 3.2, 3, 3, tileSeed), 2.1);
      return tint(base, 0.8 + stain * 0.2);
    });
    const rough = paint(size, (x, y, u, v) => {
      const tx = (u * tilesX) % 1;
      const ty = (v * tilesY) % 1;
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty);
      const tcX = Math.floor(u * tilesX);
      const tcY = Math.floor(v * tilesY);
      const tRandom = hash2(tcX, tcY, seed + tcX * 13 + tcY * 37);
      const g = (tRandom < 0.4) ? 40 : 80; // gold is shinier
      const roughVal = joint < 0.05 ? 220 : g; 
      return [roughVal, roughVal, roughVal];
    });
    const ao = paint(size, (x, y, u, v) => {
      const tx = (u * tilesX) % 1;
      const ty = (v * tilesY) % 1;
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty);
      const jAO = smooth(Math.min(1, joint / 0.15));
      const g = clamp255(100 + jAO * 155);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.0), rough, ao };
  },
"""

if 'byzantineMosaic(' not in content:
    content = content.replace('ceremonialBoulevard(size', byzantineMosaic + '\n  ceremonialBoulevard(size')

# Add to PhotoSurfaces
photo_surf = """
  byzantineMosaic: () => {
    const t = textures('byzantineMosaic', 512);
    return material('byzantineMosaic', {
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.65, // High metalness for gold tiles
      normalMap: t.normalMap,
      normalScale: 1.2,
      roughnessMap: t.roughnessMap,
      aoMap: t.aoMap,
      aoMapIntensity: 1.4,
      map: t.map
    });
  },
"""

if 'byzantineMosaic:' not in content:
    content = content.replace('ceremonialBoulevard: () => {', photo_surf + '\n  ceremonialBoulevard: () => {')


# Add to Surfaces
surf = """
  byzantineMosaic: (repeat = 1, o = {}) => {
    const mat = PhotoSurfaces.byzantineMosaic();
    mat.map.repeat.set(repeat, repeat);
    mat.normalMap.repeat.set(repeat, repeat);
    if(mat.roughnessMap) mat.roughnessMap.repeat.set(repeat, repeat);
    if(mat.aoMap) mat.aoMap.repeat.set(repeat, repeat);
    for (let k in o) mat[k] = o[k];
    return mat;
  },
"""

if 'byzantineMosaic:' not in content and 'Surfaces = {' in content:
    content = content.replace('ceremonialBoulevard: (repeat = 1, o = {}) => {', surf + '\n  ceremonialBoulevard: (repeat = 1, o = {}) => {')

with open('js/materials.js', 'w') as f:
    f.write(content)
