const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// The logic inside index.html for auto login is now:
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', initAutoLogin);
// } else {
//   initAutoLogin();
// }

console.log(html.includes("function initAutoLogin()"));
