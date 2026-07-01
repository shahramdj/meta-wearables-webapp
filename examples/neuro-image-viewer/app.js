(function() {
  'use strict';

  var SAMPLE_IMAGE =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a3a5f"/><stop offset="1" stop-color="#56a3c9"/></linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      '<g opacity="0.22" fill="#fff"><circle cx="180" cy="130" r="120"/><circle cx="840" cy="620" r="180"/><rect x="380" y="180" width="420" height="240" rx="24"/></g>' +
      '<text x="52" y="90" font-family="Arial" font-size="58" fill="#ffffff">Meta Neuro Viewer</text>' +
      '<text x="54" y="148" font-family="Arial" font-size="28" fill="#e8f7ff">Pinch + rotate zoom, pinch + move pan, double-pinch + rotate rotate</text>' +
      '</svg>'
    );

  var state = {
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
  };

  var gesture = {
    active: false,
    mode: 'zoom-pan',
    startDistance: 0,
    startAngle: 0,
    startCenter: { x: 0, y: 0 },
    startState: { scale: 1, x: 0, y: 0, rotation: 0 },
    lastPinchStartAt: 0,
    lastToastAt: 0,
  };

  var pointers = new Map();

  var LIMITS = {
    scaleMin: 0.4,
    scaleMax: 5,
    panMax: 420,
    doublePinchMs: 380,
    holdPinchThreshold: 0.2,
    zoomSensitivityPerDegree: 0.015,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeAngleDelta(delta) {
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function setStatus(text) {
    var status = document.getElementById('status');
    if (status) status.textContent = text;
  }

  function setHint(text) {
    var hint = document.getElementById('hint');
    if (hint) hint.textContent = text;
  }

  function showToast(text) {
    var old = document.getElementById('gesture-toast');
    if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }

    var toast = document.createElement('div');
    toast.id = 'gesture-toast';
    toast.textContent = text;
    toast.style.position = 'fixed';
    toast.style.left = '50%';
    toast.style.bottom = '18px';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '9px 14px';
    toast.style.borderRadius = '10px';
    toast.style.background = 'rgba(10, 12, 16, 0.88)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    toast.style.color = '#ffffff';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.zIndex = '9999';
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);

    window.setTimeout(function() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 850);
  }

  function applyTransform() {
    var image = document.getElementById('viewer-image');
    if (!image) return;

    state.x = clamp(state.x, -LIMITS.panMax, LIMITS.panMax);
    state.y = clamp(state.y, -LIMITS.panMax, LIMITS.panMax);
    state.scale = clamp(state.scale, LIMITS.scaleMin, LIMITS.scaleMax);

    image.style.transform =
      'translate(' + state.x + 'px, ' + state.y + 'px) rotate(' + state.rotation + 'deg) scale(' + state.scale + ')';
  }

  var viewer = {
    zoom: function(delta) {
      var amount = Number(delta) || 0;
      state.scale = clamp(state.scale + amount, LIMITS.scaleMin, LIMITS.scaleMax);
      applyTransform();
      setStatus('Zoom ' + state.scale.toFixed(2) + 'x');
      return viewer.getState();
    },

    pan: function(dx, dy) {
      state.x += Number(dx) || 0;
      state.y += Number(dy) || 0;
      applyTransform();
      setStatus('Pan x:' + Math.round(state.x) + ' y:' + Math.round(state.y));
      return viewer.getState();
    },

    rotate: function(angle) {
      state.rotation += Number(angle) || 0;
      applyTransform();
      setStatus('Rotate ' + Math.round(state.rotation) + 'deg');
      return viewer.getState();
    },

    reset: function() {
      state.scale = 1;
      state.x = 0;
      state.y = 0;
      state.rotation = 0;
      applyTransform();
      setStatus('Reset');
      return viewer.getState();
    },

    getState: function() {
      return {
        scale: state.scale,
        x: state.x,
        y: state.y,
        rotation: state.rotation,
      };
    },
  };

  function distance(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function angle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function center(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  function pointerPair() {
    var values = Array.from(pointers.values());
    if (values.length < 2) return null;
    return [values[0], values[1]];
  }

  function startGestureIfReady() {
    var pair = pointerPair();
    if (!pair) return;

    var now = Date.now();
    var isDoublePinch = now - gesture.lastPinchStartAt < LIMITS.doublePinchMs;

    gesture.active = true;
    gesture.mode = isDoublePinch ? 'rotate' : 'zoom-pan';
    gesture.startDistance = distance(pair[0], pair[1]);
    gesture.startAngle = angle(pair[0], pair[1]);
    gesture.startCenter = center(pair[0], pair[1]);
    gesture.startState = {
      scale: state.scale,
      x: state.x,
      y: state.y,
      rotation: state.rotation,
    };
    gesture.lastPinchStartAt = now;

    if (now - gesture.lastToastAt > 600) {
      showToast(isDoublePinch ? 'Double pinch detected' : 'Pinch detected');
      gesture.lastToastAt = now;
    }

    if (gesture.mode === 'rotate') {
      setHint('Double pinch detected: rotate hand to rotate image.');
      setStatus('Rotate mode');
    } else {
      setHint('Pinch + rotate zooms. Pinch + move pans.');
      setStatus('Zoom/Pan mode');
    }
  }

  function updateGesture() {
    if (!gesture.active) return;
    var pair = pointerPair();
    if (!pair) return;

    var currentDistance = distance(pair[0], pair[1]);
    var currentAngle = angle(pair[0], pair[1]);
    var currentCenter = center(pair[0], pair[1]);

    var angleDeltaRad = normalizeAngleDelta(currentAngle - gesture.startAngle);
    var angleDeltaDeg = angleDeltaRad * (180 / Math.PI);

    if (gesture.mode === 'rotate') {
      state.rotation = gesture.startState.rotation + angleDeltaDeg;
      applyTransform();
      return;
    }

    var distanceRatio = gesture.startDistance > 0 ? currentDistance / gesture.startDistance : 1;
    var holdPinch = Math.abs(distanceRatio - 1) <= LIMITS.holdPinchThreshold;

    if (holdPinch) {
      state.scale = clamp(
        gesture.startState.scale * (1 + angleDeltaDeg * LIMITS.zoomSensitivityPerDegree),
        LIMITS.scaleMin,
        LIMITS.scaleMax
      );
    }

    state.x = gesture.startState.x + (currentCenter.x - gesture.startCenter.x);
    state.y = gesture.startState.y + (currentCenter.y - gesture.startCenter.y);

    applyTransform();
  }

  function endGesture() {
    gesture.active = false;
    setHint('Pinch + rotate to zoom. Pinch + move to pan. Double-pinch + rotate to rotate image.');
  }

  function onPointerDown(event) {
    var frame = document.getElementById('viewer-frame');
    if (!frame) return;

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    frame.setPointerCapture(event.pointerId);

    if (pointers.size === 2) {
      startGestureIfReady();
    }

    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      updateGesture();
      event.preventDefault();
    }
  }

  function onPointerUpOrCancel(event) {
    pointers.delete(event.pointerId);

    if (pointers.size < 2) {
      endGesture();
    } else {
      startGestureIfReady();
    }
  }

  function setupButtons() {
    document.addEventListener('click', function(event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;

      switch (target.dataset.action) {
        case 'zoom-in':
          viewer.zoom(0.12);
          break;
        case 'zoom-out':
          viewer.zoom(-0.12);
          break;
        case 'pan-left':
          viewer.pan(-18, 0);
          break;
        case 'pan-right':
          viewer.pan(18, 0);
          break;
        case 'pan-up':
          viewer.pan(0, -18);
          break;
        case 'pan-down':
          viewer.pan(0, 18);
          break;
        case 'rotate-left':
          viewer.rotate(-6);
          break;
        case 'rotate-right':
          viewer.rotate(6);
          break;
        case 'reset':
          viewer.reset();
          break;
        default:
          break;
      }
    });
  }

  function setupKeyboard() {
    document.addEventListener('keydown', function(event) {
      switch (event.key) {
        case '+':
        case '=':
          viewer.zoom(0.12);
          event.preventDefault();
          break;
        case '-':
          viewer.zoom(-0.12);
          event.preventDefault();
          break;
        case 'ArrowLeft':
          viewer.pan(-16, 0);
          event.preventDefault();
          break;
        case 'ArrowRight':
          viewer.pan(16, 0);
          event.preventDefault();
          break;
        case 'ArrowUp':
          viewer.pan(0, -16);
          event.preventDefault();
          break;
        case 'ArrowDown':
          viewer.pan(0, 16);
          event.preventDefault();
          break;
        case 'q':
        case 'Q':
          viewer.rotate(-5);
          event.preventDefault();
          break;
        case 'e':
        case 'E':
          viewer.rotate(5);
          event.preventDefault();
          break;
        case 'r':
        case 'R':
          viewer.reset();
          event.preventDefault();
          break;
        default:
          break;
      }
    });
  }

  function init() {
    var frame = document.getElementById('viewer-frame');
    var image = document.getElementById('viewer-image');
    if (!frame || !image) return;

    // Best-effort only: this asks the browser to route gestures to the app.
    // OS-level reserved gestures may still override behavior depending on platform.
    frame.style.touchAction = 'none';

    image.src = SAMPLE_IMAGE;

    frame.addEventListener('pointerdown', onPointerDown, { passive: false });
    frame.addEventListener('pointermove', onPointerMove, { passive: false });
    frame.addEventListener('pointerup', onPointerUpOrCancel, { passive: false });
    frame.addEventListener('pointercancel', onPointerUpOrCancel, { passive: false });
    frame.addEventListener('pointerleave', onPointerUpOrCancel, { passive: false });

    setupButtons();
    setupKeyboard();

    window.viewer = viewer;
    applyTransform();
    setStatus('Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
