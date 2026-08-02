export const FORECAST_REGISTRY_ADDRESS =
  "0x1B16523776b4AB47f87CE70d5bF6f7BC26FC02fe" as const;

export const FORECAST_REGISTRY_ABI = [
  {
    type: "function",
    name: "submitForecast",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "roundId",
        type: "uint256",
      },
      {
        name: "direction",
        type: "uint8",
      },
      {
        name: "duration",
        type: "uint32",
      },
      {
        name: "demoPoints",
        type: "uint256",
      },
      {
        name: "startPrice",
        type: "uint256",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasForecast",
    stateMutability: "view",
    inputs: [
      {
        name: "roundId",
        type: "uint256",
      },
      {
        name: "user",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
  },
  {
    type: "function",
    name: "totalForecasts",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "event",
    name: "ForecastSubmitted",
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "user",
        type: "address",
      },
      {
        indexed: true,
        name: "roundId",
        type: "uint256",
      },
      {
        indexed: false,
        name: "direction",
        type: "uint8",
      },
      {
        indexed: false,
        name: "duration",
        type: "uint32",
      },
      {
        indexed: false,
        name: "demoPoints",
        type: "uint256",
      },
      {
        indexed: false,
        name: "startPrice",
        type: "uint256",
      },
      {
        indexed: false,
        name: "submittedAt",
        type: "uint256",
      },
    ],
  },
] as const;