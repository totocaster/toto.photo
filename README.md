# toto.photo

A professional photography portfolio website built with [Hugo](https://gohugo.io/).

## Project Structure

- `assets/`: Contains SCSS styles and JavaScript files for features like mobile menu and lightbox
- `content/`: Website content including exhibitions, press, works, and general pages
- `layouts/`: Hugo templates and partials for different content types
- `static/`: Static assets like images and other media files
- `public/`: Generated static site (not tracked in git)
- `hugo.toml`: Hugo configuration file

## Content Types

- Exhibitions
- Press coverage
- Photography works
- Folio editions
- Contact information

## Development

This site is built using Hugo. To run it locally:

1. Install Hugo (extended version)
2. Clone this repository
3. Run `hugo server -D` to start the development server
4. Visit `http://localhost:1313` in your browser

## Social Media Metadata

The site includes Open Graph and Twitter Card metadata for social media sharing. Custom banner images are located in `static/ui/og/` and are automatically used for their respective pages.

## Deployment

The site is configured for deployment through DigitalOcean (see `.do/` directory for configuration).

## Last Updated

January 30, 2025
