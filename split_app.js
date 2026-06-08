const fs = require('fs');
const appJsPath = 'frontend/src/App.js';
const mainAppJsxPath = 'frontend/src/MainApp.jsx';

const content = fs.readFileSync(appJsPath, 'utf8');

const splitIndex = content.indexOf('function App() {');

const mainAppImports = `import React, { useState } from "react";
import { pdfjs } from "react-pdf";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container, Row, Col } from "react-bootstrap";
import Navbar from "./components/Navbar/Navbar";
import UploadCard from "./components/UploadCard/UploadCard";
import PdfViewer from "./components/PdfViewer/PdfViewer";
import ChatPanel from "./components/ChatPanel/ChatPanel";
import SavedNotes from "./components/ChatPanel/SavedNotes";
import toast, { Toaster } from "react-hot-toast";
import StudyHub from "./components/StudyHub/StudyHub";
import { extractApiErrorMessage, uploadPdfApi, getSessionsApi } from "./services/api";
import {
  createStableMessageId,
  hashString,
  loadSavedNotes,
  persistSavedNotes,
} from "./utils/savedNotes";

`;

const mainAppCode = content.substring(content.indexOf('pdfjs.GlobalWorkerOptions.workerSrc'), splitIndex);
const mainAppContent = mainAppImports + mainAppCode + '\nexport default MainApp;\n';

fs.writeFileSync(mainAppJsxPath, mainAppContent);

const appJsImports = `import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

const MainApp = lazy(() => import("./MainApp"));
const LandingPage = lazy(() => import("./components/Landing/LandingPage"));
const SignIn = lazy(() => import("./components/Auth/SignIn"));
const SignUp = lazy(() => import("./components/Auth/SignUp"));
const Dashboard = lazy(() => import("./components/Dashboard/Dashboard"));
const StudyHub = lazy(() => import("./components/StudyHub/StudyHub"));

`;

const appJsCode = content.substring(splitIndex);

let newAppJsCode = appJsCode.replace(
  '<BrowserRouter>',
  '<ErrorBoundary>\n      <BrowserRouter>\n        <Suspense fallback={<div style={{display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "var(--accent)"}}><h2>Loading...</h2></div>}>'
);

newAppJsCode = newAppJsCode.replace(
  '</BrowserRouter>',
  '        </Suspense>\n      </BrowserRouter>\n    </ErrorBoundary>'
);

fs.writeFileSync(appJsPath, appJsImports + newAppJsCode);

console.log("Successfully split App.js into MainApp.jsx and App.js");
