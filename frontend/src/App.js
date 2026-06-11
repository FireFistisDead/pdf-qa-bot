import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "react-hot-toast";

const MainApp = lazy(() => import("./MainApp"));
const LandingPage = lazy(() => import("./components/Landing/LandingPage"));
const SignIn = lazy(() => import("./components/Auth/SignIn"));
const SignUp = lazy(() => import("./components/Auth/SignUp"));
const Dashboard = lazy(() => import("./components/Dashboard/Dashboard"));
const StudyHub = lazy(() => import("./components/StudyHub/StudyHub"));

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: "#111827",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "14px 16px",
            backdropFilter: "blur(12px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          },
          success: { iconTheme: { primary: "#8B5CF6", secondary: "#fff" } },
          error: { iconTheme: { primary: "#EF4444", secondary: "#fff" } },
        }}
      />
      <AuthProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <Suspense fallback={<div style={{display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "var(--accent)"}}><h2>Loading...</h2></div>}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/workspace" element={<MainApp />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/dashboard/*" element={<Dashboard />} />
                <Route path="/studyhub" element={<StudyHub />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </>
  );
}

export default App;
