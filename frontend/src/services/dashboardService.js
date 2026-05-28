/**
 * Dashboard Service
 * Simulates an API connection layer for the Express backend.
 * All these functions return Promises that resolve after a delay,
 * mimicking network latency.
 */

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const getDashboardStats = async () => {
  await delay(1200); // Simulate network latency

  // Mock response data
  return {
    documentsAnalyzed: { value: 12, trend: 23, trendLabel: "vs last week" },
    aiQueries: { value: 48, trend: 12, trendLabel: "vs last week" },
    knowledgeBases: { value: 3, trend: 0, trendLabel: "no change" },
    timeSavedMinutes: { value: 156, trend: 34, trendLabel: "vs last week" },
  };
};

export const getRecentActivity = async () => {
  await delay(1500);

  return [
    { id: '1', title: 'Uploaded "research_paper.pdf"', time: '2 hours ago', type: 'upload' },
    { id: '2', title: 'Asked 5 questions about marketing report', time: '4 hours ago', type: 'query' },
    { id: '3', title: 'Created knowledge base "Q2 Reports"', time: 'Yesterday', type: 'create' },
    { id: '4', title: 'Generated summary for "financial_analysis.pdf"', time: '2 days ago', type: 'summary' },
  ];
};

export const getAiInsights = async () => {
  await delay(1800);

  return [
    {
      id: 'insight_1',
      title: 'Consolidate similar documents',
      description: '3 documents share overlapping content. Merging into a knowledge base could improve query accuracy by ~40%.',
      actionLabel: 'Apply'
    },
    {
      id: 'insight_2',
      title: 'Try multi-document queries',
      description: 'You have 12 documents but mostly query individually. Cross-document queries can surface hidden connections.',
      actionLabel: 'Try it'
    }
  ];
};
