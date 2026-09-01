const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

// Remove from constructor
code = code.replace(
  /console\.log\("\[World3D\] calling _terrain\(\)\.\.\."\);\s*this\._terrain\(\);\s*console\.log\("\[World3D\] _terrain\(\) done"\);/g,
  '// _terrain moved to initAsync to prevent blocking the preloader'
);

// Add to initAsync
const searchInit = `    await safe('backgroundMountains', () => this._backgroundMountains());`;
const replaceInit = `    await safe('terrain', () => this._terrain());
    await safe('backgroundMountains', () => this._backgroundMountains());`;
code = code.replace(searchInit, replaceInit);

fs.writeFileSync('js/world3d.js', code);
