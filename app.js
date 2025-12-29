// Voice-to-Sheets PWA - Main JavaScript
// Handles voice recording, transcription, and Google Sheets integration

const recordBtn = document.getElementById('recordBtn');
const statusDiv = document.getElementById('status');
const transcriptDiv = document.getElementById('transcript');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.querySelector('.close');
const saveSettings = document.getElementById('saveSettings');
const logsList = document.getElementById('logsList');
const clearLogs = document.getElementById('clearLogs');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Load settings from localStorage
function loadSettings() {
    const backend = localStorage.getItem('backendUrl');
    const token = localStorage.getItem('token');
    const sheet = localStorage.getItem('sheetName');
    
    if (backend) document.getElementById('backendUrl').value = backend;
    if (token) document.getElementById('token').value = token;
    if (sheet) document.getElementById('sheetName').value = sheet;
}

// Save settings to localStorage
function saveSettingsToStorage() {
    const backend = document.getElementById('backendUrl').value;
    const token = document.getElementById('token').value;
    const sheet = document.getElementById('sheetName').value;
    
    localStorage.setItem('backendUrl', backend);
    localStorage.setItem('token', token);
    localStorage.setItem('sheetName', sheet);
    
    addLog('Settings saved successfully');
    settingsModal.style.display = 'none';
}

// Add log entry
function addLog(message) {
    const timestamp = new Date().toLocaleString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<strong>${timestamp}:</strong> ${message}`;
    logsList.insertBefore(logEntry, logsList.firstChild);
    
    // Save to localStorage
    saveLogs();
}

// Save logs to localStorage
function saveLogs() {
    const logs = [];
    document.querySelectorAll('.log-entry').forEach(entry => {
        logs.push(entry.innerHTML);
    });
    localStorage.setItem('logs', JSON.stringify(logs.slice(0, 50))); // Keep last 50
}

// Load logs from localStorage
function loadLogs() {
    const logs = JSON.parse(localStorage.getItem('logs') || '[]');
    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = log;
        logsList.appendChild(logEntry);
    });
}

// Clear all logs
function clearAllLogs() {
    logsList.innerHTML = '';
    localStorage.removeItem('logs');
    addLog('Logs cleared');
}

// Update status message
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    addLog(`${type.toUpperCase()}: ${message}`);
}

// Start recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await processAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.textContent = '⏹️ Stop Recording';
        updateStatus('Recording... Speak your idea', 'success');
    } catch (error) {
        updateStatus(`Microphone error: ${error.message}`, 'error');
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.textContent = '🎤 Start Recording';
        updateStatus('Processing audio...', 'info');
    }
}

// Process audio and send to backend
async function processAudio(audioBlob) {
    const backendUrl = localStorage.getItem('backendUrl');
    const token = localStorage.getItem('token');
    const sheetName = localStorage.getItem('sheetName');
    
    if (!backendUrl || !token) {
        updateStatus('Please configure settings first', 'error');
        settingsModal.style.display = 'block';
        return;
    }
    
    try {
        // Convert audio to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        
        reader.onloadend = async () => {
            const base64Audio = reader.result.split(',')[1];
            
            updateStatus('Transcribing and analyzing...', 'info');
            
            // Send to Google Apps Script backend
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: token,
                    sheetName: sheetName || 'Brain Dump',
                    audio: base64Audio,
                    mimeType: 'audio/webm'
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                transcriptDiv.innerHTML = `
                    <p><strong>Transcript:</strong> ${result.transcript}</p>
                    <p><strong>Category:</strong> ${result.category}</p>
                    <p><strong>Confidence:</strong> ${result.confidence}</p>
                `;
                updateStatus('✅ Successfully logged to Google Sheet!', 'success');
            } else {
                updateStatus(`Error: ${result.error}`, 'error');
                transcriptDiv.innerHTML = `<p class="error">Failed to process: ${result.error}</p>`;
            }
        };
    } catch (error) {
        updateStatus(`Processing error: ${error.message}`, 'error');
        transcriptDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    }
}

// Event Listeners
recordBtn.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'block';
});

closeSettings.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

saveSettings.addEventListener('click', saveSettingsToStorage);

clearLogs.addEventListener('click', clearAllLogs);

window.addEventListener('click', (event) => {
    if (event.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

// Initialize
loadSettings();
loadLogs();
updateStatus('Ready to record', 'success');

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => addLog('Service Worker registered'))
        .catch(err => addLog(`SW registration failed: ${err}`));
}
