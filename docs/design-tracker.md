# Design Tracker

Open design decisions for the designer. Each entry separates what the book says from what the prototype currently does.

## Open

### Rank should matter in the game (opened 2026-10-02)

**Decision needed:** how rank affects the videogame (designer has confirmed it should matter; integration not yet decided).

**Book (Captain's Log):**
- p.132: rank is chosen after assignment. Restrictions only: Commanding Officer at least Commander; Executive Officer, Chief Engineer, Chief of Security, Chief Medical Officer at least Lieutenant (junior grade); "The choice made in Step Five: Career may limit which ranks you may choose from."
- p.132 (Enlisted Personnel sidebar): enlisted characters never get Commanding Officer or Executive Officer.
- p.120: civilians hold no rank (may be granted an honorary rank).
- p.221: rank matters in play only as chain of command and roleplay (who is first officer, who leads away missions, when to "pull rank").
- No mechanical effect: rank does not change attributes, disciplines, focuses, values, or any roll.

**Prototype (current):**
- Rank is chosen on Screen 05 (Career). Education sets the rank type: officer, enlisted (Rank and File), optional (Diplomatic: officer ranks or No Rank), or none (Civilian).
- Assignment sets the minimum officer rank. Novice career length caps rank at Lieutenant (junior grade) / Petty Officer (design decision; the book gives no limits).
- Rank has no effect on any number, equipment, or later screen. It is shown on the summary and Review.
- Exported JSON records it as `character.career.rank` = `{ id, name, type }` (`type` is `officer`, `enlisted`, or `none`). Rank order is the list order in `src/data/source/ranks.json` (lowest first).

**Possible integration points (for the designer to choose; none implemented):**
- Dialogue and NPC reactions (how crew and others address and respond to the character).
- Authority: which orders the character can give, which crew they command, whether they can lead away missions.
- Mission or content access gated by rank.
- Starting equipment or ship access by rank.
- Promotion as progression during play.

**Related questions:**
- A civilian (No Rank) or Diplomatic No Rank character can currently hold any assignment, including Executive Officer, because the book's minimum ranks apply to officer ranks only. Should No Rank be restricted from command roles?
- Should the Novice rank cap stay once rank has gameplay effects?

### No Rank characters: keep, limit, or remove? (opened 2026-10-02)

**Decision needed:** what role No Rank (civilian and non-ranked diplomatic) characters have in the videogame, especially once rank matters.

**Book (Captain's Log):**
- p.120 (Civilian Career Training): "Civilian characters hold no Starfleet rank or other military rank, though they may be granted an honorary rank." Purpose: "Building a Captain's Log story around a civilian character offers a chance to shine a light on life outside of Starfleet." Examples: Sarek, Dal R'El. Types: Freight and Transport, Law Enforcement, Physician, Politician or Bureaucrat, Scientific or Technical Expert, Trader or Merchant.
- p.119 (Diplomatic Training): diplomats "are often found accompanying Starfleet vessels" and "do not necessarily hold an active Starfleet rank or other military rank (though many well-known diplomats are retired Starfleet military)."
- p.132: rank is chosen "unless you are creating a civilian character or a character in a non-militaristic organization."
- The book is a solo tabletop game that supports any story, Starfleet or not; it does not say whether a civilian can hold a Starfleet assignment.

**Prototype (current):**
- Civilian education: No Rank is the only option (set automatically). Diplomatic education: No Rank or Ensign through Captain.
- "No Rank" is a prototype label (`src/data/adaptation/career.json`); the book has no name for it.
- Honorary rank (p.120) is not offered.
- No Rank characters can take any assignment, including command roles.

**Options (for the designer to choose; none implemented):**
- Keep No Rank as an alternative way to play, with its own trade-offs once rank matters (e.g. no authority over crew, but not bound by orders or protocol).
- Limit No Rank characters to certain assignments (e.g. counselor, science specialist).
- Offer an honorary rank for civilians, and decide whether it counts as a real rank.
- Remove Civilian education (and Diplomatic No Rank) from the creator if the game centres on Starfleet service.

## Decided

_Nothing yet._
