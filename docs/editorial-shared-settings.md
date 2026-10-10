# Shared website settings

Open **Content → Pages → Home** in Admin. The Shared navigation, Shared footer,
and Shared search and feeds groups edit the public shell alongside the homepage.
Saving retains a private draft. Review and publish the home record to activate
its homepage and shared settings together. The home preview shows the exact
candidate settings before publication.

Existing records without `site_settings` use the current code defaults. Opening
an old record displays those defaults without adding them to its source. Editing
one field adds only that override. Re-enter the displayed code default to restore
that field's current appearance; removing the optional override from source also
restores the code default.

The optional homepage frontmatter uses this shape:

```yaml
site_settings:
  navigation:
    work: work
    writing: writing
    systems: systems
  footer:
    prompt: have a question?
    profiles:
      github:
        label: github
        href: https://github.com/anipotts
    rss_label: rss feed
    admin_label: admin
  seo:
    homepage_title: Ani Potts | Software Engineer Building AI Systems
    description: Ani Potts builds AI agents and data intensive software systems, and writes about working with coding agents.
    title_suffix: ani potts
    feed_description: ani potts. stuff i've figured out and felt like writing down.
```

Every field and group is optional. Footer profiles support `github`, `x`,
`linkedin`, `instagram`, and `tiktok`; each accepts an optional label and HTTPS
URL without credentials. Navigation destinations, RSS and Admin destinations,
icons, canonical origin, owner identity, contact mailbox, and executable behavior
remain in code. Shared labels and links appear on public pages; the title suffix
applies to page and detail search titles, and the feed description applies to RSS.
Page and article descriptions retain their own metadata.

Coding agents use the existing home-record draft and publication API. They must
retain unrelated frontmatter and body, save with the expected revision, and bind
publication to the reviewed source. There is no separate settings writer or
implicit publication on save. Deploying this software does not edit published CMS
records or change their current wording.

Deploy and verify the paired Admin and public readers before publishing a home
record with settings overrides. The unchanged content schema version does not
advertise support for these fields, so the existing publisher readiness response
alone cannot prove that the public renderer understands them. A previous reader
can still read the record, but ignores the optional settings and renders its code
defaults. After publishing overrides, retain a renderer that understands them for
rollback when their appearance must be preserved. This software change publishes
no overrides and does not establish live reader capability by itself.
