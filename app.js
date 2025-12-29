// =========================================
// Voice → Google Sheet - Main App Logic
// =========================================
// Matches index.html element IDs: btnSettings, btnMic, btnSubmit, settingsDlg, etc.

// ---- DOM Elements ----
const btnSettings = document.getElementById('btnSettings');
const btnMic = document.getElementById('btnMic');
const btnSubmit = document.getElementById('btnSubmit');
const btnPreview = document.getElementById('btnPreview');
const btnSync = document.getElementById('btnSync');
const btnExportLocal = document.getElementById('btnExportLocal');
const btnClearLocal = document.getElementById('btnClearLocal');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnResetSettings = document.getElementById('btnResetSettings');

const settingsDlg = document.getElementById('settingsDlg');
const ideaTextarea = document.getElementById('idea');
const sourceSelect = document.getElementById('source');
const tagsInput = document.getElementById('tags');
const speechHelper = document.getElementById('speechHelper');
const kpiCategory = document.getElementById('kpiCategory');
const kpiConfidence = document.getElementById('kpiConfidence');
const statusLine = document.getElementById('statusLine');
const preview = document.getElementById('preview');
const recent = document.getElementById('recent');
const micLabel = document.getElementById('micLabel');
const netBadge = document.getElementById('netBadge');
const netText = document.getElementById('netText');

// Settings inputs
const endpointInput = document.getElementById('endpoint');
const tokenInput = document.getElementById('token');
const defaultSheetNameInput = document.getElementById('defaultSheetName');
const categoriesInput = document.getElementById('categories');

// ---- State ----
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recognition = null;

// ---- Settings Management ----
function loadSettings() {
  const endpoint = localStorage.getItem('endpoint') || '';
  const token = localStorage.getItem('token') || '';
  const sheetName = localStorage.getItem('defaultSheetName') || 'Brain Dump';
  const cats = localStorage.getItem('categories') || 'Sales,Operations,Leadership,Automations,Agents,Strategy,Other';
  
  if (endpointInput) endpointInput.value = endpoint;
  if (tokenInput) tokenInput.value = token;
  if (defaultSheetNameInput) defaultSheetNameInput.value = sheetName;
  if (categoriesInput) categoriesInput.value = cats;
}

function saveSettings() {
  const endpoint = endpointInput.value.trim();
  const token = tokenInput.value.trim();
  const sheetName = defaultSheetNameInput.value.trim() || 'Brain Dump';
  const cats = categoriesInput.value.trim();
  
  localStorage.setItem('endpoint', endpoint);
  localStorage.setItem('token', token);
  localStorage.setItem('defaultSheetName', sheetName);
  localStorage.setItem('categories', cats);
  
  updateStatus('Settings saved!', 'ok');
  if (settingsDlg) settingsDlg.close();
}

function resetSettings() {
  localStorage.clear();
  loadSettings();
  updateStatus('Settings reset', 'ok');
}

// ---- Speech Recognition Setup ----
function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    speechHelper.textContent = 'Speech recognition not supported';
    return null;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recog = new SpeechRecognition();
  recog.continuous = false;
  recog.interimResults = true;
  recog.lang = 'en-US';
  
  recog.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = 0; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript + ' ';
      } else {
        interim += transcript;
      }
    }
    if (final) {
      ideaTextarea.value = (ideaTextarea.value + final).trim();
    }
    speechHelper.textContent = interim || '';
  };
  
  recog.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    speechHelper.textContent = 'Error: ' + event.error;
    stopRecording();
  };
  
  recog.onend = () => {
    if (isRecording) {
      // restart if still recording
      try { recog.start(); } catch (e) { console.log(e); }
    }
  };
  
  return recog;
}

// ---- Recording Functions ----
function startRecording() {
  if (isRecording) return;
  isRecording = true;
  btnMic.classList.add('active');
  micLabel.textContent = 'Stop';
  speechHelper.textContent = 'Listening...';
  
  if (!recognition) recognition = initSpeechRecognition();
  if (recognition) {
    try {
      recognition.start();
    } catch (e) {
      console.log('Recognition start error:', e);
    }
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  btnMic.classList.remove('active');
  micLabel.textContent = 'Start';
  speechHelper.textContent = '';
  
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.log('Recognition stop error:', e);
    }
  }
}

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// ---- Submit to Backend ----
async function submitIdea() {
  const endpoint = localStorage.getItem('endpoint');
  const token = localStorage.getItem('token');
  const sheetName = localStorage.getItem('defaultSheetName') || 'Brain Dump';
  const idea = ideaTextarea.value.trim();
  const source = sourceSelect.value;
  const tags = tagsInput.value;
  
  if (!idea) {
    updateStatus('Please enter an idea', 'error');
    return;
  }
  
  if (!endpoint) {
    updateStatus('Please configure endpoint in Settings', 'error');
    settingsDlg.showModal();
    return;
  }
  
  const payload = {
    idea: idea,
    source: source,
    tags: tags,
    sheetName: sheetName,
    token: token
  };
  
  // Save to local queue
  saveToLocal(payload);
  refreshRecent();
  
  // Try sending
  updateStatus('Sending...', 'info');
  kpiCategory.textContent = '...';
  kpiConfidence.textContent = 'Processing...';
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.success || response.ok) {
      updateStatus('✅ Logged to Sheet!', 'ok');
      kpiCategory.textContent = result.category || '—';
      kpiConfidence.textContent = result.confidence ? `Confidence ${result.confidence}` : 'Confidence —';
      
      // Clear form
      ideaTextarea.value = '';
      tagsInput.value = '';
    } else {
      updateStatus('❌ Error: ' + (result.error || 'Unknown'), 'error');
      kpiCategory.textContent = '—';
      kpiConfidence.textContent = 'Failed';
    }
  } catch (error) {
    updateStatus('❌ Network error: ' + error.message, 'error');
    kpiCategory.textContent = '—';
    kpiConfidence.textContent = 'Error';
  }
}

// ---- Local Storage for Offline Queue ----
function saveToLocal(payload) {
  const queue = JSON.parse(localStorage.getItem('queue') || '[]');
  queue.push({
    ...payload,
    timestamp: new Date().toISOString()
  });
  localStorage.setItem('queue', JSON.stringify(queue));
}

function refreshRecent() {
  const queue = JSON.parse(localStorage.getItem('queue') || '[]');
  recent.innerHTML = '';
  
  if (queue.length === 0) {
    recent.innerHTML = '<div class="muted">No recent entries</div>';
    return;
  }
  
  queue.slice(-10).reverse().forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="list-idea">${item.idea}</div>
      <div class="list-meta">${item.source} • ${new Date(item.timestamp).toLocaleString()}</div>
    `;
    recent.appendChild(div);
  });
}

function exportLocal() {
  const queue = JSON.parse(localStorage.getItem('queue') || '[]');
  const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'voice-brain-dump-local.json';
  a.click();
  URL.revokeObjectURL(url);
}

function clearLocal() {
  if (confirm('Clear all local entries? This cannot be undone.')) {
    localStorage.removeItem('queue');
    refreshRecent();
    updateStatus('Local data cleared', 'ok');
  }
}

function previewPayload() {
  const endpoint = localStorage.getItem('endpoint');
  const token = localStorage.getItem('token');
  const sheetName = localStorage.getItem('defaultSheetName') || 'Brain Dump';
  const idea = ideaTextarea.value.trim();
  const source = sourceSelect.value;
  const tags = tagsInput.value;
  
  const payload = {
    idea: idea,
    source: source,
    tags: tags,
    sheetName: sheetName,
    token: token
  };
  
  preview.hidden = false;
  preview.textContent = JSON.stringify(payload, null, 2);
}

function syncQueued() {
  updateStatus('Sync not yet implemented', 'info');
}

// ---- Status Updates ----
function updateStatus(msg, type) {
  statusLine.textContent = msg;
  statusLine.className = 'muted';
  if (type === 'error') statusLine.style.color = '#f44';
  else if (type === 'ok') statusLine.style.color = '#4f4';
  else statusLine.style.color = '#888';
}

// ---- Network Status ----
function updateNetworkStatus() {
  if (navigator.onLine) {
    netBadge.className = 'badge ok';
    netText.textContent = 'Online';
  } else {
    netBadge.className = 'badge warn';
    netText.textContent = 'Offline';
  }
}

// ---- Event Listeners ----
if (btnSettings) btnSettings.addEventListener('click', () => {
  loadSettings();
  settingsDlg.showModal();
});

if (btnMic) btnMic.addEventListener('click', toggleRecording);
if (btnSubmit) btnSubmit.addEventListener('click', submitIdea);
if (btnPreview) btnPreview.addEventListener('click', previewPayload);
if (btnSync) btnSync.addEventListener('click', syncQueued);
if (btnExportLocal) btnExportLocal.addEventListener('click', exportLocal);
if (btnClearLocal) btnClearLocal.addEventListener('click', clearLocal);
if (btnSaveSettings) btnSaveSettings.addEventListener('click', (e) => {
  e.preventDefault();
  saveSettings();
});
if (btnResetSettings) btnResetSettings.addEventListener('click', (e) => {
  e.preventDefault();
  resetSettings();
});

// Keyboard shortcuts
ideaTextarea.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    submitIdea();
  }
});

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// ---- Initialization ----
loadSettings();
refreshRecent();
updateNetworkStatus();
updateStatus('Ready', 'ok');

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('Service Worker registered'))
    .catch(err => console.log('SW registration failed:', err));
}
