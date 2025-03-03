---
title: "Gallery Example"
---

# Gallery Example

This is an example of how to use the gallery shortcode.

{{< gallery >}}
  {{< gallery-item src="/exhibitions/galleries/perspectives-1.jpeg" alt="Perspective 1" >}}
  {{< gallery-item src="/exhibitions/galleries/perspectives-2.jpeg" alt="Perspective 2" >}}
  {{< gallery-item src="/exhibitions/galleries/perspectives-3.jpeg" alt="Perspective 3" >}}
  {{< gallery-item src="/exhibitions/galleries/tf2-1.jpg" alt="Tokyo Flâneur 1" >}}
  {{< gallery-item src="/exhibitions/galleries/tf2-2.jpg" alt="Tokyo Flâneur 2" >}}
  {{< gallery-item src="/exhibitions/galleries/wwm-1.jpg" alt="Walk With Me 1" >}}
{{< /gallery >}}

You can use the gallery shortcode anywhere in your content to create a responsive three-column gallery with lightbox functionality.

## How to Use

1. Wrap your gallery items with the `gallery` shortcode:
   ```
   {{</* gallery */>}}
     <!-- Gallery items go here -->
   {{</* /gallery */>}}
   ```

2. Add gallery items using the `gallery-item` shortcode:
   ```
   {{</* gallery-item src="/path/to/image.jpg" alt="Image description" */>}}
   ```

The gallery will automatically arrange images in a responsive three-column grid and enable lightbox functionality when images are clicked. 