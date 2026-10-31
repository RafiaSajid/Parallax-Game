import { initPage, $ } from '../core.js';
import { initModelToy } from '../modelToy.js';
const user = await initPage();
if (user) {
  const a = $('#cta-primary'); a.href = 'dashboard.html'; a.textContent = 'Go to dashboard';
  $('#cta-secondary').hidden = true;
}
initModelToy($('.toy-slot'), 'planet'); // not awaited: the page never waits for the model (falls back to the cube if it is missing)
