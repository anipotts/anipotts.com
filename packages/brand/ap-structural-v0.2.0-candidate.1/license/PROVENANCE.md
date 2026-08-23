# AP Structural provenance

AP Structural Display Black `0.2.0-candidate.1` corrects AP Structural
`0.1.0-candidate.1`, a modified version of Urbanist Black. The preserved v0.1
TTF has SHA-256
`2933d7de53354e86842249c415e50aba4f6692b1b0f398c9e87dad4ba6ce83bc`.
Its Urbanist source was `kit/source/Urbanist-Black.ttf` at SHA-256
`ea0fc2180daff145250764c96c4a297671bc58c8a87d2ead300e8a2d02ddfd9b`.

The first AP Structural candidate compressed simple outlines to 90 percent
width and then applied the same transform again inside composite glyphs. This
build deterministically reverses both transformations. It restores normal
horizontal metrics while preserving glyph order, character mapping, anchors,
kerning, and the AP Structural family metadata. The original source lineage
commit is `3fce36bee9af1ace23ea1ab70c45d46b9a117975`.

Urbanist and this modified font are distributed under the SIL Open Font
License 1.1 in `OFL.txt`. The upstream license declares no Reserved Font Name.
The Urbanist Project Authors are credited only as the upstream font authors.
No endorsement is implied.

The build uses `fonttools==4.60.2` and `Brotli==1.2.0`. Status is `web-ready`
for brand display headings. Urbanist remains the fallback.
