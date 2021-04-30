import { wadToLamports } from '@oyster/common';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import * as BufferLayout from 'buffer-layout';
import * as Layout from '../../utils/layout';
import { LastUpdate } from './lastUpdate';

export const ReserveLayout: typeof BufferLayout.Structure = BufferLayout.struct(
  [
    BufferLayout.u8('version'),

    BufferLayout.struct(
      [Layout.uint64('slot'), BufferLayout.u8('stale')],
      'lastUpdate',
    ),

    Layout.publicKey('lendingMarket'),

    BufferLayout.struct(
      [
        Layout.publicKey('mintPubkey'),
        BufferLayout.u8('mintDecimals'),
        Layout.publicKey('supplyPubkey'),
        Layout.publicKey('feeReceiver'),
        // @FIXME: oracle option
        // TODO: replace u32 option with generic equivalent
        BufferLayout.u32('oracleOption'),
        Layout.publicKey('oracle'),
        Layout.uint64('availableAmount'),
        Layout.uint128('borrowedAmountWads'),
        Layout.uint128('cumulativeBorrowRateWads'),
        Layout.uint64('marketPrice'),
      ],
      'liquidity',
    ),

    BufferLayout.struct(
      [
        Layout.publicKey('mintPubkey'),
        Layout.uint64('mintTotalSupply'),
        Layout.publicKey('supplyPubkey'),
      ],
      'collateral',
    ),

    BufferLayout.struct(
      [
        BufferLayout.u8('optimalUtilizationRate'),
        BufferLayout.u8('loanToValueRatio'),
        BufferLayout.u8('liquidationBonus'),
        BufferLayout.u8('liquidationThreshold'),
        BufferLayout.u8('minBorrowRate'),
        BufferLayout.u8('optimalBorrowRate'),
        BufferLayout.u8('maxBorrowRate'),
        BufferLayout.struct(
          [Layout.uint64('borrowFeeWad'), BufferLayout.u8('hostFeePercentage')],
          'fees',
        ),
      ],
      'config',
    ),

    BufferLayout.blob(256, 'padding'),
  ],
);

export const isReserve = (info: AccountInfo<Buffer>) => {
  return info.data.length === ReserveLayout.span;
};

export interface Reserve {
  version: number;
  lastUpdate: LastUpdate;
  lendingMarket: PublicKey;
  liquidity: ReserveLiquidity;
  collateral: ReserveCollateral;
  config: ReserveConfig;
}

export interface ReserveLiquidity {
  mintPubkey: PublicKey;
  mintDecimals: number;
  supplyPubkey: PublicKey;
  feeReceiver: PublicKey;
  // @FIXME: oracle option
  oracleOption: number;
  oraclePubkey: PublicKey;
  availableAmount: BN;
  borrowedAmountWads: BN;
  cumulativeBorrowRateWads: BN;
  marketPrice: BN;
}

export interface ReserveCollateral {
  mintPubkey: PublicKey;
  mintTotalSupply: BN;
  supplyPubkey: PublicKey;
}

export interface ReserveConfig {
  optimalUtilizationRate: number;
  loanToValueRatio: number;
  liquidationBonus: number;
  liquidationThreshold: number;
  minBorrowRate: number;
  optimalBorrowRate: number;
  maxBorrowRate: number;
  fees: {
    borrowFeeWad: BN;
    hostFeePercentage: number;
  };
}

export const ReserveParser = (pubkey: PublicKey, info: AccountInfo<Buffer>) => {
  const buffer = Buffer.from(info.data);
  const reserve = ReserveLayout.decode(buffer) as Reserve;

  if (reserve.lastUpdate.slot.isZero()) {
    return;
  }

  const details = {
    pubkey,
    account: {
      ...info,
    },
    info: reserve,
  };

  return details;
};

export const calculateUtilizationRatio = (reserve: Reserve) => {
  // @FIXME: use BigNumber
  const totalBorrows = wadToLamports(
    reserve.liquidity.borrowedAmountWads,
  ).toNumber();
  const currentUtilization =
    totalBorrows /
    (reserve.liquidity.availableAmount.toNumber() + totalBorrows);

  return currentUtilization;
};

export const reserveMarketCap = (reserve?: Reserve) => {
  // @FIXME: use BigNumber
  const available = reserve?.liquidity.availableAmount.toNumber() || 0;
  const borrowed = wadToLamports(
    reserve?.liquidity.borrowedAmountWads,
  ).toNumber();
  const total = available + borrowed;

  return total;
};

export const collateralExchangeRate = (reserve?: Reserve) => {
  // @FIXME: use BigNumber
  return (
    (reserve?.collateral.mintTotalSupply.toNumber() || 1) /
    reserveMarketCap(reserve)
  );
};

export const collateralToLiquidity = (
  collateralAmount: BN | number,
  reserve?: Reserve,
) => {
  // @FIXME: use BigNumber
  const amount =
    typeof collateralAmount === 'number'
      ? collateralAmount
      : collateralAmount.toNumber();
  return Math.floor(amount / collateralExchangeRate(reserve));
};

export const liquidityToCollateral = (
  liquidityAmount: BN | number,
  reserve?: Reserve,
) => {
  // @FIXME: use BigNumber
  const amount =
    typeof liquidityAmount === 'number'
      ? liquidityAmount
      : liquidityAmount.toNumber();
  return Math.floor(amount * collateralExchangeRate(reserve));
};