import { createContext, useContext, useState, useEffect } from 'react';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const [range, setRange] = useState(() => {
    const saved = localStorage.getItem('iochunt_filter_range');
    return saved !== null ? Number(saved) : 168; // Default Last 7 days
  });
  
  const [machine, setMachine] = useState(() => {
    return localStorage.getItem('iochunt_filter_machine') || '';
  });

  const [aggregator, setAggregator] = useState(() => {
    return localStorage.getItem('iochunt_filter_aggregator') || '';
  });

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem('iochunt_filter_range', range);
  }, [range]);

  useEffect(() => {
    localStorage.setItem('iochunt_filter_machine', machine);
  }, [machine]);

  useEffect(() => {
    localStorage.setItem('iochunt_filter_aggregator', aggregator);
  }, [aggregator]);

  return (
    <FilterContext.Provider value={{ range, setRange, machine, setMachine, aggregator, setAggregator }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
}
