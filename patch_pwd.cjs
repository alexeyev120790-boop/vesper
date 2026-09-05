const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(/sessionStorage\.setItem\('cyberchord_auth', JSON\.stringify\(\{\s*username: state\.username,\s*password: nPass\.value\.trim\(\)\s*\}\)\);/g, 
`const updatedAuth = JSON.stringify({
                  username: state.username,
                  password: nPass.value.trim()
                });
                sessionStorage.setItem('cyberchord_auth', updatedAuth);
                localStorage.setItem('cyberchord_auth', updatedAuth);`);

fs.writeFileSync('index.html', html);
console.log('Patched password change');
