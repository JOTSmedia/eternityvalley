const fs = require('fs');
let code = fs.readFileSync('js/WorldTerrain.js', 'utf8');
code = code.replace(/console\.log\("\[world3d\] _terrain Pass 2 done"\);/g, 'console.log("[world3d] _terrain Pass 2 done", performance.now());');
code = code.replace(/console\.log\("\[world3d\] mesh added to scene"\);/g, 'console.log("[world3d] mesh added to scene", performance.now());');
code = code.replace(/console\.log\('\[world3d\] _terrain Pass 2 start'\);/g, 'console.log("[world3d] _terrain Pass 2 start", performance.now());');
fs.writeFileSync('js/WorldTerrain.js', code);
