import { useState, useEffect } from 'react';
import { getDashboardStats, getRecentActivity, getAiInsights } from '../services/dashboardService';

export const useDashboardData = () => {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [insights, setInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        // Fetch all data in parallel
        const [statsData, activityData, insightsData] = await Promise.all([
          getDashboardStats(),
          getRecentActivity(),
          getAiInsights()
        ]);

        if (isMounted) {
          setStats(statsData);
          setActivity(activityData);
          setInsights(insightsData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'An error occurred fetching dashboard data');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  return { stats, activity, insights, isLoading, error };
};
