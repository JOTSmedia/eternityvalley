const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

// The regex matches `transparent: false` but only when surrounded by keywords indicating it should be transparent
code = code.replace(/transparent:\s*false,\s*depthWrite:\s*false/g, 'transparent: true, depthWrite: false');
code = code.replace(/transparent:\s*false,\s*blending:\s*THREE\.AdditiveBlending/g, 'transparent: true, blending: THREE.AdditiveBlending');
code = code.replace(/blending:\s*THREE\.AdditiveBlending,\s*transparent:\s*false/g, 'blending: THREE.AdditiveBlending, transparent: true');
code = code.replace(/transparent:\s*false,\s*opacity:/g, 'transparent: true, opacity:');
code = code.replace(/transparent:\s*false,\s*fog:\s*false/g, 'transparent: true, fog: false');
code = code.replace(/transparent:\s*false\s*\}\)/g, 'transparent: true })'); // for the drop shadow plane

fs.writeFileSync('js/world3d.js', code);
