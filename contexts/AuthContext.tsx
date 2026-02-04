import { createContext, useContext } from 'react';

type AuthContextType = {
  setHasProfile: (value: boolean) => void;
  refreshAuthState: () => Promise<void>;
  suggestedUsername: string;
  userAvatarUrl: string | null;
};

export const AuthContext = createContext<AuthContextType>({
  setHasProfile: () => {},
  refreshAuthState: async () => {},
  suggestedUsername: '',
  userAvatarUrl: null,
});

export const useAuth = () => useContext(AuthContext);
