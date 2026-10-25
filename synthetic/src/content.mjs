/** Render one authored occurrence without labels or catalog metadata in dialogue. */
export function renderOccurrence(entry, { variantIndex, elicitation } = {}) {
  if (!entry || !Array.isArray(entry.variants) ||
      !Number.isInteger(variantIndex) || variantIndex < 0 || variantIndex >= entry.variants.length) {
    throw new TypeError('variantIndex must select an authored variant');
  }
  if (!['unprompted', 'prompted', 'uncertain'].includes(elicitation)) {
    throw new TypeError('elicitation must be unprompted, prompted, or uncertain');
  }
  const quote = entry.variants[variantIndex];
  if (typeof quote !== 'string' || !quote.trim() ||
      ![entry.specificPrompt, entry.ambiguousPrompt, entry.response].every(t => typeof t === 'string' && t.trim())) {
    throw new TypeError('occurrence requires authored dialogue text');
  }
  const utterances = [];
  if (elicitation !== 'unprompted') {
    utterances.push({ speaker: 'agent', text: elicitation === 'prompted' ? entry.specificPrompt : entry.ambiguousPrompt });
  }
  const sourceTurnIndex = utterances.length;
  const leadIn = 'Let me think. ';
  utterances.push({ speaker: 'caller', text: leadIn + quote });
  utterances.push({ speaker: 'agent', text: entry.response });
  return {
    utterances, sourceTurnIndex, quote, start: leadIn.length,
    end: leadIn.length + quote.length,
    promptTurnIndex: elicitation === 'prompted' ? 0 : null
  };
}
