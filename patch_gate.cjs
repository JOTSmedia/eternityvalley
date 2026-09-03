const fs = require('fs');
let code = fs.readFileSync('js/WorldTerrain.js', 'utf8');
const regex = /\/\/ 6b\. Inner Portcullis & Guard Chambers[\s\S]*?g\.add\(portcullisGroup\);\n\s*await yieldMain\(\);/m;
if (!regex.test(code)) {
  console.log("Could not find Portcullis!");
} else {
  code = code.replace(regex, '');
  fs.writeFileSync('js/WorldTerrain.js', code);
  console.log("Portcullis removed!");
}
