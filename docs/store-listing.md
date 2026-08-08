# SlopFilter

## Short description

Collapse low-quality posts in your X timeline using local, observable signals.

## Full description

SlopFilter makes a busy timeline easier to read. It can collapse posts using posting behaviour, engagement context, content signals, image evidence, and patterns you explicitly reject. Each collapsed post shows a reason and can be restored with one click.

Nothing is deleted. There are no accounts, analytics, telemetry, or servers. Settings, statistics, and feedback stay in your browser.

## Permissions

- Storage is used for settings, local statistics, account overrides, and feedback.
- X and Twitter host permissions are used only to read the Home timeline markup and add reversible controls. The X image CDN permission is used to inspect visible thumbnails for C2PA content credentials; full-resolution media is not requested.

## Privacy declaration

SlopFilter makes one-time model downloads from the pinned Hugging Face model host. For posts with images it may also fetch the visible X thumbnail to inspect C2PA credentials; filtering and feedback stay local, and image checks fail open. To verify: open DevTools for the X tab, choose Network, clear the list, and browse the timeline after the first model load.
