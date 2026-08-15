# toto.photo

A professional photography portfolio website built with [Hugo](https://gohugo.io/) showcasing the work of photographer Toto Tvalavadze. The portfolio explores the intersection of concrete narratives and personal interpretation through Liminal Realism.

## Project Overview

**URL**: https://toto.photo/  
**Author**: Toto Tvalavadze  
**Technology**: Hugo Static Site Generator (Extended Version 0.164.0)
**Deployment**: DigitalOcean App Platform  

## Project Structure

```
toto.photo/
├── assets/                 # Source assets processed by Hugo
│   ├── images/            # Source images for various sections
│   │   ├── about/         # About page images
│   │   ├── exhibitions/   # Exhibition gallery images and posters
│   │   ├── home/          # Homepage images
│   │   └── works/         # Portfolio work images
│   ├── js/                # JavaScript source files
│   │   ├── lightbox.js    # Image lightbox functionality
│   │   └── mobile-menu.js # Mobile navigation menu
│   └── scss/              # SCSS stylesheets
│       └── style.scss     # Main stylesheet with responsive design
├── content/               # Markdown/HTML content files
│   ├── _index.html       # Homepage content
│   ├── about.md          # About page
│   ├── contact.html      # Contact page
│   ├── exhibitions/      # Exhibition pages
│   ├── folio-editions/   # Folio edition information
│   ├── liminal-studies/  # Liminal studies gallery
│   ├── maquettes/        # Maquette (photographic studies) pages
│   ├── out-of-memory.md  # Special content page
│   ├── press/            # Press coverage pages
│   └── works/            # Portfolio works
├── layouts/              # Hugo templates
│   ├── _default/         # Default page templates
│   ├── exhibitions/      # Exhibition-specific templates
│   ├── index.html        # Homepage template
│   ├── maquettes/        # Maquette page templates
│   ├── partials/         # Reusable template components
│   │   ├── head.html     # HTML head section
│   │   ├── nav.html      # Navigation menu
│   │   ├── lightbox.html # Lightbox component
│   │   └── social-meta.html # Social media metadata
│   ├── press/            # Press section templates
│   └── shortcodes/       # Custom Hugo shortcodes
│       ├── gallery.html  # Image gallery shortcode
│       └── rawhtml.html  # Raw HTML inclusion
├── static/               # Static files (served as-is)
│   ├── about/           # About section images
│   ├── exhibitions/     # Exhibition images
│   ├── ui/              # UI assets
│   │   └── og/          # Open Graph social media images
│   └── [various images and media files]
├── resources/           # Hugo-generated assets (not tracked)
├── public/              # Generated static site (not tracked)
├── .do/                 # DigitalOcean deployment configuration
│   └── app.yaml         # App Platform configuration
└── hugo.toml            # Hugo configuration file
```

## Content Types

### 1. **Exhibitions** (`/exhibitions/`)
Gallery exhibitions with dedicated pages featuring:
- Exhibition details and dates
- Gallery information
- Image galleries
- Press materials

### 2. **Maquettes** (`/maquettes/`)
Photographic studies and conceptual works with custom permalinks configured in Hugo

### 3. **Press** (`/press/`)
Media coverage and press features about the photographer's work

### 4. **Folio Editions** (`/folio-editions/`)
Information about limited edition prints and collections

### 5. **Works** (`/works/`)
Main portfolio pieces and series

### 6. **Liminal Studies** (`/liminal-studies/`)
Special gallery exploring liminal realism concepts

## Technical Details

### Hugo Configuration
- **Base URL**: https://toto.photo/
- **Language**: en-us

### Styling
- **SCSS Variables**: Responsive design with mobile, narrow, and wide breakpoints
- **Color Scheme**: Light and dark theme variables
- **Typography**: System font stack for optimal performance
- **Layout**: Two-column design with 20vw menu and 80vw content area

### JavaScript Features
- **Lightbox**: Custom lightbox for image galleries
- **Mobile Menu**: Responsive navigation for mobile devices

### Social Media Integration
- Open Graph metadata for rich social sharing
- Twitter Card support
- Custom OG images per page in `static/ui/og/`
- Social links: Twitter (@totocaster) and Instagram

## Development

### Prerequisites
- Hugo Extended Version (for SCSS support)
- Git

### Local Development
```bash
# Clone the repository
git clone https://github.com/totocaster/toto.photo.git
cd toto.photo

# Start development server
hugo server -D

# Build for production
hugo --destination ./public
```

The development server runs at `http://localhost:1313` with live reload enabled.

### Build Process
The site uses Hugo's asset pipeline to:
- Process SCSS to CSS
- Optimize images
- Generate responsive layouts
- Create static HTML pages

## Deployment

The site is deployed on DigitalOcean App Platform with the following configuration:
- **Build Command**: `rm -r ./public; hugo --destination ./public`
- **Environment**: Hugo with extended features enabled
- **Branch**: Deploys from `main` branch
- **Auto-deploy**: Enabled for push to main

## Performance Optimizations

- Static site generation for fast page loads
- System fonts to reduce download size
- Optimized images with Hugo's image processing
- Minimal JavaScript for core functionality

## Browser Support

The site uses modern CSS and JavaScript features with fallbacks for:
- Mobile devices (responsive design)
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Tablet devices

## Last Updated

January 30, 2025

## License

- Code (templates, scripts, styles, configuration) is MIT licensed. See `LICENSE`.
- Content (photographs, images, and written text) is copyrighted and not
  licensed for reuse. See `CONTENT_LICENSE.txt`.
