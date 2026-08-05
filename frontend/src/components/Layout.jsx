import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ForcePasswordChangeModal from './ForcePasswordChangeModal';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  }, [collapsed]);

  if (user?.force_password_change) {
    return (
      <div id="main-layout" className="flex h-screen overflow-hidden relative z-0">
        <ForcePasswordChangeModal />
      </div>
    );
  }

  return (
    <div id="main-layout" className="flex h-screen overflow-hidden relative z-0">
      <Sidebar collapsed={collapsed} toggle={() => setCollapsed(!collapsed)} />
      <div id="main-wrap" className="flex flex-col flex-1 overflow-y-auto">
        <Navbar />
        <main className="p-[24px] flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
