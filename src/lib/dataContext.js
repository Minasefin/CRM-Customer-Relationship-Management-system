import { createContext, useContext } from 'react';

// Loaded data (organizations, contacts, contracts, employment) for components deep in the tree.
export const DataContext = createContext({ organizations: [], contacts: [], contracts: [], employment: [] });
export const useData = () => useContext(DataContext);
