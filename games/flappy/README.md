# Flappy BjK

Touch the play area or press Space to flap. Each cleared gate gives one point.
The flight continues until a collision, with difficulty increasing gradually.
Opening Flappy starts at the top of the page. Starting or resuming a flight
never scrolls the page; manual scrolling leaves the game running.
Leaving the game, switching browser tabs, or losing window focus pauses it.

## User images

Use the existing `image` column in the `Users` sheet. Enter each user's image
filename, for example `1.png`, `2.png`, or `11.png`. Files are loaded from
`game/img/`. No new database column or backend deployment is required.

Empty, invalid or missing image files use the drawn bird fallback. The game
refreshes the setting when opened; each round retains its starting image.
Profile pictures also resolve these filenames from `game/img/`; existing
profile image URLs continue working as before.

Scores use the existing `Scores` sheet with game ID `bjk-flappy`, separate from
Mario and Memory. Runs with at least one cleared gate use the existing offline
score queue. The leaderboard is highest score first.

Publish the website files including `games/flappy/` to make the game available.
