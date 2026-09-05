const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');
content = content.replace(
  /<div class="user-profile-quick-actions" style="grid-template-columns: repeat\(3, 1fr\);">/,
  `<div class="user-profile-quick-actions" style="grid-template-columns: repeat(5, 1fr);">`
);

const callButtonStr = `          <button class="quick-action-card" id="viewUserActionCall">
            <div class="action-card-icon">📞</div>
            <div class="action-card-label">Звонок</div>
          </button>`;

const additionalButtons = `          <button class="quick-action-card" id="viewUserActionVideo">
            <div class="action-card-icon">📹</div>
            <div class="action-card-label">Видео</div>
          </button>
          <button class="quick-action-card" id="viewUserActionBlock">
            <div class="action-card-icon">🚫</div>
            <div class="action-card-label">Блок</div>
          </button>`;

content = content.replace(callButtonStr, callButtonStr + '\n' + additionalButtons);

fs.writeFileSync('index.html', content);
