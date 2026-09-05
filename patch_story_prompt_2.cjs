const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const customModalHtml = `
  <!-- STORY OR PROFILE CHOICE MODAL -->
  <div class="modal-overlay" id="storyOrProfileModal" style="z-index: 1000000;">
    <div class="modal-card" style="max-width: 340px; padding: 24px; text-align: center;">
      <h3 style="margin-bottom: 16px;">У пользователя есть новая история!</h3>
      <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px;">Зайти в профиль или посмотреть статус?</p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button id="btnChooseViewStory" class="ripple-btn" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); padding: 12px; font-weight: bold; width: 100%;">Посмотреть статус</button>
        <button id="btnChooseViewProfile" class="ripple-btn" style="background: rgba(255,255,255,0.1); padding: 12px; font-weight: bold; width: 100%;">Зайти в профиль</button>
        <button id="btnCancelStoryOrProfile" class="cancel-btn" style="margin-top: 8px;">Отмена</button>
      </div>
    </div>
  </div>
`;

content = content.replace('<!-- STORY VIEWER MODAL -->', customModalHtml + '\n  <!-- STORY VIEWER MODAL -->');

const oldJs = `      if (uObj && uObj.hasStory && uObj.story) {
        if (!confirm('Открыть профиль пользователя? Нажмите Отмена чтобы посмотреть его статус (историю).')) {
            window.openStoryViewer(targetUsername, uObj);
            return;
        }
      }`;

const newJs = `      if (uObj && (uObj.hasStory || uObj.story)) {
        const sopModal = document.getElementById('storyOrProfileModal');
        if (sopModal) {
            sopModal.classList.add('active');
            
            document.getElementById('btnChooseViewStory').onclick = () => {
                sopModal.classList.remove('active');
                if (typeof window.openStoryViewer === 'function') window.openStoryViewer(targetUsername, uObj);
            };
            
            document.getElementById('btnChooseViewProfile').onclick = () => {
                sopModal.classList.remove('active');
                openUserProfileModalInternal(targetUsername, uObj);
            };
            
            document.getElementById('btnCancelStoryOrProfile').onclick = () => {
                sopModal.classList.remove('active');
            };
            return;
        }
      }
      openUserProfileModalInternal(targetUsername, uObj);
    }
    function openUserProfileModalInternal(targetUsername, uObj) {`;

content = content.replace(oldJs, newJs);
fs.writeFileSync('index.html', content);
