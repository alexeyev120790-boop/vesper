const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacement = `
    @media (max-width: 768px) {
      .app-layout {
        flex-direction: column !important;
      }
      .sidebar, .channels-sidebar, .members-sidebar {
        width: 100% !important;
        position: fixed !important;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 1000;
        transform: translateX(-100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex !important;
      }
      
      body.device-mode-phone:not(.phone-chat-open) .channels-sidebar {
        transform: translateX(0) !important;
        position: relative !important;
      }

      .sidebar.mobile-open, .channels-sidebar.mobile-open, .members-sidebar.mobile-open {
        transform: translateX(0);
      }
`;

html = html.replace(/@media \(max-width: 768px\) \{\s*\.app-layout \{\s*flex-direction: column !important;\s*\}\s*\.sidebar, \.channels-sidebar, \.members-sidebar \{\s*width: 100% !important;\s*position: fixed !important;\s*top: 0;\s*bottom: 0;\s*left: 0;\s*z-index: 1000;\s*transform: translateX\(-100%\);\s*transition: transform 0\.3s cubic-bezier\(0\.4, 0, 0\.2, 1\);\s*display: flex !important;\s*\}\s*\.sidebar\.mobile-open, \.channels-sidebar\.mobile-open, \.members-sidebar\.mobile-open \{\s*transform: translateX\(0\);\s*\}/, replacement);

fs.writeFileSync('index.html', html);
