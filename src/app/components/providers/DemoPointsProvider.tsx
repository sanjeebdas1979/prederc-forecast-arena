"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PredictionDirection = "higher" | "lower";
export type PredictionStatus = "pending" | "won" | "lost";
export type PredictionDuration = 60 | 300 | 900;

export type PredictionOnchainStatus =
  | "local"
  | "submitted"
  | "resolved"
  | "claimable"
  | "claimed";

export type PredictionRecord = {
  id: number;
  roundNumber: number;
  direction: PredictionDirection;
  duration: PredictionDuration | null;
  points: number;
  submittedAt: string;

  status: PredictionStatus;
  result: PredictionDirection | null;

  reward: number;
  claimableReward: number;
  claimed: boolean;

  startPrice: number | null;
  endPrice: number | null;
  priceDifference: number | null;

  forecastId: string | null;
  transactionHash: `0x${string}` | null;
  resolveTransactionHash: `0x${string}` | null;
  claimTransactionHash: `0x${string}` | null;

  onchainStatus: PredictionOnchainStatus;
};

type AddPredictionOnchainData = {
  forecastId?: bigint | string;
  transactionHash?: `0x${string}`;
};

type DemoPointsContextValue = {
  balance: number;
  predictions: PredictionRecord[];

  spendPoints: (amount: number) => boolean;

  addPrediction: (
    roundNumber: number,
    direction: PredictionDirection,
    points: number,
    duration: PredictionDuration,
    onchainData?: AddPredictionOnchainData
  ) => number;

  settleRound: (
    roundNumber: number,
    result: PredictionDirection,
    startPrice: number,
    endPrice: number
  ) => void;

  setResolveTransaction: (
    predictionId: number,
    transactionHash: `0x${string}`
  ) => void;

  markResolvedOnchain: (
    predictionId: number
  ) => void;

  syncClaimedReward: (
    predictionId: number,
    transactionHash?: `0x${string}`
  ) => boolean;

  claimRewardLocally: (
    predictionId: number,
    transactionHash: `0x${string}`
  ) => boolean;

  addPoints: (amount: number) => void;
  resetPoints: () => void;
};

type SavedDemoData = {
  balance: number;
  predictions: PredictionRecord[];
};

type DemoPointsProviderProps = {
  children: ReactNode;
};

const STARTING_POINTS = 1000;

const STORAGE_KEY =
  "prederc-forecast-arena-v2-data";

const DemoPointsContext =
  createContext<DemoPointsContextValue | null>(null);

function normalizeDuration(
  duration: unknown
): PredictionDuration | null {
  if (
    duration === 60 ||
    duration === 300 ||
    duration === 900
  ) {
    return duration;
  }

  return null;
}

function normalizeHash(
  value: unknown
): `0x${string}` | null {
  if (
    typeof value === "string" &&
    value.startsWith("0x")
  ) {
    return value as `0x${string}`;
  }

  return null;
}

function normalizeOnchainStatus(
  value: unknown,
  status: PredictionStatus,
  claimed: boolean,
  resolveTransactionHash: `0x${string}` | null
): PredictionOnchainStatus {
  if (claimed) {
    return "claimed";
  }

  if (
    status === "won" &&
    (
      resolveTransactionHash ||
      value === "claimable"
    )
  ) {
    return "claimable";
  }

  if (status === "lost") {
    return "resolved";
  }

  if (
    value === "local" ||
    value === "submitted" ||
    value === "resolved" ||
    value === "claimable" ||
    value === "claimed"
  ) {
    return value;
  }

  return "local";
}

function normalizePrediction(
  prediction: Partial<PredictionRecord>
): PredictionRecord | null {
  if (
    typeof prediction.id !== "number" ||
    !Number.isFinite(prediction.id) ||
    typeof prediction.roundNumber !== "number" ||
    !Number.isFinite(prediction.roundNumber) ||
    typeof prediction.points !== "number" ||
    !Number.isFinite(prediction.points) ||
    (
      prediction.direction !== "higher" &&
      prediction.direction !== "lower"
    )
  ) {
    return null;
  }

  const status: PredictionStatus =
    prediction.status === "won" ||
    prediction.status === "lost" ||
    prediction.status === "pending"
      ? prediction.status
      : "pending";

  const result: PredictionDirection | null =
    prediction.result === "higher" ||
    prediction.result === "lower"
      ? prediction.result
      : null;

  const reward =
    typeof prediction.reward === "number" &&
    Number.isFinite(prediction.reward)
      ? prediction.reward
      : 0;

  const claimableReward =
    typeof prediction.claimableReward === "number" &&
    Number.isFinite(prediction.claimableReward)
      ? prediction.claimableReward
      : status === "won"
        ? reward
        : 0;

  const claimed =
    prediction.claimed === true;

  const resolveTransactionHash =
    normalizeHash(
      prediction.resolveTransactionHash
    );

  return {
    id: prediction.id,
    roundNumber: prediction.roundNumber,
    direction: prediction.direction,
    duration: normalizeDuration(
      prediction.duration
    ),
    points: prediction.points,

    submittedAt:
      typeof prediction.submittedAt === "string"
        ? prediction.submittedAt
        : "Unknown",

    status,
    result,

    reward,
    claimableReward,
    claimed,

    startPrice:
      typeof prediction.startPrice === "number" &&
      Number.isFinite(prediction.startPrice)
        ? prediction.startPrice
        : null,

    endPrice:
      typeof prediction.endPrice === "number" &&
      Number.isFinite(prediction.endPrice)
        ? prediction.endPrice
        : null,

    priceDifference:
      typeof prediction.priceDifference === "number" &&
      Number.isFinite(prediction.priceDifference)
        ? prediction.priceDifference
        : null,

    forecastId:
      typeof prediction.forecastId === "string"
        ? prediction.forecastId
        : null,

    transactionHash:
      normalizeHash(
        prediction.transactionHash
      ),

    resolveTransactionHash,

    claimTransactionHash:
      normalizeHash(
        prediction.claimTransactionHash
      ),

    onchainStatus:
      normalizeOnchainStatus(
        prediction.onchainStatus,
        status,
        claimed,
        resolveTransactionHash
      ),
  };
}

export function DemoPointsProvider({
  children,
}: DemoPointsProviderProps) {
  const [balance, setBalance] =
    useState(STARTING_POINTS);

  const [predictions, setPredictions] = useState<
    PredictionRecord[]
  >([]);

  const [hasLoadedStorage, setHasLoadedStorage] =
    useState(false);

  useEffect(() => {
    try {
      const savedData =
        window.localStorage.getItem(
          STORAGE_KEY
        );

      if (savedData) {
        const parsedData =
          JSON.parse(
            savedData
          ) as SavedDemoData;

        if (
          Number.isFinite(parsedData.balance) &&
          Array.isArray(parsedData.predictions)
        ) {
          const normalizedPredictions =
            parsedData.predictions
              .map(normalizePrediction)
              .filter(
                (
                  prediction
                ): prediction is PredictionRecord =>
                  prediction !== null
              );

          setBalance(parsedData.balance);
          setPredictions(normalizedPredictions);
        }
      }
    } catch (error) {
      console.error(
        "Could not load Arena data:",
        error
      );
    } finally {
      setHasLoadedStorage(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          balance,
          predictions,
        })
      );
    } catch (error) {
      console.error(
        "Could not save Arena data:",
        error
      );
    }
  }, [
    balance,
    predictions,
    hasLoadedStorage,
  ]);

  const spendPoints = useCallback(
    (amount: number): boolean => {
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > balance
      ) {
        return false;
      }

      setBalance(
        (currentBalance) =>
          currentBalance - amount
      );

      return true;
    },
    [balance]
  );

  const addPrediction = useCallback(
    (
      roundNumber: number,
      direction: PredictionDirection,
      points: number,
      duration: PredictionDuration,
      onchainData?: AddPredictionOnchainData
    ): number => {
      const predictionId = Date.now();

      const transactionHash =
        onchainData?.transactionHash ?? null;

      const newPrediction: PredictionRecord = {
        id: predictionId,
        roundNumber,
        direction,
        duration,
        points,

        submittedAt:
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),

        status: "pending",
        result: null,

        reward: 0,
        claimableReward: 0,
        claimed: false,

        startPrice: null,
        endPrice: null,
        priceDifference: null,

        forecastId:
          onchainData?.forecastId !== undefined
            ? onchainData.forecastId.toString()
            : null,

        transactionHash,
        resolveTransactionHash: null,
        claimTransactionHash: null,

        onchainStatus: transactionHash
          ? "submitted"
          : "local",
      };

      setPredictions(
        (currentPredictions) => [
          newPrediction,
          ...currentPredictions,
        ]
      );

      return predictionId;
    },
    []
  );

  const settleRound = useCallback(
    (
      roundNumber: number,
      result: PredictionDirection,
      startPrice: number,
      endPrice: number
    ): void => {
      if (
        !Number.isFinite(startPrice) ||
        !Number.isFinite(endPrice)
      ) {
        return;
      }

      const priceDifference =
        endPrice - startPrice;

      setPredictions(
        (currentPredictions) =>
          currentPredictions.map(
            (prediction) => {
              if (
                prediction.roundNumber !==
                  roundNumber ||
                prediction.status !== "pending"
              ) {
                return prediction;
              }

              const didWin =
                prediction.direction === result;

              const reward = didWin
                ? prediction.points * 2
                : 0;

              return {
                ...prediction,

                status: didWin
                  ? "won"
                  : "lost",

                result,
                reward,
                claimableReward: reward,
                claimed: false,

                startPrice,
                endPrice,
                priceDifference,

                onchainStatus: didWin
                  ? "submitted"
                  : "resolved",
              };
            }
          )
      );
    },
    []
  );

  const setResolveTransaction = useCallback(
    (
      predictionId: number,
      transactionHash: `0x${string}`
    ): void => {
      setPredictions(
        (currentPredictions) =>
          currentPredictions.map(
            (prediction) =>
              prediction.id === predictionId
                ? {
                    ...prediction,
                    resolveTransactionHash:
                      transactionHash,
                    onchainStatus:
                      prediction.status === "won"
                        ? "claimable"
                        : "resolved",
                  }
                : prediction
          )
      );
    },
    []
  );

  const markResolvedOnchain = useCallback(
    (predictionId: number): void => {
      setPredictions(
        (currentPredictions) =>
          currentPredictions.map(
            (prediction) =>
              prediction.id === predictionId
                ? {
                    ...prediction,
                    onchainStatus:
                      prediction.status === "won"
                        ? "claimable"
                        : "resolved",
                  }
                : prediction
          )
      );
    },
    []
  );

  const syncClaimedReward = useCallback(
    (
      predictionId: number,
      transactionHash?: `0x${string}`
    ): boolean => {
      let rewardToAdd = 0;
      let didUpdate = false;

      setPredictions(
        (currentPredictions) =>
          currentPredictions.map(
            (prediction) => {
              if (
                prediction.id !== predictionId ||
                prediction.status !== "won" ||
                prediction.claimed
              ) {
                return prediction;
              }

              rewardToAdd =
                prediction.claimableReward > 0
                  ? prediction.claimableReward
                  : prediction.reward;

              if (rewardToAdd <= 0) {
                return prediction;
              }

              didUpdate = true;

              return {
                ...prediction,
                claimed: true,
                claimableReward: 0,
                claimTransactionHash:
                  transactionHash ??
                  prediction.claimTransactionHash,
                onchainStatus: "claimed",
              };
            }
          )
      );

      if (
        didUpdate &&
        rewardToAdd > 0
      ) {
        setBalance(
          (currentBalance) =>
            currentBalance + rewardToAdd
        );
      }

      return didUpdate;
    },
    []
  );

  const claimRewardLocally = useCallback(
    (
      predictionId: number,
      transactionHash: `0x${string}`
    ): boolean =>
      syncClaimedReward(
        predictionId,
        transactionHash
      ),
    [syncClaimedReward]
  );

  const addPoints = useCallback(
    (amount: number): void => {
      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return;
      }

      setBalance(
        (currentBalance) =>
          currentBalance + amount
      );
    },
    []
  );

  const resetPoints = useCallback((): void => {
    setBalance(STARTING_POINTS);
    setPredictions([]);

    try {
      window.localStorage.removeItem(
        STORAGE_KEY
      );
    } catch (error) {
      console.error(
        "Could not clear Arena data:",
        error
      );
    }
  }, []);

  const value = useMemo(
    () => ({
      balance,
      predictions,

      spendPoints,
      addPrediction,
      settleRound,

      setResolveTransaction,
      markResolvedOnchain,

      syncClaimedReward,
      claimRewardLocally,

      addPoints,
      resetPoints,
    }),
    [
      balance,
      predictions,

      spendPoints,
      addPrediction,
      settleRound,

      setResolveTransaction,
      markResolvedOnchain,

      syncClaimedReward,
      claimRewardLocally,

      addPoints,
      resetPoints,
    ]
  );

  return (
    <DemoPointsContext.Provider value={value}>
      {children}
    </DemoPointsContext.Provider>
  );
}

export function useDemoPoints(): DemoPointsContextValue {
  const context = useContext(
    DemoPointsContext
  );

  if (!context) {
    throw new Error(
      "useDemoPoints must be used inside DemoPointsProvider."
    );
  }

  return context;
}