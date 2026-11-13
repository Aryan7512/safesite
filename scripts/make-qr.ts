// Printable QR signs for the 8 areas (SAFESITE:AREA:<CODE>) → qr/index.html
//   npm run qr   then open qr/index.html and print (one sign per page).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { AREA_CODES, AREA_NAMES } from './seed-data';

const HI: Record<string, string> = {
  TANK: 'टैंक फ़ार्म', REACT: 'रिएक्टर ब्लॉक', DIST: 'डिस्टिलेशन यूनिट', LOAD: 'लोडिंग बे',
  WARE: 'कच्चा माल गोदाम', UTIL: 'यूटिलिटी (बॉयलर हाउस)', ETP: 'अपशिष्ट उपचार संयंत्र', WKSP: 'मेंटेनेंस वर्कशॉप',
};

async function main() {
  const dir = join(__dirname, '..', 'qr');
  mkdirSync(dir, { recursive: true });
  const cards: string[] = [];
  for (const code of AREA_CODES) {
    const svg = await QRCode.toString(`SAFESITE:AREA:${code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    writeFileSync(join(dir, `${code}.svg`), svg);
    cards.push(`<section><p class="k">PLANT X · REPORT A HAZARD</p><div class="q">${svg}</div><h1>${AREA_NAMES[code]}</h1><h2>${HI[code]}</h2><p class="s">Scan with SafeSite · SafeSite से स्कैन करें</p><p class="c">SAFESITE:AREA:${code}</p></section>`);
  }
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>SafeSite area QR signs</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#fff;color:#000}
section{page-break-after:always;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:12px solid #FFD60A;box-sizing:border-box}
.q{width:60vmin}.q svg{width:100%;height:auto}
h1{font-size:48px;margin:12px 0 0}h2{font-size:36px;margin:0;font-weight:600}
.k{letter-spacing:4px;font-weight:700}.s{font-size:20px}.c{font-family:monospace;color:#555}
</style>${cards.join('\n')}`,
  );
  console.log(`Wrote ${AREA_CODES.length} QR signs → ${join(dir, 'index.html')}`);
}

main();
