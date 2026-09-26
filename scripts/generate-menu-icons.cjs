// Rasterizes the right-click menu icons from the app's own stroke icon family
// (24px grid, 1.75 stroke, round caps and joins; see Icons.tsx). Native menus
// take bitmaps, not SVG, so each icon is drawn at 16px and 32px (@2x) in two
// inks: "dark" for menus drawn dark, "light" for menus drawn light.
//
// Run with `npm run icons:menu` (it needs Electron's renderer to draw).

const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'resources', 'menu')

const STAR = 'm12 3.6 2.55 5.3 5.8.78-4.23 4.02 1.05 5.75L12 16.7l-5.17 2.75 1.05-5.75L3.65 9.68l5.8-.78Z'
const ICONS = {
  play: '<path d="M8 5.5v13l10-6.5Z"/>',
  star: `<path d="${STAR}"/>`,
  'star-filled': `<path d="${STAR}" fill="currentColor"/>`,
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2.5h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  store: '<path d="M5.5 8.5h13l-1.1 11h-10.8Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  hide: '<path d="M3 12s3.5-6.5 9-6.5 9 6.5 9 6.5-3.5 6.5-9 6.5S3 12 3 12Z"/><circle cx="12" cy="12" r="2.75"/><path d="m4.5 4.5 15 15"/>',
  properties: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.75v.01"/>'
}
// Near the menu text colors Windows uses, a touch softer.
const INKS = { dark: '#e8e8ec', light: '#2b2b30' }

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({ show: false })
  await win.loadURL('about:blank')
  for (const [name, body] of Object.entries(ICONS)) {
    for (const [variant, ink] of Object.entries(INKS)) {
      for (const [scale, px] of [['', 16], ['@2x', 32]]) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${ink}" color="${ink}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
        const png = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            const c = document.createElement('canvas'); c.width = ${px}; c.height = ${px}
            c.getContext('2d').drawImage(img, 0, 0, ${px}, ${px})
            resolve(c.toDataURL('image/png'))
          }
          img.onerror = reject
          img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
        })`)
        writeFileSync(join(OUT, `${name}-${variant}${scale}.png`), Buffer.from(png.split(',')[1], 'base64'))
      }
    }
  }
  console.log(`wrote ${Object.keys(ICONS).length * 4} icons to resources/menu`)
  app.quit()
})
