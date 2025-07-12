# TODO: Custom Social Media Banners

The following pages need custom social media banner images (recommended size: 1200x630px):

## Required Custom Banners

1. **About Page** (`/about/`)
   - File location: `/static/about/social-banner-about.jpg`
   - Current fallback: Will use default avatar if not provided
   - Suggestion: Professional portrait or artistic self-representation

2. **Works Page** (`/works/`)
   - File location: `/static/works/social-banner-works.jpg`
   - Current fallback: Will use default avatar if not provided
   - Suggestion: Collage of your best work or signature pieces

## Implementation Notes

- Place the banner images in the specified locations
- Images should be 1200x630px for optimal display on social media
- JPEG format recommended for better compression
- Once created, the social metadata system will automatically use them

## Pages Already Configured

The following pages already have appropriate images configured:
- Homepage: Uses avatar image
- Individual exhibitions: Use their poster images
- Individual maquettes: Use their featured images
- Out of Memory: Uses series hero image
- Folio Editions: Uses Liminal Studies hero image
- Liminal Studies: Uses its hero image