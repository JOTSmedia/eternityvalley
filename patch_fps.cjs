const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

// 1. Cap DPR for mobile more aggressively in _init
code = code.replace(
  /const maxDpr = window.innerWidth > 2000 \? 0\.85 : \(window.innerWidth > 768 \? 1\.0 : 1\.25\);/g,
  'const maxDpr = window.innerWidth > 2000 ? 0.75 : (window.innerWidth > 768 ? 1.0 : 0.85);'
);

// 2. Aggressive FPS scaling (target 60fps = 16.6ms)
const searchScale = `    let targetScale = this._renderScale;
    if (medianMs > 20) {
       targetScale = Math.max(0.5, this._renderScale - 0.15); // Drop fast
    } else if (medianMs < 14) {
       targetScale = Math.min(1.5, this._renderScale + 0.05); // Recover slow
    }`;

const replaceScale = `    let targetScale = this._renderScale;
    if (medianMs > 16.0) {
       targetScale = Math.max(0.4, this._renderScale - 0.20); // Drop extremely fast to maintain 60 FPS
    } else if (medianMs < 12.0) {
       targetScale = Math.min(1.0, this._renderScale + 0.05); // Recover slow, never exceed native to avoid thermal throttle
    }`;

code = code.replace(searchScale, replaceScale);

fs.writeFileSync('js/world3d.js', code);
