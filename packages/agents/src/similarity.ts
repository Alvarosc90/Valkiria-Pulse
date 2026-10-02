function normalize(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(value: string, size = 3) {
  const words = normalize(value).split(" ").filter(Boolean);
  const set = new Set<string>();

  if (words.length < size) {
    if (words.length) set.add(words.join(" "));
    return set;
  }

  for (let index = 0; index <= words.length - size; index += 1) {
    set.add(words.slice(index, index + size).join(" "));
  }

  return set;
}

export function textSimilarity(left: string, right: string) {
  const a = shingles(left);
  const b = shingles(right);
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
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
