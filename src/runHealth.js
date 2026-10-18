export function createRunHealth(state, config) {
  return {
    stateSaveEnabled: config.briefing.saveState,
    stateUpdatedAtBeforeRun: state.updatedAt,
    seenPostIdsBeforeRun: state.seenPostIds.length,
    totals: undefined,
    topics: [],
  };
}

export function runHealthTotals(runHealth) {
  return runHealth.topics.reduce(
    (totals, topic) => ({
      queriesAttempted: totals.queriesAttempted + topic.queriesAttempted,
      queriesSucceeded: totals.queriesSucceeded + topic.queriesSucceeded,
      queriesFailed: totals.queriesFailed + topic.queriesFailed,
      queriesSkipped: totals.queriesSkipped + topic.queriesSkipped,
      pagesFetched: totals.pagesFetched + topic.pagesFetched,
      fetchedPosts: totals.fetchedPosts + topic.fetchedPosts,
      alreadySeenPosts: totals.alreadySeenPosts + topic.alreadySeenPosts,
      collectedPosts: totals.collectedPosts + topic.collectedPosts,
      signalPosts: totals.signalPosts + topic.signalPosts,
      citedPosts: totals.citedPosts + topic.citedPosts,
      collectionWarnings: totals.collectionWarnings + topic.collectionWarnings,
    }),
    {
      queriesAttempted: 0,
      queriesSucceeded: 0,
      queriesFailed: 0,
      queriesSkipped: 0,
      pagesFetched: 0,
      fetchedPosts: 0,
      alreadySeenPosts: 0,
      collectedPosts: 0,
      signalPosts: 0,
      citedPosts: 0,
      collectionWarnings: 0,
    },
  );
}
