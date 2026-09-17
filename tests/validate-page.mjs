import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = `file://${path.join(root, 'index.html')}`;
const html = await readFile(path.join(root, 'index.html'), 'utf8');

if (!/^<!doctype html>/i.test(html.trim())) {
  throw new Error('El documento debe declarar HTML5 con <!DOCTYPE html>.');
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'desktop', width: 1440, height: 900 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const response = await page.goto(pageUrl, { waitUntil: 'load' });
    if (!response || !response.ok()) {
      throw new Error(`No se pudo cargar la página en ${viewport.name}.`);
    }

    const checks = await page.evaluate(() => ({
      stylesheetLoaded: [...document.styleSheets].some((sheet) => sheet.href?.endsWith('/style.css')),
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      hasLang: Boolean(document.documentElement.lang),
      hasTitle: Boolean(document.title),
      hasMain: Boolean(document.querySelector('main')),
      externalLinksAreSecure: [...document.querySelectorAll('a[href^="http"]')]
        .every((link) => link.href.startsWith('https://'))
    }));

    for (const [name, passed] of Object.entries(checks)) {
      if (!passed) {
        throw new Error(`${viewport.name}: falló la comprobación ${name}.`);
      }
    }

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    if (accessibility.violations.length > 0) {
      throw new Error(`${viewport.name}: axe encontró ${accessibility.violations.length} incumplimiento(s): ${
        accessibility.violations.map((violation) => violation.id).join(', ')
      }.`);
    }
  }
} finally {
  await browser.close();
}

console.log('HTML5, WCAG AA, enlaces seguros y responsividad: OK');
