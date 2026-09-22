# Workflow source marks

The Codex mark (`codex.png`) is a resized copy of the official Codex macOS app
resource `icon-codex-dark-color.png`, recorded with the other brand marks in
`packages/brand/marks/MARKS.md`. It retains the native app artwork and
background.

The light variant (`codex-light.png`) is the unmodified official
`icon-codex-light.png` bundled in the installed app's Resources directory.
Source SHA-256: `de7d43f3386105ab20952958c2c25beb0d903e2aeb6e1aef57c49a648c0d1c07`.
The site selects the light or dark artwork using its active theme.

These marks identify the services in a personal system diagram. They remain
the property of their respective owners and do not imply endorsement.

Unused marks belonging only to the retired lifecycle experiment were removed
on 2026-09-08. Current marks use the local assets and vector icon packages
listed in the shared provider registry.

## Workflow marquee artwork, 2026-09-07

The workflow uses one 36px tile, 9px corner radius, and a shared theme-aware
background/border. Brand artwork keeps its original colors in both themes.
The only native light/dark artwork pair is Codex, as documented above.

- `messages.png`: PNG rendition of Apple's installed Messages
  `AppIcon.icns`, preserving the original green icon and white bubble
- `1password.png`: PNG rendition of the installed 1Password app's
  `icon.icns`, preserving the product icon rather than the single-color
  company mark; [1Password explains the distinction](https://1password.com/blog/1password-brand-refresh)
- `obsidian.svg`: unmodified [current gradient mark](https://obsidian.md/images/obsidian-logo-gradient.svg)
  linked by [Obsidian's brand guidelines](https://obsidian.md/brand)
- `instagram.jpg`, `linkedin.jpg`, `spotify.jpg`, `whatsapp.jpg`:
  publisher-supplied 512px artwork returned by Apple's App Store lookup
  for IDs 389801252, 288429040, 324684580, and 310633997 respectively
- `granola.png`: unmodified [site icon](https://www.granola.ai/icon.png)
  referenced by Granola's official homepage
- `mercury.jpg` and `stripe.jpg`: publisher-supplied 512px artwork from
  Apple's App Store lookup for Mercury Technologies' app (1491984028) and
  Stripe Dashboard (978516833), retrieved 2026-09-07

Native ICNS assets were converted to PNG without altering their artwork.
On 2026-09-14 every raster mark here was downscaled to about three times its
largest rendered size (80, 112, 128 or 144px) so pages stop shipping 512 to
1024px sources. The SHA-256 above describes the unmodified Codex source.
Small internal padding in native app assets is accounted for by display size.
No private history, message content, or account information is included in these assets.
