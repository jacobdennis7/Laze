// Renders the social-preview card and iOS touch icon.
//   bun scripts/og/generate.mjs
// Needs scripts/og/VarelaRound.ttf (gitignored):
//   curl -o scripts/og/VarelaRound.ttf 'https://fonts.gstatic.com/s/varelaround/v21/w8gdH283Tvk__Lua32TysjIvoA.ttf'
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const font = {
  fontFiles: ['scripts/og/VarelaRound.ttf'],
  loadSystemFonts: false,
  defaultFontFamily: 'Varela Round',
};

const og = new Resvg(readFileSync('scripts/og/og.svg', 'utf8'), { font, fitTo: { mode: 'width', value: 1200 } });
writeFileSync('public/og.png', og.render().asPng());

const icon = new Resvg(readFileSync('public/icon.svg', 'utf8'), { font, fitTo: { mode: 'width', value: 180 } });
writeFileSync('public/icon-180.png', icon.render().asPng());

console.log('wrote public/og.png and public/icon-180.png');
