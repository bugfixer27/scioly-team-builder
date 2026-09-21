// MIDDLE SCHOOL Team Builder configuration — separate backend from the high school builder.
//   1. apiUrl: the /exec URL of the *middle school* Apps Script web app (see MS_TEAMBUILDER_SETUP.md).
//   2. token:  must match CONFIG.API_TOKEN in that Apps Script.
// Leave apiUrl empty until the middle school backend is deployed; the page then shows a "not connected" notice.
window.TEAMBUILDER_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbztOpiJSorD0Dh6P8QXtnhlk6lGqMUM-NW47Ry_FWXoAIVVETSqTteSUF8kjpJMqvckoA/exec',
  token: 'Riverdale5250',
  pollSeconds: 45
};
