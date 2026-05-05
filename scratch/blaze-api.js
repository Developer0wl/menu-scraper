const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('response', res => {
    if (res.request().resourceType() === 'fetch' || res.request().resourceType() === 'xhr') {
      const url = res.url();
      if (!url.includes('google') && !url.includes('clarity') && !url.includes('adroll') && !url.includes('snapchat')) {
        console.log('[API]', res.status(), url);
      }
    }
  });

  await page.goto('https://blazepizza.com/nutrition', {waitUntil: 'domcontentloaded'});
  
  try {
    // Check if there are iframes
    const frames = page.frames();
    console.log('Frames found:', frames.map(f => f.url()));

    await page.waitForTimeout(5000);
    // Maybe an iframe?
    let contentFrame = page;
    const iframe = await page.$('iframe');
    if (iframe) {
       console.log('Found an iframe, switching to it...');
       contentFrame = await iframe.contentFrame();
    }
    
    const html = await contentFrame.content();
    if (html.includes('I agree')) {
       console.log('Found "I agree"');
       await contentFrame.click('text="I agree"');
       await contentFrame.click('text="GO"');
       await page.waitForTimeout(5000);
    } else {
       console.log('Could not find "I agree"');
    }
    
  } catch (e) {
    console.log('Click failed:', e.message);
  }
  
  await browser.close();
})();
