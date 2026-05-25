(function () {
    if (!window.electronAPI) return;
    window.electronAPI.getSetting('accentColor').then(function (color) {
        if (color) document.documentElement.style.setProperty('--accent', color);
    });
})();
