/**
 * Mini App mantig'i — Telegram webview ichida ishlaydi.
 *
 * Asosiy qoida: rasm FAQAT kameradan olinadi (`capture="environment"`), har bir
 * tomon alohida yuboriladi va server javobi holatning yagona manbasi bo'ladi —
 * shu sababli qayta urinish yoki oynani yangilash ham ketma-ketlikni buzmaydi.
 */
(function () {
  'use strict';

  /** Matnlar `src/i18n/uz.ts` dagi `miniapp` bo'limidan ko'chirilgan. */
  var TEXT = {
    takePhoto: '📷 Suratga olish',
    retake: '🔄 Qayta olish',
    submit: 'Yuborish',
    continueNext: 'Davom etish ▶️',
    retry: '🔄 Qayta urinish',
    uploading: 'Yuborilmoqda...',
    photoReady: "Rasm tayyor. Ko'rinishini tekshiring.",
    errorGeneric: "Xatolik. Qayta urinib ko'ring.",
    errorSession: 'Sessiya muddati tugagan. Botga qaytib, tugmani qaytadan bosing.',
    errorPhotoType: 'Faqat rasm fayli qabul qilinadi. Qayta suratga oling.',
    errorNetwork: "Aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring.",
    errorNoTelegram: 'Bu sahifani Telegram ilovasi orqali oching.',
    errorCameraDenied:
      "Kameraga ruxsat berilmadi. Telegram sozlamalarida kameraga ruxsat bering va oynani qayta oching.",
    errorCameraUnavailable: "Kamera ochilmadi. Tugmani bosib tizim kamerasidan foydalaning.",
    errorCapture: "Kadr olinmadi. Qayta urinib ko'ring.",
    cameraStarting: 'Kamera yoqilmoqda...',
    cameraLive: 'Mashinani kadrga oling va tugmani bosing'
  };

  var STEPS = [
    {
      side: 'REAR',
      title: 'Orqa tomon',
      hint: "Mashinaning orqasiga o'ting. Reklama va davlat raqami to'liq ko'rinsin."
    },
    { side: 'LEFT', title: 'Chap chet', hint: "Chap tomondan suratga oling. Reklama to'liq kadrga tushsin." },
    { side: 'RIGHT', title: "O'ng chet", hint: "O'ng tomondan suratga oling. Reklama to'liq kadrga tushsin." }
  ];

  var UPLOAD_URL = '/api/upload';
  var GEO_TIMEOUT_MS = 8000;
  var CLOSE_DELAY_MS = 2000;
  var HTTP_OK = 200;
  /** Kadr sifati: 0.92 — fayl hajmi va reklama o'qilishi orasidagi muvozanat. */
  var JPEG_QUALITY = 0.92;

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  var dom = {
    stepCounter: document.getElementById('stepCounter'),
    steps: document.getElementById('steps'),
    captureCard: document.getElementById('captureCard'),
    stepTitle: document.getElementById('stepTitle'),
    stepHint: document.getElementById('stepHint'),
    framePlaceholder: document.getElementById('framePlaceholder'),
    previewImage: document.getElementById('previewImage'),
    previewNote: document.getElementById('previewNote'),
    cameraVideo: document.getElementById('cameraVideo'),
    captureCanvas: document.getElementById('captureCanvas'),
    cameraInput: document.getElementById('cameraInput'),
    captureBtn: document.getElementById('captureBtn'),
    submitBtn: document.getElementById('submitBtn'),
    retakeBtn: document.getElementById('retakeBtn'),
    progress: document.getElementById('progress'),
    alert: document.getElementById('alert'),
    alertText: document.getElementById('alertText'),
    retryBtn: document.getElementById('retryBtn'),
    successCard: document.getElementById('successCard')
  };

  /** Butun holat bitta muzlatilgan obyektda — o'zgarish faqat yangi nusxa orqali. */
  var state = Object.freeze({
    stepIndex: 0,
    file: null,
    previewUrl: null,
    busy: false,
    error: null,
    blocked: null,
    done: false,
    /** Jonli kamera oqimi tayyor bo'lsa true — kadr canvas orqali olinadi. */
    streamReady: false,
    /** 'live' = getUserMedia (ishonchli), 'fallback' = fayl tanlagich (past ishonch). */
    captureMode: 'live'
  });

  var token = new URLSearchParams(window.location.search).get('token') || '';
  var initData = tg && tg.initData ? tg.initData : '';
  var locationPromise = Promise.resolve(null);

  function setState(patch) {
    var next = {};
    Object.keys(state).forEach(function (key) {
      next[key] = state[key];
    });
    Object.keys(patch).forEach(function (key) {
      next[key] = patch[key];
    });
    state = Object.freeze(next);
    render();
  }

  function currentStep() {
    return STEPS[state.stepIndex] || STEPS[0];
  }

  function indexOfSide(side) {
    for (var i = 0; i < STEPS.length; i += 1) {
      if (STEPS[i].side === side) return i;
    }
    return -1;
  }

  // ─────────────────────────── Telegram integratsiyasi ───────────────────────────

  /** themeParams ni CSS o'zgaruvchilariga bog'laydi — ilova mavzuga moslashadi. */
  function applyTheme() {
    if (!tg) return;
    var params = tg.themeParams || {};
    var root = document.documentElement;

    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (typeof value === 'string' && value.length > 0) {
        root.style.setProperty('--tg-theme-' + key.replace(/_/g, '-'), value);
      }
    });

    root.setAttribute('data-theme', tg.colorScheme === 'dark' ? 'dark' : 'light');
  }

  function haptic(kind) {
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (kind === 'success' || kind === 'error') tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred(kind);
    } catch (ignored) {
      /* Eski mijozlarda HapticFeedback bo'lmasligi mumkin — bu jiddiy emas. */
    }
  }

  /**
   * MainButton faqat YUBORISH uchun ishlatiladi: kamerani ochish brauzerning
   * haqiqiy bosish hodisasini talab qiladi, MainButton esa Telegram ko'prigidan keladi.
   */
  function syncMainButton() {
    if (!tg || !tg.MainButton) return;
    var button = tg.MainButton;

    if (state.done || state.blocked || !state.file) {
      button.hideProgress();
      button.hide();
      return;
    }

    button.setText(state.stepIndex === STEPS.length - 1 ? TEXT.submit : TEXT.continueNext);
    button.show();

    if (state.busy) {
      button.disable();
      button.showProgress(true);
      return;
    }
    button.hideProgress();
    button.enable();
  }

  // ─────────────────────────── Ko'rinish ───────────────────────────

  function toggle(element, visible) {
    if (!element) return;
    element.hidden = !visible;
  }

  function renderSteps() {
    var items = dom.steps ? dom.steps.children : [];
    for (var i = 0; i < items.length; i += 1) {
      var status = i < state.stepIndex || state.done ? 'done' : i === state.stepIndex ? 'active' : 'idle';
      items[i].setAttribute('data-status', status);
    }
  }

  function render() {
    var step = currentStep();

    if (dom.stepCounter) {
      dom.stepCounter.textContent = state.stepIndex + 1 + '/' + STEPS.length + '-qadam';
    }
    if (dom.stepTitle) dom.stepTitle.textContent = step.title;
    if (dom.stepHint) dom.stepHint.textContent = step.hint;
    renderSteps();

    var hasPhoto = state.file !== null;
    var showVideo = !hasPhoto && state.streamReady && !state.done && !state.blocked;
    toggle(dom.captureCard, !state.done && !state.blocked);
    toggle(dom.successCard, state.done);
    toggle(dom.cameraVideo, showVideo);
    toggle(dom.framePlaceholder, !hasPhoto && !showVideo);
    toggle(dom.previewImage, hasPhoto);
    toggle(dom.previewNote, hasPhoto && !state.busy);

    if (dom.framePlaceholder && !hasPhoto && !showVideo) {
      var frameText = dom.framePlaceholder.querySelector('.frame__text');
      if (frameText) {
        frameText.textContent =
          state.captureMode === 'fallback' ? TEXT.cameraLive : TEXT.cameraStarting;
      }
    }

    if (hasPhoto && state.previewUrl && dom.previewImage) {
      dom.previewImage.src = state.previewUrl;
    }

    toggle(dom.captureBtn, !hasPhoto);
    toggle(dom.submitBtn, hasPhoto);
    toggle(dom.retakeBtn, hasPhoto);
    toggle(dom.progress, state.busy);

    if (dom.submitBtn) {
      dom.submitBtn.textContent = state.stepIndex === STEPS.length - 1 ? TEXT.submit : TEXT.continueNext;
      dom.submitBtn.disabled = state.busy;
    }
    if (dom.captureBtn) dom.captureBtn.disabled = state.busy;
    if (dom.retakeBtn) dom.retakeBtn.disabled = state.busy;

    // Jonli kamera ishlayotganda zaxira fayl tanlagich butunlay o'chiriladi —
    // galereyaga yo'l tasodifan ham ochilmasligi kerak.
    if (dom.cameraInput) dom.cameraInput.disabled = state.streamReady;

    var message = state.blocked || state.error;
    toggle(dom.alert, message !== null && message !== undefined);
    if (dom.alertText && message) dom.alertText.textContent = message;
    toggle(dom.retryBtn, Boolean(state.error) && !state.blocked && hasPhoto);

    syncMainButton();
  }

  // ─────────────────────────── Rasm olish ───────────────────────────

  function releasePreview() {
    if (state.previewUrl) {
      try {
        URL.revokeObjectURL(state.previewUrl);
      } catch (ignored) {
        /* Ba'zi webview larda revoke qo'llab-quvvatlanmaydi. */
      }
    }
  }

  /** Joylashuv majburiy emas: rad etilsa ham yuklash to'xtamaydi. */
  function readLocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (position) {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        function () {
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 }
      );
    });
  }

  function onFileSelected(event) {
    var input = event.target;
    var file = input && input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;

    if (file.type && file.type.indexOf('image/') !== 0) {
      input.value = '';
      setState({ error: TEXT.errorPhotoType });
      haptic('error');
      return;
    }

    releasePreview();
    // Joylashuvni rasm olingan zahoti so'raymiz — yuklashgacha tayyor bo'ladi.
    locationPromise = readLocation();
    haptic('light');
    // Fayl tanlagich orqali kelgan rasm — galereyadan olingan bo'lishi mumkin,
    // shuning uchun serverda past ishonch bilan belgilanadi.
    setState({
      file: file,
      previewUrl: URL.createObjectURL(file),
      captureMode: 'fallback',
      error: null
    });
    input.value = '';
  }

  // ─────────────────────── Jonli kamera (getUserMedia) ───────────────────────
  //
  // Nega fayl tanlagich emas: Android WebView da `capture="environment"`
  // atributi e'tiborsiz qoldirilishi mumkin va tizim galereyani ochadi.
  // getUserMedia da esa fayl tanlash oynasi umuman mavjud emas — foydalanuvchi
  // faqat shu yerda va shu daqiqada kadr olishi mumkin.

  var activeStream = null;

  function supportsLiveCamera() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && dom.cameraVideo);
  }

  function stopCamera() {
    if (!activeStream) return;
    try {
      activeStream.getTracks().forEach(function (track) {
        track.stop();
      });
    } catch (ignored) {
      /* Oqim allaqachon yopilgan bo'lishi mumkin. */
    }
    activeStream = null;
    if (dom.cameraVideo) dom.cameraVideo.srcObject = null;
  }

  /** Orqa kamerani so'raydi; muvaffaqiyatsiz bo'lsa zaxira yo'lga o'tadi. */
  function startCamera() {
    if (!supportsLiveCamera()) {
      setState({ streamReady: false, captureMode: 'fallback' });
      return Promise.resolve(false);
    }
    if (activeStream) {
      setState({ streamReady: true, captureMode: 'live' });
      return Promise.resolve(true);
    }

    var constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    return navigator.mediaDevices
      .getUserMedia(constraints)
      .then(function (stream) {
        activeStream = stream;
        dom.cameraVideo.srcObject = stream;
        // iOS WKWebView da play() Promise qaytaradi va rad etilishi mumkin.
        var played = dom.cameraVideo.play();
        if (played && typeof played.catch === 'function') played.catch(function () {});
        setState({ streamReady: true, captureMode: 'live', error: null });
        return true;
      })
      .catch(function (error) {
        // Ruxsat rad etildi yoki qurilma band — zaxira yo'l ochiq qoladi.
        var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
        setState({
          streamReady: false,
          captureMode: 'fallback',
          error: denied ? TEXT.errorCameraDenied : TEXT.errorCameraUnavailable
        });
        return false;
      });
  }

  /** Joriy kadrni JPEG faylga aylantiradi. */
  function captureFromVideo() {
    var video = dom.cameraVideo;
    var canvas = dom.captureCanvas;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      return Promise.resolve(null);
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise(function (resolve) {
      if (typeof canvas.toBlob !== 'function') {
        resolve(null);
        return;
      }
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            resolve(null);
            return;
          }
          var name = currentStep().side.toLowerCase() + '.jpg';
          // Ba'zi webview larda File konstruktori yo'q — Blob ni boyitamiz.
          var file;
          try {
            file = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
          } catch (ignored) {
            file = blob;
            file.name = name;
            file.lastModified = Date.now();
          }
          resolve(file);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    });
  }

  function openCamera() {
    if (state.busy) return;

    // Zaxira rejim: tizim kamerasini fayl tanlagich orqali ochamiz.
    if (!state.streamReady) {
      if (!dom.cameraInput) return;
      setState({ error: null });
      dom.cameraInput.click();
      return;
    }

    setState({ busy: true, error: null });
    captureFromVideo().then(function (file) {
      if (!file) {
        setState({ busy: false, error: TEXT.errorCapture });
        haptic('error');
        return;
      }
      releasePreview();
      // Joylashuvni kadr olingan zahoti so'raymiz — yuklashgacha tayyor bo'ladi.
      locationPromise = readLocation();
      haptic('light');
      setState({
        busy: false,
        file: file,
        previewUrl: URL.createObjectURL(file),
        captureMode: 'live',
        error: null
      });
    });
  }

  function retake() {
    if (state.busy) return;
    releasePreview();
    setState({ file: null, previewUrl: null, error: null });
    if (!state.streamReady) openCamera();
  }

  // ─────────────────────────── Yuklash ───────────────────────────

  function buildFormData(file, position) {
    var form = new FormData();
    form.append('token', token);
    form.append('side', currentStep().side);
    form.append('initData', initData);
    form.append('clientTakenAt', new Date(file.lastModified || Date.now()).toISOString());
    // Server shu maydon bo'yicha ishonch darajasini belgilaydi.
    form.append('captureMode', state.captureMode);
    if (position) {
      form.append('lat', String(position.lat));
      form.append('lng', String(position.lng));
      form.append('accuracy', String(Math.round(position.accuracy)));
    }
    // Fayl oxirida — server matn maydonlarini oldinroq o'qiy oladi.
    form.append('file', file, currentStep().side.toLowerCase() + '.jpg');
    return form;
  }

  function readJson(response) {
    return response.json().catch(function () {
      return null;
    });
  }

  function messageFrom(payload) {
    if (payload && typeof payload.message === 'string' && payload.message.length > 0) return payload.message;
    return TEXT.errorGeneric;
  }

  function finish() {
    releasePreview();
    haptic('success');
    // Uchala tomon yuborildi — kamerani darhol bo'shatamiz.
    stopCamera();
    setState({ done: true, busy: false, file: null, previewUrl: null, streamReady: false, error: null });
    if (tg) {
      if (tg.disableClosingConfirmation) tg.disableClosingConfirmation();
      window.setTimeout(function () {
        if (tg.close) tg.close();
      }, CLOSE_DELAY_MS);
    }
  }

  /** Server javobi — holatning yagona manbai: keyingi qadamni u aytadi. */
  function applyServerState(payload) {
    if (payload.completed === true) {
      finish();
      return;
    }

    var remaining = Array.isArray(payload.remaining) ? payload.remaining : [];
    var nextIndex = remaining.length > 0 ? indexOfSide(remaining[0]) : state.stepIndex + 1;
    if (nextIndex < 0 || nextIndex >= STEPS.length) {
      finish();
      return;
    }

    releasePreview();
    haptic('light');
    setState({ stepIndex: nextIndex, file: null, previewUrl: null, busy: false, error: null });
  }

  function upload() {
    if (state.busy || !state.file || state.blocked) return;
    setState({ busy: true, error: null });

    var file = state.file;
    locationPromise
      .then(function (position) {
        return fetch(UPLOAD_URL, { method: 'POST', body: buildFormData(file, position), cache: 'no-store' });
      })
      .then(function (response) {
        return readJson(response).then(function (payload) {
          if (response.status !== HTTP_OK || !payload || payload.ok !== true) {
            throw new Error(messageFrom(payload));
          }
          return payload;
        });
      })
      .then(applyServerState)
      .catch(function (error) {
        var isNetwork = error instanceof TypeError;
        haptic('error');
        setState({ busy: false, error: isNetwork ? TEXT.errorNetwork : error.message || TEXT.errorGeneric });
      });
  }

  // ─────────────────────────── Ishga tushirish ───────────────────────────

  function blockingReason() {
    if (!tg || !initData) return TEXT.errorNoTelegram;
    if (!token) return TEXT.errorSession;
    return null;
  }

  function bindEvents() {
    if (dom.cameraInput) dom.cameraInput.addEventListener('change', onFileSelected);
    if (dom.captureBtn) dom.captureBtn.addEventListener('click', openCamera);
    if (dom.submitBtn) dom.submitBtn.addEventListener('click', upload);
    if (dom.retakeBtn) dom.retakeBtn.addEventListener('click', retake);
    if (dom.retryBtn) dom.retryBtn.addEventListener('click', upload);

    if (tg) {
      if (tg.MainButton) tg.MainButton.onClick(upload);
      if (tg.onEvent) tg.onEvent('themeChanged', applyTheme);
    }
  }

  function init() {
    if (tg) {
      tg.ready();
      if (tg.expand) tg.expand();
      if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      applyTheme();
    }

    bindEvents();
    setState({ blocked: blockingReason() });

    // Kamera faqat sahifa ishga yaroqli bo'lsa yoqiladi.
    if (!blockingReason()) startCamera();

    // Oyna yopilganda kamerani bo'shatamiz — indikator yonib qolmasin.
    window.addEventListener('pagehide', stopCamera);
    window.addEventListener('beforeunload', stopCamera);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') stopCamera();
      else if (!state.done && !state.file && !state.blocked) startCamera();
    });
  }

  init();
})();
