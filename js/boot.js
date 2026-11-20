'use strict';
if ('serviceWorker' in navigator && !window.NinoNative) {
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then(function (reg) {
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden)
                reg.update().catch(function () { });
        });
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            try {
                var lastTs = Number(sessionStorage.getItem('nino-sw-reload-ts') || 0);
                var nowTs = Date.now();
                if (nowTs - lastTs < 10000)
                    return;
                sessionStorage.setItem('nino-sw-reload-ts', String(nowTs));
                var t = document.getElementById('toast');
                var busy = typeof session !== 'undefined' && session && session.taskMode;
                if (t) {
                    t.textContent = busy ? 'มีอัปเดตใหม่ — จะรีโหลดอัตโนมัติหลังงานปัจจุบันเสร็จ' : 'มีอัปเดตใหม่ — กำลังรีโหลด...';
                    t.className = 'show info';
                }
                var doReload = function () {
                    location.reload();
                };
                if (!busy) {
                    setTimeout(doReload, 1200);
                }
                else {
                    var iv = setInterval(function () {
                        if (!(typeof session !== 'undefined' && session && session.taskMode)) {
                            clearInterval(iv);
                            doReload();
                        }
                    }, 1500);
                }
            }
            catch (e) { }
        });
    }).catch(function () { });
}
window.addEventListener('error', function (e) {
    try {
        var t = document.getElementById('toast');
        if (t) {
            t.textContent = 'JS Error: ' + (e.message || 'unknown');
            t.className = 'err';
            t.classList.add('show');
            setTimeout(function () {
                t.classList.remove('show');
            }, 5000);
        }
    }
    catch (_) { }
});
window.addEventListener('unhandledrejection', function (e) {
    try {
        var t = document.getElementById('toast');
        if (t) {
            t.textContent = 'Promise Error: ' + String(e.reason && e.reason.message || e.reason || 'unknown').slice(0, 120);
            t.className = 'err';
            t.classList.add('show');
            setTimeout(function () {
                t.classList.remove('show');
            }, 5000);
        }
    }
    catch (_) { }
});
