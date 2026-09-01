const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf-8');

// Change clampedDt to not severely clamp the progress
const searchClamp = `var clampedDt = Math.max(0.001, Math.min(0.08, dt));`;
const replaceClamp = `var clampedDt = Math.max(0.001, Math.min(0.5, dt));`; // Allow up to 500ms leaps so it doesn't artificially drag out the load if blocked

code = code.replace(searchClamp, replaceClamp);
fs.writeFileSync('index.html', code);
