import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInstalledEpicGame, manifestImageSources, parseCatalogCache, rankKeyImages } from '../src/main/providers/epicScan'
import { gameSignals, isExcludedPackage, manifestColor, parseAppxManifest, parseGameConfig } from '../src/main/providers/xboxScan'

test('epic: keeps complete base games only', () => {
  const base = {
    DisplayName: 'Alan Wake 2',
    AppName: 'Dill',
    MainGameAppName: 'Dill',
    InstallLocation: 'D:\\Epic\\AlanWake2',
    AppCategories: ['public', 'games', 'applications']
  }
  assert.equal(isInstalledEpicGame(base), true)
  assert.equal(isInstalledEpicGame({ ...base, bIsIncompleteInstall: true }), false)
  assert.equal(isInstalledEpicGame({ ...base, AppName: 'DillDLC1' }), false) // DLC
  assert.equal(isInstalledEpicGame({ ...base, AppCategories: ['public', 'engines'] }), false) // Unreal Engine
  assert.equal(isInstalledEpicGame({ ...base, AppCategories: [] }), true)
})

test('epic: image fields in the manifest come first, catalog art is ordered tall-first', () => {
  const sources = manifestImageSources({
    AppName: 'x',
    InstallLocation: 'D:\\Game',
    DisplayName: 'X',
    CoverImage: 'https://cdn/x.jpg',
    IconPath: 'Assets\\icon.png',
    Description: 'not an image'
  })
  assert.deepEqual(sources, [
    { kind: 'url', url: 'https://cdn/x.jpg' },
    { kind: 'file', path: 'D:\\Game\\Assets\\icon.png' }
  ])
  assert.deepEqual(
    rankKeyImages([
      { type: 'DieselGameBox', url: 'https://cdn/wide.jpg' },
      { type: 'Screenshot', url: 'https://cdn/shot.jpg', width: 1920, height: 1080 },
      { type: 'DieselGameBoxTall', url: 'https://cdn/tall.jpg' }
    ]),
    ['https://cdn/tall.jpg', 'https://cdn/wide.jpg', 'https://cdn/shot.jpg']
  )
  const cache = Buffer.from(JSON.stringify([{ id: 'item1', keyImages: [{ type: 'Thumbnail', url: 'https://cdn/t.jpg' }] }])).toString('base64')
  assert.equal(parseCatalogCache(cache).get('item1')?.[0].url, 'https://cdn/t.jpg')
})

const FORAGER_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10">
  <Identity Name="HumbleBundle.ForagerWin10" Publisher="CN=DB84" Version="1.0.1.2" ProcessorArchitecture="x64" />
  <Properties><DisplayName>Forager</DisplayName><Logo>Assets\\StoreLogo.png</Logo></Properties>
  <Applications>
    <Application Id="App" Executable="WinUAPRunner.exe" EntryPoint="WinUAPRunner.App">
      <uap:VisualElements DisplayName="Forager" Square150x150Logo="Assets\\Logo.png" Square44x44Logo="Assets\\SmallLogo.png" BackgroundColor="transparent">
        <uap:DefaultTile Wide310x150Logo="Assets\\WideLogo.png" Square310x310Logo="Assets\\LargeLogo.png"></uap:DefaultTile>
        <uap:SplashScreen Image="Assets\\SplashScreen.png" BackgroundColor="#1D2B53" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>`

test('xbox: parses AppxManifest names, logos and protocols', () => {
  const m = parseAppxManifest(FORAGER_MANIFEST)
  assert.ok(m)
  assert.equal(m.displayName, 'Forager')
  assert.equal(m.logo, 'Assets\\StoreLogo.png')
  assert.equal(m.applications[0].id, 'App')
  // Splash screen first, then the large and wide tiles, small icons last. The
  // splash has its own color; the tiles' "transparent" declares none.
  assert.deepEqual(m.applications[0].visuals, [
    { reference: 'Assets\\SplashScreen.png', tier: 0, background: '#1d2b53' },
    { reference: 'Assets\\LargeLogo.png', tier: 1 },
    { reference: 'Assets\\WideLogo.png', tier: 2 },
    { reference: 'Assets\\Logo.png', tier: 3 },
    { reference: 'Assets\\SmallLogo.png', tier: 3 }
  ])

  const solitaire = parseAppxManifest(`<Package xmlns:uap="x"><Properties><DisplayName>Solitaire &amp; Casual Games</DisplayName></Properties>
    <Applications><Application Id="App"><Extensions>
      <uap:Extension Category="windows.protocol"><uap:Protocol Name="xboxliveapp-1297287741" /></uap:Extension>
      <uap:Extension Category="windows.protocol"><uap:Protocol Name="microsoftsolitairecollection" /></uap:Extension>
    </Extensions></Application></Applications></Package>`)
  assert.equal(solitaire?.displayName, 'Solitaire & Casual Games')
  assert.deepEqual(solitaire?.applications[0].protocols, ['xboxliveapp-1297287741', 'microsoftsolitairecollection'])
})

test('xbox: game heuristics', () => {
  const none = { hasGameConfig: false, protocols: [], installLocation: 'C:\\Program Files\\WindowsApps\\Foo', rootEntries: ['Foo.exe'] }
  assert.deepEqual(gameSignals(none), [])
  assert.deepEqual(gameSignals({ ...none, hasGameConfig: true }), ['gdk-config'])
  assert.deepEqual(gameSignals({ ...none, protocols: ['ms-xbl-5c1a2b3d'] }), ['xbox-live'])
  assert.deepEqual(gameSignals({ ...none, installLocation: 'E:\\XboxGames\\Halo\\Content' }), ['xboxgames-folder'])
  assert.deepEqual(gameSignals({ ...none, rootEntries: ['WinUAPRunner.exe', 'game.dll'] }), ['engine-files'])
  assert.deepEqual(gameSignals({ ...none, rootEntries: ['UnityPlayer.dll'] }), ['engine-files'])

  assert.equal(isExcludedPackage('Microsoft.GamingApp'), true)
  assert.equal(isExcludedPackage('Microsoft.XboxGamingOverlay'), true)
  assert.equal(isExcludedPackage('Microsoft.WindowsCalculator'), true)
  assert.equal(isExcludedPackage('Microsoft.HEVCVideoExtension'), true)
  assert.equal(isExcludedPackage('Microsoft.MicrosoftSolitaireCollection'), false)
  assert.equal(isExcludedPackage('Microsoft.624F8B84B80'), false) // Forza Horizon
  assert.equal(isExcludedPackage('HumbleBundle.ForagerWin10'), false)

  const gdk = parseGameConfig(`<Game configVersion="1"><ShellVisuals DefaultDisplayName="Halo Infinite" Square480x480Logo="Logo480.png" Square150x150Logo="Logo.png" SplashScreenImage="Splash.png" StoreLogo="StoreLogo.png" BackgroundColor="#000000"/></Game>`)
  assert.deepEqual(gdk, {
    displayName: 'Halo Infinite',
    visuals: [
      { reference: 'Splash.png', tier: 0, background: '#000000' },
      { reference: 'Logo480.png', tier: 1, background: '#000000' },
      { reference: 'Logo.png', tier: 3, background: '#000000' },
      { reference: 'StoreLogo.png', tier: 3, background: '#000000' }
    ]
  })
})

test('xbox: manifest colors become CSS colors', () => {
  assert.equal(manifestColor('transparent'), undefined)
  assert.equal(manifestColor('#1D2B53'), '#1d2b53')
  assert.equal(manifestColor('#FFF'), '#fff')
  assert.equal(manifestColor('#FF107C10'), '#107c10') // alpha first
  assert.equal(manifestColor('#00107C10'), undefined) // fully transparent
  assert.equal(manifestColor('black'), 'black')
  assert.equal(manifestColor('url(x)'), undefined)
  assert.equal(manifestColor(undefined), undefined)
})
