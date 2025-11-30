import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProcessingProvider, useProcessing } from "@/contexts/ProcessingContext";
import { ProcessingToast } from "@/components/ProcessingToast";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ProfileSettings from "./pages/ProfileSettings";
import Security from "./pages/Security";
import Bookmarks from "./pages/Bookmarks";
import SearchHistory from "./pages/SearchHistory";
import Candidates from "./pages/Candidates";
import RecentResumes from "./pages/RecentResumes";
import ExternalSubmissions from "./pages/ExternalSubmissions";
import NotFound from "./pages/NotFound";
import DeveloperSettings from "./pages/DeveloperSettings";
import Legal from "./pages/Legal";
 
const queryClient = new QueryClient();

const GlobalProcessingToast = () => {
  const processing = useProcessing();

  if (!processing.isMinimized || !processing.isProcessing) {
    return null;
  }

  return (
    <ProcessingToast
      logs={processing.logs}
      progress={processing.progress}
      status={processing.status}
      isComplete={processing.isComplete}
      hasError={processing.hasError}
      estimatedTimeRemaining={processing.estimatedTimeRemaining}
      onExpand={processing.expand}
      onClose={processing.stopProcessing}
    />
  );
};
 
const App = () => (
  <QueryClientProvider client={queryClient}>
    <ProcessingProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/profile-settings" element={<ProfileSettings />} />
            <Route path="/security" element={<Security />} />
            <Route path="/developer-settings" element={<DeveloperSettings />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/history" element={<SearchHistory />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/recent-resumes" element={<RecentResumes />} />
            <Route path="/external-submissions" element={<ExternalSubmissions />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <GlobalProcessingToast />
        </BrowserRouter>
      </TooltipProvider>
    </ProcessingProvider>
  </QueryClientProvider>
);
 
export default App;
