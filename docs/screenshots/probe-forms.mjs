// Probe form pages to discover all labeled inputs and their structure.
// Run: node probe-forms.mjs
import { chromium } from 'playwright'

const BASE = 'https://localhost'
const PAGES = [
  '/inventories/new',
  '/credentials/new',
  '/projects/new',
  '/templates/job_template/new',
  '/users/new',
  '/teams/new',
  '/organizations/new',
  '/event_rules/new',
  '/outbound_webhooks/new',
  '/policies/new',
  '/scanners/new',
  '/tenants/new',
  '/service_catalog/new',
  '/drift_alert_rules/new',
  '/schedules/new',
  '/notification_templates/new',
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
})
const page = await ctx.newPage()

// Login
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.setItem('forge_password_changed_1', 'true'))
await page.locator('input').first().fill('admin')
await page.locator('input[type="password"]').first().fill('ForgeAdmin2026!')
await Promise.all([
  page.waitForResponse((r) => r.url().includes('/api/login/') && r.request().method() === 'POST'),
  page.click('button:has-text("Sign in")'),
])
await page.waitForTimeout(500)

for (const path of PAGES) {
  console.log(`\n=== ${path} ===`)
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    // Get all labels with their associated input types
    const fields = await page.evaluate(() => {
      const out = []
      const labels = document.querySelectorAll('label')
      labels.forEach((lbl) => {
        const text = lbl.textContent.trim()
        if (!text) return
        const id = lbl.getAttribute('for')
        let inputType = '?'
        let inputTag = '?'
        if (id) {
          const inp = document.getElementById(id)
          if (inp) {
            inputTag = inp.tagName.toLowerCase()
            inputType = inp.getAttribute('type') || inputTag
          }
        }
        out.push(`  ${text} → ${inputTag}/${inputType}`)
      })
      // Buttons
      const buttons = []
      document.querySelectorAll('main button').forEach((b) => {
        const t = b.textContent.trim()
        if (t) buttons.push(`  [btn] ${t}`)
      })
      return [...out, ...buttons]
    })
    fields.forEach((f) => console.log(f))
  } catch (e) {
    console.log(`  ERROR: ${e.message}`)
  }
}

await browser.close()
