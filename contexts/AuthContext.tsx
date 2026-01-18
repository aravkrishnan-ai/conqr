import { createContext, useContext } from 'react';

type AuthContextType = {
  setHasProfile: (value: boolean) => void;
  refreshAuthState: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({
  setHasProfile: () => {},
  refreshAuthState: async () => {},
});

export const useAuth = () => useContext(AuthContext);
