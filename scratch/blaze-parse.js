const fs = require('fs');
const html = fs.readFileSync('blaze-debug.html', 'utf8');
const matches = [...html.matchAll(/self\.__next_f\.push\(\[\d+,\"(.*?)\"\]\)/g)].map(m => m[1]);
const unescaped = matches.map(m => {
  try {
    return JSON.parse('"' + m + '"');
  } catch(e) {
    return '';
  }
}).join('');

const index = unescaped.toLowerCase().indexOf('allergen');
console.log('Allergen index:', index);
if (index > -1) {
  console.log(unescaped.substring(index - 50, index + 500));
} else {
  // Let's dump all occurrences of "menu" or "pizza"
  const mIndex = unescaped.toLowerCase().indexOf('pizza');
  console.log('Pizza index:', mIndex);
  if (mIndex > -1) console.log(unescaped.substring(mIndex - 50, mIndex + 200));
}
