(function() {
  'use strict';

  var CONFIG_STORAGE_KEY = 'mdg_patient_dashboard_config_v1';

  var DEFAULT_CONFIG = {
    fhirBaseUrl: 'http://192.168.40.24:8081/fhir',
    patientIds: ['pat-001', 'pat-002', 'pat-003', 'pat-004', 'pat-005'],
  };

  var RUNTIME_CONFIG = window.PATIENT_DASHBOARD_CONFIG || {};

  function sanitizePatientIds(value) {
    if (Array.isArray(value)) {
      return value.map(function(id) { return String(id).trim(); }).filter(Boolean);
    }

    return String(value || '')
      .split(/[\n,]/)
      .map(function(id) { return id.trim(); })
      .filter(Boolean);
  }

  function buildConfig(source) {
    var patientIds = sanitizePatientIds(source && source.patientIds);
    return {
      fhirBaseUrl: source && source.fhirBaseUrl ? String(source.fhirBaseUrl).trim() : DEFAULT_CONFIG.fhirBaseUrl,
      patientIds: patientIds.length ? patientIds : DEFAULT_CONFIG.patientIds.slice(),
    };
  }

  function loadStoredConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function persistConfig(config) {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      console.warn('Could not persist endpoint config:', error);
    }
  }

  var CONFIG = buildConfig(Object.assign({}, RUNTIME_CONFIG, loadStoredConfig()));

  var FALLBACK_XRAY =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#121826"/><circle cx="256" cy="180" r="86" fill="#8b949f" opacity="0.55"/><ellipse cx="182" cy="290" rx="70" ry="118" fill="#8b949f" opacity="0.42"/><ellipse cx="330" cy="290" rx="70" ry="118" fill="#8b949f" opacity="0.42"/><text x="256" y="470" text-anchor="middle" font-family="Arial" font-size="26" fill="#d0d6df">Image unavailable</text></svg>');

  var state = {
    currentScreen: null,
    currentPatient: null,
    patients: [],
    contextCache: {},
    mediaCache: {},
    isLoading: false,
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
      return;
    }

    if (state.currentScreen === 'settings') {
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
    var scrollParent = focusables[nextIndex].closest('.content, .patient-grid, .viewer-controls, .nav-bar');
    if (scrollParent) {
      focusables[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function normalizeBaseUrl(url) {
    return String(url || '').replace(/\/$/, '');
  }

  function fhirUrl(path) {
    return normalizeBaseUrl(CONFIG.fhirBaseUrl) + path;
  }

  function setStatus(message) {
    var el = document.getElementById('home-meta');
    if (el) {
      el.textContent = message;
    }
  }

  function setLoading(loading, text) {
    state.isLoading = loading;
    var loadingEl = document.getElementById('loading');
    var textEl = loadingEl ? loadingEl.querySelector('.loading-text') : null;
    if (textEl && text) {
      textEl.textContent = text;
    }
    if (loadingEl) {
      loadingEl.classList.toggle('hidden', !loading);
    }
  }

  function setError(message) {
    var errorEl = document.getElementById('error');
    if (!errorEl) return;
    var msgEl = errorEl.querySelector('.error-message');
    if (msgEl) {
      msgEl.textContent = message;
    }
    errorEl.classList.remove('hidden');
  }

  function clearError() {
    var errorEl = document.getElementById('error');
    if (errorEl) {
      errorEl.classList.add('hidden');
    }
  }

  function requestJson(url) {
    return fetch(url).then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + url);
      }
      return response.json();
    });
  }

  function shortText(value) {
    if (value === undefined || value === null) return '--';
    var text = String(value);
    return text.length > 32 ? text.slice(0, 29) + '...' : text;
  }

  function getConfigInputs() {
    return {
      fhirBase: document.getElementById('config-fhir-base'),
      patientIds: document.getElementById('config-patient-ids'),
    };
  }

  function fillConfigForm(config) {
    var inputs = getConfigInputs();
    if (!inputs.fhirBase || !inputs.patientIds) return;
    inputs.fhirBase.value = config.fhirBaseUrl;
    inputs.patientIds.value = (config.patientIds || []).join(', ');
  }

  function readConfigForm() {
    var inputs = getConfigInputs();
    if (!inputs.fhirBase || !inputs.patientIds) {
      return buildConfig(CONFIG);
    }

    return buildConfig({
      fhirBaseUrl: inputs.fhirBase.value,
      patientIds: sanitizePatientIds(inputs.patientIds.value),
    });
  }

  function applyConfig(config, options) {
    options = options || {};
    CONFIG = buildConfig(config);

    if (options.persist) {
      persistConfig(CONFIG);
    }

    state.currentPatient = null;
    state.patients = [];
    state.contextCache = {};
    state.mediaCache = {};

    renderPatientList();
    setStatus('Endpoints updated');

    if (options.reload !== false) {
      navigateTo('home', { addToHistory: false });
      loadPatientSummaries();
    }
  }

  function firstValue(array, field) {
    if (!Array.isArray(array) || !array.length) return null;
    return array[0] && array[0][field];
  }

  function firstMap(values) {
    return Array.isArray(values) && values.length && values[0] ? values[0] : {};
  }

  function primaryName(patient) {
    var name = firstMap(patient && patient.name);
    var parts = [];
    var given = Array.isArray(name.given) ? name.given : [];

    given.forEach(function(value) {
      if (value) {
        parts.push(String(value));
      }
    });

    if (name.family) {
      parts.push(String(name.family));
    }

    return parts.length ? parts.join(' ') : null;
  }

  function calculateAge(birthDate) {
    if (!birthDate) return null;
    var now = new Date();
    var dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return null;
    var age = now.getFullYear() - dob.getFullYear();
    var monthDelta = now.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age;
  }

  function codeableConceptText(concept) {
    if (!concept || typeof concept !== 'object') return null;
    if (concept.text) return String(concept.text);
    var coding = Array.isArray(concept.coding) ? concept.coding : [];
    for (var i = 0; i < coding.length; i += 1) {
      if (coding[i] && (coding[i].display || coding[i].code)) {
        return String(coding[i].display || coding[i].code);
      }
    }
    return null;
  }

  function referenceDisplay(reference) {
    if (!reference || typeof reference !== 'object') return null;
    return reference.display || reference.reference || null;
  }

  function normalizePatientSummary(patient) {
    return {
      id: patient.id,
      demographics: {
        name: primaryName(patient),
        birthDate: patient.birthDate || null,
        gender: patient.gender || null,
      },
      age: calculateAge(patient.birthDate),
      sex: patient.gender || null,
    };
  }

  function normalizeProcedures(resources) {
    return resources.map(function(resource) {
      var period = resource && resource.performedPeriod ? resource.performedPeriod : {};
      return {
        id: resource.id,
        description: codeableConceptText(resource.code),
        status: resource.status || null,
        performed: resource.performedDateTime || period.start || null,
      };
    });
  }

  function normalizeAllergies(resources) {
    return resources.map(function(resource) {
      return {
        id: resource.id,
        substance: codeableConceptText(resource.code),
        clinicalStatus: codeableConceptText(resource.clinicalStatus),
      };
    });
  }

  function normalizeConditions(resources) {
    return resources.map(function(resource) {
      return {
        id: resource.id,
        description: codeableConceptText(resource.code),
        clinicalStatus: codeableConceptText(resource.clinicalStatus),
      };
    });
  }

  function normalizeMedications(resources) {
    return resources.map(function(resource) {
      return {
        id: resource.id,
        medication: codeableConceptText(resource.medicationCodeableConcept) || referenceDisplay(resource.medicationReference),
        status: resource.status || null,
      };
    });
  }

  function normalizeLabs(resources) {
    return resources.map(function(resource) {
      var quantity = resource && resource.valueQuantity ? resource.valueQuantity : {};
      return {
        id: resource.id,
        test: codeableConceptText(resource.code),
        value: quantity.value || resource.valueString || codeableConceptText(resource.valueCodeableConcept),
        unit: quantity.unit || null,
        issued: resource.effectiveDateTime || resource.issued || null,
      };
    });
  }

  function normalizeImaging(resources) {
    return resources.map(function(resource) {
      var series = firstMap(resource && resource.series);
      return {
        id: resource.id,
        description: resource.description || series.description || codeableConceptText(resource.procedureCode),
        status: resource.status || null,
        started: resource.started || null,
        modality: codeableConceptText(series.modality),
      };
    });
  }

  function fetchPatientSummary(patientId) {
    return requestJson(fhirUrl('/Patient/' + encodeURIComponent(patientId)))
      .then(normalizePatientSummary);
  }

  function loadPatientSummaries() {
    setLoading(true, 'Loading patient records...');
    clearError();
    setStatus('Loading...');

    var introCopy = document.getElementById('intro-copy');
    if (introCopy) {
      introCopy.textContent = 'Connecting to ' + normalizeBaseUrl(CONFIG.fhirBaseUrl);
    }

    var requests = CONFIG.patientIds.map(function(id) {
      return fetchPatientSummary(id);
    });

    return Promise.allSettled(requests)
      .then(function(results) {
        state.patients = results
          .filter(function(result) { return result.status === 'fulfilled'; })
          .map(function(result) { return result.value; });

        renderPatientList();

        var failedCount = results.length - state.patients.length;
        if (!state.patients.length) {
          throw new Error('No patient summaries returned from FHIR server');
        }

        if (failedCount > 0) {
          setStatus(state.patients.length + ' loaded, ' + failedCount + ' failed');
        } else {
          setStatus(state.patients.length + ' patients');
        }
      })
      .catch(function(error) {
        setError('FHIR request failed. Check FHIR base URL, CORS, and mock server status.');
        setStatus('Connection failed');
        throw error;
      })
      .finally(function() {
        setLoading(false);
      });
  }

  function renderPatientList() {
    var list = document.getElementById('patient-list');
    if (!list) return;
    list.innerHTML = '';

    if (!state.patients.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No patients found. Press Reload after the backend starts.';
      list.appendChild(empty);
      return;
    }

    state.patients.forEach(function(patient) {
      var card = document.createElement('div');
      card.className = 'patient-card';

      var title = document.createElement('div');
      title.className = 'patient-card-title';
      title.textContent = shortText(patient.demographics && patient.demographics.name) || patient.id;
      card.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'patient-meta';
      var gender = shortText(patient.demographics && patient.demographics.gender);
      var age = patient.age !== undefined && patient.age !== null ? patient.age + 'y' : '--';
      meta.textContent = 'ID: ' + patient.id + ' | ' + gender + ' | ' + age;
      card.appendChild(meta);

      var button = document.createElement('button');
      button.className = 'nav-item focusable primary';
      button.dataset.action = 'view-patient';
      button.dataset.patientId = patient.id;
      button.type = 'button';
      button.textContent = 'Open Case';
      card.appendChild(button);

      list.appendChild(card);
    });
  }

  function readBundleEntries(bundle) {
    if (!bundle || !Array.isArray(bundle.entry)) return [];
    return bundle.entry
      .map(function(entry) { return entry && entry.resource ? entry.resource : null; })
      .filter(Boolean);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function updateViewer() {
    var image = document.getElementById('xray-image');
    if (!image) return;
    image.style.transform = 'translate(' + state.viewer.x + 'px, ' + state.viewer.y + 'px) scale(' + state.viewer.scale + ')';
  }

  function renderHighlights(context) {
    var recommendations = document.getElementById('ai-recommendations');
    if (!recommendations) return;

    var highlights = [];
    var topProcedure = firstValue(context.procedures, 'description');
    var topAllergy = firstValue(context.allergies, 'substance');
    var topMedication = firstValue(context.medications, 'medication');
    var topCondition = firstValue(context.conditions, 'description');

    if (topProcedure) highlights.push('Procedure: ' + topProcedure);
    if (topCondition) highlights.push('Condition: ' + topCondition);
    if (topMedication) highlights.push('Medication: ' + topMedication);
    if (topAllergy) highlights.push('Allergy: ' + topAllergy);
    if (!highlights.length) highlights.push('No highlights returned by microservice.');

    recommendations.innerHTML = '';
    highlights.slice(0, 4).forEach(function(text) {
      var chip = document.createElement('div');
      chip.className = 'recommendation-chip';
      chip.textContent = text;
      recommendations.appendChild(chip);
    });
  }

  function setImageHint(text) {
    var hint = document.getElementById('viewer-hint');
    if (hint) {
      hint.textContent = text;
    }
  }

  function setImageSource(url, alt) {
    var image = document.getElementById('xray-image');
    if (!image) return;
    image.src = url;
    image.alt = alt;
    image.onerror = function() {
      image.onerror = null;
      image.src = FALLBACK_XRAY;
      setImageHint('Image unavailable from FHIR endpoint. Showing fallback.');
      state.viewer = { scale: 1, x: 0, y: 0 };
      updateViewer();
    };
  }

  function loadMedicalImage(patientId) {
    if (state.mediaCache[patientId]) {
      return Promise.resolve(state.mediaCache[patientId]);
    }

    return requestJson(fhirUrl('/Media?patient=' + encodeURIComponent(patientId)))
      .then(function(bundle) {
        var resources = readBundleEntries(bundle);
        var firstMedia = resources[0] || null;
        if (!firstMedia || !firstMedia.id) {
          throw new Error('No FHIR Media record found for ' + patientId);
        }

        var result = {
          mediaId: firstMedia.id,
          imageUrl: fhirUrl('/Media/' + encodeURIComponent(firstMedia.id)),
          modality: firstMedia.modality && firstMedia.modality.text ? firstMedia.modality.text : 'XRAY',
        };
        state.mediaCache[patientId] = result;
        return result;
      });
  }

  function loadPatientContext(patientId) {
    if (state.contextCache[patientId]) {
      return Promise.resolve(state.contextCache[patientId]);
    }

    return Promise.all([
      requestJson(fhirUrl('/AllergyIntolerance?patient=' + encodeURIComponent(patientId))),
      requestJson(fhirUrl('/Condition?patient=' + encodeURIComponent(patientId))),
      requestJson(fhirUrl('/MedicationRequest?patient=' + encodeURIComponent(patientId))),
      requestJson(fhirUrl('/Observation?patient=' + encodeURIComponent(patientId))),
      requestJson(fhirUrl('/ImagingStudy?patient=' + encodeURIComponent(patientId))),
      requestJson(fhirUrl('/Procedure?patient=' + encodeURIComponent(patientId))),
    ])
      .then(function(results) {
        return {
          allergies: normalizeAllergies(readBundleEntries(results[0])),
          conditions: normalizeConditions(readBundleEntries(results[1])),
          medications: normalizeMedications(readBundleEntries(results[2])),
          recentLabs: normalizeLabs(readBundleEntries(results[3])),
          imaging: normalizeImaging(readBundleEntries(results[4])),
          procedures: normalizeProcedures(readBundleEntries(results[5])),
        };
      })
      .then(function(context) {
        state.contextCache[patientId] = context;
        return context;
      });
  }

  function populateDetail(summary, context, imageInfo) {
    state.currentPatient = summary;
    state.viewer = { scale: 1.4, x: 0, y: 0 };

    var detailName = (summary.demographics && summary.demographics.name) || summary.id;
    document.getElementById('detail-name').textContent = detailName;

    var topProcedure = firstValue(context.procedures, 'description') || 'No procedure';
    document.getElementById('detail-procedure').textContent = shortText(topProcedure);

    document.getElementById('vital-hr').textContent = summary.age !== undefined && summary.age !== null ? String(summary.age) : '--';
    document.getElementById('vital-bp').textContent = shortText(summary.sex || '--');

    var topLab = firstValue(context.recentLabs, 'test');
    var topImaging = firstValue(context.imaging, 'modality') || firstValue(context.imaging, 'description');

    document.getElementById('vital-spo2').textContent = shortText(topLab || '--');
    document.getElementById('vital-temp').textContent = shortText(topImaging || '--');

    renderHighlights(context);

    if (imageInfo && imageInfo.imageUrl) {
      setImageSource(imageInfo.imageUrl, detailName + ' medical image');
      setImageHint('Image source: ' + shortText(imageInfo.mediaId) + ' (' + shortText(imageInfo.modality) + ')');
    } else {
      setImageSource(FALLBACK_XRAY, detailName + ' medical image unavailable');
      setImageHint('FHIR media endpoint unavailable. Showing fallback image.');
    }

    updateViewer();
  }

  function openPatient(patientId) {
    var summary = state.patients.find(function(item) { return item.id === patientId; });
    if (!summary) {
      return;
    }

    setStatus('Loading case ' + patientId + '...');
    clearError();

    Promise.allSettled([
      loadPatientContext(patientId),
      loadMedicalImage(patientId),
    ]).then(function(results) {
      var contextResult = results[0];
      var imageResult = results[1];

      if (contextResult.status !== 'fulfilled') {
        throw contextResult.reason || new Error('Failed to load patient context');
      }

      var context = contextResult.value;
      var imageInfo = imageResult.status === 'fulfilled' ? imageResult.value : null;
      populateDetail(summary, context, imageInfo);
      navigateTo('detail', { addToHistory: false });
      setStatus('Case ready');
    }).catch(function(error) {
      setError('Could not load full patient case. ' + (error && error.message ? error.message : '')); 
      setStatus('Case load failed');
    });
  }

  function reloadDetail() {
    if (!state.currentPatient || !state.currentPatient.id) {
      return;
    }

    var patientId = state.currentPatient.id;
    delete state.contextCache[patientId];
    delete state.mediaCache[patientId];
    openPatient(patientId);
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
    state.viewer = { scale: 1.4, x: 0, y: 0 };
    updateViewer();
  }

  function handleAction(action, element) {
    switch (action) {
      case 'view-patient':
        openPatient(element.dataset.patientId);
        break;
      case 'back':
        navigateBack();
        break;
      case 'reload-patients':
        loadPatientSummaries();
        break;
      case 'open-settings':
        fillConfigForm(CONFIG);
        navigateTo('settings', { addToHistory: false });
        break;
      case 'save-config':
        persistConfig(readConfigForm());
        setStatus('Configuration saved');
        break;
      case 'apply-config':
        applyConfig(readConfigForm(), { persist: true, reload: true });
        break;
      case 'reset-config':
        applyConfig(DEFAULT_CONFIG, { persist: true, reload: true });
        fillConfigForm(CONFIG);
        break;
      case 'reload-detail':
        reloadDetail();
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
    if (screenId === 'home' && !state.patients.length && !state.isLoading) {
      loadPatientSummaries();
      return;
    }

    if (screenId === 'settings') {
      fillConfigForm(CONFIG);
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

      if (isInput) {
        if (event.key === 'Escape') {
          navigateBack();
          event.preventDefault();
        }
        return;
      }

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
    fillConfigForm(CONFIG);
    navigateTo('home', { addToHistory: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
