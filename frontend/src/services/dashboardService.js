/**
 * Dashboard Service
 * Pulls real data from Supabase for the overview page stats and activity log.
 */

import { supabase } from './supabaseClient';

export const getDashboardStats = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Count total documents
  const { count: totalDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  // Count documents ready for chat (processed)
  const { count: readyDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'READY FOR CHAT');

  // Count chat messages (queries)
  const { count: totalQueries } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user');

  return {
    documentsAnalyzed: {
      value: totalDocs || 0,
      trend: 0,
      trendLabel: 'total uploaded'
    },
    aiQueries: {
      value: totalQueries || 0,
      trend: 0,
      trendLabel: 'total queries'
    },
    knowledgeBases: {
      value: readyDocs || 0,
      trend: 0,
      trendLabel: 'docs indexed'
    },
    timeSavedMinutes: {
      value: (totalQueries || 0) * 3, // estimate ~3 min saved per AI query
      trend: 0,
      trendLabel: 'est. minutes saved'
    },
  };
};

export const getRecentActivity = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch most recent document uploads
  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, created_at, status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!docs) return [];

  return docs.map(doc => {
    const date = new Date(doc.created_at);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    let time;
    if (diffMins < 1) time = 'Just now';
    else if (diffMins < 60) time = `${diffMins}m ago`;
    else if (diffHrs < 24) time = `${diffHrs}h ago`;
    else if (diffDays === 1) time = 'Yesterday';
    else time = `${diffDays} days ago`;

    return {
      id: doc.id,
      title: `Uploaded "${doc.name}"`,
      time,
      type: doc.status === 'READY FOR CHAT' ? 'INDEXED' : 'UPLOAD'
    };
  });
};

export const getAiInsights = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { count: totalDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { count: readyDocs } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'READY FOR CHAT');

  const insights = [];

  const unprocessed = (totalDocs || 0) - (readyDocs || 0);
  if (unprocessed > 0) {
    insights.push({
      id: 'insight_unprocessed',
      title: `${unprocessed} document${unprocessed > 1 ? 's' : ''} not yet indexed`,
      description: `You have ${unprocessed} uploaded file${unprocessed > 1 ? 's' : ''} that ${unprocessed > 1 ? 'have' : 'has'} not been processed yet. Hit PROCESS to enable AI chat on ${unprocessed > 1 ? 'them' : 'it'}.`,
      actionLabel: 'Go to Documents'
    });
  }

  if ((readyDocs || 0) > 0) {
    insights.push({
      id: 'insight_chat',
      title: `${readyDocs} document${readyDocs > 1 ? 's' : ''} ready for AI chat`,
      description: `You have indexed documents waiting. Start a chat session to ask questions and extract intelligence from your data.`,
      actionLabel: 'Start Chat'
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'insight_start',
      title: 'Upload your first document',
      description: 'Drop a PDF into the Uplink Portal to get started. Once uploaded and processed, you can ask the AI anything about it.',
      actionLabel: 'Upload Now'
    });
  }

  return insights;
};
