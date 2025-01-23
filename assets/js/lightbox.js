(function () {
  // Expose functions to global scope
  window.openLightbox = function (imgSrc) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = imgSrc;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.closeLightbox = function () {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  };

  // Close lightbox with Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      window.closeLightbox();
    }
  });
})();
