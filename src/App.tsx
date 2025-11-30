import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import Bookmarks from "./pages/Bookmarks";
import SearchHistory from "./pages/SearchHistory";
import Candidates from "./pages/Candidates";
import RecentResumes from "./pages/RecentResumes";
import NotFound from "./pages/NotFound";
import DeveloperSettings from "./pages/DeveloperSettings";
import Legal from "./pages/Legal";
 
const queryClient = new QueryClient();
 
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/developer-settings" element={<DeveloperSettings />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/history" element={<SearchHistory />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/recent-resumes" element={<RecentResumes />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);
 
export default App;
