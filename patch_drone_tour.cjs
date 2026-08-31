const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const searchHtml = `      card.innerHTML = \`
        <div class="dtc-header">
          <div class="dtc-title-area">
            <h3 class="dtc-title">Stage \${activeStage.stage} of 11: \${activeStage.title}</h3>
            <p class="dtc-sub">\${activeStage.sub}</p>
          </div>
          <div class="dtc-controls">
            <button class="dtc-btn dtc-prev" aria-label="Previous Stage"><i class="ico-slot" data-icon="chevron-left">❮</i></button>
            <button class="dtc-btn dtc-play" aria-label="Pause/Play"><i class="ico-slot" data-icon="play-pause">\${this._tourPaused ? '▶' : '⏸'}</i></button>
            <button class="dtc-btn dtc-next" aria-label="Next Stage"><i class="ico-slot" data-icon="chevron-right">❯</i></button>
            <button class="dtc-btn dtc-exit" aria-label="Exit Tour"><i class="ico-slot" data-icon="close">✖</i></button>
          </div>
        </div>
        <div class="dtc-progress-wrap">
          <div class="dtc-progress" id="dtcProgress"></div>
        </div>
      \`;`;

const replaceHtml = `      card.innerHTML = \`
        <div class="dtc-content">
          <div class="dtc-progress-wrap"><div class="dtc-progress" id="dtcProgress"></div></div>
          <span class="dtc-title"><span class="dtc-stage">\${activeStage.stage}/11</span> \${activeStage.title}</span>
          <div class="dtc-controls">
            <button class="dtc-btn dtc-prev" aria-label="Previous Stage">❮</button>
            <button class="dtc-btn dtc-play" aria-label="Pause/Play">\${this._tourPaused ? '▶' : '⏸'}</button>
            <button class="dtc-btn dtc-next" aria-label="Next Stage">❯</button>
            <button class="dtc-btn dtc-exit" aria-label="Exit Tour">✖</button>
          </div>
        </div>
      \`;`;

code = code.replace(searchHtml, replaceHtml);
fs.writeFileSync('js/world3d.js', code);
