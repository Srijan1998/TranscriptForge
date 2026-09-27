// Local extractive summary: selects source sentences; it does not generate claims.
export function summarize(snippets, limit = 5) {
  const text = snippets.map(s => s.text.replace(/\s+/g, ' ').trim()).join(' ');
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
  // Auto-captions often have no punctuation. Group them into readable excerpts.
  const candidates = sentences.length >= 3 ? sentences : text.match(/(?:\S+\s*){1,45}/g) || [];
  const stop = new Set('the a an and or but to of in on for with is are was were be been it this that these those i you we they he she my your our their as at by from not so just have has had do does did can will would about'.split(' '));
  const words = s => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 2 && !stop.has(w));
  const counts = new Map();
  candidates.forEach(s => new Set(words(s)).forEach(w => counts.set(w, (counts.get(w) || 0) + 1)));
  const ranked = candidates.map((text, index) => {
    const tokens = words(text);
    return { text: text.trim(), index, score: tokens.reduce((s, w) => s + (counts.get(w) || 0), 0) / Math.sqrt(tokens.length || 1) };
  }).filter(s => s.text).sort((a, b) => b.score - a.score);
  const seen = new Set();
  return ranked.filter(s => { if (seen.has(s.text)) return false; seen.add(s.text); return true; })
    .slice(0, limit).sort((a, b) => a.index - b.index).map(s => s.text);
}
