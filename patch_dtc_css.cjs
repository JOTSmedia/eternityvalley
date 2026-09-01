const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf-8');
css += `
.dtc-btn.dtc-speed {
  width: 32px;
  font-weight: 500;
  font-family: 'Plus Jakarta Sans', sans-serif;
}
`;
fs.writeFileSync('css/style.css', css);
