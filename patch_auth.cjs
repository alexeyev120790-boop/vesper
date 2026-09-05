const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const regex = /\/\/ Auto load session on DOMReady\s+window\.addEventListener\('DOMContentLoaded', \(\) => \{([\s\S]*?)\}\);/g;

html = html.replace(regex, (match, body) => {
    return `// Auto load session on DOMReady
    function initAutoLogin() {${body}}
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAutoLogin);
    } else {
      initAutoLogin();
    }`;
});

fs.writeFileSync('index.html', html);
console.log('Patched index.html for auto login');
