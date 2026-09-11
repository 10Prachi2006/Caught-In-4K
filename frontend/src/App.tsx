import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AlertCentre } from './pages/AlertCentre';
import { Dashboard } from './pages/Dashboard';
import { GisMap } from './pages/GisMap';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { VehicleSearch } from './pages/VehicleSearch';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="live" element={<LiveMonitoring />} />
          <Route path="search" element={<VehicleSearch />} />
          <Route path="map" element={<GisMap />} />
          <Route path="alerts" element={<AlertCentre />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
