import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import BrandsPage from './pages/BrandsPage';
import BrandDetailPage from './pages/BrandDetailPage';
import TrendsPage from './pages/TrendsPage';
import GeoPage from './pages/GeoPage';
import ConversationsPage from './pages/ConversationsPage';
import AgentPage from './pages/AgentPage';
import AboutAgentPage from './pages/AboutAgentPage';
import ArchitecturePage from './pages/ArchitecturePage';
import PipelinePage from './pages/PipelinePage';
import WatchlistPage from './pages/WatchlistPage';
import AboutPage from './pages/AboutPage';
import NotFoundPage from './pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="/brands" element={<BrandsPage />} />
            <Route path="/brands/:brandId" element={<BrandDetailPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/trends/:topicId" element={<TrendsPage />} />
            <Route path="/geo" element={<GeoPage />} />
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/about-agent" element={<AboutAgentPage />} />
            <Route path="/architecture" element={<ArchitecturePage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
