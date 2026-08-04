"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  usePublicClient,
  useWriteContract,
} from "wagmi";

import { arcTestnet } from "viem/chains";

import {
  FORECAST_REGISTRY_V2_ABI,
  FORECAST_REGISTRY_V2_ADDRESS,
} from "../../contracts/forecastRegistryV2";

import {
  useDemoPoints,
  type PredictionRecord,
} from "../providers/DemoPointsProvider";

function formatPrice(
  price: number | null
): string {
  if (
    price === null ||
    !Number.isFinite(price)
  ) {
    return "Not recorded";
  }

  return `$${price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDifference(
  difference: number | null
): string {
  if (
    difference === null ||
    !Number.isFinite(difference)
  ) {
    return "Not recorded";
  }

  const sign =
    difference >= 0 ? "+" : "-";

  return `${sign}$${Math.abs(
    difference
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(
  duration: 60 | 300 | 900 | null
): string {
  if (duration === 60) {
    return "1 Minute";
  }

  if (duration === 300) {
    return "5 Minutes";
  }

  if (duration === 900) {
    return "15 Minutes";
  }

  return "Not recorded";
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function sleep(
  milliseconds: number
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds
    );
  });
}

function getErrorText(
  error: unknown
): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return error.message.toLowerCase();
}

export default function PredictionHistory() {
  const {
    predictions,
    setResolveTransaction,
    markResolvedOnchain,
    syncClaimedReward,
  } = useDemoPoints();

  const publicClient = usePublicClient({
    chainId: arcTestnet.id,
  });

  const {
    writeContractAsync,
    isPending: isWaitingForWallet,
  } = useWriteContract();

  const [
    processingPredictionId,
    setProcessingPredictionId,
  ] = useState<number | null>(null);

  const [
    processingAction,
    setProcessingAction,
  ] = useState<
    "resolve" | "claim" | "sync" | null
  >(null);

  const [messages, setMessages] = useState<
    Record<number, string>
  >({});

  const [latestHashes, setLatestHashes] =
    useState<
      Record<
        number,
        `0x${string}` | undefined
      >
    >({});

  function updateMessage(
    predictionId: number,
    message: string
  ): void {
    setMessages(
      (currentMessages) => ({
        ...currentMessages,
        [predictionId]: message,
      })
    );
  }

  async function readHasClaimed(
    forecastId: string
  ): Promise<boolean> {
    if (!publicClient) {
      return false;
    }

    const result =
      await publicClient.readContract({
        address:
          FORECAST_REGISTRY_V2_ADDRESS,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "hasClaimed",
        args: [BigInt(forecastId)],
      });

    return result === true;
  }

  async function waitForClaimStatus(
    forecastId: string
  ): Promise<boolean> {
    const maximumAttempts = 40;

    for (
      let attempt = 1;
      attempt <= maximumAttempts;
      attempt += 1
    ) {
      try {
        const hasClaimed =
          await readHasClaimed(forecastId);

        if (hasClaimed) {
          return true;
        }
      } catch (error) {
        console.error(
          "Claim status read failed:",
          error
        );
      }

      await sleep(1500);
    }

    return false;
  }

  async function syncPredictionClaim(
    prediction: PredictionRecord
  ): Promise<void> {
    if (
      !prediction.forecastId ||
      prediction.claimed ||
      prediction.status !== "won"
    ) {
      return;
    }

    try {
      setProcessingPredictionId(
        prediction.id
      );
      setProcessingAction("sync");

      updateMessage(
        prediction.id,
        "Checking claim status on Arc Testnet..."
      );

      const hasClaimed =
        await readHasClaimed(
          prediction.forecastId
        );

      if (!hasClaimed) {
        updateMessage(
          prediction.id,
          "This reward has not been claimed onchain yet."
        );
        return;
      }

      syncClaimedReward(
        prediction.id,
        latestHashes[prediction.id]
      );

      updateMessage(
        prediction.id,
        "Successful onchain claim detected. Arena balance updated."
      );
    } catch (error) {
      console.error(
        "Claim sync failed:",
        error
      );

      updateMessage(
        prediction.id,
        "Could not read the claim status from Arc Testnet."
      );
    } finally {
      setProcessingPredictionId(null);
      setProcessingAction(null);
    }
  }

  async function resolvePredictionOnchain(
    prediction: PredictionRecord
  ): Promise<void> {
    if (
      !prediction.forecastId ||
      prediction.endPrice === null ||
      !publicClient
    ) {
      updateMessage(
        prediction.id,
        "Forecast data is incomplete."
      );
      return;
    }

    try {
      setProcessingPredictionId(
        prediction.id
      );
      setProcessingAction("resolve");

      updateMessage(
        prediction.id,
        "Confirm forecast resolution in MetaMask."
      );

      const hash =
        await writeContractAsync({
          address:
            FORECAST_REGISTRY_V2_ADDRESS,
          abi: FORECAST_REGISTRY_V2_ABI,
          functionName: "resolveForecast",
          args: [
            BigInt(prediction.forecastId),
            BigInt(
              Math.round(
                prediction.endPrice * 100
              )
            ),
          ],
          chainId: arcTestnet.id,
        });

      setLatestHashes(
        (currentHashes) => ({
          ...currentHashes,
          [prediction.id]: hash,
        })
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

      if (receipt.status !== "success") {
        throw new Error(
          "Resolution failed."
        );
      }

      setResolveTransaction(
        prediction.id,
        hash
      );

      updateMessage(
        prediction.id,
        "Forecast resolved. Reward is claimable."
      );
    } catch (error) {
      const errorText =
        getErrorText(error);

      if (
        errorText.includes(
          "already resolved"
        )
      ) {
        markResolvedOnchain(
          prediction.id
        );

        updateMessage(
          prediction.id,
          "Forecast was already resolved onchain."
        );
      } else {
        updateMessage(
          prediction.id,
          "Forecast resolution failed."
        );
      }
    } finally {
      setProcessingPredictionId(null);
      setProcessingAction(null);
    }
  }

  async function claimPredictionReward(
    prediction: PredictionRecord
  ): Promise<void> {
    if (
      !prediction.forecastId ||
      !publicClient
    ) {
      updateMessage(
        prediction.id,
        "Forecast ID is unavailable."
      );
      return;
    }

    try {
      setProcessingPredictionId(
        prediction.id
      );
      setProcessingAction("claim");

      updateMessage(
        prediction.id,
        "Confirm reward claim in MetaMask."
      );

      const hash =
        await writeContractAsync({
          address:
            FORECAST_REGISTRY_V2_ADDRESS,
          abi: FORECAST_REGISTRY_V2_ABI,
          functionName: "claimReward",
          args: [
            BigInt(
              prediction.forecastId
            ),
          ],
          chainId: arcTestnet.id,
        });

      setLatestHashes(
        (currentHashes) => ({
          ...currentHashes,
          [prediction.id]: hash,
        })
      );

      updateMessage(
        prediction.id,
        "Checking claim status on Arc Testnet..."
      );

      const hasClaimed =
        await waitForClaimStatus(
          prediction.forecastId
        );

      if (!hasClaimed) {
        updateMessage(
          prediction.id,
          "Claim transaction submitted. Use Sync Claim Status after Explorer shows Success."
        );
        return;
      }

      syncClaimedReward(
        prediction.id,
        hash
      );

      updateMessage(
        prediction.id,
        "Arena Points claimed successfully."
      );
    } catch (error) {
      const errorText =
        getErrorText(error);

      if (
        errorText.includes(
          "already claimed"
        )
      ) {
        const hasClaimed =
          await readHasClaimed(
            prediction.forecastId
          );

        if (hasClaimed) {
          syncClaimedReward(
            prediction.id
          );

          updateMessage(
            prediction.id,
            "Previous successful claim detected. Arena balance updated."
          );
        }
      } else {
        updateMessage(
          prediction.id,
          "Reward claim failed."
        );
      }
    } finally {
      setProcessingPredictionId(null);
      setProcessingAction(null);
    }
  }

  useEffect(() => {
    if (!publicClient) {
      return;
    }

    const predictionsToSync =
      predictions.filter(
        (prediction) =>
          prediction.status === "won" &&
          !prediction.claimed &&
          Boolean(
            prediction.forecastId
          )
      );

    for (
      const prediction of predictionsToSync
    ) {
      void readHasClaimed(
        prediction.forecastId as string
      )
        .then((hasClaimed) => {
          if (hasClaimed) {
            syncClaimedReward(
              prediction.id
            );
          }
        })
        .catch((error) => {
          console.error(
            "Automatic claim sync failed:",
            error
          );
        });
    }
  }, [
    publicClient,
    predictions,
    syncClaimedReward,
  ]);

  const totalUnclaimedRewards =
    predictions.reduce(
      (total, prediction) =>
        prediction.status === "won" &&
        !prediction.claimed
          ? total + prediction.reward
          : total,
      0
    );

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-orange-400">
            Prediction History
          </p>

          <h3 className="mt-2 text-2xl font-bold text-white">
            Your recent forecasts
          </h3>

          <p className="mt-2 text-sm text-gray-500">
            Winning rewards remain available until
            they are claimed onchain.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-3">
          <p className="text-[10px] uppercase text-emerald-400">
            Unclaimed Rewards
          </p>

          <p className="mt-1 text-xl font-black text-white">
            {totalUnclaimedRewards.toLocaleString()} points
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {predictions.map((prediction) => {
          const isWon =
            prediction.status === "won";

          const isResolvedOnchain =
            Boolean(
              prediction.resolveTransactionHash
            ) ||
            prediction.onchainStatus ===
              "claimable" ||
            prediction.onchainStatus ===
              "claimed";

          const isClaimable =
            isWon &&
            isResolvedOnchain &&
            !prediction.claimed;

          const isProcessing =
            processingPredictionId ===
            prediction.id;

          const visibleHash =
            latestHashes[prediction.id] ??
            prediction.claimTransactionHash ??
            prediction.resolveTransactionHash ??
            prediction.transactionHash;

          return (
            <article
              key={prediction.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500">
                    Round #{prediction.roundNumber}
                  </p>

                  <p
                    className={`mt-2 text-lg font-bold ${
                      prediction.direction === "higher"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {prediction.direction.toUpperCase()}
                  </p>
                </div>

                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold">
                  {prediction.claimed
                    ? "CLAIMED"
                    : prediction.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-500">
                    Timeframe
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatDuration(
                      prediction.duration
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Stake
                  </p>
                  <p className="mt-1 font-semibold">
                    {prediction.points} points
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Start / End
                  </p>
                  <p className="mt-1 text-xs">
                    {formatPrice(
                      prediction.startPrice
                    )}{" "}
                    →{" "}
                    {formatPrice(
                      prediction.endPrice
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Movement
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatDifference(
                      prediction.priceDifference
                    )}
                  </p>
                </div>
              </div>

              {isWon && (
                <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
                  <p className="font-bold text-emerald-400">
                    {prediction.reward} Arena Points
                  </p>

                  {!prediction.claimed &&
                    !isResolvedOnchain && (
                      <button
                        type="button"
                        disabled={
                          isWaitingForWallet ||
                          isProcessing
                        }
                        onClick={() => {
                          void resolvePredictionOnchain(
                            prediction
                          );
                        }}
                        className="mt-3 w-full rounded-xl bg-yellow-500/15 px-4 py-3 text-xs font-bold text-yellow-300"
                      >
                        {isProcessing &&
                        processingAction === "resolve"
                          ? "RESOLVING..."
                          : "RESOLVE REWARD ONCHAIN"}
                      </button>
                    )}

                  {isClaimable && (
                    <button
                      type="button"
                      disabled={
                        isWaitingForWallet ||
                        isProcessing
                      }
                      onClick={() => {
                        void claimPredictionReward(
                          prediction
                        );
                      }}
                      className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-black"
                    >
                      {isProcessing &&
                      processingAction === "claim"
                        ? "CHECKING CLAIM..."
                        : `CLAIM ${prediction.reward} POINTS ONCHAIN`}
                    </button>
                  )}

                  {!prediction.claimed &&
                    prediction.forecastId && (
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => {
                          void syncPredictionClaim(
                            prediction
                          );
                        }}
                        className="mt-2 w-full rounded-xl border border-blue-500/30 px-4 py-2 text-xs font-semibold text-blue-300"
                      >
                        {isProcessing &&
                        processingAction === "sync"
                          ? "SYNCING..."
                          : "SYNC CLAIM STATUS"}
                      </button>
                    )}

                  {prediction.claimed && (
                    <p className="mt-3 text-sm font-bold text-emerald-400">
                      ✓ Reward claimed onchain
                    </p>
                  )}
                </div>
              )}

              {messages[prediction.id] && (
                <p className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-xs text-blue-200">
                  {messages[prediction.id]}
                </p>
              )}

              {visibleHash && (
                <a
                  href={`https://testnet.arcscan.app/tx/${visibleHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-xs font-semibold text-blue-300"
                >
                  {shortenHash(visibleHash)} — View on Arc Explorer ↗
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}