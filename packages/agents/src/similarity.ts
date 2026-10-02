function normalize(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function shingles(value: string, size = 3) {
  const tokens = words(value);
  const set = new Set<string>();

  if (tokens.length < size) {
    if (tokens.length) set.add(tokens.join(" "));
    return set;
  }

  for (let index = 0; index <= tokens.length - size; index += 1) {
    set.add(tokens.slice(index, index + size).join(" "));
  }

  return set;
}

function jaccard<T>(a: Set<T>, b: Set<T>) {
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

export function textSimilarity(left: string, right: string) {
  const leftWords = new Set(words(left));
  const rightWords = new Set(words(right));
  const tokenScore = jaccard(leftWords, rightWords);

  const leftShingles = shingles(left, 3);
  const rightShingles = shingles(right, 3);
  const structureScore = jaccard(leftShingles, rightShingles);

  return tokenScore * 0.6 + structureScore * 0.4;
}

export function nearestRecentPost(
  candidate: string,
  recentPosts: string[]
) {
  let best = { similarity: 0, text: "" };

  for (const recent of recentPosts) {
    const similarity = textSimilarity(candidate, recent);
    if (similarity > best.similarity) {
      best = { similarity, text: recent };
    }
  }

  return best;
}
