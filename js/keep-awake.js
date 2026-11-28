/* Keeps the screen on while NINO is writing a reply (the native-app behaviour people expect from a chat app).
   Uses the Screen Wake Lock API when the WebView has it. Nested generations are counted, so the lock is released
   only when the last one finishes. The browser drops the lock when the app goes to the background; it is taken
   again when the app comes back, if a reply is still running. Never throws: without the API it does nothing. */
(function () {
    'use strict';
    var held = null;
    var pending = false;
    var count = 0;
    function supported() {
        return typeof navigator !== 'undefined' && !!navigator.wakeLock && typeof navigator.wakeLock.request === 'function';
    }
    function take() {
        if (held || pending || !supported()) return;
        pending = true;
        try {
            navigator.wakeLock.request('screen').then(function (lock) {
                pending = false;
                /* the reply may have ended while the request was in flight: give the lock straight back */
                if (count === 0 || held) { try { lock.release(); } catch (e) { } return; }
                held = lock;
                lock.addEventListener('release', function () { if (held === lock) held = null; });
            }, function () { pending = false; held = null; });
        } catch (e) { pending = false; held = null; }
    }
    function hold() {
        count++;
        take();
    }
    function release() {
        count = Math.max(0, count - 1);
        if (count === 0 && held) {
            var h = held;
            held = null;
            try { h.release(); } catch (e) { }
        }
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible' && count > 0) take();
        });
    }
    window.ninoAwake = { hold: hold, release: release, active: function () { return !!held; }, count: function () { return count; } };
})();
