import sharp from 'sharp';

const SIZE = 512;
const HALF = SIZE / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4F46E5"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    <filter id="dotshadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.2"/>
    </filter>
  </defs>

  <!-- Background gradient -->
  <rect width="${SIZE}" height="${SIZE}" rx="108" fill="url(#bg)"/>

  <!-- Route curve -->
  <path d="M115 395 C145 320, 195 275, 250 250 C305 225, 330 200, 395 115"
        stroke="rgba(255,255,255,0.3)" stroke-width="16" stroke-linecap="round" fill="none"/>

  <!-- Start dot -->
  <circle cx="115" cy="395" r="18" fill="rgba(255,255,255,0.9)" filter="url(#dotshadow)"/>
  <circle cx="115" cy="395" r="8" fill="#4F46E5"/>

  <!-- End dot -->
  <circle cx="395" cy="115" r="18" fill="rgba(255,255,255,0.9)" filter="url(#dotshadow)"/>
  <circle cx="395" cy="115" r="8" fill="#4F46E5"/>

  <!-- Main pin shadow -->
  <ellipse cx="${HALF}" cy="340" rx="40" ry="10" fill="rgba(0,0,0,0.12)"/>

  <!-- Pin body -->
  <g filter="url(#shadow)">
    <!-- Pin tail -->
    <polygon points="${HALF-30},275 ${HALF+30},275 ${HALF},340" fill="#FFFFFF"/>
    <!-- Pin head circle -->
    <circle cx="${HALF}" cy="210" r="90" fill="#FFFFFF"/>
  </g>

  <!-- Letter N inside pin -->
  <text x="${HALF}" y="232" text-anchor="middle" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="110" font-weight="800" fill="#4F46E5" letter-spacing="-3">N</text>
</svg>`;

const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4F46E5"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>

  <!-- Full bleed background for maskable -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

  <!-- Route curve (smaller, centered for safe zone) -->
  <path d="M145 375 C170 315, 210 280, 255 258 C300 236, 320 210, 370 140"
        stroke="rgba(255,255,255,0.25)" stroke-width="14" stroke-linecap="round" fill="none"/>

  <!-- Start dot -->
  <circle cx="145" cy="375" r="14" fill="rgba(255,255,255,0.85)"/>
  <circle cx="145" cy="375" r="6" fill="#4F46E5"/>

  <!-- End dot -->
  <circle cx="370" cy="140" r="14" fill="rgba(255,255,255,0.85)"/>
  <circle cx="370" cy="140" r="6" fill="#4F46E5"/>

  <!-- Pin -->
  <polygon points="${HALF-24},280 ${HALF+24},280 ${HALF},330" fill="#FFFFFF"/>
  <circle cx="${HALF}" cy="220" r="72" fill="#FFFFFF"/>

  <!-- Letter N -->
  <text x="${HALF}" y="240" text-anchor="middle" font-family="'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        font-size="88" font-weight="800" fill="#4F46E5" letter-spacing="-2">N</text>
</svg>`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4F46E5"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="10" fill="url(#bg)"/>
  <polygon points="20,30 28,30 24,36" fill="#FFFFFF"/>
  <circle cx="24" cy="22" r="11" fill="#FFFFFF"/>
  <text x="24" y="26.5" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="14" font-weight="800" fill="#4F46E5">N</text>
</svg>`;

async function generate() {
  for (const size of [192, 512]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icon-${size}.png`);
    await sharp(Buffer.from(svgMaskable)).resize(size, size).png().toFile(`public/icon-${size}-maskable.png`);
    console.log(`icon-${size}.png + maskable`);
  }

  const { writeFileSync } = await import('fs');
  writeFileSync('public/favicon.svg', faviconSvg);
  console.log('favicon.svg');
}

generate().catch(console.error);
