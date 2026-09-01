const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');

const motesInit = `var motes = [];
  var moteCanvas = document.createElement('canvas');
  moteCanvas.width = 64;
  moteCanvas.height = 64;
  var mCtx = moteCanvas.getContext('2d');
  var mGrad = mCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  mGrad.addColorStop(0, 'rgba(255, 245, 200, 1)');
  mGrad.addColorStop(0.5, 'rgba(242, 208, 74, 0.5)');
  mGrad.addColorStop(1, 'rgba(242, 208, 74, 0)');
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 64, 64);

  for (var i = 0; i < 40; i++) {`;
content = content.replace(/var motes = \[\];\n  for \(var i = 0; i < 40; i\+\+\) \{/, motesInit);

const motesDraw = `motes.forEach(function(m) {
      m.x += m.vx + Math.sin(t + m.phase) * 0.20;
      m.y += m.vy;
      if (m.y < -20) { m.y = h + 20; m.x = Math.random() * w; }
      var flicker = 0.6 + Math.sin(t * 2.2 + m.phase) * 0.4;
      ctx.globalAlpha = m.alpha * flicker;
      var r = m.r * 3.2;
      ctx.drawImage(moteCanvas, m.x - r, m.y - r, r * 2, r * 2);
    });
    ctx.globalAlpha = 1;`;

content = content.replace(/motes\.forEach\(function\(m\) \{[\s\S]*?ctx\.fill\(\);\n    \}\);/, motesDraw);

fs.writeFileSync('index.html', content);
