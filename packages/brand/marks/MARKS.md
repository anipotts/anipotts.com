# Brand marks

Every brand, app and device mark the admin shows, vendored here so nothing is
hotlinked. `scripts/brand/build-marks.mjs` turns this folder into one cached
sprite (`sprite.svg`), the lazy file URLs in `src/marks.generated.ts` and the
file ledger at the end of this page. `pnpm brand:marks` rebuilds them and
`pnpm test:brand` fails when a file, a source row or a hash drifts.

The marks identify the services in Ani's own admin. They remain the property of
their owners and do not imply endorsement. No private history, message content
or account information is included in any of them.

## Rules

- Brand artwork keeps its official colours in both themes. It is never
  recoloured, redrawn or used to show state.
- Every mark fills its tile. `svg/` holds flat single-colour glyphs only;
  each sits on its brand's own plate, drawn edge to edge like an app icon,
  in the pairing the brand uses for its own icon (`plate` and `color` in
  `src/marks.ts`: white on GitHub's `#181717`, X's, Vercel's and Resend's
  black, Buttondown's blue, Linear's indigo and npm's red; Cloudflare's
  orange and YouTube's red on white). Plates keep their colours in both
  themes; a dark plate keeps a faint rim on the dark canvas.
- Device renders are the icon itself, with no plate, tile, corner or clip
  behind them. ap-plus, a matte black phone, takes a light drop-shadow rim on
  the dark canvas so its outline reads.
- Every brand and app tile keeps a faint inner rim in both themes, so a
  white plate (Cloudflare's, YouTube's, Chrome's, Apple Health's) still reads
  as a tile on a white surface and a black one (Voice Memos, Lexar) on the
  dark canvas.
- `img/` holds artwork that brings its own colours: a 56 and a 112 px WebP
  (2x and 4x of the 28 px tile) with a 112 px PNG fallback, or one standalone
  vector when the official file needs gradients or clip paths.
- simple-icons ids hidden at the owner's request (openai, slack, linkedin,
  sandisk, windows, microsoft) never come from simple-icons. The build fails
  if one does.

## Processing

- macOS app icons were read from each installed app's `.icns` with
  `iconutil -c iconset` (the largest representation, 256 or 1024 px), then
  cropped to the opaque icon plate so the tile clips the plate edge to edge.
  The transparent margin and drop shadow are removed; the artwork is not
  altered.
- App Store artwork is the publisher-supplied `artworkUrl512` returned by
  `https://itunes.apple.com/lookup?id=<id>`, fetched as PNG.
- Apple Health is Apple's own App Store listing artwork, so the Apple Design
  Resources disk image and its licence are not involved. Its plate is drawn
  on white, so the tile's corner clips the white margin.
- ChatGPT Atlas's `.icns` tops out at 256 px (`icon_128x128@2x`), which
  still covers the 112 px rendition.
- Chrome's vendored icon is its white app plate, so it fills the tile like
  every other app plate.
- Rasters were resized with ImageMagick (Lanczos), written as WebP with
  `cwebp -q 90 -alpha_q 100 -m 6 -sharp_yuv`, and the PNG fallback was
  quantized with `pngquant --quality 80-98` (kept lossless when that would cost
  quality).
- Glyphs were optimized with svgo 4.0.1 (`preset-default`, titles, roles,
  dimensions, fills and styles removed) so the tile supplies their colour.
- The device renders (ap-mini, ap-pro, ap-phone, ap-plus) were generated with
  ChatGPT on 2026-09-21 from the Mac mini source icon
  (`apps/www/public/brand/sources/mac-mini.png`), as transparent 512 px PNGs
  sharing one bounding box. On 2026-09-22 each was cropped to its own alpha
  bounding box (alpha above 8 of 255, with Pillow), centred on a transparent
  square as wide as its longer side, then resized with ImageMagick (Lanczos)
  and encoded as above. The device's longer side fills the tile, so the Mac
  mini fills its box like an app plate, the MacBook spans its width and the
  phones its height; the source hashes below are the uncropped renders.

## Not vendored yet

- Calendar sources stay on the Phosphor calendar glyph until it is settled
  whether the calendar source is Google or Apple.

## Sources

| mark           | source                                                                                                                                                         | retrieved  | source sha256                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| 1password      | `/Applications/1Password.app/Contents/Resources/icon.icns` (com.1password.1password 8.12.36)                                                                   | 2026-09-21 | `67e7aee5c6e0234358b39734b951c54ffb987a1837f04fffffab25c04a181429` |
| ap-mini        | ChatGPT-generated device render from the Mac mini source icon (Ani, 2026-09-21)                                                                                | 2026-09-21 | `43aa258174f81bbcf09543baba564697ea32bd78d1af0cc5775f2f75fd0bf045` |
| ap-phone       | ChatGPT-generated device render, iPhone 16 in blue (Ani, 2026-09-21)                                                                                           | 2026-09-21 | `6bfdc5ae41451304085f5129f7002e2b9976639440358c29d4fe1c1b2d78be88` |
| ap-plus        | ChatGPT-generated device render, iPhone 15 Plus in matte black (Ani, 2026-09-21)                                                                               | 2026-09-21 | `eaf979cac984a9e1f3c21120ea16af0548cbc2f3f97051b7a68493d3432e6438` |
| ap-pro         | ChatGPT-generated device render, MacBook (Ani, 2026-09-21)                                                                                                     | 2026-09-21 | `d7a90470e04017e477c148d0d33571953a372a434ae4ef74c309d42561716f86` |
| applehealth    | App Store lookup 1242545199 (Apple Health, Apple Inc.), `artworkUrl512`                                                                                        | 2026-09-22 | `8b2cf50fdd2cfa1acfc4145524338d17775bad5dd4a247faa7461ddfa7933778` |
| buttondown     | Buttondown press kit, `https://buttondown.com/next-assets/Buttondown_PressKit.zip`, `Buttondown-Logo.svg`                                                      | 2026-09-21 | `81e75a670065a2cbd3928ad056d172d3b1015f0aa59471c149207b2d542a83ea` |
| calendar       | `/System/Applications/Calendar.app/Contents/Resources/AppIcon.icns` (com.apple.iCal 16.0)                                                                      | 2026-09-21 | `279f89daa017127bde7751e920576b1269621664827cccb00b19d829d1f6b0e4` |
| chatgpt        | `/Applications/ChatGPT.app/Contents/Resources/AppIcon.icns` (com.openai.chat 1.2026.153)                                                                       | 2026-09-21 | `6899c38554e58b034e84c43695d3d1f5f2e8109803a67d784022ec4274b0ff1b` |
| chatgpt-atlas  | `/Applications/ChatGPT Atlas.app/Contents/Resources/AppIcon.icns` (com.openai.atlas 1.2025.344.9)                                                              | 2026-09-22 | `c72e9b2be76257b8342d3723df818d1ad47514da029d5cc8c0dbdf6258a4e695` |
| chrome         | `/Applications/Google Chrome.app/Contents/Resources/app.icns` (com.google.Chrome 153.0.8010.53)                                                                | 2026-09-21 | `770c76bce29805a54ffd4fa28929f7f03a86d42d8cf281cadcff694e17483b95` |
| claude         | Anthropic press kit `ClaudeIcon-Rounded.svg`, `https://www.anthropic.com/press-kit`, unmodified (previously `apps/admin/src/assets/provider-marks/claude.svg`) | 2026-09-21 | `059e22f525d67c6258c4f64514f0b0e717c914df8a706936d0299d5e6b8082d9` |
| cloudflare     | `simple-icons@16.32.0` `icons/cloudflare.svg`, colour `#F38020`, guidelines `https://www.cloudflare.com/trademark/`                                            | 2026-09-21 | `408096d99907fd99e0863cb5d73f77a72537c6a85fd8d5e2704178a83a891f08` |
| codex          | `/Applications/AI/ChatGPT.app/Contents/Resources/icon-codex-dark-color.png` (com.openai.codex 26.915.31945)                                                    | 2026-09-21 | `69fb4384e161be8a20dcb94a9ac34aea4fbfaeb67514110a71e7b0732eccb0fc` |
| contacts       | `/System/Applications/Contacts.app/Contents/Resources/Contacts.icns` (com.apple.AddressBook 14.0)                                                              | 2026-09-21 | `daeaf494a411800ac5b5896cd77da7d60ce16d7af88df12ea447b11fa7f57f39` |
| github         | `simple-icons@16.32.0` `icons/github.svg`, colour `#181717`, guidelines `https://github.com/logos`                                                             | 2026-09-21 | `3bf8cceead820aec50d4ee825a3fd02c5a1cd6665cc9cf4cbf3d9c8861a204bb` |
| gmail          | App Store lookup 422689480 (Gmail, Google LLC), `artworkUrl512`                                                                                                | 2026-09-21 | `a1f181f16b9b081a136584a50a40b05a49d1032119fa251d99a36a38d0125e00` |
| googlecalendar | App Store lookup 909319292 (Google Calendar, Google LLC), `artworkUrl512`                                                                                      | 2026-09-21 | `1eaa40f511f0575f992ed8da589cbcc3e6e732db09a19ebee938b31d2a8acf25` |
| googledrive    | `/Applications/Google Drive.app/Contents/Resources/drive_fs.icns` (com.google.drivefs 131.0)                                                                   | 2026-09-21 | `93d314f3161a44f90a7d75a2025a9ff07f7f63a0e444fe3a02b4a7755a7a3d19` |
| granola        | `/Applications/Granola.app/Contents/Resources/icon.icns` (com.granola.app 7.576.0)                                                                             | 2026-09-21 | `f2306e63509d1fa1dd776cf60111f6c14a26a87ef19f3db29ec8e7b4e96b844c` |
| instagram      | App Store lookup 389801252 (Instagram, Instagram, Inc.), `artworkUrl512`                                                                                       | 2026-09-21 | `dc0149edc49fce2d599dd7d02c0c957bf7bfd2c4bf9e117206abf606310fd002` |
| lexar          | App Store lookup 6670745871 (Lexar, Lexar International), `artworkUrl512`                                                                                      | 2026-09-21 | `7ac2201a2158b0b87d73e2d6e045868187011819e85dc84853d3ff02c1f6bc1a` |
| linear         | `simple-icons@16.32.0` `icons/linear.svg`, colour `#5E6AD2`                                                                                                    | 2026-09-21 | `90b91b61090f4f9c94f9cb24769642278f03e8eedcfe5680738cf3a186bfc00f` |
| linkedin       | App Store lookup 288429040 (LinkedIn, LinkedIn Corporation), `artworkUrl512`                                                                                   | 2026-09-21 | `d313c49c3507cb31806221f5661cfa78fea21f58f590c9ecf5873aebdce97eae` |
| mercury        | App Store lookup 1491984028 (Mercury, Mercury Technologies, Inc.), `artworkUrl512`                                                                             | 2026-09-21 | `c79f982fa705110b267950acd87a7d7c79d6113fb6a6784b375eb8fc2114c362` |
| messages       | `/System/Applications/Messages.app/Contents/Resources/AppIcon.icns` (com.apple.MobileSMS 26.0)                                                                 | 2026-09-21 | `016775c2d0c7950ba6f7950434502b32e112af2ef6e7b4c583d69afa6f2fb4f0` |
| notes          | `/System/Applications/Notes.app/Contents/Resources/AppIcon.icns` (com.apple.Notes 4.13)                                                                        | 2026-09-21 | `3936b1834b262e7b8ae651a58dd536cd9b14af4a5da40145a899407445d04190` |
| npm            | `simple-icons@16.32.0` `icons/npm.svg`, colour `#CB3837`, guidelines `https://docs.npmjs.com/policies/logos-and-usage`                                         | 2026-09-21 | `00b410dc2c839cfa62910a065eaf28a48cbdb4babe503cf34d475cc94ba03be1` |
| obsidian       | `/Applications/Obsidian.app/Contents/Resources/icon.icns` (md.obsidian 1.8.7)                                                                                  | 2026-09-21 | `313153fc79bbf31b3c7e4639cf71552441f2e7de449e2965267eebaf58f326b5` |
| resend         | `simple-icons@16.32.0` `icons/resend.svg`, colour `#000000`, guidelines `https://resend.com/brand`                                                             | 2026-09-21 | `1a95a84811b2f856852afdbcb475419d9f8d18d6cc9dd7353d89a246162662eb` |
| safari         | `/Applications/Safari.app/Contents/Resources/AppIcon.icns` (com.apple.Safari 26.5)                                                                             | 2026-09-21 | `3dd019e290d9402434ebecac8a1944168e27f3a9b0b53ad05150da2ea5066846` |
| spotify        | `/Applications/Spotify.app/Contents/Resources/AppIcon.icns` (com.spotify.client 1.2.99.317)                                                                    | 2026-09-21 | `2ffd073e04a43233725fcf548c048df63d558510ec499db784717aaab5e1dfc2` |
| stripe         | App Store lookup 978516833 (Stripe Dashboard, Stripe, LLC), `artworkUrl512`                                                                                    | 2026-09-21 | `0ae1f0ae9fbe8e28f14a3abed5fd7a5a9c1a63b564f5890c30a31848c60f3947` |
| tailscale      | `/Applications/Tailscale.app/Contents/Resources/AppIcon.icns` (io.tailscale.ipn.macsys 1.96.2)                                                                 | 2026-09-21 | `443cf1bd77be64877b754db2a5fff7dad5ef698542ade59184a554e666ddf1a5` |
| vercel         | `simple-icons@16.32.0` `icons/vercel.svg`, colour `#000000`, guidelines `https://vercel.com/geist/brands`                                                      | 2026-09-21 | `57f1e4135486c566e9878fddd259f7f6bf8ec43f31e7e6e38a36d9e814a1c0e0` |
| voicememos     | `/System/Applications/VoiceMemos.app/Contents/Resources/VoiceMemosApp.icns` (com.apple.VoiceMemos 3.2)                                                         | 2026-09-21 | `2488403d403e06fc7e7d27537df3db41b43077c57b6ff1094e35f00266e80f2b` |
| whatsapp       | `/Applications/WhatsApp.app/Contents/Resources/AppIcon.icns` (net.whatsapp.WhatsApp 26.34.74)                                                                  | 2026-09-21 | `6be065440cf354497973693324f822802e54017b5401fe533742ba63cf6c525b` |
| x              | `simple-icons@16.32.0` `icons/x.svg`, colour `#000000`, guidelines `https://about.x.com/en/who-we-are/brand-toolkit`                                           | 2026-09-21 | `693e68863eceb8dc9f72e2acd386ab9c20a10858dab2c076212f7084cb7a32fe` |
| youtube        | `simple-icons@16.32.0` `icons/youtube.svg`, colour `#FF0000`, guidelines `https://www.youtube.com/howyoutubeworks/resources/brand-resources/`                  | 2026-09-21 | `5038808acbbc4e6edda16cbeb1cc6dec80e4e4ee4e227e039c41229fa222aa8c` |

The simple-icons tarball is
`https://registry.npmjs.org/simple-icons/-/simple-icons-16.32.0.tgz`
(`sha512-BwqATHxAulx7X6kNdTkecy7PBjLkgtAHcgrwYLd9iA+cD2At9DzhJwdwaSELk2+aZe01IfiM/Wxtyp68Dvup2A==`),
checked against the registry's published integrity. Source SHA-256 values are
for the file named in the source column (the `.icns`, the App Store PNG, the
press-kit SVG or the simple-icons SVG) before processing.

## Files

<!-- files:start -->

| file                          | bytes | sha256                                                             |
| ----------------------------- | ----- | ------------------------------------------------------------------ |
| `svg/buttondown.svg`          | 1213  | `d6df088e6f0be9463c7cd2511c3b645b21dafe549c6c52ec11c5e171a689c96d` |
| `svg/cloudflare.svg`          | 807   | `4beaf58d7244deb33e887625d7575cba7a68c5a9dba8e8996a2ae5fa53b3b4f6` |
| `svg/github.svg`              | 755   | `ee16cb441b9b7d95febc0c7ec45fb8885ca75f23ea942d036dda87adceaa0519` |
| `svg/linear.svg`              | 356   | `98312e7462500e6d067d32c2ee09d59c2904b122dd7091dbf07d39f75ce06fec` |
| `svg/npm.svg`                 | 253   | `7a2cfea9ccda1f5371bd15df80ae337af0e26ad037823e35fd3cb04b5ca71cb0` |
| `svg/resend.svg`              | 277   | `7fdaf028ed41d5ffece28b6488f65a36cd33e6fbb74f54caa2ecd76807c84e02` |
| `svg/vercel.svg`              | 65    | `83366e6182644327df4b2a51178fc7cea892fb312ca13b5bc5e7d196b214a40c` |
| `svg/x.svg`                   | 237   | `330a6edbdbc6ab0fd10e4449a144e4d6fc25873ed973b910b83ac583fda4cdbf` |
| `svg/youtube.svg`             | 369   | `f84ac559337643c57dee859e3348dbe20288d8f3ab344d1fabda2661250d1521` |
| `img/1password-112.png`       | 7247  | `440ceeb4c182a5d22c1b70184724586c0f2221c66e5f21be4af4bd4d7ef15997` |
| `img/1password-112.webp`      | 4692  | `fb07bb3bc50d083449cf674bbed9d7b905531d623b5720f547b4b6f5f7407d39` |
| `img/1password-56.webp`       | 2032  | `fa28f77122786444cfb8c99cef167ce4043240116e6149488470a8f544b6f0dc` |
| `img/ap-mini-112.png`         | 6885  | `e29d0adf2568d147e78a079b6344863e5feeebc1b3eb4496944b79d6a223b107` |
| `img/ap-mini-112.webp`        | 3328  | `634e374c2cf3d704298b596bd59a4a6cc468a32a4a17f3bb9370cd968573b1bc` |
| `img/ap-mini-56.webp`         | 1492  | `07e536da5f40ca492e91b5a4f5810f31fcd5cbd7c5844107915f66659feb39c6` |
| `img/ap-phone-112.png`        | 5660  | `115e7c2888f63dc63773aa9a6a3135ddb7dfd40f5abb79ecaa08268f11b6dca3` |
| `img/ap-phone-112.webp`       | 2798  | `8f56ea7637b2074861af46ef6aefa0db4e35d4b26b2dacc456af7b6348f4d25e` |
| `img/ap-phone-56.webp`        | 1382  | `5d465b7d38e3ff70fd049d1b5ac7810d5d2db19b3c62dd51e4e05c2ca6e3a5d2` |
| `img/ap-plus-112.png`         | 4247  | `3154766333b287839e0acae79200450161e18eeef5a9fb432b2acbf801baeba4` |
| `img/ap-plus-112.webp`        | 1902  | `4053bb69a29d968dd61c27f865a894be0574019c802e057cabdcf5422e7b3b89` |
| `img/ap-plus-56.webp`         | 854   | `452f77665b6e75f95b9ab1014ffe74f937dfc6704b5756079ad9af9a02b6448c` |
| `img/ap-pro-112.png`          | 5601  | `44bd9f6cd2c9b96c6f49ce3504246c42e61763746ea3d193d3552f85f05682c7` |
| `img/ap-pro-112.webp`         | 2288  | `18f6ca9a674f0bbb511a04dd19b52530517eedda4621d69fb32b1d2ec2e50278` |
| `img/ap-pro-56.webp`          | 1042  | `9f8dde5313ccaa65aa65dbb9fa1a1bf3405eba99d7d57c62013db651c1db792f` |
| `img/applehealth-112.png`     | 3095  | `9c8296094631d66df5962577363d6a09b3a90c6f5debdd55c2fcc8410bde7f57` |
| `img/applehealth-112.webp`    | 1090  | `78c9950b63ebbee78380ac8785b544cf060e4fd616b9f9515eaa63a8fe2d7b56` |
| `img/applehealth-56.webp`     | 528   | `6e851f5dc2b1e5b5b9aed86c1211327b3813bfd519fcc42ac670de5fd85e1f0a` |
| `img/calendar-112.png`        | 3638  | `f4247602c43dd3777430cec58ef162b47dfdd0646b25cb6fc1c3461ed454dea4` |
| `img/calendar-112.webp`       | 3266  | `cc2df506923c389da2f2e8e1e5e26676d66b69d8a15ba86e0ffd06f737200425` |
| `img/calendar-56.webp`        | 1542  | `131f10cb8b0365bbdf3b24e58a317851a2ff4083adc6d03d6bb91e80fb43e319` |
| `img/chatgpt-112.png`         | 6218  | `a23a532da42682e230419ee155ca33bfb07f46787af9119bfeb2ac3dc1f30fae` |
| `img/chatgpt-112.webp`        | 4030  | `d887e095827a75e60acf7255ce6376b140b75068ec93db5bc8355664549673e8` |
| `img/chatgpt-56.webp`         | 1812  | `2c799e2aff1b5786765a58f856bfb93618afc29ab234ea0130e389c83705304a` |
| `img/chatgpt-atlas-112.png`   | 5767  | `dfb5ba9dee2582500bd5e6f34433a238207167fc1ed1419c704eb8aaa3429a0f` |
| `img/chatgpt-atlas-112.webp`  | 3366  | `9e9f5bc4972cb1a245fd56e5fde74c4743fc0750fc6e8a183f0f6f662cda01b4` |
| `img/chatgpt-atlas-56.webp`   | 1648  | `5f610c71aad500dfd582359e0a2128c67980006399f4db002a6f277d2dbf9ff8` |
| `img/chrome-112.png`          | 6037  | `4f4c7626770e9f3b6d731549f88b5c951483037c8c60852e04da7e3c5ec91a32` |
| `img/chrome-112.webp`         | 4708  | `d7e44f32ec19ab7663bb0f9f1a3aad9810dec1807e93c99a46d24eae2af00b0e` |
| `img/chrome-56.webp`          | 2236  | `56521d9b4109ef5e86e5426f477fb4fed4b89faee0d38b1808bb41c95714e7be` |
| `img/claude.svg`              | 3064  | `059e22f525d67c6258c4f64514f0b0e717c914df8a706936d0299d5e6b8082d9` |
| `img/codex-112.png`           | 5560  | `b6c37e956f833a2a270c9546e78ebc32c90183a046f5ee52d15feda1a072bae4` |
| `img/codex-112.webp`          | 2862  | `3287a4258c5ddead39a5f45b1613b326ed97219fad3f420cefe02353f2018290` |
| `img/codex-56.webp`           | 1434  | `40c4302d38ae2ef27df3f3046c4d35019dab25c903dc390397b6eceaa1dc935a` |
| `img/contacts-112.png`        | 5678  | `7059cb7d893113e9b2a345c0902cd7e5c6a692a3087961993cb7a0a90c4dfbd2` |
| `img/contacts-112.webp`       | 2852  | `9a7be306a73af4d1f8567924fd80c86209a057bf396b44e31dfcf98b0af0807b` |
| `img/contacts-56.webp`        | 1338  | `9ecaef2514a8b411829b9c02fdcca22c0b197cc79b19076c5c01695183ea21e3` |
| `img/gmail-112.png`           | 3447  | `1203e06594c2cf6a5e93bc0c00b6dc31900e3814754d4652940c2ebdc225296c` |
| `img/gmail-112.webp`          | 1616  | `cd36474bc062424284c2c83caf7434b3cabe04e4b54a2964046d1003529d7a6f` |
| `img/gmail-56.webp`           | 838   | `0482be6cd2a1e44520921252e0a8d058e6ac972bf765e0e589aece9b4875c708` |
| `img/googlecalendar-112.png`  | 3082  | `b3dd0ec8b21bf5acdb295c3f519e3f4b22eb32809ed016a22f27bb37e03b237b` |
| `img/googlecalendar-112.webp` | 1760  | `ca939ef792e4e1f73a23c27b3ce22f939b55ce7412884148b3fbed0f24b2d26f` |
| `img/googlecalendar-56.webp`  | 868   | `81bbafedd0bc0111b5e610a617d149d2398b64fe0990dfbb31cc46a450a5fa8b` |
| `img/googledrive-112.png`     | 4147  | `59d4f3969dc8cbb5b9193906d5494704c7414991890a7476fce6071e598bc52d` |
| `img/googledrive-112.webp`    | 2874  | `ffbb50b953dc6719c205c386e9ff7056e494d6cc0efd1382fc6e9b7b2fb52613` |
| `img/googledrive-56.webp`     | 1360  | `e3c6d82b5f2dcee6d23702b598ca7873ae32717e663a5dd3e5cedf8e1a56769d` |
| `img/granola-112.png`         | 5528  | `de1ef1f0a8153ef255a52d7316224d28fd786a7620d03c263bd5e78f254a1851` |
| `img/granola-112.webp`        | 3864  | `c45916e37adfbe22a06c769ca7cbde78088626356a23a869930000aec2f4f5d4` |
| `img/granola-56.webp`         | 1950  | `ca32bca51c358e925d6f00e87277868de40a203b0b73b259447abf334b76b714` |
| `img/instagram-112.png`       | 6442  | `a4506d353e33e47a749087ef9020b5891c3ea54290b9cfd098aac2c84e3d27cb` |
| `img/instagram-112.webp`      | 3662  | `5d608f0986a961c5aad451d9253dba41310035e613a3d570f06e905a0043e4fe` |
| `img/instagram-56.webp`       | 1730  | `63f70a22f21d8f07a8c6fbb85ece8621eb1e9ababc251ba14bab7f140d706167` |
| `img/lexar-112.png`           | 1220  | `c9aa9b30fb407e6777f1fc3d88af1e57ab9208b3bfd0aa76adceec38afa206a8` |
| `img/lexar-112.webp`          | 1232  | `c468e2902358b36a87246a1d53191893015d89098ab9a999933cc76a8cebe4bf` |
| `img/lexar-56.webp`           | 616   | `9b6f1f3f1825fd0f111bc0dca761f8b9be3d2401b497989032e114d0848d3482` |
| `img/linkedin-112.png`        | 831   | `135aa070851d2288ca8ac87436795d8f3bf5cd48caf998d4449368b94cf4c82f` |
| `img/linkedin-112.webp`       | 1228  | `537306bb15097fd3d38f337c224d5858e3b7a9af825d87f63ce4762a9f4a2de0` |
| `img/linkedin-56.webp`        | 750   | `6c1290d111e401103ed3b44221d6b9ef59b1579d9b9e61037efd1d4dc914e3ac` |
| `img/mercury-112.png`         | 6642  | `c9edc7fdb82cb35a3e7acb726e21a830f2203a2d0574b7de2fd1e1021073414f` |
| `img/mercury-112.webp`        | 3818  | `fa689bc76ea066e4c30e4f56d23555c731245f2ca404f77ac0ae2a9a13eb73eb` |
| `img/mercury-56.webp`         | 1582  | `cfe80717b770e0b4eaa7e12a7da59dec8bcc7d7078c0b70e20e2e272b830f31d` |
| `img/messages-112.png`        | 5544  | `25f6016c93a0fc8b3c17eec9a37be7adc4ccf496d55066439dbe26d7edf2d9a5` |
| `img/messages-112.webp`       | 2894  | `67cb3f03899aa66509ca7cc14be0b79722f6a84a9a7cd3bc59948f7191d89530` |
| `img/messages-56.webp`        | 1382  | `001d6d7dfbdc1d3d13ae2c3a9e1a6b1aad544ae104c3ac86b070b9e6f0f964ab` |
| `img/notes-112.png`           | 2255  | `42a7f9b288b189e8cc555af1bb21fdee70819e07b68586a028cfd8d2a3d3a23d` |
| `img/notes-112.webp`          | 2262  | `76643739898d89816d860f38201e56206f85a081a87b79b958ceb82d6bb6ff71` |
| `img/notes-56.webp`           | 1124  | `4415aa3b279a5032297f1accac24ea9d79f3863f02d139152ce05b946f361d6f` |
| `img/obsidian-112.png`        | 4891  | `1b0b4958326190a0828c4e931861998d8de348bb29768be5222bd5c012e4a80e` |
| `img/obsidian-112.webp`       | 2566  | `57225508d4fd9a35b9fb1b52c898c23ee41ddaa87bcc6e94f78c37909abbebd7` |
| `img/obsidian-56.webp`        | 1198  | `a8c44af933da49490e2f87366c7d1886ff51f74c8a17778e3e3060920262f33a` |
| `img/safari-112.png`          | 6254  | `1d788bb9403a91a4f48f099a7ead1868e72e41be380118609f137b08d686e49e` |
| `img/safari-112.webp`         | 4932  | `9daf9590ae1aca53bd7471933f87d16d43782768f6dbed1cc27c72ab22395ae5` |
| `img/safari-56.webp`          | 1950  | `c10134682b1e9b6bbae265ce5ee00838cd4bb55b5db3eb48d4baf2b622c471fd` |
| `img/spotify-112.png`         | 2603  | `45ddcead8d153124554ad2cdbcd185453809d4c53a0d6069891d0591dd4b3706` |
| `img/spotify-112.webp`        | 3312  | `072fbd76add0066f97cc2617f3014ceb748918d14dc499cd419455e7b6e5f77f` |
| `img/spotify-56.webp`         | 1548  | `a0803813d37c5dcad05dd48b52f4cd180f279f13cb1e78a10dbc7ecfda88ac79` |
| `img/stripe-112.png`          | 1476  | `090ec829ef2881ab6b4d78bec7c85ec8d326d2cbfb7b227a1d3532ca9c27fc2e` |
| `img/stripe-112.webp`         | 1116  | `105fd52462939465e947f3fd14d7b89f54c61788902fa1848e211e0b9e2df39b` |
| `img/stripe-56.webp`          | 740   | `9a4af496d70e3ba9b2950831f344ec680b072c3c7e53d4817c6f5417eb569248` |
| `img/tailscale-112.png`       | 2531  | `7c515dfbe9f50220c1d51fae6cb530576d62d44b39f323b415c1dda0d1d2d573` |
| `img/tailscale-112.webp`      | 2134  | `e98f27c63653d26cf1f014f1c108399471ebec8183a21f1383a9f37796c5eb49` |
| `img/tailscale-56.webp`       | 1052  | `36ed234e6a943ca48d82a48ac6e94fd5b02bcd74b866fa942b08c4109a0b96b3` |
| `img/voicememos-112.png`      | 5028  | `3369d788d7c705481e1eb0d460e4fcc5d5c7f3975868ed9790942fc59d5e3f6c` |
| `img/voicememos-112.webp`     | 2866  | `42d6cac17b818a586fd0b22e41ee33f6ca660ec56ed09c8a8d3ee1a26c0445cb` |
| `img/voicememos-56.webp`      | 1494  | `501c08f30f67cf76ecbadf41b7c7ff61ed5f665948ef1e265a20ea02fc60e18f` |
| `img/whatsapp-112.png`        | 6298  | `1d1dfc46bd5794d6f2d66d85cb53b68ec1d1ca595cde620822b525b1da490089` |
| `img/whatsapp-112.webp`       | 3918  | `c1d78394eab21d7f9f27be7eb3c970254895ca43c49c8d8f5ceff491a5660885` |
| `img/whatsapp-56.webp`        | 1966  | `027727c98e5ef6bd0a1a0730a719770b92efac1efae1af7483984c7ba9c91eb8` |
| `sprite.svg`                  | 4552  | `011380b05fa8b2d9fb4554e9a7ff5bd0b64c32f80727ac143517e412f3093e22` |

<!-- files:end -->
