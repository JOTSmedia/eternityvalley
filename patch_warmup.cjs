const fs = require('fs');
let code = fs.readFileSync('js/world3d.js', 'utf-8');

const search = `  warmup() {
    if (!this.renderer || !this.scene || !this.camera) return;
    try {
      this._loadHDRI();
      this._updateEnvironment();
      if (typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch (e) {
      console.log('[world3d] warmup error:', e);
    }
  }`;

const replace = `  async warmup() {
    if (!this.renderer || !this.scene || !this.camera) return;
    try {
      this._loadHDRI();
      this._updateEnvironment();
      if (typeof this.renderer.compileAsync === 'function') {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else if (typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
      }
    } catch (e) {
      console.log('[world3d] warmup error:', e);
    }
  }`;

code = code.replace(search, replace);

// And we must await warmup() inside initAsync()
code = code.replace(/this\.warmup\(\);/g, 'await this.warmup();');

fs.writeFileSync('js/world3d.js', code);
