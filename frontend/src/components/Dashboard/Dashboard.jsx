import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './views/DashboardHome';
import DocumentsView from './views/DocumentsView';
import ChatView from './views/ChatView';
import KnowledgeView from './views/KnowledgeView';
import SettingsView from './views/SettingsView';

/**
 * Main Dashboard Entry Point
 * Wraps the views inside the DashboardLayout shell.
 */
const Dashboard = () => {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="documents" element={<DocumentsView />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="knowledge" element={<KnowledgeView />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default Dashboard;
