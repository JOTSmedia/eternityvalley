const fs = require('fs');
let code = fs.readFileSync('js/main.js', 'utf-8');

const search = `      if (res.world.warmup) {
        try { res.world.warmup(); } catch (e) {}
      }`;

const replace = `      // warmup is handled automatically inside world.initAsync() now`;

code = code.replace(search, replace);
fs.writeFileSync('js/main.js', code);
