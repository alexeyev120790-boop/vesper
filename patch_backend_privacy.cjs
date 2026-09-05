const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// 1. Update UserAccount interface
const interfaceOld = `  blockedUsers?: string[];
  story?: any;
}`;
const interfaceNew = `  blockedUsers?: string[];
  story?: any;
  privacySearch?: string;
  privacyCall?: string;
}`;
content = content.replace(interfaceOld, interfaceNew);

// 2. In auth_success, send them to client
const authSuccessOld = `    blockedUsers: client.blockedUsers || [],
    story: (acc?.story && Date.now() - acc.story.createdAt < 24 * 60 * 60 * 1000) ? acc.story : undefined,`;
const authSuccessNew = `    blockedUsers: client.blockedUsers || [],
    story: (acc?.story && Date.now() - acc.story.createdAt < 24 * 60 * 60 * 1000) ? acc.story : undefined,
    privacySearch: acc?.privacySearch || 'all',
    privacyCall: acc?.privacyCall || 'all',`;
content = content.replace(authSuccessOld, authSuccessNew);

// 3. update_profile: parse and save them
const updateProfileOld = `          if (msg.statusText !== undefined) {
            account.statusText = msg.statusText;
            client.statusText = msg.statusText;
          }`;
const updateProfileNew = `          if (msg.statusText !== undefined) {
            account.statusText = msg.statusText;
            client.statusText = msg.statusText;
          }
          if (msg.privacySearch !== undefined) {
            account.privacySearch = msg.privacySearch;
            client.privacySearch = msg.privacySearch;
          }
          if (msg.privacyCall !== undefined) {
            account.privacyCall = msg.privacyCall;
            client.privacyCall = msg.privacyCall;
          }`;
content = content.replace(updateProfileOld, updateProfileNew);

// 4. Client interface update
const clientOld = `  blockedUsers?: string[];
  story?: any;
}`;
const clientNew = `  blockedUsers?: string[];
  story?: any;
  privacySearch?: string;
  privacyCall?: string;
}`;
content = content.replace(/  blockedUsers\?: string\[\];\n  story\?: any;\n\}/g, clientNew);

// 5. search_users: filter by privacySearch
const searchUsersOld = `        const results = Array.from(knownMap.values()).filter(u => {
          if (u.username.toLowerCase() === clientLower) return false;
          if (u.username.toLowerCase().includes(query)) return true;
          return false;
        });`;
const searchUsersNew = `        const results = Array.from(knownMap.values()).filter(u => {
          if (u.username.toLowerCase() === clientLower) return false;
          if (u.privacySearch === 'none') return false; // Hide from search if privacySearch is none
          if (u.username.toLowerCase().includes(query)) return true;
          return false;
        });`;
content = content.replace(searchUsersOld, searchUsersNew);

// 6. getAllUsersInfo: add privacySearch to knownMap for filtering
const getAllUsersInfoOld = `      story: hasValidStory ? u.story : undefined
    });`;
const getAllUsersInfoNew = `      story: hasValidStory ? u.story : undefined,
      privacySearch: u.privacySearch || 'all',
      privacyCall: u.privacyCall || 'all'
    });`;
content = content.replace(getAllUsersInfoOld, getAllUsersInfoNew);

// 7. call_start: check privacyCall
const callStartOld = `        const targetClient = getClientByUsername(msg.targetUser);
        if (!targetClient) {
          return sendError(ws, 'Пользователь не в сети!');
        }`;
const callStartNew = `        const targetClient = getClientByUsername(msg.targetUser);
        if (!targetClient) {
          return sendError(ws, 'Пользователь не в сети!');
        }
        
        // Check privacyCall
        const targetAcc = usersMap.get(targetClient.username.toLowerCase());
        const privacyCall = targetAcc?.privacyCall || 'all';
        if (privacyCall === 'none') {
          return sendError(ws, 'Пользователь запретил звонки.');
        }
        if (privacyCall === 'contacts') {
          // Note: we don't have a contact system yet, so maybe we just let it pass if they have chatted? 
          // We'll deny for now as an example of privacy check if no contact system exists
          return sendError(ws, 'Пользователь принимает звонки только от контактов.');
        }`;
content = content.replace(callStartOld, callStartNew);

fs.writeFileSync('server.ts', content);
