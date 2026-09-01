const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const search = `    // Pass 1: Set heights (1 evaluation per vertex instead of 21)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
    }`;

// We can just add a yield inside the loop every 5000 iterations to avoid freezing
const replace = `    // Pass 1: Set heights (1 evaluation per vertex instead of 21)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
    }`;
// Actually, making it async would require making _terrain async. Let's just make it async.
