(function() {
  'use strict';

  var CONFIG = {
    appName: 'Level Tool',
    storageKey: 'mdg_level_tool_state',
  };

  var state = {
    currentScreen: 'home',
    screenHistory: [],
    isRunning: false,
    demoMode: false,
    orientationAvailable: false,
    currentPitch: 0,
    currentRoll: 0,
    rawPitch: 0,
    rawRoll: 0,
    calibration: { pitch: 0, roll: 0 },
    demoTimer: null,
    orientationHandler: null,
  };

  var screens = {};

  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function(screen) {
      if (screen.id) screens[screen.id] = screen;
    });
  }

  function navigateTo(screenId, options) {
    options = options || {};
    if (options.addToHistory !== false && state.currentScreen) {
      state.screenHistory.push(state.currentScreen);
    }
    Object.values(screens).forEach(function(screen) {
      screen.classList.add('hidden');
    });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
      onScreenEnter(screenId);
      focusFirst(screens[screenId]);
    }
  }

  function navigateBack() {
    if (state.screenHistory.length > 0) {
      navigateTo(state.screenHistory.pop(), { addToHistory: false });
    }
  }

  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }

  function moveFocus(direction) {
    var container = screens[state.currentScreen];
    if (!container) return;
    var focusables = Array.from(container.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
    if (focusables.length === 0) return;
    var current = document.activeElement;
    var index = focusables.indexOf(current);
    if (index === -1) {
      focusFirst(container);
      return;
    }
    var nextIndex;
    if (direction === 'up' || direction === 'left') {
      nextIndex = index > 0 ? index - 1 : focusables.length - 1;
    } else {
      nextIndex = index < focusables.length - 1 ? index + 1 : 0;
    }
    focusables[nextIndex].focus();
    var scrollParent = focusables[nextIndex].closest('.content, .list-container');
    if (scrollParent) {
      focusables[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function loadData() {
    try {
      var saved = localStorage.getItem(CONFIG.storageKey);
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && parsed.calibration) {
          state.calibration = parsed.calibration;
        }
      }
    } catch (error) {
      console.warn('Unable to load saved state', error);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({ calibration: state.calibration }));
    } catch (error) {
      console.warn('Unable to save state', error);
    }
  }

  function updateStatus() {
    var status = document.getElementById('status-indicator');
    if (!status) return;
    if (state.isRunning) {
      status.textContent = state.demoMode ? 'Demo running' : 'Running';
      status.style.color = state.demoMode ? '#ffd54f' : '#00ff9d';
    } else {
      status.textContent = 'Stopped';
      status.style.color = '#a0a0b0';
    }
  }

  function renderLevel() {
    var pitch = state.rawPitch - state.calibration.pitch;
    var roll = state.rawRoll - state.calibration.roll;
    state.currentPitch = pitch;
    state.currentRoll = roll;

    var bubble = document.getElementById('bubble');
    var pitchValue = document.getElementById('pitch-value');
    var rollValue = document.getElementById('roll-value');

    if (!bubble || !pitchValue || !rollValue) return;

    var maxOffset = 110;
    var x = Math.max(-maxOffset, Math.min(maxOffset, (roll / 20) * maxOffset));
    var y = Math.max(-maxOffset, Math.min(maxOffset, (pitch / 20) * maxOffset));
    bubble.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

    var tiltAmount = Math.max(Math.abs(pitch), Math.abs(roll));
    var colorClass = tiltAmount < 2 ? 'green' : tiltAmount < 10 ? 'yellow' : 'red';
    bubble.className = 'bubble ' + colorClass;

    pitchValue.textContent = pitch.toFixed(1) + '°';
    rollValue.textContent = roll.toFixed(1) + '°';
    updateStatus();
  }

  function showToast(message, type) {
    var toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast ' + (type || '');
    toast.style.opacity = '1';
    clearTimeout(toast.hideTimer);
    toast.hideTimer = setTimeout(function() {
      toast.style.opacity = '0';
    }, 2200);
  }

  function enableDemoMode() {
    if (state.demoTimer) return;
    state.demoMode = true;
    state.orientationAvailable = false;
    state.rawPitch = 0;
    state.rawRoll = 0;

    var start = Date.now();
    state.demoTimer = setInterval(function() {
      var t = (Date.now() - start) / 2000;
      state.rawPitch = Math.sin(t * 1.1) * 8;
      state.rawRoll = Math.cos(t * 0.9) * 6;
      renderLevel();
    }, 100);
    showToast('Demo mode active', 'warning');
    updateStatus();
  }

  function stopDemoMode() {
    if (state.demoTimer) {
      clearInterval(state.demoTimer);
      state.demoTimer = null;
    }
    state.demoMode = false;
  }

  function handleOrientationEvent(event) {
    if (event.beta == null || event.gamma == null) return;
    state.orientationAvailable = true;
    state.rawPitch = event.beta;
    state.rawRoll = event.gamma;
    renderLevel();
  }

  function startSensors() {
    if (state.isRunning) return;
    state.isRunning = true;
    state.demoMode = false;

    function subscribe() {
      if (state.orientationHandler) {
        window.removeEventListener('deviceorientation', state.orientationHandler);
      }
      state.orientationHandler = handleOrientationEvent;
      window.addEventListener('deviceorientation', state.orientationHandler);
      updateStatus();
      showToast('Sensors started', 'success');
    }

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function(permissionState) {
        if (permissionState === 'granted') {
          subscribe();
        } else {
          enableDemoMode();
        }
      }).catch(function() {
        enableDemoMode();
      });
    } else if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      subscribe();
    } else {
      enableDemoMode();
    }
  }

  function stopSensors() {
    if (!state.isRunning) return;
    state.isRunning = false;
    if (state.orientationHandler) {
      window.removeEventListener('deviceorientation', state.orientationHandler);
      state.orientationHandler = null;
    }
    stopDemoMode();
    updateStatus();
    showToast('Stopped', 'info');
  }

  function calibrate() {
    state.calibration.pitch = state.rawPitch;
    state.calibration.roll = state.rawRoll;
    saveData();
    renderLevel();
    showToast('Calibrated', 'success');
  }

  function handleAction(action) {
    switch (action) {
      case 'start':
        startSensors();
        break;
      case 'stop':
        stopSensors();
        break;
      case 'calibrate':
        calibrate();
        break;
      case 'back':
        navigateBack();
        break;
      default:
        break;
    }
  }

  function onScreenEnter(screenId) {
    if (screenId === 'home') {
      renderLevel();
    }
  }

  function setupEvents() {
    document.addEventListener('click', function(event) {
      var actionEl = event.target.closest('[data-action]');
      if (actionEl) {
        handleAction(actionEl.dataset.action);
      }
    });

    document.addEventListener('keydown', function(event) {
      var active = document.activeElement;
      var isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      if (isInput && !['Escape', 'Enter'].includes(event.key)) return;

      switch (event.key) {
        case 'ArrowUp':
          moveFocus('up');
          event.preventDefault();
          break;
        case 'ArrowDown':
          moveFocus('down');
          event.preventDefault();
          break;
        case 'ArrowLeft':
          moveFocus('left');
          event.preventDefault();
          break;
        case 'ArrowRight':
          moveFocus('right');
          event.preventDefault();
          break;
        case 'Enter':
          if (isInput) return;
          if (active && active.classList.contains('focusable')) {
            active.click();
          }
          event.preventDefault();
          break;
        case 'Escape':
          navigateBack();
          event.preventDefault();
          break;
      }
    });
  }

  function init() {
    collectScreens();
    setupEvents();
    loadData();
    renderLevel();
    setTimeout(function() {
      navigateTo('home', { addToHistory: false });
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
