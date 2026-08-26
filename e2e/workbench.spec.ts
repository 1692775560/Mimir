import { expect, test } from '@playwright/test'

test.skip(process.env.DSH_E2E_URL === undefined, 'Set DSH_E2E_URL to a running dsh Web instance with Mimir mounted')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /Mimir/ }).first()
  await expect(toggle).toBeVisible({ timeout: 30_000 })
  await toggle.click()
  await expect(page.getByRole('dialog', { name: /Mimir/ })).toBeVisible()
})

test('opens the workbench and renders all six views', async ({ page }, testInfo) => {
  const workbench = page.getByRole('dialog', { name: /Mimir/ })
  // Tab names carry live count suffixes (e.g. "文献 48"), so match prefixes.
  const tabs = [/总览|Overview/, /^论文|^Paper/, /^文献|^Library/, /^实验|^Experiments/, /^图表|^Figures/, /^服务器|^Servers/]
  for (const [index, label] of tabs.entries()) {
    await workbench.getByRole('tab', { name: label }).first().click()
    await expect(workbench).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`view-${String(index + 1)}.png`) })
  }
})

test('literature search exposes an import outcome', async ({ page }) => {
  const workbench = page.getByRole('dialog', { name: /Mimir/ })
  await workbench.getByRole('tab', { name: /^文献|^Library/ }).first().click()
  await workbench.getByPlaceholder(/egocentric whole body/).fill('attention is all you need')
  await workbench.getByRole('button', { name: /^搜索$|^Search$/ }).click()
  await expect(workbench.getByText(/Attention Is All You Need/i).first()).toBeVisible({ timeout: 30_000 })
  await expect(workbench.getByRole('button', { name: /^导入$|^Import$|已入库|Imported/ }).first()).toBeVisible()
})
