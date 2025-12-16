const DEFAULTS = window.PLAYBACK_DEFAULT_SETTINGS;

// DOM Elements
const speedStepInput = document.getElementById('speedStep');
const seekIntervalInput = document.getElementById('seekInterval');
const startHiddenInput = document.getElementById('startHidden');
const keyInputs = {
    decreaseSpeed: document.getElementById('decreaseSpeed'),
    increaseSpeed: document.getElementById('increaseSpeed'),
    resetSpeed: document.getElementById('resetSpeed'),
    rewind: document.getElementById('rewind'),
    advance: document.getElementById('advance'),
    toggleVisibility: document.getElementById('toggleVisibility')
};
const saveBtn = document.getElementById('saveBtn');
const resetPosBtn = document.getElementById('resetPosBtn');
const statusDiv = document.getElementById('status');

// Temporary state for keys
let currentKeyBindings = { ...DEFAULTS.keyBindings };

// Load Settings
chrome.storage.sync.get(DEFAULTS, (items) => {
    speedStepInput.value = items.speedStep;
    seekIntervalInput.value = items.seekInterval;
    startHiddenInput.checked = items.startHidden;
    currentKeyBindings = items.keyBindings;
    updateKeyDisplays();
});

function updateKeyDisplays() {
    for (const [action, code] of Object.entries(currentKeyBindings)) {
        if (keyInputs[action]) {
            keyInputs[action].value = formatKeyCode(code);
            keyInputs[action].dataset.code = code;
        }
    }
}

function formatKeyCode(code) {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
}

// Key Recording
Object.entries(keyInputs).forEach(([action, input]) => {
    input.addEventListener('click', () => {
        input.value = 'Press key...';
        input.classList.add('recording');

        const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Ignore modifier-only presses
            if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

            currentKeyBindings[action] = e.code;
            updateKeyDisplays();

            input.classList.remove('recording');
            document.removeEventListener('keydown', handler, true);
        };

        document.addEventListener('keydown', handler, true);

        // Cancel on blur
        input.addEventListener('blur', () => {
            input.classList.remove('recording');
            document.removeEventListener('keydown', handler, true);
            updateKeyDisplays(); // Revert if nothing pressed
        }, { once: true });
    });
});

// Save
saveBtn.addEventListener('click', () => {
    const settings = {
        speedStep: parseFloat(speedStepInput.value),
        seekInterval: parseFloat(seekIntervalInput.value),
        startHidden: startHiddenInput.checked,
        keyBindings: currentKeyBindings
    };

    chrome.storage.sync.set(settings, () => {
        statusDiv.innerText = 'Saved!';
        statusDiv.classList.add('visible');
        setTimeout(() => statusDiv.classList.remove('visible'), 2000);
    });
});

resetPosBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "reset_position" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready or connection failed');
                    // Optional: Inject script if missing? Or just ignore.
                } else {
                    statusDiv.innerText = 'Position Reset!';
                    statusDiv.classList.add('visible');
                    setTimeout(() => statusDiv.classList.remove('visible'), 2000);
                }
            });
        }
    });
});
