// Renders the SafeSite mark (shield + check) to the app icon, splash, Android
// adaptive layers and favicon.  node scripts/make-icons.mjs
import sharp from 'sharp';
const BG = '#0B0F14', ACCENT = '#4DA3FF', INK = '#04121F';
const shield = (s, stroke, fill, check) => `
  <g transform="translate(${s.x} ${s.y}) scale(${s.k})">
    <path d="M16 6 L24 9 V15.5 C24 20.5 20.6 24.3 16 26 C11.4 24.3 8 20.5 8 15.5 V9 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 16 L15 19 L20.5 13" fill="none" stroke="${check}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  <rect x="152" y="152" width="720" height="720" rx="168" fill="${ACCENT}"/>
  ${shield({ x: 0, y: 0, k: 32 }, INK, 'rgba(4,18,31,0.16)', INK)}
</svg>`;
const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="262" y="262" width="500" height="500" rx="116" fill="${ACCENT}"/>
  ${shield({ x: 256, y: 256, k: 16 }, INK, 'rgba(4,18,31,0.16)', INK)}
</svg>`;
const mono = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${shield({ x: 256, y: 256, k: 16 }, '#fff', 'none', '#fff')}
</svg>`;
const solid = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${c}"/></svg>`;
const out = (svg, file, size = 1024) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
await out(icon, 'assets/icon.png');
await out(fg.replace('<svg', '<svg'), 'assets/splash-icon.png');
await out(fg, 'assets/android-icon-foreground.png');
await out(solid(BG), 'assets/android-icon-background.png');
await out(mono, 'assets/android-icon-monochrome.png');
await out(icon, 'assets/favicon.png', 64);
console.log('icons written');
