const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  let queries = {};

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('sanity.io') && url.includes('graphql')) {
      try {
        const json = await res.json();
        const keys = Object.keys(json.data || {});
        for (const k of keys) {
           queries[k] = json.data[k];
        }
      } catch (e) {}
    }
  });

  await page.goto('https://www.timhortons.com/nutrition-and-wellness');
  await page.waitForTimeout(10000);
  
  // also try hitting the menu page
  await page.goto('https://www.timhortons.com/menu');
  await page.waitForTimeout(10000);

  fs.writeFileSync('timhortons-sanity-all.json', JSON.stringify(queries, null, 2));
  
  await browser.close();
})();
