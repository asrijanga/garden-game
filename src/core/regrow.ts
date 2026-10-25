/**
 * While a saved garden is being rebuilt, each stroke's growth animations (stones settling,
 * flowers sprouting, water rising…) wait this many extra seconds, so the garden regrows in
 * a gentle wave, stroke after stroke, instead of all at once. Zero the rest of the time.
 */
export const regrow = { offset: 0 };
