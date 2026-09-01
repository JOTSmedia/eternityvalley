const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const search = `    // Shadow maps
    let shadowSize = 1024;
    if (tier === 'ultra') shadowSize = 4096;
    else if (tier === 'high') shadowSize = 2048;`;

const replace = `    // Shadow maps
    const isMobileDevice = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    let shadowSize = isMobileDevice ? 512 : 1024;
    if (tier === 'ultra') shadowSize = isMobileDevice ? 1024 : 4096;
    else if (tier === 'high') shadowSize = isMobileDevice ? 1024 : 2048;`;

code = code.replace(search, replace);
fs.writeFileSync('js/world3d.js', code);
