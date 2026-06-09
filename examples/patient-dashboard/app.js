(function() {
  'use strict';

  var patients = [
    {
      id: 'p1',
      name: 'Mia Chen',
      procedure: 'Appendectomy',
      vitals: { hr: '82 bpm', bp: '118/76', spo2: '98%', temp: '36.8°C' },
      recommendations: [
        'Monitor abdominal tenderness hourly.',
        'Maintain IV fluids and reassess pain control.',
        'Encourage deep breathing and early mobilization.',
      ],
      xrayUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 'p2',
      name: 'Noah Silva',
      procedure: 'Chest tube placement',
      vitals: { hr: '90 bpm', bp: '124/80', spo2: '95%', temp: '37.1°C' },
      recommendations: [
        'Evaluate drainage output every 4 hours.',
        'Check tube position and seal for leaks.',
        'Advance oxygen weaning as tolerated.',
      ],
      xrayUrl: 'https://images.unsplash.com/photo-1580281657521-7f22c1c4954f?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 'p3',
      name: 'Lina Patel',
      procedure: 'Hip replacement',
      vitals: { hr: '78 bpm', bp: '112/72', spo2: '99%', temp: '36.6°C' },
      recommendations: [
        'Continue anticoagulation protocol.',
        'Perform neurovascular checks per limb.',
        'Encourage assisted weight-bearing today.',
      ],
      xrayUrl: 'https://images.unsplash.com/photo-1585155772512-127c287f0b5d?auto=format&fit=crop&w=900&q=80',
    },
  ];

  var state = {
    currentPatient: null,
    viewer: { scale: 1, x: 0, y: 0 },
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
      state.previousScreen = state.currentScreen;
    }
    Object.values(screens).forEach(function(screen) { screen.classList.add('hidden'); });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
      onScreenEnter(screenId);
      focusFirst(screens[screenId]);
    }
  }

  function navigateBack() {
    if (state.currentScreen === 'detail') {
      navigateTo('home', { addToHistory: false });
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
    if (!focusables.length) return;
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
    var scrollParent = focusables[nextIndex].closest('.content, .patient-grid, .viewer-controls');
    if (scrollParent) {
      focusables[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function renderPatientList() {
    var list = document.getElementById('patient-list');
    if (!list) return;
    list.innerHTML = '';
    patients.forEach(function(patient) {
      var card = document.createElement('div');
      card.className = 'patient-card';

      var title = document.createElement('div');
      title.className = 'patient-card-title';
      title.textContent = patient.name;
      card.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'patient-meta';
      meta.textContent = patient.procedure;
      card.appendChild(meta);

      var button = document.createElement('button');
      button.className = 'nav-item focusable primary';
      button.dataset.action = 'view-patient';
      button.dataset.patientId = patient.id;
      button.type = 'button';
      button.textContent = 'View X-ray';
      card.appendChild(button);

      list.appendChild(card);
    });
  }

  function populateDetail(patient) {
    state.currentPatient = patient;
    state.viewer = { scale: 1, x: 0, y: 0 };

    document.getElementById('detail-name').textContent = patient.name;
    document.getElementById('detail-procedure').textContent = patient.procedure;
    document.getElementById('vital-hr').textContent = patient.vitals.hr;
    document.getElementById('vital-bp').textContent = patient.vitals.bp;
    document.getElementById('vital-spo2').textContent = patient.vitals.spo2;
    document.getElementById('vital-temp').textContent = patient.vitals.temp;

    var recommendations = document.getElementById('ai-recommendations');
    recommendations.innerHTML = '';
    patient.recommendations.forEach(function(text) {
      var chip = document.createElement('div');
      chip.className = 'recommendation-chip';
      chip.textContent = text;
      recommendations.appendChild(chip);
    });

    var image = document.getElementById('xray-image');
    image.src = patient.xrayUrl;
    image.alt = patient.name + ' X-ray';
    updateViewer();
  }

  function updateViewer() {
    var image = document.getElementById('xray-image');
    if (!image) return;
    image.style.transform = 'translate(' + state.viewer.x + 'px, ' + state.viewer.y + 'px) scale(' + state.viewer.scale + ')';
  }

  function zoom(delta) {
    state.viewer.scale = Math.max(0.7, Math.min(2.5, state.viewer.scale + delta));
    updateViewer();
  }

  function pan(dx, dy) {
    state.viewer.x += dx;
    state.viewer.y += dy;
    updateViewer();
  }

  function resetView() {
    state.viewer = { scale: 1, x: 0, y: 0 };
    updateViewer();
  }

  function handleAction(action, element) {
    switch (action) {
      case 'view-patient':
        var patientId = element.dataset.patientId;
        var patient = patients.find(function(item) { return item.id === patientId; });
        if (patient) {
          populateDetail(patient);
          navigateTo('detail', { addToHistory: false });
        }
        break;
      case 'back':
        navigateBack();
        break;
      case 'zoom-in':
        zoom(0.2);
        break;
      case 'zoom-out':
        zoom(-0.2);
        break;
      case 'pan-left':
        pan(-18, 0);
        break;
      case 'pan-right':
        pan(18, 0);
        break;
      case 'pan-up':
        pan(0, -18);
        break;
      case 'pan-down':
        pan(0, 18);
        break;
      case 'reset-view':
        resetView();
        break;
      default:
        break;
    }
  }

  function onScreenEnter(screenId) {
    if (screenId === 'home') {
      renderPatientList();
    }
  }

  function setupEvents() {
    document.addEventListener('click', function(event) {
      var actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      handleAction(actionEl.dataset.action, actionEl);
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
    onScreenEnter('home');
    navigateTo('home', { addToHistory: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
