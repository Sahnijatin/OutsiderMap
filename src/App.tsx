import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import LocationsPage from './pages/LocationsPage';
import VibePage from './pages/VibePage';
import BlogIndex from './pages/BlogIndex';
import BlogPost from './pages/BlogPost';
import AiSuggest from './pages/AiSuggest';
import SubmitSpot from './pages/SubmitSpot';
import AdminBlog from './pages/AdminBlog';
import AdminLogin from './pages/AdminLogin';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-black text-white overflow-x-hidden">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/vibe/:vibeName" element={<VibePage />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/ai-suggest" element={<AiSuggest />} />
          <Route path="/submit" element={<SubmitSpot />} />
          <Route path="/admin/blog" element={<AdminBlog />} />
          <Route path="/admin/login" element={<AdminLogin />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;