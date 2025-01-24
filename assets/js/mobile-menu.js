document.addEventListener('DOMContentLoaded', function () {
  const menuButton = document.querySelector('.mobile-menu-toggle');
  const menuOverlay = document.querySelector('.mobile-menu-overlay');

  menuButton.addEventListener('click', function () {
    const isOpen = menuButton.classList.contains('is-active');

    menuButton.classList.toggle('is-active');
    menuOverlay.classList.toggle('is-active');
    menuButton.textContent = isOpen ? 'Menu' : 'Close';
  });
});
