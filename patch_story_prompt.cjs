const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const oldJs = `    window.openUserProfileModal = function(targetUsername) {
      if (!targetUsername) return;
      if (targetUsername.toLowerCase() === state.username.toLowerCase()) {
        openMyProfileModal();
        return;
      }
      const viewUserAvatarDisplay = document.getElementById('viewUserAvatarDisplay');`;

const newJs = `    window.openUserProfileModal = function(targetUsername) {
      if (!targetUsername) return;
      if (targetUsername.toLowerCase() === state.username.toLowerCase()) {
        openMyProfileModal();
        return;
      }
      
      const uObj = (state.allRegisteredUsers || []).find(u => u.username && u.username.toLowerCase() === targetUsername.toLowerCase());
      if (uObj && uObj.hasStory && uObj.story) {
        if (!confirm('Открыть профиль пользователя? Нажмите Отмена чтобы посмотреть его статус (историю).')) {
            window.openStoryViewer(targetUsername, uObj);
            return;
        }
      }
      
      const viewUserAvatarDisplay = document.getElementById('viewUserAvatarDisplay');`;

content = content.replace(oldJs, newJs);
fs.writeFileSync('index.html', content);
