(function () {
  // Expose functions to global scope
  window.toggleMobileMenu = function () {
    const menuButton = document.querySelector('.mobile-menu-toggle');
    const menuOverlay = document.querySelector('.mobile-menu-overlay');
    const isOpen = menuButton.classList.contains('is-active');

    menuButton.classList.toggle('is-active');
    menuOverlay.classList.toggle('is-active');
    menuButton.textContent = isOpen ? 'Menu' : 'Close';
  };

  // Initialize mobile menu
  document.addEventListener('DOMContentLoaded', function () {
    const menuButton = document.querySelector('.mobile-menu-toggle');
    if (menuButton) {
      menuButton.addEventListener('click', window.toggleMobileMenu);
    }
  });
})();
