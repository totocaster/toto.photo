(function () {
  let currentImageIndex = 0;

  function getGalleryImages() {
    return Array.from(document.querySelectorAll('.gallery-image'));
  }

  function showImageAt(index) {
    const galleryImages = getGalleryImages();
    if (galleryImages.length === 0) return;

    currentImageIndex = (index + galleryImages.length) % galleryImages.length;
    const selectedImage = galleryImages[currentImageIndex];
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = selectedImage.src;
    lightboxImg.alt = selectedImage.alt || 'Gallery image';
  }

  window.openLightbox = function (imgSrc) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const galleryImages = getGalleryImages();
    const requestedUrl = new URL(imgSrc, document.baseURI).href;
    const requestedIndex = galleryImages.findIndex(function (image) {
      return image.src === requestedUrl;
    });

    if (requestedIndex >= 0) {
      showImageAt(requestedIndex);
    } else {
      lightboxImg.src = imgSrc;
      lightboxImg.alt = 'Gallery image';
    }

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  window.changeLightboxImage = function (step) {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox.classList.contains('active') || getGalleryImages().length < 2) return;
    showImageAt(currentImageIndex + step);
  };

  window.closeLightbox = function () {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  };

  document.addEventListener('keydown', function (e) {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox.classList.contains('active')) return;

    if (e.key === 'Escape') {
      window.closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      window.changeLightboxImage(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      window.changeLightboxImage(1);
    }
  });
})();
