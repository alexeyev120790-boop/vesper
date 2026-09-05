const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const jsToAdd = `
    const psSelect = document.getElementById('privacySearchSelect');
    if (psSelect) {
      psSelect.addEventListener('change', () => {
        sendPayload({ type: 'update_profile', privacySearch: psSelect.value });
        showToast('Настройки приватности обновлены');
      });
    }

    const pcSelect = document.getElementById('privacyCallSelect');
    if (pcSelect) {
      pcSelect.addEventListener('change', () => {
        sendPayload({ type: 'update_profile', privacyCall: pcSelect.value });
        showToast('Настройки звонков обновлены');
      });
    }
`;

content = content.replace(/(if \(closeSettingsModalBtn\) \{)/, jsToAdd + '\n    $1');

const jsLoadToAdd = `
          if (msg.privacySearch) {
             const ps = document.getElementById('privacySearchSelect');
             if (ps) ps.value = msg.privacySearch;
          }
          if (msg.privacyCall) {
             const pc = document.getElementById('privacyCallSelect');
             if (pc) pc.value = msg.privacyCall;
          }
`;

content = content.replace(/(if \(msg\.story !== undefined\) state\.story = msg\.story;)/, '$1' + jsLoadToAdd);

fs.writeFileSync('index.html', content);
