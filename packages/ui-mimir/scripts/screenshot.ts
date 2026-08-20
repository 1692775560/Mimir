/**
 * QA screenshot harness (NOT part of the package test suite): opens the
 * Mimir workbench in headless Chromium against a running `dsh web` instance
 * with the plugin mounted, and captures one PNG per tab into /tmp/research-ui/.
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
  { id: 'figures', label: /^图表$|^Figures$/ },
]

const browser = await chromium.launch({ executablePath: CHROMIUM })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text().slice(0, 200))
})
page.on('pageerror', (error) => { console.log('[pageerror]', String(error).slice(0, 300)) })

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

await browser.close()
console.log(`done -> ${OUT_DIR}`)
