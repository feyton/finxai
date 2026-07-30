// Moved to ../../shared/merchantNormalize so the web app can use the SAME
// normalization instead of reimplementing it.
//
// This matters more than it looks: normalizeMerchant is ~40 lines of ORDER-DEPENDENT
// regex (strip completion clauses, then date tails, then trailing numeric codes, then
// company suffixes). It derives the key that merchant rules are stored under, so two
// implementations that disagree by one branch would silently stop a learned correction
// from ever matching again. Duplicating the category logic had already caused three
// bugs in a single day; this was next.
//
// Re-exported here so existing `from './merchantNormalize'` imports keep working.
export * from '../../shared/merchantNormalize';
