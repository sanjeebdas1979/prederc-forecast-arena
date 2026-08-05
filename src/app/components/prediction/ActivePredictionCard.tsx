"use client";

import {
  useEffect,
  useMemo,
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

import { useBtcPrice } from "../providers/BtcPriceProvider";
import { useDemoPoints } from "../providers/DemoPointsProvider";

import {
  useRound,
  type PredictionDuration,
} from "../providers/RoundProvider";

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) {
    return "Waiting...";
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
    return "Waiting...";
  }

  const sign = difference >= 0 ? "+" : "-";

  return `${sign}$${Math.abs(
    difference
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(
  duration: PredictionDuration | null
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

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes
    .toString()
    .padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function getTransactionError(
  error: unknown
): string {
  if (!(error instanceof Error)) {
    return "Onchain transaction failed.";
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("user rejected") ||
    message.includes("user denied")
  ) {
    return "Transaction was rejected in MetaMask.";
  }

  if (message.includes("only owner")) {
    return "Only the ForecastRegistryV2 owner wallet can resolve this forecast.";
  }

  if (
    message.includes("already resolved")
  ) {
    return "This forecast has already been resolved onchain.";
  }

  if (
    message.includes("already claimed")
  ) {
    return "This reward has already been claimed.";
  }

  if (
    message.includes("did not win") ||
    message.includes("no claimable reward")
  ) {
    return "No onchain reward is available for this forecast.";
  }

  return "Onchain transaction failed. Please try again.";
}

export default function ActivePredictionCard() {
  const {
    predictions,
    setResolveTransaction,
    claimRewardLocally,
  } = useDemoPoints();

  const { data } = useBtcPrice();

  const {
    roundNumber,
    timeLeft,
    status,
    result,
    startPrice,
    endPrice,
  } = useRound();

  const publicClient = usePublicClient({
    chainId: arcTestnet.id,
  });

  const {
    writeContractAsync,
    isPending: isWaitingForWallet,
  } = useWriteContract();

  const [transactionMessage, setTransactionMessage] =
    useState("");

  const [
    isConfirmingTransaction,
    setIsConfirmingTransaction,
  ] = useState(false);

  const [latestTransactionHash, setLatestTransactionHash] =
    useState<`0x${string}` | null>(null);

  const [isResolvedOnchain, setIsResolvedOnchain] =
    useState(false);

  const currentPrediction = useMemo(
    () =>
      predictions.find(
        (prediction) =>
          prediction.roundNumber === roundNumber
      ) ?? null,
    [predictions, roundNumber]
  );

  useEffect(() => {
    setIsResolvedOnchain(
      Boolean(
        currentPrediction?.resolveTransactionHash
      )
    );

    setTransactionMessage("");
    setLatestTransactionHash(null);
  }, [
    currentPrediction?.id,
    currentPrediction?.resolveTransactionHash,
  ]);

  if (!currentPrediction) {
    return (
      <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
        <p className="text-xs font-semibold text-orange-400">
          Live Position
        </p>

        <h2 className="mt-2 text-xl font-bold text-white">
          No active prediction
        </h2>

        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
          <p className="text-xs leading-5 text-gray-400">
            Submit a Higher or Lower prediction to track
            your position here.
          </p>
        </div>
      </section>
    );
  }
   const activePrediction = currentPrediction;
  const livePrice =
    data && Number.isFinite(data.price)
      ? data.price
      : null;

  const entryPrice =
    currentPrediction.startPrice ?? startPrice;

  const finalPrice =
    currentPrediction.endPrice ?? endPrice;

  const displayPrice =
    currentPrediction.status === "pending"
      ? livePrice
      : finalPrice;

  const priceDifference =
    entryPrice !== null && displayPrice !== null
      ? displayPrice - entryPrice
      : null;

  const isDirectionCurrentlyCorrect =
    priceDifference === null
      ? null
      : currentPrediction.direction === "higher"
        ? priceDifference > 0
        : priceDifference < 0;

  const isSettled =
    currentPrediction.status !== "pending";

  const isWinner =
    currentPrediction.status === "won";

  const isClaimed =
    currentPrediction.claimed;

  const forecastId =
    currentPrediction.forecastId;

  const isOnchainBusy =
    isWaitingForWallet ||
    isConfirmingTransaction;

  const statusText =
    currentPrediction.status === "won"
      ? isClaimed
        ? "CLAIMED"
        : "WON"
      : currentPrediction.status === "lost"
        ? "LOST"
        : status === "resolving"
          ? "RESOLVING"
          : "LIVE";

  const statusStyles =
    currentPrediction.status === "won"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : currentPrediction.status === "lost"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
        : status === "resolving"
          ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
          : "border-blue-500/30 bg-blue-500/10 text-blue-400";

  const movementStyles =
    priceDifference === null
      ? "text-gray-300"
      : priceDifference >= 0
        ? "text-emerald-400"
        : "text-rose-400";

  async function resolveRewardOnchain(): Promise<void> {
    if (!forecastId) {
      setTransactionMessage(
        "This prediction does not have an onchain forecast ID."
      );
      return;
    }

    if (
      finalPrice === null ||
      !Number.isFinite(finalPrice) ||
      finalPrice <= 0
    ) {
      setTransactionMessage(
        "Final BTC price is not ready yet."
      );
      return;
    }

    if (!publicClient) {
      setTransactionMessage(
        "Arc Testnet client is not ready."
      );
      return;
    }

    try {
      setTransactionMessage(
        "Confirm forecast resolution in MetaMask."
      );

      setLatestTransactionHash(null);

      const scaledFinalPrice = BigInt(
        Math.round(finalPrice * 100)
      );

      const hash = await writeContractAsync({
        address:
          FORECAST_REGISTRY_V2_ADDRESS,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "resolveForecast",
        args: [
          BigInt(forecastId),
          scaledFinalPrice,
        ],
        chainId: arcTestnet.id,
      });

      setLatestTransactionHash(hash);
      setIsConfirmingTransaction(true);

      setTransactionMessage(
        "Waiting for Arc Testnet resolution confirmation..."
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

      if (receipt.status !== "success") {
        throw new Error(
          "Resolution transaction failed."
        );
      }

      setResolveTransaction(
  activePrediction.id,
  hash
);

      setIsResolvedOnchain(true);

      setTransactionMessage(
        "Reward is now claimable onchain."
      );
    } catch (error) {
      console.error(
        "Onchain forecast resolution failed:",
        error
      );

      setTransactionMessage(
        getTransactionError(error)
      );
    } finally {
      setIsConfirmingTransaction(false);
    }
  }

  async function claimRewardOnchain(): Promise<void> {
    if (!forecastId) {
      setTransactionMessage(
        "This prediction does not have an onchain forecast ID."
      );
      return;
    }

    if (!publicClient) {
      setTransactionMessage(
        "Arc Testnet client is not ready."
      );
      return;
    }

    try {
      setTransactionMessage(
        "Confirm reward claim in MetaMask."
      );

      setLatestTransactionHash(null);

      const hash = await writeContractAsync({
        address:
          FORECAST_REGISTRY_V2_ADDRESS,
        abi: FORECAST_REGISTRY_V2_ABI,
        functionName: "claimReward",
        args: [BigInt(forecastId)],
        chainId: arcTestnet.id,
      });

      setLatestTransactionHash(hash);
      setIsConfirmingTransaction(true);

      setTransactionMessage(
        "Waiting for Arc Testnet claim confirmation..."
      );

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        });

      if (receipt.status !== "success") {
        throw new Error(
          "Claim transaction failed."
        );
      }

      const didUpdateBalance =
        claimRewardLocally(
          activePrediction.id,
          hash
        );

      if (!didUpdateBalance) {
        setTransactionMessage(
          "Claim confirmed, but local Arena balance could not be updated."
        );
        return;
      }

      setTransactionMessage(
        "Arena Points claimed successfully."
      );
    } catch (error) {
      console.error(
        "Onchain reward claim failed:",
        error
      );

      setTransactionMessage(
        getTransactionError(error)
      );
    } finally {
      setIsConfirmingTransaction(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d121a] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-orange-400">
            {isSettled
              ? "Prediction Settled"
              : "Your Active Prediction"}
          </p>

          <h2 className="mt-1 text-xl font-bold text-white">
            Round #{currentPrediction.roundNumber}
          </h2>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-bold ${statusStyles}`}
        >
          {statusText}
        </span>
      </div>

      <div
        className={`mt-4 rounded-2xl border p-4 ${
          currentPrediction.direction === "higher"
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-rose-500/30 bg-rose-500/10"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="text-3xl">
            {currentPrediction.direction === "higher"
              ? "📈"
              : "📉"}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Your prediction
            </p>

            <p
              className={`mt-1 text-xl font-bold ${
                currentPrediction.direction === "higher"
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {currentPrediction.direction.toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] text-gray-500">
            Timeframe
          </p>

          <p className="mt-1 text-sm font-semibold text-white">
            {formatDuration(
              currentPrediction.duration
            )}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] text-gray-500">
            Stake
          </p>

          <p className="mt-1 text-sm font-semibold text-white">
            {currentPrediction.points.toLocaleString()} points
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] text-gray-500">
            Entry Price
          </p>

          <p className="mt-1 font-mono text-xs font-semibold text-white">
            {formatPrice(entryPrice)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] text-gray-500">
            {isSettled
              ? "Final Price"
              : "Live Price"}
          </p>

          <p className="mt-1 font-mono text-xs font-semibold text-white">
            {formatPrice(displayPrice)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
          <p className="text-[10px] text-gray-500">
            Price Movement
          </p>

          <p
            className={`mt-1 font-mono text-lg font-bold ${movementStyles}`}
          >
            {formatDifference(priceDifference)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
          <p className="text-[10px] text-gray-500">
            Position Status
          </p>

          <p
            className={`mt-1 text-lg font-bold ${
              isSettled
                ? isWinner
                  ? "text-emerald-400"
                  : "text-rose-400"
                : isDirectionCurrentlyCorrect === null
                  ? "text-gray-300"
                  : isDirectionCurrentlyCorrect
                    ? "text-emerald-400"
                    : "text-rose-400"
            }`}
          >
            {isSettled
              ? isWinner
                ? "Winning Result"
                : "Losing Result"
              : isDirectionCurrentlyCorrect === null
                ? "Waiting for movement"
                : isDirectionCurrentlyCorrect
                  ? "Currently Winning"
                  : "Currently Losing"}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
          <p className="text-[10px] text-gray-500">
            {isSettled
              ? "Arena Reward"
              : "Time Remaining"}
          </p>

          <p
            className={`mt-1 text-lg font-bold ${
              isWinner
                ? "text-emerald-400"
                : "text-white"
            }`}
          >
            {isSettled
              ? isWinner
                ? `+${currentPrediction.reward.toLocaleString()} points`
                : "0 points"
              : formatTime(timeLeft)}
          </p>
        </div>
      </div>

      {isWinner && (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-400">
                Arena Reward
              </p>

              <p className="mt-1 text-xl font-black text-white">
                {currentPrediction.reward.toLocaleString()} points
              </p>

              <p className="mt-1 text-[10px] text-gray-400">
                {isClaimed
                  ? "Reward claimed successfully."
                  : isResolvedOnchain
                    ? "Reward is ready to claim onchain."
                    : "Resolve this forecast onchain before claiming."}
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1 text-[9px] font-bold ${
                isClaimed
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : isResolvedOnchain
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
              }`}
            >
              {isClaimed
                ? "✓ CLAIMED"
                : isResolvedOnchain
                  ? "CLAIMABLE"
                  : "AWAITING RESOLUTION"}
            </span>
          </div>

          {!isClaimed && !isResolvedOnchain && (
            <button
              type="button"
              onClick={() => {
                void resolveRewardOnchain();
              }}
              disabled={isOnchainBusy}
              className="mt-4 w-full rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-xs font-bold text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-wait disabled:opacity-50"
            >
              {isOnchainBusy
                ? "PROCESSING ON ARC..."
                : "RESOLVE REWARD ONCHAIN"}
            </button>
          )}

          {!isClaimed && isResolvedOnchain && (
            <button
              type="button"
              onClick={() => {
                void claimRewardOnchain();
              }}
              disabled={isOnchainBusy}
              className="mt-4 w-full rounded-xl border border-emerald-400/40 bg-emerald-500 px-4 py-3 text-xs font-black text-[#07120d] transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50"
            >
              {isOnchainBusy
                ? "PROCESSING CLAIM..."
                : `CLAIM ${currentPrediction.reward.toLocaleString()} ARENA POINTS ONCHAIN`}
            </button>
          )}
        </div>
      )}

      {transactionMessage && (
        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3">
          <p className="text-[10px] font-semibold text-blue-200">
            {transactionMessage}
          </p>

          {latestTransactionHash && (
            <div className="mt-2">
              <p className="font-mono text-[9px] text-gray-400">
                {shortenHash(
                  latestTransactionHash
                )}
              </p>

              <a
                href={`https://testnet.arcscan.app/tx/${latestTransactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-[10px] font-semibold text-blue-300 hover:text-blue-200"
              >
                View on Arc Explorer ↗
              </a>
            </div>
          )}
        </div>
      )}

      {!isSettled && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] leading-5 text-gray-500">
            The live position may change until the round
            closes. Rewards become available only after the
            final BTC price is confirmed.
          </p>
        </div>
      )}

      {isSettled && result && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-gray-300">
            Final market result:{" "}
            <span
              className={`font-bold ${
                result === "higher"
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {result.toUpperCase()}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}