import { BigNumber, ethers } from 'ethers';
import lodash from 'lodash';
import { Decimal } from 'decimal.js';
import { EtherscanTx } from './etherscan';
import { CurveAssetTypeName, CURVE_POOL_TOKEN_DECIMALS } from './curve.constants';
import { CurvePoolWithInterface } from '../../data/pools';

export enum CurveTransactionType {
  ADD_LIQUIDITY = 'add_liquidity', // can be one coin only or multiple
  REMOVE_LIQUIDITY = 'remove_liquidity', // can be one coin only or multiple
  EXCHANGE = 'exchange',
}

interface CurveTokenWithAmount {
  symbol: string;
  address: string;
  // may be unknown, need detailed tx logs
  amount?: Decimal;
  // whether this tx is adding or removing token liquidity to pool
  type: 'add' | 'remove';
}

export interface CurveTransaction {
  hash: string;
  pool: string;
  timestamp: number;
  type: CurveTransactionType;
  // Total is unknown for tricrypto or similar pools with different types of
  // assets (TODO)
  totalAmount?: Decimal;
  // Input or output tokens
  tokens: Array<CurveTokenWithAmount>;
}

interface ParseTransactionProps {
  pool: CurvePoolWithInterface;
  tx: EtherscanTx;
}
interface ParseTransactionAPI {
  decodedInput: ethers.utils.TransactionDescription | void;
  transaction: CurveTransaction | void;
}
export const parseTransaction = ({ pool, tx }: ParseTransactionProps): ParseTransactionAPI => {
  if (tx.txreceipt_status !== '1' || tx.isError === '1') {
    // Sometimes failed / reverted tx cannot be decoded/parsed correctly
    return { decodedInput: undefined, transaction: undefined };
  }
  if (!tx.to) {
    // `to` is empty on deploy contract call
    return { decodedInput: undefined, transaction: undefined };
  }
  let decodedInput;
  try {
    decodedInput = pool.interface.parseTransaction({ data: tx.input, value: tx.value });
  } catch (e) {
    if ((e as any).code === 'INVALID_ARGUMENT') {
      return { decodedInput: undefined, transaction: undefined };
    }
    throw e;
  }
  let transaction;
  if (decodedInput.name.startsWith('remove_liquidity')) {
    transaction = parseRemoveLiquidity({ tx, pool, decodedInput });
  } else if (decodedInput.name.startsWith('add_liquidity')) {
    transaction = parseAddLiquidity({ tx, pool, decodedInput });
  } else if (decodedInput.name.startsWith('exchange')) {
    transaction = parseExchange({ tx, pool, decodedInput });
  }

  return { decodedInput, transaction };
};

interface ParseRemoveLiquidityProps {
  tx: EtherscanTx;
  pool: CurvePoolWithInterface;
  decodedInput: ethers.utils.TransactionDescription;
}
const parseRemoveLiquidity = ({
  tx,
  pool,
  decodedInput,
}: ParseRemoveLiquidityProps): CurveTransaction | void => {
  let totalAmount: Decimal;
  let tokens: Array<CurveTokenWithAmount>;

  if (decodedInput.name === 'remove_liquidity_imbalance') {
    const rawAmounts: Array<BigNumber> = decodedInput.args._amounts ?? decodedInput.args.amounts;
    totalAmount = new Decimal(0);
    tokens = lodash.compact(
      rawAmounts.map((rawAmount, i) => {
        if (rawAmount.isZero()) {
          // Ignore zero values:
          return;
        }
        const coin = pool.coins[i];
        const decimals = Number(coin.decimals);
        const amount = new Decimal(ethers.utils.formatUnits(rawAmount, decimals));
        totalAmount = totalAmount.add(amount);
        return {
          symbol: coin.symbol,
          address: coin.address,
          amount,
          type: 'remove',
        };
      }),
    );
  } else if (decodedInput.name === 'remove_liquidity_one_coin') {
    const rawAmount =
      decodedInput.args._token_amount ??
      decodedInput.args.token_amount ??
      decodedInput.args._burn_amount;
    const coin = pool.coins[decodedInput.args.i];
    totalAmount = new Decimal(ethers.utils.formatUnits(rawAmount, CURVE_POOL_TOKEN_DECIMALS));
    tokens = [
      {
        // Output amount of this token unknown without better logs of tx
        symbol: coin.symbol,
        address: coin.address,
        type: 'remove',
      },
    ];
  } else if (decodedInput.name === 'remove_liquidity') {
    const rawAmount = decodedInput.args._amount ?? decodedInput.args._burn_amount;
    totalAmount = new Decimal(ethers.utils.formatUnits(rawAmount, CURVE_POOL_TOKEN_DECIMALS));
    // all coins removed in amounts that map to current pool balance/weighting
    tokens = pool.coins.map((coin) => {
      return {
        symbol: coin.symbol,
        address: coin.address,
        type: 'remove',
      };
    });
  } else {
    console.warn('[parseRemoveLiquidity] Unknown transaction type: ', decodedInput.name);
    return;
  }

  return {
    hash: tx.hash,
    pool: pool.address,
    timestamp: Number(tx.timeStamp),
    type: CurveTransactionType.REMOVE_LIQUIDITY,
    totalAmount: pool.assetTypeName !== CurveAssetTypeName.UNKNOWN ? totalAmount : undefined,
    tokens,
  };
};

interface ParseAddLiquidityProps {
  tx: EtherscanTx;
  pool: CurvePoolWithInterface;
  decodedInput: ethers.utils.TransactionDescription;
}
const parseAddLiquidity = ({
  tx,
  pool,
  decodedInput,
}: ParseAddLiquidityProps): CurveTransaction | void => {
  let totalAmount: Decimal;
  let tokens: Array<CurveTokenWithAmount>;

  if (decodedInput.name == 'add_liquidity') {
    const rawAmounts: Array<BigNumber> =
      decodedInput.args._amounts ?? decodedInput.args.amounts ?? decodedInput.args.uamounts;
    totalAmount = new Decimal(0);
    tokens = lodash.compact(
      rawAmounts.map((rawAmount, i) => {
        if (rawAmount.isZero()) {
          // Ignore zero values:
          return;
        }
        const coin = pool.coins[i];
        const decimals = Number(coin.decimals);
        const amount = new Decimal(ethers.utils.formatUnits(rawAmount, decimals));
        totalAmount = totalAmount.add(amount);
        return {
          symbol: coin.symbol,
          address: coin.address,
          amount,
          type: 'add',
        };
      }),
    );
  } else {
    console.warn('[parseAddLiquidity] Unknown transaction type: ', decodedInput.name);
    return;
  }

  return {
    hash: tx.hash,
    pool: pool.address,
    timestamp: Number(tx.timeStamp),
    type: CurveTransactionType.ADD_LIQUIDITY,
    totalAmount: pool.assetTypeName !== CurveAssetTypeName.UNKNOWN ? totalAmount : undefined,
    tokens,
  };
};

interface ParseExchangeProps {
  tx: EtherscanTx;
  pool: CurvePoolWithInterface;
  decodedInput: ethers.utils.TransactionDescription;
}
const parseExchange = ({ tx, pool, decodedInput }: ParseExchangeProps): CurveTransaction | void => {
  let totalAmount: Decimal;
  let tokens: Array<CurveTokenWithAmount>;

  // `exchange` is a standard/straightforward exchange.
  if (decodedInput.name === 'exchange') {
    const fromCoin = pool.coins[decodedInput.args.i.toNumber()];
    const toCoin = pool.coins[decodedInput.args.j.toNumber()];
    const rawAmount: BigNumber = decodedInput.args.dx ?? decodedInput.args._dx;
    totalAmount = new Decimal(ethers.utils.formatUnits(rawAmount, Number(fromCoin.decimals)));

    tokens = [
      {
        symbol: fromCoin.symbol,
        address: fromCoin.address,
        amount: totalAmount,
        type: 'add',
      },
      {
        symbol: toCoin.symbol,
        address: toCoin.address,
        // TODO: need tx logs to determine amount
        type: 'remove',
      },
    ];
  } else if (decodedInput.name === 'exchange_underlying') {
    // `exchange_underlying` exchanges the underlying token. E.g. instead of
    // aUSDC => aUSDT, exchange USDC => USDT through the Curve aToken pool
    // `i` and `j` correspond to underlying tokens, but pool data doesn't have
    // this so need another way to fetch.
    return;
  } else {
    console.warn('[parseExchange] Unknown transaction type: ', decodedInput.name);
    return;
  }

  return {
    hash: tx.hash,
    pool: pool.address,
    timestamp: Number(tx.timeStamp),
    type: CurveTransactionType.EXCHANGE,
    totalAmount: pool.assetTypeName !== CurveAssetTypeName.UNKNOWN ? totalAmount : undefined,
    tokens,
  };
};