import sharp from 'sharp';
import { readFileSync } from 'fs';

const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="0" fill="#F9FAFB"/>
  <path d="M128 384 C128 384, 170 299, 213 256 C256 213, 299 234, 320 192 C341 149, 384 128, 384 128" stroke="#4F46E5" stroke-width="20" stroke-linecap="round" fill="none" opacity="0.3"/>
  <g transform="translate(128, 340)">
    <circle cx="0" cy="0" r="36" fill="#4F46E5" opacity="0.2"/>
    <circle cx="0" cy="0" r="18" fill="#4F46E5"/>
  </g>
  <g transform="translate(277, 213)">
    <path d="M0-72 C-40-72 -63-45 -63-13.5 C-63 27 0 72 0 72 C0 72 63 27 63-13.5 C63-45 40-72 0-72Z" fill="#6366F1"/>
    <circle cx="0" cy="-18" r="22" fill="#FFFFFF"/>
  </g>
  <g transform="translate(384, 107)">
    <circle cx="0" cy="0" r="32" fill="#4F46E5" opacity="0.2"/>
    <circle cx="0" cy="0" r="16" fill="#4F46E5"/>
  </g>
</svg>`;

const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#F9FAFB"/>
  <path d="M153 359 C153 359, 189 287, 224 252 C259 217, 294 234, 311 199 C328 164, 359 149, 359 149" stroke="#4F46E5" stroke-width="18" stroke-linecap="round" fill="none" opacity="0.3"/>
  <g transform="translate(153, 320)">
    <circle cx="0" cy="0" r="30" fill="#4F46E5" opacity="0.2"/>
    <circle cx="0" cy="0" r="15" fill="#4F46E5"/>
  </g>
  <g transform="translate(270, 223)">
    <path d="M0-58 C-32-58 -51-36 -51-11 C-51 22 0 58 0 58 C0 58 51 22 51-11 C51-36 32-58 0-58Z" fill="#6366F1"/>
    <circle cx="0" cy="-14" r="18" fill="#FFFFFF"/>
  </g>
  <g transform="translate(359, 128)">
    <circle cx="0" cy="0" r="26" fill="#4F46E5" opacity="0.2"/>
    <circle cx="0" cy="0" r="13" fill="#4F46E5"/>
  </g>
</svg>`;

async function generate() {
  const sizes = [192, 512];
  for (const size of sizes) {
    await sharp(Buffer.from(svgSource))
      .resize(size, size)
      .png()
      .toFile(`public/icon-${size}.png`);
    console.log(`Created icon-${size}.png`);

    await sharp(Buffer.from(svgMaskable))
      .resize(size, size)
      .png()
      .toFile(`public/icon-${size}-maskable.png`);
    console.log(`Created icon-${size}-maskable.png`);
  }
}

generate().catch(console.error);
