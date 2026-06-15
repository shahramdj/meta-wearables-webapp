(function() {
  'use strict';

  var CONFIG = {
    gestureDefinitions: [
      { id: 'swipe-up', label: 'Swipe Up', aliases: ['swipe-up', 'swipeup', 'up', 'arrowup'] },
      { id: 'swipe-down', label: 'Swipe Down', aliases: ['swipe-down', 'swipedown', 'down', 'arrowdown'] },
      { id: 'swipe-left', label: 'Swipe Left', aliases: ['swipe-left', 'swipeleft', 'left', 'arrowleft'] },
      { id: 'swipe-right', label: 'Swipe Right', aliases: ['swipe-right', 'swiperight', 'right', 'arrowright'] },
      { id: 'tap', label: 'Tap', aliases: ['tap', 'select', 'enter'] },
      { id: 'double-tap', label: 'Double Tap', aliases: ['double-tap', 'doubletap', 'double_tap', 'space'] },
      { id: 'pinch-open', label: 'Pinch Open', aliases: ['pinch-open', 'pinchopen', 'spread', 'zoom-in', 'zoomin'] },
      { id: 'pinch-close', label: 'Pinch Close', aliases: ['pinch-close', 'pinchclose', 'pinch', 'zoom-out', 'zoomout'] },
      { id: 'hold', label: 'Hold', aliases: ['hold', 'longpress', 'long-press'] },
      { id: 'release', label: 'Release', aliases: ['release'] },
    ],
    inputEventNames: ['neurabandgesture', 'neurobandgesture', 'emggesture', 'gesturecontrol'],
    maxLogItems: 8,
    cardFlashMs: 380,
  };

  var state = {
    listening: false,
    totalEvents: 0,
    counters: {},
    flashTimers: {},
    aliasToId: {},
  };

  var dom = {
    grid: null,
    status: null,
    totalEvents: null,
    lastGesture: null,
    eventLog: null,
  };

  function normalize(value) {
    return String(value || '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  }

  function buildLookup() {
    CONFIG.gestureDefinitions.forEach(function(gesture) {
      state.counters[gesture.id] = 0;
      gesture.aliases.forEach(function(alias) {
        state.aliasToId[normalize(alias)] = gesture.id;
      });
    });
  }

  function collectDom() {
    dom.grid = document.getElementById('gesture-grid');
    dom.status = document.getElementById('status-indicator');
    dom.totalEvents = document.getElementById('total-events');
    dom.lastGesture = document.getElementById('last-gesture');
    dom.eventLog = document.getElementById('event-log');
  }

  function renderGestureCards() {
    dom.grid.innerHTML = '';
    CONFIG.gestureDefinitions.forEach(function(gesture) {
      var card = document.createElement('div');
      card.className = 'gesture-card';
      card.id = 'gesture-card-' + gesture.id;

      var name = document.createElement('div');
      name.className = 'gesture-name';
      name.textContent = gesture.label;

      var count = document.createElement('div');
      count.className = 'gesture-count';
      count.id = 'gesture-count-' + gesture.id;
      count.textContent = '0';

      card.appendChild(name);
      card.appendChild(count);
      dom.grid.appendChild(card);
    });
  }

  function updateStatus() {
    dom.status.textContent = state.listening ? 'Listening' : 'Stopped';
    dom.status.style.color = state.listening ? '#57f2a0' : '#afb6c8';
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function addLogLine(text) {
    var item = document.createElement('div');
    item.className = 'log-item';
    item.textContent = '[' + formatTime(new Date()) + '] ' + text;

    dom.eventLog.prepend(item);
    while (dom.eventLog.children.length > CONFIG.maxLogItems) {
      dom.eventLog.removeChild(dom.eventLog.lastElementChild);
    }
  }

  function activateCard(gestureId) {
    var card = document.getElementById('gesture-card-' + gestureId);
    if (!card) return;

    card.classList.add('active');
    if (state.flashTimers[gestureId]) {
      clearTimeout(state.flashTimers[gestureId]);
    }

    state.flashTimers[gestureId] = setTimeout(function() {
      card.classList.remove('active');
    }, CONFIG.cardFlashMs);
  }

  function onGestureDetected(gestureId, source) {
    if (!state.listening || !state.counters[gestureId] && state.counters[gestureId] !== 0) return;

    state.totalEvents += 1;
    state.counters[gestureId] += 1;

    var countEl = document.getElementById('gesture-count-' + gestureId);
    if (countEl) countEl.textContent = String(state.counters[gestureId]);

    dom.totalEvents.textContent = String(state.totalEvents);
    dom.lastGesture.textContent = gestureId;
    activateCard(gestureId);
    addLogLine(gestureId + ' from ' + source);
  }

  function parseGestureName(event) {
    var detail = event.detail || {};
    var raw = detail.gesture || detail.name || detail.type || detail.action || event.gesture || event.name || '';
    var normalized = normalize(raw);

    if (state.aliasToId[normalized]) {
      return state.aliasToId[normalized];
    }

    // Some payloads send names with separators already collapsed.
    var collapsed = normalized.replace(/-/g, '');
    return state.aliasToId[collapsed] || null;
  }

  function onGestureEvent(event) {
    var gestureId = parseGestureName(event);
    if (!gestureId) {
      addLogLine('Unknown gesture payload on ' + event.type);
      return;
    }
    onGestureDetected(gestureId, event.type);
  }

  function startListening() {
    if (state.listening) return;
    state.listening = true;
    CONFIG.inputEventNames.forEach(function(name) {
      window.addEventListener(name, onGestureEvent);
    });
    updateStatus();
    addLogLine('Gesture listeners started');
  }

  function stopListening() {
    if (!state.listening) return;
    state.listening = false;
    CONFIG.inputEventNames.forEach(function(name) {
      window.removeEventListener(name, onGestureEvent);
    });
    updateStatus();
    addLogLine('Gesture listeners stopped');
  }

  function resetDemo() {
    state.totalEvents = 0;
    dom.totalEvents.textContent = '0';
    dom.lastGesture.textContent = 'None';
    dom.eventLog.innerHTML = '';

    Object.keys(state.counters).forEach(function(gestureId) {
      state.counters[gestureId] = 0;
      var countEl = document.getElementById('gesture-count-' + gestureId);
      if (countEl) countEl.textContent = '0';

      var card = document.getElementById('gesture-card-' + gestureId);
      if (card) card.classList.remove('active');
    });

    addLogLine('Counters reset');
  }

  function moveFocus(direction) {
    var focusables = Array.from(document.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
    if (!focusables.length) return;

    var current = document.activeElement;
    var index = focusables.indexOf(current);
    if (index === -1) {
      focusables[0].focus();
      return;
    }

    var nextIndex;
    if (direction === 'up' || direction === 'left') {
      nextIndex = index > 0 ? index - 1 : focusables.length - 1;
    } else {
      nextIndex = index < focusables.length - 1 ? index + 1 : 0;
    }

    focusables[nextIndex].focus();
    focusables[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function mapKeyToGesture(key) {
    switch (key) {
      case 'ArrowUp': return 'swipe-up';
      case 'ArrowDown': return 'swipe-down';
      case 'ArrowLeft': return 'swipe-left';
      case 'ArrowRight': return 'swipe-right';
      case 'Enter': return 'tap';
      case ' ': return 'double-tap';
      case 'z':
      case 'Z':
        return 'pinch-open';
      case 'x':
      case 'X':
        return 'pinch-close';
      case 'h':
      case 'H':
        return 'hold';
      case 'r':
      case 'R':
        return 'release';
      default:
        return null;
    }
  }

  function handleAction(action) {
    switch (action) {
      case 'start':
        startListening();
        break;
      case 'stop':
        stopListening();
        break;
      case 'reset':
        resetDemo();
        break;
      default:
        break;
    }
  }

  function setupEvents() {
    document.addEventListener('click', function(event) {
      var actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      handleAction(actionEl.dataset.action);
    });

    document.addEventListener('keydown', function(event) {
      var key = event.key;

      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        moveFocus(key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : key === 'ArrowLeft' ? 'left' : 'right');
      }

      if (key === 'Enter') {
        var active = document.activeElement;
        if (active && active.classList.contains('focusable')) {
          active.click();
        }
      }

      var mappedGesture = mapKeyToGesture(key);
      if (mappedGesture) {
        onGestureDetected(mappedGesture, 'keyboard');
      }

      if (mappedGesture || key === 'Enter' || key.indexOf('Arrow') === 0) {
        event.preventDefault();
      }
    });
  }

  function init() {
    buildLookup();
    collectDom();
    renderGestureCards();
    setupEvents();
    updateStatus();
    addLogLine('Ready. Press Start to listen for gesture events.');
    var first = document.querySelector('.focusable');
    if (first) first.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
