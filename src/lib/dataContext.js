import { createContext, useContext } from 'react';

// Loaded data (organizations, contacts, contracts, employment) for components deep in the tree.
export const DataContext = createContext({ organizations: [], contacts: [], contracts: [], employment: [] });
export const useData = () => useContext(DataContext);

// App-wide actions used by ⋯ menus (edit, archive, delete, change status). Set up in App.jsx.
export const ActionsContext = createContext({});
export const useActions = () => useContext(ActionsContext);
