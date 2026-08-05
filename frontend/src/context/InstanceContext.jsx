import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const InstanceContext = createContext(null);

export const InstanceProvider = ({ children }) => {
  const [instanceInfo, setInstanceInfo] = useState({
    mode: 'central_server',
    instance_name: 'IOC Hunt Platform',
    tenant_id: 'default',
    setup_complete: true,
    available_modes: []
  });
  const [loading, setLoading] = useState(true);

  const refreshInstanceInfo = useCallback(async () => {
    try {
      const res = await axios.get('/api/instance/info');
      setInstanceInfo(res.data);
      return res.data;
    } catch (err) {
      console.error('[Instance] Failed to fetch instance info:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshInstanceInfo();
  }, [refreshInstanceInfo]);

  const isCentral = () => instanceInfo.mode === 'central_server';
  const isAggregator = () => instanceInfo.mode === 'aggregator';

  return (
    <InstanceContext.Provider value={{
      instanceInfo,
      loading,
      isCentral,
      isAggregator,
      refreshInstanceInfo
    }}>
      {children}
    </InstanceContext.Provider>
  );
};

export const useInstance = () => {
  const ctx = useContext(InstanceContext);
  if (!ctx) throw new Error('useInstance must be used within an InstanceProvider');
  return ctx;
};
