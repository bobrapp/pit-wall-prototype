/**
 * Pit Wall v4 — shared cross-tab state via localStorage
 * Exposes window.PW with get / set / reset helpers.
 * Cross-tab sync fires 'pw:change' CustomEvent in every open tab.
 */
(function () {
  var KEY = 'pw4_state';

  var DEFAULTS = {
    nameplate:         'silverado',
    nameplateLabel:    'Silverado HD 1500',
    dqScore:           88,
    gateStatus:        'ok',   // ok | at-risk | blocked | clear
    overrideSubmitted: false,
    equinoxSubmitted:  false,
  };

  function gateStatusFor(score, overrideSubmitted) {
    if (overrideSubmitted) return 'clear';
    if (score < 68)  return 'blocked';
    if (score < 78)  return 'at-risk';
    return 'ok';
  }

  function dispatch(detail) {
    try {
      window.dispatchEvent(new CustomEvent('pw:change', { detail: detail }));
    } catch (e) {}
  }

  window.PW = {
    get: function () {
      try {
        return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
      } catch (e) {
        return Object.assign({}, DEFAULTS);
      }
    },

    set: function (updates) {
      var next = Object.assign(this.get(), updates, { _ts: Date.now() });
      // Auto-derive gateStatus unless caller explicitly sets it
      if (!Object.prototype.hasOwnProperty.call(updates, 'gateStatus')) {
        next.gateStatus = gateStatusFor(next.dqScore, next.overrideSubmitted);
      }
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
      dispatch(next);
      return next;
    },

    reset: function () {
      var def = Object.assign({}, DEFAULTS, { _ts: Date.now() });
      try { localStorage.setItem(KEY, JSON.stringify(def)); } catch (e) {}
      dispatch(def);
    },

    gateStatusFor: gateStatusFor,
  };

  // Cross-tab sync — storage events only fire in OTHER open tabs
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    try {
      var data = Object.assign({}, DEFAULTS, JSON.parse(e.newValue || '{}'));
      dispatch(data);
    } catch (e) {}
  });
}());
