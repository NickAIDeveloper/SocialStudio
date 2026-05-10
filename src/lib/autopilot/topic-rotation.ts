// src/lib/autopilot/topic-rotation.ts

export interface TopicCluster {
  topic: string;
  sampleSize?: number;
  medianEngagement?: number;
}

export interface PickTopicInput {
  // Topics from brain.signals28d.topicClusters. Empty array allowed.
  topics: TopicCluster[];
  // Topics already used in the last N days. Caller pulls from posts.topicHint.
  recentTopics: string[];
  // Optional fallback to use when no topics are configured.
  fallback?: string;
}

// Round-robin with no-repeat window. Picks the highest-signal topic that
// isn't in `recentTopics`. If every topic has been used recently, picks the
// least-recently used (i.e., the first one in `topics` not at the FRONT of
// `recentTopics`). If `topics` is empty, returns `fallback ?? null`.
export function pickNextTopic(input: PickTopicInput): string | null {
  if (input.topics.length === 0) {
    return input.fallback ?? null;
  }
  // Sort by medianEngagement descending so the strongest topics get priority.
  const sorted = [...input.topics].sort(
    (a, b) => (b.medianEngagement ?? 0) - (a.medianEngagement ?? 0)
  );
  // First pass: a topic NOT in recentTopics at all.
  const recentSet = new Set(input.recentTopics.map((t) => t.toLowerCase()));
  for (const t of sorted) {
    if (!recentSet.has(t.topic.toLowerCase())) return t.topic;
  }
  // All topics have been used recently. Pick the LEAST-recently-used:
  // i.e., the topic whose last appearance in recentTopics is FURTHEST back.
  // recentTopics is ordered most-recent-first.
  let bestTopic: string | null = null;
  let bestLastIdx = -1;
  for (const t of sorted) {
    const idx = input.recentTopics.findIndex(
      (r) => r.toLowerCase() === t.topic.toLowerCase()
    );
    if (idx > bestLastIdx) {
      bestLastIdx = idx;
      bestTopic = t.topic;
    }
  }
  return bestTopic ?? sorted[0].topic;
}
