// Team Builder configuration — the ONLY file leaders edit.
//   1. apiUrl: the Apps Script web app URL ending in /exec (see TEAMBUILDER_SETUP.md §4).
//   2. token:  must match CONFIG.API_TOKEN in the Apps Script.
// For local testing against fake data, run `node test/dev-server.js` and use apiUrl 'http://localhost:8787/exec'.
window.TEAMBUILDER_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxU5Tqy01vPzoW3yJ7Ww5Pv54D-8SVV7m8AoNdepanfPnzD4xDNzW4DBXTdh6HOgzdC/exec',
  token: 'Riverdale5250',
  pollSeconds: 45
};
