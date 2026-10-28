# 13. Detective catch: a correct check eliminates that Mafia

- Status: Accepted
- Date: 2026-10-27

## Context

Players asked that when the Detective identifies a Mafia, that Mafia is out (and, when it was the last Mafia,
the game ends). Before this, a correct check only made the narrator say "The Detective found one of the Mafia
last night", without a name, and nobody was removed. The rule applies in both rule-running modes: App-GM
narrator mode (`src/game/engine.js`, `NarratorGame.jsx`) and online rooms (`src/online/roomLogic.js`, which
drives the same engine). Human GM mode is a manual reference screen, so only the Rules text changes there.

## Decision

- **Catch.** When a living Detective's night check targets a real Mafia, that Mafia is *caught*. They die at the
  morning resolution exactly like an elimination: `alive: false`, no night action, no vote, cannot be voted.
- **Order at morning:** night kill (an attack not blocked by the Doctor), then the catch, then the normal win
  check (`CHECK_WIN`, unchanged: no Mafia left -> village wins; Mafia >= others -> Mafia win). Because the
  win check sees both deaths and checks "no Mafia left" first, catching the last Mafia always gives a village
  win, even when the same night's kill alone would have given the Mafia parity (e.g. Mafia, Doctor, Detective:
  the Mafia kill the Doctor while the Detective catches the Mafia -> village wins).
- **Game over from the morning.** On a win, the morning summary is still shown and narrated, then the game goes
  to END (win announcement) with no discussion or vote. Narrator mode's Morning button reads "See who won";
  online, the timeline goes `morning -> morningRead -> END`.
- **Edge cases.**
  - The Doctor's save blocks only the Mafia's attack; it never protects a caught Mafia.
  - A Detective killed the same night still catches: both actions happened during the night.
  - A dead Detective's dummy turn gets no answer and catches nobody (unchanged).
  - A wrong guess changes nothing and is not announced (unchanged).
  - A caught player who is already dead after the kill (impossible through the UI: Mafia cannot target Mafia)
    is not caught twice; the engine keeps `detectiveFoundMafia` and says only "found one of the Mafia".
- **Narration** reuses existing clips, no new audio: `detective_found` + the caught player's name +
  `voted_out_post` ("The Detective found one of the Mafia last night. <name> has been eliminated." / Tamil
  "... <name> ஆட்டத்தை விட்டு வெளியேறுறாங்க."). When the name cannot be spoken (no name voice), only
  `detective_found` is said.
- **Voice only (amended 2026-10-28).** The catch is announced by the narrator's voice alone; nothing on the
  shared screen names it. The morning screen (App-GM `NarratorGame` and online `MorningNews`) shows only the
  night kill / save, with no "Detective caught" panel, and captions stop at `detective_found`: the narrator
  speaks the rest of the list but the caption keeps the previous line (`captionedItems` /
  `VOICE_ONLY_FROM` in `src/audio/narrator.js`, also used for non-host online captions). The caught player's
  tile is still shown dead (they are out and cannot be voted), without a role. The Detective's private
  night result ("MAFIA" / "IS Mafia") is unchanged, and the game-over screens (roles, log, online
  "The Detective caught ...") still show everything, as all roles are revealed there anyway.
- **State.** `morning.caught` (name/seat or null) and log `caught` were added; saved games stay compatible
  (missing `caught` means no catch), so `ENGINE_VERSION` is unchanged.

## Consequences

- The caught Mafia's identity is public at morning (they are out, like a voted-out player); other roles stay
  hidden until END (ADR 0005 unchanged).
- Games are shorter and the Detective is much stronger; the Doctor's guess matters less in the endgame.
- e2e scripts that had the Detective check the Mafia on night 1 now expect the catch (narrator, names-tts) or
  check a non-Mafia (timers; audio-matrix and player-counts only in the Mafia-win plan).

## Alternatives

- Catch before the kill (the caught Mafia's kill is cancelled): rejected; both happen during the same night,
  and it would make the Doctor irrelevant on catch nights.
- Mafia parity checked before the catch: rejected; catching the last Mafia must always win for the village.
- Ending the game only on the last Mafia without removing others: rejected; one rule for every catch is simpler.

## Amendment (2026-10-28): the Detective is not told the answer

Players pointed out that a Detective who sees "MAFIA" at night already knows the morning's outcome. Now the
Detective only names a suspect; the answer is never shown or said at night.

- **App-GM narrator mode:** after the Detective's tap the screen shows "Choice locked in" (the pick is locked,
  one per night). The "MAFIA / NOT MAFIA" screen and the `detective_result` clip ("Here is your answer") are
  gone, and the Detective's taps no longer close early to leave reading time (`resultMs` removed): the turn is
  the same fixed window as every other role, so nothing in sound, text or timing depends on the answer. A dead
  Detective's dummy turn looks the same.
- **Online rooms:** `viewFor` no longer sends `detectiveResult`, and `detectiveLog` carries only the checked
  names (no `isMafia`); the Detective's phone shows "Choice locked in" and disables further taps.
- **Human GM mode:** the Rules text tells the Game Master not to answer the Detective and to announce a
  correct identification at morning.
- **Morning:** unchanged from the voice-only rule above: on a correct check the narrator says "The Detective
  found one of the Mafia last night. <name> has been eliminated."; on a wrong check nothing is said.
- The engine still records `night.result` and the log's `detectiveCheck.isMafia` (they drive the catch);
  they appear only on the game-over screen and log.
