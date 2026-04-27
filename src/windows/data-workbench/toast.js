// Toast notification system — bottom-left, auto-dismiss, types: info/success/error
function showToast(msg, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ';
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = msg;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Dismiss';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icon;

    el.appendChild(iconSpan);
    el.appendChild(msgSpan);
    el.appendChild(closeBtn);
    container.appendChild(el);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('toast--visible'));
    });

    let timer = null;
    function dismiss() {
        if (timer) clearTimeout(timer);
        timer = null;
        el.classList.remove('toast--visible');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 500); // fallback if transition doesn't fire
    }

    closeBtn.addEventListener('click', dismiss);

    if (duration > 0) {
        timer = setTimeout(dismiss, duration);
    }

    return {
        update(newMsg) { msgSpan.textContent = newMsg; },
        dismiss
    };
}
