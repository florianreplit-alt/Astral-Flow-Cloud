# ☁️ Astral Cloud

A small WhatsApp utility bot built with [Baileys](https://github.com/WhiskeySockets/Baileys).

## Setup

```bash
npm install
node index.js
```

On first run, a QR code will print in your terminal. Scan it from
**WhatsApp → Linked Devices → Link a Device**.

Once paired, your session is saved to `auth_info/` — you won't need to
re-scan on future restarts (as long as that folder persists).

## Running with PM2 (recommended for VPS)

```bash
pm2 start index.js --name astral-cloud
pm2 save
```

## Commands

| Command | Description |
|---|---|
| `.menu` | Show the full command list |
| `.time` | Current time (or `.time japan` for another country) |
| `.date` | Today's date |
| `.ping` | Check bot response speed |
| `.calc <expr>` | Quick calculator, e.g. `.calc 12 * (4 + 1)` |
| `.shorten <url>` | Shorten a link |
| `.qr <text>` | Generate a QR code image |
| `.sticker` | Reply to an image with this to turn it into a sticker |
| `.tenor <query>[, count]` | Search Tenor and send back animated stickers |
| `.about` | About Astral Cloud |

## Downloaders

| Command | Description |
|---|---|
| `.play <song name or link>` | Search YouTube and send back the audio as MP3 |

`.play` searches YouTube for the song, then downloads the audio through a
y2mate-based scraping backend. This depends on a third-party site's HTML
structure, so it can break if they change their site — if `.play` stops
working, the fix is updating the scraping logic in `utils/y2mate/audio.js`.

## Downloaders

| Command | Description |
|---|---|
| `.play <song name or link>` | Search YouTube and send back the audio as MP3 |
| `.tiktok <url>` | Download a TikTok video (or images) |
| `.ig <url>` | Download an Instagram post/reel |
| `.pinterest <url>` | Download a Pinterest image/video/gif |
| `.fb <url>` | Download a Facebook video/photo |
| `.dl <url>` | Auto-detect the platform and download |

`.play` uses a y2mate-based scraping backend. `.tiktok`/`.ig`/`.pinterest`/`.fb`
use tikwm.com and api-faa.my.id. All of these are third-party scraper APIs,
not official platform APIs — they can change or go down without notice. If
one stops working, the fix is updating the relevant fetch function in
`utils/downloaders/fetchers.js` (or `utils/y2mate/` for `.play`).

Replying to a message that contains a supported link also works for `.dl`.

## Files

| Command | Description |
|---|---|
| `.7zip` | Reply to an archive to extract it |
| `.7zip add <path/name.ext>` | Reply to a file to add it to the compression queue |
| `.7zip up` | Compress everything in the queue and send it back as a .zip |

`.7zip` auto-downloads a portable 7-Zip binary on first use (into
`media/bin/7ZIP/`) and shells out to it. Queue size, max file size, and
compression timeout can be tuned via `MAX_QUEUE_SIZE`, `MAX_UPLOAD` (in MB),
and `COMPRESS_TIMEOUT` (in ms) environment variables.

## Search

| Command | Description |
|---|---|
| `.anime <title>` | Search AniList — poster, short synopsis, rating |
| `.movie <title>` / `.omdb <title>` | Search OMDb — poster, short synopsis, IMDb rating |

`.movie`/`.omdb` needs an OMDb API key set as the `OMDB_API_KEY` environment
variable (free key from [omdbapi.com](https://www.omdbapi.com/apikey.aspx)).
`.anime` uses AniList's public GraphQL API and needs no key.

## Group moderation (admin-only)

| Command | Description |
|---|---|
| `.kick @user` | Remove a member (mention, reply, or number) |
| `.add <number>` | Add a member by number |
| `.promote @user` | Make a member admin |
| `.demote @user` | Remove admin status |
| `.tagall <text>` | Mention every member, visibly |
| `.hidetag <text>` | Ping every member without showing the tags |
| `.mute` | Only admins can send messages |
| `.unmute` | Everyone can send messages again |
| `.setname <name>` | Change the group name |
| `.setdesc <text>` | Change the group description |
| `.antilink on/off` | Auto-delete + kick on links |
| `.antistatus on/off` | Auto-delete + kick on Status shares |
| `.antichannel on/off` | Auto-delete + kick on Channel forwards |
| `.antispam on/off` | Auto-delete + kick on rapid message spam |
| `.welcome on/off` | Verify new members with a math check before they can stay |

All anti-features are **ON by default** in every group. Only group admins can
run these commands, and group admins are always exempt from the anti-features
(so an admin sharing a link won't get kicked).

`.welcome` is **OFF by default**. When on: new members get tagged with a
random simple addition question (e.g. `3 + 5 = ?`) and 5 minutes to answer
correctly in the group. Wrong answers are ignored (they can keep trying until
the timer runs out). On a correct answer they're tagged again and asked for
their name, age, best/worst anime, and the year they started watching —
that part is just for fun, nothing is required or stored. If they don't
answer the math question correctly within 5 minutes, the bot removes them
(only if it has admin rights in the group — otherwise it just posts that it
couldn't).

Admin-only commands fire immediately once the sender is confirmed an admin —
they don't pre-check whether the bot itself is a group admin. If the bot
lacks admin rights, the underlying WhatsApp API call fails and the bot
reports it couldn't complete the action.

## Project structure

```
astral-cloud/
├── index.js              # Entry point — connection + message listener
├── handlers/
│   └── router.js         # Parses commands, dispatches to command modules
├── commands/
│   ├── menu.js
│   ├── datetime.js
│   ├── calc.js
│   ├── shorten.js
│   ├── qr.js
│   ├── sticker.js
│   └── misc.js
├── utils/
│   └── extractText.js
└── auth_info/             # Session data (auto-created, gitignored)
```

## Adding a new command

1. Create a new file in `commands/` that exports a function.
2. Import it in `handlers/router.js` and add a `case` in the switch statement.
3. Add it to the menu list in `commands/menu.js`.

## Notes

- Uses `.` as the command prefix (change `PREFIX` in `commands/menu.js`).
- `auth_info/` contains your WhatsApp session — never commit it or share it.
- Deleting `auth_info/` will require re-pairing via QR code.
