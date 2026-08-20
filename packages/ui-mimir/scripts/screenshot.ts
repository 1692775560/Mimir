/**
 * QA screenshot harness (NOT part of the package test suite): opens the
 * Mimir workbench in headless Chromium against a running `dsh web` instance
 * with the plugin mounted, and captures one PNG per tab into /tmp/research-ui/.
 * Beyond plain tab captures it exercises the figure management (upload two
 * SVG figures, delete the __probe.png left by the route smoke test, hover a
 * card so the copy/delete actions show) and seeds two demo servers (one
 * loopback, one unreachable) so the servers tab shows real probe outcomes.
 * Run: pnpm exec tsx packages/ui-mimir/scripts/screenshot.ts
 * Requires a local Playwright install — adjust the import below (or set
 * PLAYWRIGHT_MODULE) and CHROMIUM_PATH to your Chromium binary.
 */

import { mkdir } from 'node:fs/promises'
// QA-only absolute import: playwright is deliberately not a package
// dependency; point this at any local playwright installation.
import { chromium } from '/Users/wujie/deepseek-harness/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'

const BASE_URL = process.env.DSH_URL ?? 'http://127.0.0.1:3080'
const OUT_DIR = '/tmp/research-ui'
// The ms-playwright cache holds chromium-1234 while playwright 1.61.1 wants
// 1228; point at the cached binary directly instead of downloading another.
const CHROMIUM = process.env.CHROMIUM_PATH
  ?? '/Users/wujie/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const TABS: ReadonlyArray<{ id: string; label: RegExp }> = [
  { id: 'overview', label: /总览|Overview/ },
  { id: 'paper', label: /^论文$|^Paper$/ },
  { id: 'papers', label: /^文献$|^Library$/ },
  { id: 'experiments', label: /^实验$|^Experiments$/ },
]

const FIGURE_UPLOADS = [
  '/tmp/research-ui/assets/loss-curve.svg',
  '/tmp/research-ui/assets/mpjpe-bars.svg',
]

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200))
})
page.on('pageerror', (error) => { console.log('[pageerror]', String(error).slice(0, 300)) })
// The figure delete path confirms via window.confirm.
page.on('dialog', (dialog) => { void dialog.accept() })

await mkdir(OUT_DIR, { recursive: true })
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
// The app shell mounts asynchronously; the sidebar footer toggle is the cue.
const toggle = page.getByRole('button', { name: /Mimir/ }).first()
await toggle.waitFor({ state: 'visible', timeout: 30_000 })
await toggle.click()

const workbench = page.getByRole('dialog', { name: /Mimir/ })
await workbench.waitFor({ state: 'visible', timeout: 15_000 })
// Let the deferred project list + auto-selection settle.
await page.waitForTimeout(2500)

for (const tab of TABS) {
  await workbench.getByRole('button', { name: tab.label }).first().click()
  // Tab loads are remote round-trips; give each view time to settle.
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT_DIR}/tab-${tab.id}.png` })
  console.log(`captured tab-${tab.id}.png`)
  if (tab.id === 'paper') {
    // Collapse the outline rail and verify the editor pane gets wider.
    await workbench.getByRole('button', { name: /收起大纲|Collapse the outline/ }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT_DIR}/tab-paper-collapsed.png` })
    console.log('captured tab-paper-collapsed.png')
  }
}

// ── Papers: search arXiv from the library view, then import one result.
await workbench.getByRole('button', { name: /^文献$|^Library$/ }).first().click()
await page.waitForTimeout(1200)
await workbench.getByPlaceholder(/egocentric whole body/).fill('egocentric whole body')
await workbench.getByRole('button', { name: /^搜索$|^Search$/ }).click()
// The host-side fetch carries a 15s timeout; give the feed time to arrive.
await page.waitForTimeout(6000)
await page.screenshot({ path: `${OUT_DIR}/tab-papers-search.png` })
console.log('captured tab-papers-search.png')
// Import the first not-yet-imported result, then capture the 已入库 repaint.
const importButton = workbench.getByRole('button', { name: /^导入$|^Import$/ }).first()
if (await importButton.count() > 0) {
  await importButton.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT_DIR}/tab-papers-imported.png` })
  console.log('captured tab-papers-imported.png')
} else {
  console.log('no importable result (all imported or the search failed)')
}

// ── Figures: upload two figures, delete the route-smoke probe, hover a card.
await workbench.getByRole('button', { name: /^图表$|^Figures$/ }).first().click()
await page.waitForTimeout(1200)
await workbench.locator('input[type="file"]').setInputFiles(FIGURE_UPLOADS)
// Uploads settle sequentially, then a forced rescan repaints the grid.
await page.waitForTimeout(2500)
const probeCard = workbench.getByText('__probe.png')
if (await probeCard.count() > 0) {
  const card = probeCard.locator('xpath=..')
  await card.hover()
  await card.getByRole('button', { name: /^删除$|^Delete$/ }).click()
  await page.waitForTimeout(1500)
  console.log('deleted __probe.png through the UI')
}
const firstCard = workbench.getByText('loss-curve.svg').locator('xpath=..')
await firstCard.hover()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT_DIR}/tab-figures.png` })
console.log('captured tab-figures.png')

// ── Servers: seed a loopback and an unreachable demo server, let probes settle.
await workbench.getByRole('button', { name: /^服务器$|^Servers$/ }).first().click()
await page.waitForTimeout(800)
const addServer = async (name: string, host: string, username: string, note: string): Promise<void> => {
  await workbench.getByRole('button', { name: /添加服务器|Add server/ }).click()
  await workbench.getByPlaceholder(/gpu01/).fill(name)
  await workbench.getByPlaceholder(/192\.168\.1\.10|gpu\.example\.com/).fill(host)
  await workbench.getByPlaceholder(/SSH/).fill(username)
  await workbench.getByPlaceholder(/可选备注|Optional note/).fill(note)
  await workbench.getByRole('button', { name: /^保存$|^Save$/ }).click()
  await page.waitForTimeout(800)
}
await addServer('gpu01', '127.0.0.1', 'ops', '本地回环演示（无 sshd，ssh 探测应失败）')
await addServer('gpu-offline', '10.255.255.1', 'ops', '不可达地址演示（TCP 超时）')
// gpu-offline's TCP probe times out after 4s; give both probes room to settle.
await page.waitForTimeout(7000)
await page.screenshot({ path: `${OUT_DIR}/tab-servers.png` })
console.log('captured tab-servers.png')

await browser.close()
console.log(`done -> ${OUT_DIR}`)
