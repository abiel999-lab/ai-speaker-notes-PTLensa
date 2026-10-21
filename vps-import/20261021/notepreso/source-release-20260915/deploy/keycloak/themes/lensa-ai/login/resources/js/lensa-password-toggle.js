const setPasswordVisibility = (button, input) => {
    const shouldShow = input.type === 'password';
    input.type = shouldShow ? 'text' : 'password';

    const label = shouldShow
        ? button.dataset.labelHide || 'Hide password'
        : button.dataset.labelShow || 'Show password';

    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', shouldShow ? 'true' : 'false');

    const icon = button.querySelector('i');
    if (icon) {
        const showClasses = (button.dataset.iconShow || 'fa-eye fas').trim().split(/\s+/);
        const hideClasses = (button.dataset.iconHide || 'fa-eye-slash fas').trim().split(/\s+/);

        [...showClasses, ...hideClasses].forEach((className) => {
            if (className) icon.classList.remove(className);
        });

        (shouldShow ? hideClasses : showClasses).forEach((className) => {
            if (className) icon.classList.add(className);
        });
    }
};

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-password-toggle]');
    if (!button) return;

    event.preventDefault();

    const inputId = button.getAttribute('aria-controls');
    if (!inputId) return;

    const input = document.getElementById(inputId);
    if (!input || (input.type !== 'password' && input.type !== 'text')) return;

    setPasswordVisibility(button, input);
    input.focus({ preventScroll: true });
});
