// Annotated screenshot generator for the Forge Platform user handbook.
//
// This is a documentation tool only. It is intentionally separate from the
// frontend application — it does not ship with the product, it is not part
// of the build, and it has no runtime dependency on forge-frontend code.
// All it needs is a running Forge stack reachable at FORGE_URL.
//
// Run from forge-deploy/docs/screenshots/:
//   npm install                          # one-time setup
//   npx playwright install chromium      # one-time setup
//   npm run screenshots                  # take all screenshots
//   node screenshots.mjs dashboard       # only one shot id
//
// Output: ../img/handbook/<id>.png
//
// Each shot may highlight elements three ways:
//   { kind: 'label', text: 'Name', n: 1 }                         # form field by Label text
//   { kind: 'role',  role: 'button', name: 'Create Inventory', n: 2 } # by ARIA role
//   { kind: 'css',   selector: 'main h1', n: 3 }                  # raw CSS selector

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../img/handbook')

const BASE = process.env.FORGE_URL || 'https://localhost'
const USER = process.env.FORGE_USER || 'admin'
const PASS = process.env.FORGE_PASS || 'ForgeAdmin2026!'

const ANNOTATE_CSS = `
[data-forge-highlight] {
  outline: 4px solid #ff3b30 !important;
  outline-offset: 3px !important;
  box-shadow: 0 0 0 8px rgba(255, 59, 48, 0.18) !important;
  border-radius: 6px !important;
}
.forge-callout-badge {
  position: absolute !important;
  z-index: 999999;
  background: #ff3b30;
  color: white;
  font: 700 15px/1 system-ui, -apple-system, sans-serif;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  border: 2px solid white;
}
`

/**
 * Annotate elements. All matching is done inside the page (page.evaluate),
 * which works even when shadcn/Radix labels are not associated via htmlFor.
 *
 * Each item: { kind: 'label'|'role'|'css', n: <number>, ... }
 */
async function annotate(page, items) {
  const failed = await page.evaluate((items) => {
    const failures = []

    function normText(s) {
      return (s || '').trim().replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '')
    }

    function findByLabelText(text) {
      const want = normText(text)
      const labels = Array.from(document.querySelectorAll('label'))
      const lbl = labels.find((l) => normText(l.textContent) === want)
      if (!lbl) return null

      // (a) <label for="x"> + <... id="x">
      const id = lbl.getAttribute('for')
      if (id) {
        const el = document.getElementById(id)
        if (el) return el
      }
      // (b) input nested directly inside the label
      const nested = lbl.querySelector('input, select, textarea, button, [role="combobox"]')
      if (nested) return nested
      // (c) sibling/descendant inside the same form-row container
      let container = lbl.parentElement
      for (let i = 0; i < 4 && container; i++) {
        const el = container.querySelector('input, select, textarea, [role="combobox"], button[type="button"]')
        if (el && el !== lbl && !lbl.contains(el)) return el
        container = container.parentElement
      }
      // (d) follow-sibling traversal
      let sib = lbl.nextElementSibling
      while (sib) {
        if (sib.matches('input, select, textarea, button, [role="combobox"]')) return sib
        const inner = sib.querySelector('input, select, textarea, [role="combobox"]')
        if (inner) return inner
        sib = sib.nextElementSibling
      }
      // Last resort: highlight the label's container
      return lbl.parentElement || lbl
    }

    function findByRole(role, namePattern) {
      const rx = new RegExp(namePattern, 'i')
      // role=button → button, [role="button"]; role=link → a, [role="link"]
      const tagMap = { button: 'button, [role="button"]', link: 'a, [role="link"]' }
      const sel = tagMap[role] || `[role="${role}"]`
      const els = Array.from(document.querySelectorAll(sel))
      return els.find((el) => rx.test(el.textContent || el.getAttribute('aria-label') || ''))
    }

    function placeBadge(target, n) {
      const rect = target.getBoundingClientRect()
      const badge = document.createElement('div')
      badge.className = 'forge-callout-badge'
      badge.textContent = String(n)
      // Position absolutely on the document so the badge stays put even
      // when the page is scrolled for full-page screenshots.
      badge.style.left = `${rect.left + window.scrollX - 14}px`
      badge.style.top = `${rect.top + window.scrollY - 14}px`
      document.body.appendChild(badge)
    }

    for (const it of items) {
      let target = null
      if (it.kind === 'label') target = findByLabelText(it.text)
      else if (it.kind === 'role') target = findByRole(it.role, it.namePattern)
      else if (it.kind === 'css') target = document.querySelector(it.selector)

      if (!target) {
        failures.push({ n: it.n, kind: it.kind, key: it.text || it.namePattern || it.selector })
        continue
      }
      target.setAttribute('data-forge-highlight', '')
      placeBadge(target, it.n)
    }

    return failures
  }, items.map((it) => ({
    n: it.n,
    kind: it.kind,
    text: it.text,
    selector: it.selector,
    role: it.role,
    // Convert RegExp to source string for serialization
    namePattern: it.name instanceof RegExp ? it.name.source : it.name,
  })))

  for (const f of failed) {
    console.warn(`  ! callout ${f.n} (${f.kind}): no match for "${f.key}"`)
  }
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.setItem('forge_password_changed_1', 'true')
  })

  const userInput = page.locator('input').first()
  const passInput = page.locator('input[type="password"]').first()
  await userInput.click()
  await userInput.fill(USER)
  await passInput.click()
  await passInput.fill(PASS)

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/login/') && r.request().method() === 'POST'),
    page.click('button:has-text("Sign in")'),
  ])
  await page.waitForTimeout(800)
  await page.waitForLoadState('networkidle')
}

/** Helper: navigate, settle, annotate. */
async function go(page, path, callouts = []) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await annotate(page, callouts)
}

// Common selectors
const SEARCH = 'input[placeholder*="earch"]'

const SHOTS = {
  // ============================================================
  // VIEWS
  // ============================================================
  dashboard: async (p) => {
    await go(p, '/dashboard', [
      { kind: 'css', selector: 'main h1', n: 1 },
      { kind: 'role', role: 'link', name: /Getting Started/i, n: 2 },
    ])
  },
  jobs: (p) => go(p, '/jobs', [
    { kind: 'css', selector: SEARCH, n: 1 },
    { kind: 'role', role: 'button', name: /Refresh/i, n: 2 },
  ]),
  schedules: (p) => go(p, '/schedules', [
    { kind: 'role', role: 'link', name: /Create Schedule|Add Schedule|New Schedule/i, n: 1 },
  ]),
  schedules_new: (p) => go(p, '/schedules/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Template', n: 2 },
    { kind: 'label', text: 'Frequency', n: 3 },
    { kind: 'label', text: 'Start Date/Time', n: 4 },
    { kind: 'role', role: 'button', name: /Create Schedule/i, n: 5 },
  ]),
  activity: (p) => go(p, '/activity', [
    { kind: 'css', selector: SEARCH, n: 1 },
  ]),
  audit_log: (p) => go(p, '/audit', [
    { kind: 'css', selector: SEARCH, n: 1 },
  ]),
  analytics: (p) => go(p, '/analytics', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),

  // ============================================================
  // AUTOMATION
  // ============================================================
  event_rules: (p) => go(p, '/event_rules', [
    { kind: 'role', role: 'link', name: /Create Event Rule|New Event Rule|Add/i, n: 1 },
  ]),
  event_rules_new: (p) => go(p, '/event_rules/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Source Type', n: 2 },
    { kind: 'label', text: 'Webhook Path', n: 3 },
    { kind: 'role', role: 'button', name: /Add Condition/i, n: 4 },
    { kind: 'role', role: 'button', name: /Add Action/i, n: 5 },
    { kind: 'role', role: 'button', name: /Create Event Rule/i, n: 6 },
  ]),
  event_logs: (p) => go(p, '/event_logs', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  outbound_webhooks: (p) => go(p, '/outbound_webhooks', [
    { kind: 'role', role: 'link', name: /Create|New|Add/i, n: 1 },
  ]),
  outbound_webhooks_new: (p) => go(p, '/outbound_webhooks/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Target URL', n: 2 },
    { kind: 'role', role: 'button', name: /Job Failed/i, n: 3 },
    { kind: 'role', role: 'button', name: /Create Outbound Webhook/i, n: 4 },
  ]),

  // ============================================================
  // SELF-SERVICE
  // ============================================================
  service_portal: (p) => go(p, '/service_portal', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  my_requests: (p) => go(p, '/my_requests', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  approvals: (p) => go(p, '/service_approvals', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  catalog_admin: (p) => go(p, '/service_catalog', [
    { kind: 'role', role: 'link', name: /Add Item|Create|New/i, n: 1 },
  ]),
  catalog_admin_new: (p) => go(p, '/service_catalog/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Category', n: 2 },
    { kind: 'label', text: 'Underlying template', n: 3 },
    { kind: 'label', text: 'Requires approval before launch', n: 4 },
    { kind: 'role', role: 'button', name: /^Save$/i, n: 5 },
  ]),

  // ============================================================
  // TENANCY
  // ============================================================
  tenants: (p) => go(p, '/tenants', [
    { kind: 'role', role: 'link', name: /Create Tenant|New|Add/i, n: 1 },
  ]),
  tenants_new: (p) => go(p, '/tenants/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Admin username', n: 2 },
    { kind: 'label', text: 'Admin password', n: 3 },
    { kind: 'label', text: 'Max concurrent jobs', n: 4 },
    { kind: 'role', role: 'button', name: /^Save$/i, n: 5 },
  ]),
  quota_events: (p) => go(p, '/tenant_quota_events', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),

  // ============================================================
  // COMPLIANCE
  // ============================================================
  drift_detections: (p) => go(p, '/drift_detections', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  drift_alerts: (p) => go(p, '/drift_alerts', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  alert_rules: (p) => go(p, '/drift_alert_rules', [
    { kind: 'role', role: 'link', name: /Create Alert Rule|New|Add/i, n: 1 },
  ]),
  alert_rules_new: (p) => go(p, '/drift_alert_rules/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Host Filter (fnmatch pattern)', n: 2 },
    { kind: 'label', text: 'Minimum Severity', n: 3 },
    { kind: 'role', role: 'button', name: /Create Alert Rule/i, n: 4 },
  ]),
  fact_snapshots: (p) => go(p, '/fact_snapshots', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  policies: (p) => go(p, '/policies', [
    { kind: 'role', role: 'link', name: /Create Policy|New|Add/i, n: 1 },
  ]),
  policies_new: (p) => go(p, '/policies/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Enforcement', n: 2 },
    { kind: 'label', text: 'Rego module', n: 3 },
    { kind: 'role', role: 'button', name: /^Save$/i, n: 4 },
  ]),
  policy_decisions: (p) => go(p, '/policy_decisions', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  scanners: (p) => go(p, '/scanners', [
    { kind: 'role', role: 'link', name: /Create Scanner|New|Add/i, n: 1 },
  ]),
  scanners_new: (p) => go(p, '/scanners/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Tool', n: 2 },
    { kind: 'label', text: 'Severity threshold', n: 3 },
    { kind: 'role', role: 'button', name: /^Save$/i, n: 4 },
  ]),
  scan_results: (p) => go(p, '/scan_results', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  observability: (p) => go(p, '/observability', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),

  // ============================================================
  // RESOURCES
  // ============================================================
  templates: (p) => go(p, '/templates', [
    { kind: 'css', selector: SEARCH, n: 1 },
    { kind: 'role', role: 'link', name: /Job Template/i, n: 2 },
  ]),
  templates_new: (p) => go(p, '/templates/job_template/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Inventory', n: 2 },
    { kind: 'label', text: 'Project', n: 3 },
    { kind: 'label', text: 'Playbook', n: 4 },
    { kind: 'label', text: 'Limit', n: 5 },
    { kind: 'role', role: 'button', name: /Create Template/i, n: 6 },
  ]),
  inventories: (p) => go(p, '/inventories', [
    { kind: 'css', selector: SEARCH, n: 1 },
    { kind: 'role', role: 'link', name: /Create Inventory|New|Add/i, n: 2 },
  ]),
  inventories_new: (p) => go(p, '/inventories/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Description', n: 2 },
    { kind: 'label', text: 'Organization', n: 3 },
    { kind: 'label', text: 'Inventory Type', n: 4 },
    { kind: 'role', role: 'button', name: /Create Inventory/i, n: 5 },
  ]),
  hosts: (p) => go(p, '/hosts', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  projects: (p) => go(p, '/projects', [
    { kind: 'css', selector: SEARCH, n: 1 },
    { kind: 'role', role: 'link', name: /Create Project|New|Add/i, n: 2 },
  ]),
  projects_new: (p) => go(p, '/projects/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'SCM Type', n: 2 },
    { kind: 'label', text: 'SCM URL', n: 3 },
    { kind: 'label', text: 'SCM Branch', n: 4 },
    { kind: 'role', role: 'button', name: /Create Project/i, n: 5 },
  ]),
  credentials: (p) => go(p, '/credentials', [
    { kind: 'css', selector: SEARCH, n: 1 },
    { kind: 'role', role: 'link', name: /Create Credential|New|Add/i, n: 2 },
  ]),
  credentials_new: (p) => go(p, '/credentials/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Credential Type', n: 2 },
    { kind: 'label', text: 'Organization', n: 3 },
    { kind: 'role', role: 'button', name: /Create Credential/i, n: 4 },
  ]),

  // ============================================================
  // ACCESS
  // ============================================================
  organizations: (p) => go(p, '/organizations', [
    { kind: 'role', role: 'link', name: /Create Organization|New|Add/i, n: 1 },
  ]),
  organizations_new: (p) => go(p, '/organizations/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Description', n: 2 },
    { kind: 'label', text: 'Max Hosts', n: 3 },
    { kind: 'role', role: 'button', name: /Create Organization/i, n: 4 },
  ]),
  users: (p) => go(p, '/users', [
    { kind: 'role', role: 'link', name: /Create User|New|Add/i, n: 1 },
  ]),
  users_new: (p) => go(p, '/users/new', [
    { kind: 'label', text: 'Username', n: 1 },
    { kind: 'label', text: 'Email', n: 2 },
    { kind: 'label', text: 'Password', n: 3 },
    { kind: 'role', role: 'button', name: /Superuser/i, n: 4 },
    { kind: 'role', role: 'button', name: /Create User/i, n: 5 },
  ]),
  teams: (p) => go(p, '/teams', [
    { kind: 'role', role: 'link', name: /Create Team|New|Add/i, n: 1 },
  ]),
  teams_new: (p) => go(p, '/teams/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Description', n: 2 },
    { kind: 'label', text: 'Organization', n: 3 },
    { kind: 'role', role: 'button', name: /Create Team/i, n: 4 },
  ]),

  // ============================================================
  // ADMIN
  // ============================================================
  instances: (p) => go(p, '/instances', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  instance_groups: (p) => go(p, '/instance_groups', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  execution_environments: (p) => go(p, '/execution_environments', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  notifications: (p) => go(p, '/notification_templates', [
    { kind: 'role', role: 'link', name: /Create|New|Add/i, n: 1 },
  ]),
  notifications_new: (p) => go(p, '/notification_templates/new', [
    { kind: 'label', text: 'Name', n: 1 },
    { kind: 'label', text: 'Notification Type', n: 2 },
    { kind: 'role', role: 'button', name: /^Create$/i, n: 3 },
  ]),
  topology: (p) => go(p, '/topology', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
  settings: (p) => go(p, '/settings', [
    { kind: 'css', selector: 'main h1', n: 1 },
  ]),
}

async function main() {
  const only = process.argv[2]
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  page.on('framenavigated', async () => {
    try { await page.addStyleTag({ content: ANNOTATE_CSS }) } catch {}
  })

  await login(page)

  const ids = only ? [only] : Object.keys(SHOTS)
  for (const id of ids) {
    const fn = SHOTS[id]
    if (!fn) {
      console.error(`unknown shot: ${id}`)
      continue
    }
    try {
      await fn(page)
      await page.addStyleTag({ content: ANNOTATE_CSS })
      await page.waitForTimeout(150)
      const out = resolve(OUT_DIR, `${id}.png`)
      await page.screenshot({ path: out, fullPage: true })
      console.log(`✓ ${id}`)
    } catch (e) {
      console.error(`✗ ${id}: ${e.message.split('\n')[0]}`)
    }
  }

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
