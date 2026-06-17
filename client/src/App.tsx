import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RideProvider } from './context/RideContext';
import { TabBar } from './components/TabBar';
import { StatusBanners } from './components/StatusBanners';
import { ConsentBanner } from './components/ConsentBanner';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Home } from './pages/Home';
import { Fahren } from './pages/Fahren';
import { MapPage } from './pages/MapPage';
import { Statistik } from './pages/Statistik';
import { RideDetail } from './pages/RideDetail';
import { Einstellungen } from './pages/Einstellungen';
import { Freunde } from './pages/Freunde';
import { FriendProfile } from './pages/FriendProfile';
import { Groups } from './pages/Groups';
import { GroupDetail } from './pages/GroupDetail';
import { PublicRide } from './pages/PublicRide';
import { Impressum } from './pages/legal/Impressum';
import { Datenschutz } from './pages/legal/Datenschutz';
import { Nutzungsbedingungen } from './pages/legal/Nutzungsbedingungen';

const LEGAL_PATHS = ['/impressum', '/datenschutz', '/nutzungsbedingungen'];

function LegalRoutes() {
  return (
    <Routes>
      <Route path="/impressum" element={<Impressum />} />
      <Route path="/datenschutz" element={<Datenschutz />} />
      <Route path="/nutzungsbedingungen" element={<Nutzungsbedingungen />} />
    </Routes>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Öffentlich geteilte Fahrten sind ohne Anmeldung erreichbar – vor dem
  // Auth-Gate behandeln, damit auch ausgeloggte Besucher sie sehen.
  if (location.pathname.startsWith('/r/')) {
    return (
      <Routes>
        <Route path="/r/:token" element={<PublicRide />} />
      </Routes>
    );
  }

  // Rechtstexte müssen ohne Anmeldung erreichbar sein (Pflichtinformationen).
  if (LEGAL_PATHS.includes(location.pathname)) {
    return <LegalRoutes />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-accent)" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/registrieren" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  if (location.pathname === '/login' || location.pathname === '/registrieren') {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <div key={location.pathname} className="page-fade">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fahren" element={<Fahren />} />
          <Route path="/karte" element={<MapPage />} />
          <Route path="/statistik" element={<Statistik />} />
          <Route path="/fahrten/:id" element={<RideDetail />} />
          <Route path="/einstellungen" element={<Einstellungen />} />
          <Route path="/freunde" element={<Freunde />} />
          <Route path="/freunde/:id" element={<FriendProfile />} />
          <Route path="/gruppen" element={<Groups />} />
          <Route path="/gruppen/:id" element={<GroupDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <TabBar />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <StatusBanners />
        <AuthProvider>
          <RideProvider>
            <AppShell />
            <ConsentBanner />
          </RideProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
