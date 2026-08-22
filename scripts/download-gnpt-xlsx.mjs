#!/usr/bin/env node

/* Automates Global Energy Monitor's "Download data" form to fetch the
 * latest Global Nuclear Power Tracker spreadsheet (feeds plants.json via
 * sync-nuclear-data.mjs). Unlike the WorldPop population mosaic, this file
 * sits behind a lead-capture form (name/email/org/sector/country/use-case)
 * with no anonymous or stable API - GEM only hands out a short-lived
 * (10 minute) pre-signed download URL after a real form submission, and the
 * underlying storage bucket itself returns 403 without that signature.
 *
 * This script drives a real browser through the same form a human fills
 * out, using one consistent, real identity for this project (not a
 * fabricated one per run), then grabs the resulting file while the signed
 * URL is still valid. Requires the requester identity via env vars - see
 * the REQUIRED_ENV list below - so it isn't hardcoded into a public script.
 *
 * Usage: node download-gnpt-xlsx.mjs [--output <path>] */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const REQUIRED_ENV = ['GNPT_REQUESTER_NAME', 'GNPT_REQUESTER_EMAIL', 'GNPT_REQUESTER_ORG']
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env var ${key}`)
}

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const outputPath = resolve(argument('--output', 'gnpt-nuclear.xlsx'))

const browser = await chromium.launch()
const page = await browser.newPage()

// Resolves once the form submission's response includes the pre-signed
// download URL, so we can fetch it directly instead of trying to intercept
// a browser-triggered download (simpler, and works headless either way).
const downloadUrlPromise = page.waitForResponse(response => response.url().includes('digitaloceanspaces.com') && response.status() === 200, { timeout: 30000 })

await page.goto('https://globalenergymonitor.org/download-data', { waitUntil: 'networkidle' })

// The dataset catalog and the download form are both custom elements with
// closed-off shadow DOM (<gem-download-page>, <gem-download-form>), not
// reachable via normal Playwright locators - reach in with page.evaluate.
// Each dataset "toggle" is a styled <div role="button" data-item="...">,
// not a real checkbox, so it just needs a click to flip its own state.
await page.evaluate(() => {
  const pageRoot = document.querySelector('gem-download-page').shadowRoot
  const card = pageRoot.querySelector('[data-item="nuclear"]')
  if (!card) throw new Error('Could not find the Nuclear Power dataset card')
  card.click()
})

// Opens the "Download data" side panel with the selected dataset.
await page.evaluate(() => {
  const pageRoot = document.querySelector('gem-download-page').shadowRoot
  const button = [...pageRoot.querySelectorAll('button')].find(b => /download selected/i.test(b.textContent))
  if (!button) throw new Error('Could not find the "Download selected" button')
  button.click()
})
await page.waitForTimeout(500)

await page.evaluate(({ name, email, org, useCase }) => {
  const form = document.querySelector('gem-download-page').shadowRoot.querySelector('gem-download-form').shadowRoot
  const nativeInputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  const nativeSelectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  const nativeCheckboxSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked').set

  const textInputs = [...form.querySelectorAll('input[type=text]')]
  const [nameInput, orgInput] = textInputs
  const emailInput = form.querySelector('input[type=email]')

  nativeInputSetter.call(nameInput, name)
  nameInput.dispatchEvent(new Event('input', { bubbles: true }))
  nativeInputSetter.call(emailInput, email)
  emailInput.dispatchEvent(new Event('input', { bubbles: true }))
  nativeInputSetter.call(orgInput, org)
  orgInput.dispatchEvent(new Event('input', { bubbles: true }))

  const sector = form.querySelector('select[name="sector"]')
  nativeSelectSetter.call(sector, 'Academic / Research')
  sector.dispatchEvent(new Event('change', { bubbles: true }))

  const country = form.querySelector('select[name="country"]')
  nativeSelectSetter.call(country, 'China')
  country.dispatchEvent(new Event('change', { bubbles: true }))

  const textarea = form.querySelector('textarea')
  nativeTextareaSetter.call(textarea, useCase)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))

  const licenseCheckbox = form.querySelectorAll('input[type=checkbox]')[0]
  nativeCheckboxSetter.call(licenseCheckbox, true)
  licenseCheckbox.dispatchEvent(new Event('change', { bubbles: true }))

  const submit = [...form.querySelectorAll('button')].find(b => /submit and download/i.test(b.textContent))
  if (!submit) throw new Error('Could not find the "Submit and Download" button')
  submit.click()
}, {
  name: process.env.GNPT_REQUESTER_NAME,
  email: process.env.GNPT_REQUESTER_EMAIL,
  org: process.env.GNPT_REQUESTER_ORG,
  useCase: 'Independent, non-commercial research and education: building an open-source web app (StrikeScope) that visualizes global nuclear power plant locations and illustrative accident-scenario reference zones for public understanding of nuclear infrastructure.',
})

const downloadResponse = await downloadUrlPromise
const downloadUrl = downloadResponse.url()
console.log(`Got signed download URL (expires shortly): ${downloadUrl.split('?')[0]}`)

const fileResponse = await fetch(downloadUrl)
if (!fileResponse.ok) throw new Error(`Download failed: HTTP ${fileResponse.status}`)
await mkdir(resolve(outputPath, '..'), { recursive: true })
await writeFile(outputPath, Buffer.from(await fileResponse.arrayBuffer()))
console.log(`Wrote ${outputPath}`)

await browser.close()
