const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');

const cacheVars = `  var motes = [];
  var cachedVig = null, cachedPVig = null, cachedSky = null, cacheW = 0, cacheH = 0;`;

content = content.replace(/var motes = \[\];/, cacheVars);

const cacheUpdate = `    if (cacheW !== w || cacheH !== h) {
      cacheW = w; cacheH = h;
      cachedSky = ctx.createLinearGradient(0, 0, 0, h);
      cachedSky.addColorStop(0.0, '#0c1220');
      cachedSky.addColorStop(0.35, '#121b2c');
      cachedSky.addColorStop(0.65, '#1b2a3f');
      cachedSky.addColorStop(0.85, '#26384d');
      cachedSky.addColorStop(1.0, '#121a26');
      
      cachedPVig = octx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.45, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
      cachedPVig.addColorStop(0, 'rgba(10, 16, 28, 0)');
      cachedPVig.addColorStop(0.75, 'rgba(10, 16, 28, 0.45)');
      cachedPVig.addColorStop(1.0, 'rgba(8, 12, 22, 0.90)');

      cachedVig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.40, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
      cachedVig.addColorStop(0, 'rgba(10, 15, 26, 0)');
      cachedVig.addColorStop(0.75, 'rgba(10, 15, 26, 0.35)');
      cachedVig.addColorStop(1.0, 'rgba(8, 12, 20, 0.80)');
    }

    ctx.fillStyle = cachedSky;
    ctx.fillRect(0, 0, w, h);`;

content = content.replace(/var sky = ctx\.createLinearGradient[\s\S]*?ctx\.fillRect\(0, 0, w, h\);/, cacheUpdate);

content = content.replace(/var pvig = octx\.createRadialGradient[\s\S]*?pvig\.addColorStop\(1\.0, 'rgba\(8, 12, 22, 0\.90\)'\);/, "var pvig = cachedPVig;");
content = content.replace(/var vig = ctx\.createRadialGradient[\s\S]*?vig\.addColorStop\(1\.0, 'rgba\(8, 12, 20, 0\.80\)'\);/, "var vig = cachedVig;");

fs.writeFileSync('index.html', content);
