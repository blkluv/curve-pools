import { getEnv } from './env';
import { Etherscan } from './etherscan';

// TODO: figure out way to reduce duplication (getEnv causes error for browser)
export const explorers = {
  ethereum: {
    mainnet: new Etherscan({
      baseURL: 'https://etherscan.io',
      apiURL: 'https://api.etherscan.io',
      apiKey: getEnv('ETHERSCAN_API_KEY'),
    }),
    goerli: new Etherscan({
      baseURL: 'https://goerli.etherscan.io',
      apiURL: 'https://api-goerli.etherscan.io',
      apiKey: getEnv('ETHERSCAN_API_KEY'),
    }),
  },
  arbitrum: {
    mainnet: new Etherscan({
      baseURL: 'https://arbiscan.io',
      apiURL: 'https://api.arbiscan.io',
      apiKey: getEnv('ETHERSCAN_ARBITRUM_API_KEY'),
    }),
  },
  optimism: {
    mainnet: new Etherscan({
      baseURL: 'https://optimistic.etherscan.io',
      apiURL: 'https://api-optimistic.etherscan.io',
      apiKey: getEnv('ETHERSCAN_OPTIMISM_API_KEY'),
    }),
  },
  polygon: {
    mainnet: new Etherscan({
      baseURL: 'https://polygonscan.com',
      apiURL: 'https://api.polygonscan.com',
      apiKey: getEnv('ETHERSCAN_POLYGON_API_KEY'),
    }),
  },
  fantom: {
    mainnet: new Etherscan({
      baseURL: 'https://ftmscan.com',
      apiURL: 'https://api.ftmscan.com',
      apiKey: getEnv('ETHERSCAN_FANTOM_API_KEY'),
    }),
  },
  avalanche: {
    mainnet: new Etherscan({
      baseURL: 'https://snowtrace.io',
      apiURL: 'https://api.snowtrace.io',
      apiKey: getEnv('ETHERSCAN_AVALANCHE_API_KEY'),
    }),
  },
};
