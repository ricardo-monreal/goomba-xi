// Adds the Linux (AppImage) build settings to package.json, keeping everything else as it is
// (your productName, version, appId...). Safe to run more than once.
//   node tools/add-linux-build.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../package.json', import.meta.url)
const pkg = JSON.parse(readFileSync(file, 'utf8'))

pkg.scripts ??= {}
pkg.scripts['dist:linux'] = 'electron-vite build && electron-builder --linux AppImage --publish never'
pkg.build ??= {}
pkg.build.publish = []
pkg.build.linux = {
  target: ['AppImage'],
  category: 'Game',
  synopsis: 'Launcher for a FINAL FANTASY XI private server',
  ...(pkg.build.linux ?? {})
}
pkg.build.appImage = { artifactName: '${productName}-${version}-x86_64.AppImage', ...(pkg.build.appImage ?? {}) }

writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
console.log(`package.json updated. Build with: npm run dist:linux   (version ${pkg.version}, name "${pkg.build.productName ?? pkg.productName}")`)
