import { Suspense, lazy } from 'react';
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

// Alle weiteren Seiten lazy: Leaflet/Recharts landen so in eigenen Chunks und
// blockieren den ersten Seitenaufbau nicht. Der Service Worker precacht alle
// Chunks, offline funktioniert also weiterhin alles.
const Fahren = lazy(() => import('./pages/Fahren').then((m) => ({ default: m.Fahren })));
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));
const Statistik = lazy(() => import('./pages/Statistik').then((m) => ({ default: m.Statistik })));
const RideDetail = lazy(() => import('./pages/RideDetail').then((m) => ({ default: m.RideDetail })));
const Einstellungen = lazy(() => import('./pages/Einstellungen').then((m) => ({ default: m.Einstellungen })));
const Freunde = lazy(() => import('./pages/Freunde').then((m) => ({ default: m.Freunde })));
const FriendProfile = lazy(() => import('./pages/FriendProfile').then((m) => ({ default: m.FriendProfile })));
const Groups = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Groups })));
const Routen = lazy(() => import('./pages/Routen').then((m) => ({ default: m.Routen })));
const GroupDetail = lazy(() => import('./pages/GroupDetail').then((m) => ({ default: m.GroupDetail })));
const PublicRide = lazy(() => import('./pages/PublicRide').then((m) => ({ default: m.PublicRide })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const Impressum = lazy(() => import('./pages/legal/Impressum').then((m) => ({ default: m.Impressum })));
const Datenschutz = lazy(() => import('./pages/legal/Datenschutz').then((m) => ({ default: m.Datenschutz })));
const Nutzungsbedingungen = lazy(() =>
  import('./pages/legal/Nutzungsbedingungen').then((m) => ({ default: m.Nutzungsbedingungen })),
);

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--color-border) border-t-(--color-accent)" />
    </div>
  );
}

const LEGAL_PATHS = ['/impressum', '/datenschutz', '/nutzungsbedingungen'];

function LegalRoutes() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/nutzungsbedingungen" element={<Nutzungsbedingungen />} />
      </Routes>
    </Suspense>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Öffentlich geteilte Fahrten sind ohne Anmeldung erreichbar – vor dem
  // Auth-Gate behandeln, damit auch ausgeloggte Besucher sie sehen.
  if (location.pathname.startsWith('/r/')) {
    return (
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/r/:token" element={<PublicRide />} />
        </Routes>
      </Suspense>
    );
  }

  // Rechtstexte müssen ohne Anmeldung erreichbar sein (Pflichtinformationen).
  if (LEGAL_PATHS.includes(location.pathname)) {
    return <LegalRoutes />;
  }

  if (loading) {
    return <Spinner />;
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
        <Suspense fallback={<Spinner />}>
          <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fahren" element={<Fahren />} />
          <Route path="/karte" element={<MapPage />} />
          <Route path="/routen" element={<Routen />} />
          <Route path="/statistik" element={<Statistik />} />
          <Route path="/fahrten/:id" element={<RideDetail />} />
          <Route path="/einstellungen" element={<Einstellungen />} />
          <Route path="/freunde" element={<Freunde />} />
          <Route path="/freunde/:id" element={<FriendProfile />} />
          <Route path="/gruppen" element={<Groups />} />
          <Route path="/gruppen/:id" element={<GroupDetail />} />
          <Route path="/admin" element={user.isAdmin ? <Admin /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
