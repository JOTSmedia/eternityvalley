const fs = require('fs');
let code = fs.readFileSync('css/style.css', 'utf-8');

const searchCss = `/* ============================================================
   DRONE TOUR CINEMATIC VIEWPORT (UNOBSTRUCTED FULL SCREEN)
   ============================================================ */
#droneTourCard {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 680px;
  background: rgba(14, 18, 22, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px 24px;
  color: #fff;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  transition: opacity 0.4s ease, transform 0.4s ease;
}
#droneTourCard.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 16px);
}
.dtc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.dtc-title-area {
  flex: 1;
}
.dtc-title {
  font-family: 'Tenor Sans', sans-serif;
  font-size: 18px;
  color: #e8c04a;
  margin: 0 0 4px 0;
}
.dtc-sub {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
  line-height: 1.4;
}
.dtc-controls {
  display: flex;
  gap: 8px;
}
.dtc-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}
.dtc-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}
.dtc-btn.dtc-exit {
  background: rgba(230, 70, 70, 0.2);
  color: #ff9999;
}
.dtc-btn.dtc-exit:hover {
  background: rgba(230, 70, 70, 0.4);
}
.dtc-progress-wrap {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}
.dtc-progress {
  height: 100%;
  background: #e8c04a;
  width: 0%;
  border-radius: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .dtc-progress { transition: none !important; }
}
@media (max-width: 640px) {
  .dtc-sub { display: none; }
  .dtc-title { font-size: 16px; }
  #droneTourCard { padding: 12px 16px; bottom: 24px; }
}`;

const replaceCss = `/* ============================================================
   DRONE TOUR CINEMATIC VIEWPORT (UNOBSTRUCTED FULL SCREEN)
   ============================================================ */
#droneTourCard {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: auto;
  max-width: 480px;
  background: rgba(14, 18, 16, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 99px;
  padding: 6px 14px;
  color: #fff;
  z-index: 200;
  pointer-events: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 16px rgba(212, 175, 55, 0.08);
  transition: opacity 0.4s ease, transform 0.4s ease;
  white-space: nowrap;
}
#droneTourCard.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 12px);
}
.dtc-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: relative;
}
.dtc-title {
  font-family: var(--display, 'Tenor Sans', sans-serif);
  font-size: 12px;
  color: #e8c04a;
  margin: 0;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dtc-stage {
  color: rgba(255, 255, 255, 0.5);
  font-family: var(--ui, 'Plus Jakarta Sans', sans-serif);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.dtc-controls {
  display: flex;
  gap: 4px;
}
.dtc-btn {
  background: transparent;
  border: 1px solid transparent;
  color: rgba(255, 255, 255, 0.85);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.dtc-btn:hover {
  background: rgba(212, 175, 55, 0.15);
  border-color: rgba(212, 175, 55, 0.4);
  color: #e8c04a;
}
.dtc-btn.dtc-exit:hover {
  background: rgba(230, 70, 70, 0.15);
  border-color: rgba(230, 70, 70, 0.4);
  color: #ff9999;
}
.dtc-progress-wrap {
  position: absolute;
  bottom: -6px;
  left: 6px;
  right: 6px;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1px;
  overflow: hidden;
}
.dtc-progress {
  height: 100%;
  background: #e8c04a;
  width: 0%;
  border-radius: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .dtc-progress { transition: none !important; }
}
@media (max-width: 640px) {
  #droneTourCard { bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
  .dtc-title { font-size: 10.5px; }
  .dtc-stage { display: none; }
}`;

code = code.replace(searchCss, replaceCss);
fs.writeFileSync('css/style.css', code);
