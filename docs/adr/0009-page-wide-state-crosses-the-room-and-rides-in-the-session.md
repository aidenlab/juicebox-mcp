# Page-wide state crosses the room and rides in the session

Every sync event so far names a panel (ADR-0008). Hiding juicebox.js's navbar (the Juicebox Panel Controls) is the first state that belongs to a whole page: one switch hides it on every panel, and panels opened later follow it. A person hides it with a button in juicebox-view's Header, and the model hides it with `show_panel_controls {show}`, which `room.send` delivers to every page in the room. For the person's click and the model's call to behave the same, the click has to reach every page too. So the switch lives in juicebox.js's browser registry, which posts an event when it changes. The remote sends that as a sync event without `panel`, and peers apply it to their whole registry. The switch is also written into the session as a registry-level field next to `selectedGene`, and only when hidden. That way a late joiner restoring the room's session matches the pages already there, and a snapshot link or a reload in a room reproduces the view.

Rejected:
- **Local to each page,** as igvjs-mcp's Controls are: a click would stay on one page while the model's call reaches all of them.
- **Kept nowhere,** also as in igvjs-mcp: a late joiner would show the controls while its peers hide them.
- **Sent on the sync channel only, outside the session:** it would need a catch-up path of its own beside the session restore every late joiner already does.

Consequences:
- The session string is the contract between hosts (juicebox.js ADR-0011), so every host that restores a session honours the field. juicebox-web included, a snapshot link made with the controls hidden opens with them hidden. Sessions without the field are unchanged.
- A sync event without `panel` no longer means only "from a remote older than ADR-0008". A page-wide event type says it carries no panel, and a receiver tells the two apart by type.
- The next page-wide setting should follow this pattern instead of inventing another.
