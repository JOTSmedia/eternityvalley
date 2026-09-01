const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const search = `        card.addEventListener('click', (e) => {
          const btn = e.target.closest('.dtc-btn');
          if (!btn) return;
          if (btn.classList.contains('dtc-prev')) this.prevTourStage();
          if (btn.classList.contains('dtc-next')) this.nextTourStage();
          if (btn.classList.contains('dtc-play')) this.toggleTourPause();
          if (btn.classList.contains('dtc-exit')) this.exitTour();
        });
      }
      
      card.classList.remove('hidden');
      card.innerHTML = \`
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

const replace = `        card.addEventListener('click', (e) => {
          const btn = e.target.closest('.dtc-btn');
          if (!btn) return;
          if (btn.classList.contains('dtc-prev')) this.prevTourStage();
          if (btn.classList.contains('dtc-next')) this.nextTourStage();
          if (btn.classList.contains('dtc-play')) this.toggleTourPause();
          if (btn.classList.contains('dtc-exit')) this.exitTour();
          if (btn.classList.contains('dtc-speed')) {
            const currentSpeed = this._tourSpeedMultiplier || 1.0;
            if (currentSpeed === 1.0) this._tourSpeedMultiplier = 1.5;
            else if (currentSpeed === 1.5) this._tourSpeedMultiplier = 2.0;
            else if (currentSpeed === 2.0) this._tourSpeedMultiplier = 0.5;
            else this._tourSpeedMultiplier = 1.0;
            this._updateTourHUD(this._tourTime, true); // force re-render
          }
        });
      }
      
      card.classList.remove('hidden');
      const mult = this._tourSpeedMultiplier || 1.0;
      card.innerHTML = \`
        <div class="dtc-content">
          <div class="dtc-progress-wrap"><div class="dtc-progress" id="dtcProgress"></div></div>
          <span class="dtc-title"><span class="dtc-stage">\${activeStage.stage}/11</span> \${activeStage.title}</span>
          <div class="dtc-controls">
            <button class="dtc-btn dtc-speed" aria-label="Tour Speed">\${mult}x</button>
            <button class="dtc-btn dtc-prev" aria-label="Previous Stage">❮</button>
            <button class="dtc-btn dtc-play" aria-label="Pause/Play">\${this._tourPaused ? '▶' : '⏸'}</button>
            <button class="dtc-btn dtc-next" aria-label="Next Stage">❯</button>
            <button class="dtc-btn dtc-exit" aria-label="Exit Tour">✖</button>
          </div>
        </div>
      \`;`;

if (!code.includes("class=\"dtc-btn dtc-prev\"")) {
  console.log("Tour controls not found");
} else {
  code = code.replace(search, replace);
  fs.writeFileSync('js/world3d.js', code);
  console.log("Patched tour card");
}
