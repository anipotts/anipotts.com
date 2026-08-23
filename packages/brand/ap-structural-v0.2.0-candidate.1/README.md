# AP Structural `0.2.0-candidate.1`

Status: `web-ready`.

This packet corrects the first AP Structural build. Version 0.1 compressed
simple outlines to 90% width and applied the same compression a second time to
composite glyphs. That made letters such as `i`, `j`, and accented forms visibly
narrower than the rest of the face.

Version 0.2 restores the source proportions, composite transforms, advance
widths, and normal width classification. The family remains AP Structural and
retains the same 487 glyphs and 491 mapped code points.

Rebuild with the pinned FontTools and Brotli versions recorded in
`license/PROVENANCE.md`:

```bash
python3 scripts/brand/build-ap-structural-v0.2.py
```

Rollback by changing the shared typography source back to the preserved v0.1
WOFF2 file. Do not delete either immutable packet.
