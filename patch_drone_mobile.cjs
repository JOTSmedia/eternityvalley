const fs = require('fs');
let code = fs.readFileSync('css/style.css', 'utf-8');

code = code.replace(
  /#droneTourCard \{ bottom: calc\(64px \+ env\(safe-area-inset-bottom, 0px\)\); \}/g,
  `#droneTourCard { bottom: calc(100px + env(safe-area-inset-bottom, 0px)); }`
);

fs.writeFileSync('css/style.css', code);
