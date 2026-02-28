import { useAppStore } from './stores/app-store';
import AuthScreen from './components/AuthScreen';
import Dashboard from './pages/Dashboard';
import { useWebSocket } from './hooks/useWebSocket';

function AppContent() {
  useWebSocket();
  return <Dashboard />;
}

export default function App() {
  const token = useAppStore((s) => s.token);

  if (!token) {
    return <AuthScreen />;
  }

  return <AppContent />;
}
