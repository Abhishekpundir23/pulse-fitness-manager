import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

type AppDataContextValue = {
  revision: number;
  refreshData: () => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: PropsWithChildren) {
  const [revision, setRevision] = useState(0);
  const refreshData = useCallback(() => setRevision((value) => value + 1), []);
  const value = useMemo(() => ({ revision, refreshData }), [revision, refreshData]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
}

