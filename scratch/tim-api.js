const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('sanity.io') && url.includes('graphql')) {
      try {
        const json = await res.json();
        const str = JSON.stringify(json);
        if (str.toLowerCase().includes('allergen') || str.toLowerCase().includes('nutrition') || str.toLowerCase().includes('milk')) {
          console.log('[SANITY MATCH]', url.substring(0, 100));
          console.log('Keys:', Object.keys(json.data || {}));
          if (json.data && json.data.allMenu) {
             console.log('Sample item:', JSON.stringify(json.data.allMenu[0]).substring(0, 500));
          }
          fs.writeFileSync('timhortons-sanity.json', str);
        }
      } catch (e) {}
    }
  });

  await page.goto('https://www.timhortons.com/nutrition-and-wellness');
  await page.waitForTimeout(10000);
  
  await browser.close();
})();
