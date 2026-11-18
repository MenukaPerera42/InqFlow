# InqFlow — Website Brand Kit

Prepared from your chosen coral InqFlow logo. The PNGs have transparent backgrounds. The artwork is raster-derived from the supplied PNG, not an original editable vector SVG.

## Contents
- `public/brand/inqflow-logo-*.png`: horizontal full logo at multiple widths
- `public/brand/inqflow-logo.webp`: optimized horizontal logo
- `public/brand/inqflow-wordmark.png`: wordmark only
- `public/brand/inqflow-mark-*.png`: icon only
- `public/brand/og-image.png`: social share preview (1200 × 630)
- `public/icons/`: favicon, Apple touch, PWA icons, maskable PWA icon
- `public/favicon.ico`: browser favicon
- `public/site.webmanifest`: PWA manifest starter
- `preview.png`: visual overview

## Next.js App Router setup
Copy the contents of `public/` into `apps/web/public/` (or your Next.js public folder). Then add this to `apps/web/src/app/layout.tsx` metadata:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InqFlow",
  description: "Customer inquiry management made simple.",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-32.png", type: "image/png", sizes: "32x32" }],
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: { title: "InqFlow", description: "Customer inquiry management made simple.", images: ["/brand/og-image.png"] },
};
```

For a responsive navbar:

```tsx
import Image from "next/image";
<Image src="/brand/inqflow-logo-640.png" alt="InqFlow" width={220} height={76} style={{ width: 180, height: "auto" }} priority />
```

Adjust the displayed dimensions to fit your layout. Do not use the logo image as a CSS background if accessible text is needed.

## Brand colors (approximate from supplied raster)
- Coral: `#FF4B49`
- Charcoal: `#30343A`
- White: `#FFFFFF`

## Notes
- Logo mark has a speech-bubble and flowing arrow.
- Transparent assets work on light backgrounds; the dark wordmark is not optimized for dark backgrounds.
- PNG-derived transparency may have minor edge artifacts. For print-quality scaling, recreate the logo as vector artwork.
- The PWA manifest is optional; including it does not by itself make the site a full offline-capable PWA.
