const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf-8');

const search = `        // Start building the asynchronous features (water, plots, gate, bridge, islands, etc.)
        world.initAsync().catch(e => console.warn('[world] async initialization error:', e));`;

const replace = `        // Start building the asynchronous features (water, plots, gate, bridge, islands, etc.)
        await world.initAsync().catch(e => console.warn('[world] async initialization error:', e));`;

code = code.replace(search, replace);
fs.writeFileSync('js/main.js', code);
