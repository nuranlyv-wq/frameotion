# Frameotion

**Let your AI direct. Render motion videos locally.**

Frameotion is an editable motion engine with an MCP interface. Your connected
assistant composes native scenes, inspects real browser-rendered PNGs, repairs
layouts and exports MP4. The local MCP workflow does not call paid model APIs.
Your MCP client may have its own model costs.

- Native typography, camera paths, glass, hinges and object transformations.
- Revision history and immutable render snapshots.
- Frame previews and layout audits before export.
- Local stdio transport; no hosted account required.

## Quick start

Requires Node.js 22.12+, Chrome/Chromium and FFmpeg on PATH.

```sh
npm ci
npm start
```

Open http://127.0.0.1:4177/connect.html to generate a configuration for your
installation or open the Cursor install link. Other MCP clients can copy the
JSON into their local MCP settings. Restart the client after saving.

```sh
npm run mcp:config
```

Ask your connected assistant:

> Read frameotion://guide and the connected-project example. Make a short
> product motion video. Preview the intermediate frames, repair the layout,
> audit it and render an MP4. Keep each scene causally connected.

[Tools and scene schemas](docs/frameotion-local-mcp.md) ·
[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Scope and limitations

This is a local engine, not a hosted remote MCP endpoint. A website cannot
install Node, FFmpeg or a local MCP server silently. Scene authorship is supplied
by your connected AI; audits do not prove creative quality. The wider studio
also includes experimental workflows with separate dependencies and API keys.
Imported client media and proprietary sound packs are not distributed; add
media you have rights to use. Some optional studios need additional assets.

## License

Frameotion-owned code is MIT licensed. Third-party code, fonts, marks and
runtime dependencies retain their own terms. See THIRD_PARTY_NOTICES.md.
Remotion licensing must be reviewed for your use, especially commercial teams.

If Frameotion helps you ship a video, a star and a reproducible example help
others discover it.
