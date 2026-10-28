// Role visuals (icons, colours) live in roleVisuals.js so this file has no UI imports and runs in the Worker.

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;

export function mafiaCountFor(playerCount) {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

export function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function generateDeck(playerCount) {
  const roles = [];
  const mafiaCount = mafiaCountFor(playerCount);
  for (let i = 0; i < mafiaCount; i++) roles.push('mafia');
  if (playerCount >= 4) {
    roles.push('doctor');
    roles.push('detective');
  }
  while (roles.length < playerCount) roles.push('villager');
  return shuffle(roles);
}

/**
 * Win check for the Game Master view.
 * Villagers win when every Mafia is eliminated; Mafia win when alive Mafia >= alive non-Mafia.
 */
export function getWinner(players, eliminated) {
  const alive = players.filter((p) => !eliminated.includes(p.name));
  const mafiaAlive = alive.filter((p) => p.role === 'mafia').length;
  const othersAlive = alive.length - mafiaAlive;
  let winner = null;
  if (mafiaAlive === 0) winner = 'villagers';
  else if (mafiaAlive >= othersAlive) winner = 'mafia';
  return { mafiaAlive, othersAlive, winner };
}

/**
 * Data-driven role definitions used by the narrator engine (src/game/engine.js).
 *  - team:       'mafia' | 'village' (win check counts team 'mafia' vs everyone else)
 *  - nightOrder: order of the role's night turn (null = no night turn)
 *  - wakeClip / sleepClip: narrator clip ids (public/audio/<voice>/<id>.mp3)
 *  - targetRule: key into TARGET_RULES in engine.js (who can be tapped)
 *  - action:     key into ACTIONS in engine.js (what a tap does / how the night resolves)
 * Adding a role (e.g. Sheriff, Jester) = add an entry here (+ a target rule / action
 * resolver in engine.js if the existing ones don't fit). The state machine iterates this table.
 */
export const ROLE_DEFS = {
  mafia: {
    id: 'mafia',
    team: 'mafia',
    nightOrder: 1,
    wakeClip: 'mafia_wake',
    sleepClip: 'mafia_sleep',
    targetRule: 'aliveNotOwnTeam',
    action: 'kill',
  },
  doctor: {
    id: 'doctor',
    team: 'village',
    nightOrder: 2,
    wakeClip: 'doctor_wake',
    sleepClip: 'doctor_sleep',
    targetRule: 'aliveNoRepeatSave',
    action: 'save',
  },
  detective: {
    id: 'detective',
    team: 'village',
    nightOrder: 3,
    wakeClip: 'detective_wake',
    sleepClip: 'detective_sleep',
    targetRule: 'aliveExceptSelf',
    action: 'investigate',
  },
  villager: {
    id: 'villager',
    team: 'village',
    nightOrder: null,
    wakeClip: null,
    sleepClip: null,
    targetRule: null,
    action: null,
  },
};
