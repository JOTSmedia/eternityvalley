const fs = require('fs');
let code = fs.readFileSync('js/terrain.js', 'utf-8');

// Replace tarn logic
const search1 = `  const dxTarn = x / 36.0;
  const dzTarn = (z - (-560)) / 30.0;
  const dTarnNorm = Math.hypot(dxTarn, dzTarn);
  if (dTarnNorm < 1.35) {
    const tarnBedTarget = 174.0; // 8.0m deep crystal alpine lake bed beneath 182.0m water surface
    const tarnBlend = sstep(0.8, 1.35, dTarnNorm);
    h = lerp(tarnBedTarget, h, tarnBlend);
  }`;

const replace1 = `  // 1. Carve the Tarn at Cathedral (z=-640)
  const dxTarn = x / 42.0;
  const dzTarn = (z - (-640)) / 45.0;
  const dTarnNorm = Math.hypot(dxTarn, dzTarn);
  if (dTarnNorm < 1.4) {
    const tarnBedTarget = 174.0;
    const tarnBlend = sstep(0.65, 1.4, dTarnNorm);
    h = lerp(tarnBedTarget, h, tarnBlend);
  }
  
  // 2. Carve the river channel from the Tarn (z=-640) to the cataract lip (z=-460)
  if (z >= -640 && z <= -460 && Math.abs(x) < 55) {
     const chanX = Math.abs(x);
     // Carve down to 174-173
     const chanBed = 173.0;
     const chanBlend = sstep(12.0, 32.0, chanX);
     h = Math.min(h, lerp(chanBed, h, chanBlend));
  }`;

code = code.replace(search1, replace1);

const search2 = `    const tarnHole = Math.exp(-Math.pow(dTarnNorm / 1.0, 2.0));
    const targetH = lerp(184.0 + roll * (1.0 - catTerrace * 0.95), 174.0, tarnHole * 0.98);`;

const replace2 = `    const tarnHole = Math.exp(-Math.pow(dTarnNorm / 1.5, 2.0));
    // also factor in the channel
    const chanFactor = (z >= -640 && z <= -460) ? Math.exp(-Math.pow(x/20.0, 2.0)) : 0.0;
    const waterCarve = Math.max(tarnHole, chanFactor);
    const targetH = lerp(184.0 + roll * (1.0 - catTerrace * 0.95), 173.0, waterCarve * 0.98);`;

code = code.replace(search2, replace2);

fs.writeFileSync('js/terrain.js', code);
console.log('Fixed tarn');
