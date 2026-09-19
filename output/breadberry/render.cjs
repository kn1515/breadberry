const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + path.join(__dirname,'preview.html'));
  await page.evaluate(() => document.fonts.ready);
  const slides = page.locator('.slide');
  console.log('Slides found:',await slides.count());
  for (let i = 0; i < await slides.count(); i++) {
    await slides.nth(i).screenshot({path:path.join(__dirname,`slide-${i+1}.png`)});
  }
  await browser.close();
})().catch(e => {console.error(e); process.exit(1)});
