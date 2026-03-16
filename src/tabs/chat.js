import { api } from '../api.js';
import { esc, chatTimeStr } from '../utils/helpers.js';
import { showToast } from '../utils/toast.js';

let chatTimer = null;
let lastChatCount = 0;

export function initChat() {
  document.getElementById('chatSendBtn').addEventListener('click', sendChatMsg);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMsg();
  });
}

export async function loadCharacters() {
  try {
    const chars = await api('/api/characters');
    const sel = document.getElementById('chatCharSelect');
    sel.innerHTML = '<option value="">Select character...</option>';
    chars.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      sel.appendChild(opt);
    });
    if (chars.length === 1) sel.selectedIndex = 1;
  } catch (e) { console.error('loadCharacters error:', e); }
}

export function startChatPolling() {
  if (chatTimer) clearInterval(chatTimer);
  pollChat();
  chatTimer = setInterval(pollChat, 5000);
}

async function pollChat() {
  try {
    const msgs = await api('/api/chat');
    if (msgs.length === lastChatCount) return;
    lastChatCount = msgs.length;
    const el = document.getElementById('chatMessages');
    const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    el.innerHTML = msgs.map(m => `<div class="chat-msg">
      <span class="chat-time">${chatTimeStr(m.timestamp)}</span>
      <span class="chat-sender">${esc(m.sender.charAt(0).toUpperCase() + m.sender.slice(1))}</span>
      <span class="chat-text"> ${esc(m.message)}</span>
    </div>`).join('');
    if (wasAtBottom) el.scrollTop = el.scrollHeight;
  } catch (e) { console.error('pollChat error:', e); }
}

async function sendChatMsg() {
  const sel = document.getElementById('chatCharSelect');
  const inp = document.getElementById('chatInput');
  const character = sel.value;
  const message = inp.value.trim();
  if (!character) { showToast('Select a character first', 'error'); return; }
  if (!message) return;
  try {
    await api('/api/chat', { method: 'POST', body: { character, message } });
    inp.value = '';
    pollChat();
  } catch (e) { showToast('Send failed: ' + e.message, 'error'); }
}
