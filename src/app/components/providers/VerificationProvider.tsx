"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { useAccount } from "wagmi";
import { arcTestnet } from "viem/chains";

type VerificationContextValue = {
  isVerified: boolean;
  setVerified: (value: boolean) => void;
  clearVerification: () => void;
};

type VerificationProviderProps = {
  children: ReactNode;
};

const VerificationContext =
  createContext<VerificationContextValue | null>(null);

export function VerificationProvider({
  children,
}: VerificationProviderProps) {
  const {
    address,
    chainId,
    isConnected,
  } = useAccount();

  const isVerified =
    isConnected &&
    Boolean(address) &&
    chainId === arcTestnet.id;

  const setVerified = useCallback(
    (_value: boolean): void => {
      // Verification is derived automatically from
      // wallet connection and Arc Testnet network.
    },
    []
  );

  const clearVerification = useCallback(
    (): void => {
      // Disconnecting or switching networks automatically
      // removes verification.
    },
    []
  );

  const value = useMemo(
    () => ({
      isVerified,
      setVerified,
      clearVerification,
    }),
    [
      isVerified,
      setVerified,
      clearVerification,
    ]
  );

  return (
    <VerificationContext.Provider value={value}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification(): VerificationContextValue {
  const context = useContext(
    VerificationContext
  );

  if (!context) {
    throw new Error(
      "useVerification must be used inside VerificationProvider."
    );
  }

  return context;
}