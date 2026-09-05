const pngToIcoPkg = require('png-to-ico');
const pngToIco = pngToIcoPkg.default || pngToIcoPkg;
const fs = require('fs');

pngToIco(['public/apple-touch-icon.png'])
  .then(buf => {
    fs.writeFileSync('build/icon.ico', buf);
    console.log('build/icon.ico generated successfully, size:', buf.length);
  })
  .catch(err => {
    console.error('Error generating ico:', err);
  });
