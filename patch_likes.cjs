const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const targetStr = `            renderDirectMessagesList();
            
            // TOP LEFT SEARCH BAR DROPDOWN`;

const replaceStr = `            renderDirectMessagesList();
            
            // Update story modal if active
            const storyModal = document.getElementById('storyModal');
            if (storyModal && storyModal.classList.contains('active') && state.activeStoryAuthor) {
              const uObj = returnedUsers.find(u => u.username.toLowerCase() === state.activeStoryAuthor.toLowerCase());
              if (uObj && uObj.story) {
                const storyData = uObj.story;
                const likes = storyData.likes || [];
                const storyLikesCount = document.getElementById('storyLikesCount');
                if (storyLikesCount) storyLikesCount.textContent = likes.length;
                const hasLiked = likes.includes(state.username);
                const storyHeartIcon = document.getElementById('storyHeartIcon');
                if (storyHeartIcon) storyHeartIcon.textContent = hasLiked ? '❤️' : '🤍';
                const storyLikersText = document.getElementById('storyLikersText');
                if (storyLikersText) {
                  storyLikersText.textContent = likes.length > 0 ? \`Понравилось: \${likes.join(', ')}\` : 'Пока нет лайков';
                }
              }
            }

            // TOP LEFT SEARCH BAR DROPDOWN`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync('index.html', content);
