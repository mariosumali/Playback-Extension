(function () {
    const DEFAULTS = window.PLAYBACK_DEFAULT_SETTINGS;
    let settings = { ...DEFAULTS };

    const controllers = new WeakMap();
    let lastSpeed = 1.0;

    class VideoController {
        constructor(video) {
            this.video = video;
            this.host = null;
            this.shadow = null;
            this.overlay = null;
            this.isVisible = !settings.startHidden;
            this.positionOffset = { x: 20, y: 20 };

            this.isDragging = false;
            this.dragStartX = 0;
            this.dragStartY = 0;
            this.dragStartLeft = 0;
            this.dragStartTop = 0;

            // Bind methods once
            this.handleDragStart = this.handleDragStart.bind(this);
            this.handleDragMove = this.handleDragMove.bind(this);
            this.handleDragEnd = this.handleDragEnd.bind(this);
            this.updatePosition = this.updatePosition.bind(this);

            this.init();
        }

        async init() {
            if (!chrome.runtime?.id) return;

            if (lastSpeed !== 1.0 && lastSpeed !== this.video.playbackRate) {
                this.video.playbackRate = lastSpeed;
            }

            try {
                const savedPos = await chrome.storage.local.get(['positionOffset']);
                if (savedPos.positionOffset) {
                    this.positionOffset = savedPos.positionOffset;
                }
            } catch (e) {
                // Context invalidated or storage error
                return;
            }

            this.createDOM();
            this.attachListeners();
            this.updateSpeedDisplay();
            this.updatePosition();
        }

        createDOM() {
            this.host = document.createElement('div');
            this.host.className = 'playback-extension-host';
            Object.assign(this.host.style, {
                position: 'absolute',
                zIndex: '2147483647',
                top: '0',
                left: '0',
                width: '0',
                height: '0',
                pointerEvents: 'none'
            });

            this.shadow = this.host.attachShadow({ mode: 'open' });

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('style.css');
            this.shadow.appendChild(link);

            this.overlay = document.createElement('div');
            this.overlay.className = 'playback-speed-controller';
            if (!this.isVisible) this.overlay.classList.add('playback-hidden');
            this.overlay.style.pointerEvents = 'auto';

            const label = document.createElement('span');
            label.className = 'playback-speed-label';
            label.innerText = 'Speed';

            const value = document.createElement('span');
            value.className = 'playback-speed-value';
            value.innerText = this.video.playbackRate.toFixed(2);

            this.overlay.appendChild(label);
            this.overlay.appendChild(value);
            this.shadow.appendChild(this.overlay);

            this.attachToParent();
        }

        attachToParent() {
            const parent = this.video.parentElement || document.body;
            if (parent) {
                parent.appendChild(this.host);
            }
        }

        attachListeners() {
            this.video.addEventListener('ratechange', () => {
                this.updateSpeedDisplay();
                if (this.video.playbackRate !== lastSpeed) {
                    lastSpeed = this.video.playbackRate;
                    chrome.storage.local.set({ lastSpeed });
                }
            });

            this.video.addEventListener('play', () => {
                if (this.video.playbackRate !== lastSpeed) {
                    this.video.playbackRate = lastSpeed;
                }
                this.updateSpeedDisplay();
            });

            // Drag events - already bound in constructor
            this.overlay.addEventListener('mousedown', this.handleDragStart);
            document.addEventListener('mousemove', this.handleDragMove);
            document.addEventListener('mouseup', this.handleDragEnd);

            this.repositionInterval = setInterval(this.updatePosition, 200);
        }

        handleDragStart(e) {
            if (e.button !== 0) return;
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;

            this.dragStartLeft = parseFloat(this.overlay.style.left) || 0;
            this.dragStartTop = parseFloat(this.overlay.style.top) || 0;

            this.overlay.style.transition = 'none';
            e.preventDefault();
            e.stopPropagation();
        }

        handleDragMove(e) {
            if (!this.isDragging) return;

            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;

            this.overlay.style.left = `${this.dragStartLeft + dx}px`;
            this.overlay.style.top = `${this.dragStartTop + dy}px`;

            e.stopPropagation();
        }

        handleDragEnd(e) {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.overlay.style.transition = '';

            const videoRect = this.video.getBoundingClientRect();
            const overlayRect = this.overlay.getBoundingClientRect();

            const anchorX = videoRect.left;
            const anchorY = videoRect.bottom;

            const offsetX = overlayRect.left - anchorX;
            const offsetY = anchorY - overlayRect.top;

            this.positionOffset = { x: offsetX, y: offsetY };
            chrome.storage.local.set({ positionOffset: this.positionOffset });

            this.updatePosition();
            e.stopPropagation();
        }

        updateSpeedDisplay() {
            this.overlay.querySelector('.playback-speed-value').innerText = this.video.playbackRate.toFixed(2);
        }

        updatePosition() {
            // Self-destruct if extension context is invalidated (orphaned script)
            if (!chrome.runtime?.id) {
                this.destroy();
                return;
            }

            if (this.isDragging || !this.video) return;

            const videoRect = this.video.getBoundingClientRect();
            if (videoRect.width === 0) return;

            // Host is appended to parent, check if parent is valid
            if (!this.host.parentElement) {
                this.attachToParent();
                if (!this.host.parentElement) return;
            }

            const parentRect = this.host.parentElement.getBoundingClientRect();

            const targetScreenTop = videoRect.bottom - this.positionOffset.y;
            const targetScreenLeft = videoRect.left + this.positionOffset.x;

            const relTop = targetScreenTop - parentRect.top;
            const relLeft = targetScreenLeft - parentRect.left;

            this.overlay.style.top = `${relTop}px`;
            this.overlay.style.left = `${relLeft}px`;
        }

        toggleVisibility() {
            this.isVisible = !this.isVisible;
            if (this.isVisible) this.overlay.classList.remove('playback-hidden');
            else this.overlay.classList.add('playback-hidden');
        }

        destroy() {
            clearInterval(this.repositionInterval);
            if (this.host && this.host.parentNode) {
                this.host.parentNode.removeChild(this.host);
            }
            // Remove listeners
            this.overlay.removeEventListener('mousedown', this.handleDragStart);
            document.removeEventListener('mousemove', this.handleDragMove);
            document.removeEventListener('mouseup', this.handleDragEnd);
        }
    }

    // --- Main Logic ---

    function init() {
        chrome.storage.sync.get(DEFAULTS, (items) => {
            settings = items;
            observeDOM();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync') {
                for (let key in changes) settings[key] = changes[key].newValue;
            }
        });

        document.addEventListener('keydown', handleGlobalKey, true);

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "reset_position") {
                resetActiveControllerPosition();
            }
        });
    }

    function resetActiveControllerPosition() {
        const videos = Array.from(document.querySelectorAll('video, audio'));
        const bestVideo = videos.sort((a, b) => {
            const aPlaying = !a.paused;
            const bPlaying = !b.paused;
            if (aPlaying && !bPlaying) return -1;
            if (!aPlaying && bPlaying) return 1;
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return (rectB.width * rectB.height) - (rectA.width * rectA.height);
        })[0];

        if (!bestVideo) return;
        const controller = controllers.get(bestVideo);
        if (controller) {
            const videoRect = bestVideo.getBoundingClientRect();
            controller.positionOffset = { x: 20, y: videoRect.height - 20 };
            chrome.storage.local.set({ positionOffset: controller.positionOffset });
            controller.updatePosition();
        }
    }

    function observeDOM() {
        document.querySelectorAll('video, audio').forEach(bindController);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
                        bindController(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('video, audio').forEach(bindController);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function bindController(video) {
        if (controllers.has(video)) return;
        const controller = new VideoController(video);
        controllers.set(video, controller);
    }

    function handleGlobalKey(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT', 'CONTENTEDITABLE'].includes(e.target.tagName) || e.target.isContentEditable) {
            return;
        }

        const key = e.code;
        const bindings = settings.keyBindings;
        let action = null;
        for (const [act, binding] of Object.entries(bindings)) {
            if (binding === key) {
                action = act;
                break;
            }
        }
        if (!action) return;

        const videos = Array.from(document.querySelectorAll('video, audio'));
        const bestVideo = videos.sort((a, b) => {
            const aPlaying = !a.paused;
            const bPlaying = !b.paused;
            if (aPlaying && !bPlaying) return -1;
            if (!aPlaying && bPlaying) return 1;
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return (rectB.width * rectB.height) - (rectA.width * rectA.height);
        })[0];

        if (!bestVideo) return;

        const controller = controllers.get(bestVideo);
        if (!controller) return;

        let showFeedback = true;

        switch (action) {
            case 'decreaseSpeed':
                bestVideo.playbackRate = Math.max(0.1, bestVideo.playbackRate - settings.speedStep);
                break;
            case 'increaseSpeed':
                bestVideo.playbackRate = Math.min(16, bestVideo.playbackRate + settings.speedStep);
                break;
            case 'resetSpeed':
                bestVideo.playbackRate = 1.0;
                break;
            case 'rewind':
                bestVideo.currentTime -= settings.seekInterval;
                showFeedback = false;
                break;
            case 'advance':
                bestVideo.currentTime += settings.seekInterval;
                showFeedback = false;
                break;
            case 'toggleVisibility':
                controller.toggleVisibility();
                showFeedback = false;
                break;
        }

        if (showFeedback) {
            controller.updateSpeedDisplay();
        }
    }

    init();

})();
