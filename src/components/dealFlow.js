// State machine for handing out cards on the dealing screen.
//
//   idle --OPEN(i)--> picking(i) --CHOOSE(name)--> revealing(i, name) --HIDE--> hiding(i, name) --DONE(i)--> idle
//                        |                                                   (card i is assigned on DONE)
//                        +--CANCEL--> idle
//
// The overlays (name picker, "you are…" bar) are rendered straight from this state: the picker is on
// screen exactly while `picker !== null`. They used to sit in framer-motion's AnimatePresence. On a
// busy WebKit (iPhone) the exit fades of earlier pickers stall and pile up in the DOM; when they
// finally finish, AnimatePresence re-renders its last *committed* child list, which can predate the
// picker that was just opened, so the new picker was removed ~25 ms after it appeared while the state
// still said "picking": every card locked, no dialog, deal stuck. (e2e/deal-stress.e2e.mjs catches it.)

export const initialDealFlow = { picker: null, revealing: null, hiding: null };

export const isBusy = (s) => s.picker !== null || s.revealing !== null || s.hiding !== null;

export function dealFlow(s, a) {
  switch (a.type) {
    case 'OPEN':
      // one card at a time, and never a card that already has an owner
      if (isBusy(s) || a.taken) return s;
      return { ...s, picker: a.index };
    case 'CANCEL':
      return s.picker === null ? s : { ...s, picker: null };
    case 'CHOOSE':
      if (s.picker === null || !a.name) return s;
      return { ...s, picker: null, revealing: { index: s.picker, name: a.name } };
    case 'HIDE':
      // idempotent: the auto-hide timer and a "Hide & Pass" tap can both fire for the same card
      if (!s.revealing) return s;
      return { ...s, revealing: null, hiding: s.revealing };
    case 'DONE':
      if (!s.hiding || s.hiding.index !== a.index) return s;
      return { ...s, hiding: null };
    default:
      return s;
  }
}

/** Names that can still be picked for the open card. */
export const availableNames = (names, assignments, s) => {
  const assigned = new Set(Object.values(assignments));
  return names.filter((n) => !assigned.has(n) && n !== s.revealing?.name && n !== s.hiding?.name);
};
