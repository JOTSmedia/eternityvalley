const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

// Helper function we can inject at the top of World3D or use directly
const yieldStr = `if (i > 0 && i % 4000 === 0) await new Promise(r => setTimeout(r, 0));`;

function makeAsyncAndYield(methodName, loopsToPatch) {
  // Make method async
  const methodRegex = new RegExp(`^\\s*${methodName}\\(\\) {`, 'm');
  if (code.match(methodRegex)) {
    code = code.replace(methodRegex, `  async ${methodName}() {`);
    
    // Add yields to specific loops
    for (const loopStart of loopsToPatch) {
      const patchedLoopStart = loopStart + `\n      ${yieldStr}`;
      code = code.replace(loopStart, patchedLoopStart);
    }
    console.log(`Patched ${methodName}`);
  }
}

makeAsyncAndYield('_terrain', [
  'for (let i = 0; i < pos.count; i++) {'
]);

makeAsyncAndYield('_backgroundMountains', [
  'for (let i = 0; i < pos.count; i++) {'
]);

makeAsyncAndYield('_water', [
  'for (let r = 1; r <= rings; r++) {',
  'for (let r = 1; r < rings; r++) {'
]);

// Vegetation has specific counts. 1200 trees, 1800 trees. Mod 200 is good.
const vegYieldStr = `if (i > 0 && i % 200 === 0) await new Promise(r => setTimeout(r, 0));`;
const methodRegexVeg = new RegExp(`^\\s*_vegetation\\(\\) {`, 'm');
if (code.match(methodRegexVeg)) {
  code = code.replace(methodRegexVeg, `  async _vegetation() {`);
  code = code.replace('for (let i = 0; i < 1200; i++) {', 'for (let i = 0; i < 1200; i++) {\n      ' + vegYieldStr);
  code = code.replace('for (let i = 0; i < 1800; i++) {', 'for (let i = 0; i < 1800; i++) {\n      ' + vegYieldStr);
  console.log('Patched _vegetation');
}

fs.writeFileSync('js/world3d.js', code);
