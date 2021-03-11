// utils
const { print } = require("../utils/lendingPoolConfig");
const { retry } = require("../utils/functions");
const BigNumber = require("bignumber.js");

// get user account data
exports.getUserData = async function (
  user,
  lendingPool,
  lendingPoolDataProvider
) {
  try {
    data = await retry(() =>
      lendingPool.methods.getUserAccountData(user).call()
    );
  } catch (err) {
    data = await retry(() =>
      lendingPoolDataProvider.methods.calculateUserGlobalData(user).call()
    );
    data.availableBorrowsETH = 0;
  }

  const parsedData = {
    TotalLiquidity: print(data.totalLiquidityETH || data.totalLiquidityBalanceETH),
    TotalCollateral: print(data.totalCollateralETH || data.totalCollateralBalanceETH),
    TotalBorrow: print(data.totalBorrowsETH || data.totalBorrowBalanceETH),
    TotalFees: print(data.totalFeesETH),
    AvailableBorrow: print(data.availableBorrowsETH),
    LiquidationThreshold: `${data.currentLiquidationThreshold}%`,
    LoanToValue: `${data.ltv || data.currentLtv}%`,
    healthFactor: print(data.healthFactor),
  };

  return parsedData;
};

// Get user reserved data
exports.getUserReserved = async function (
  user,
  lendingPool,
  currency
) {
  const { reserveCusd, reserveCelo } = currency;
  const dataCelo = await retry(() =>
    lendingPool.methods.getUserReserveData(reserveCelo, user).call()
  );

  const dataCusd = await retry(() =>
    lendingPool.methods.getUserReserveData(reserveCusd, user).call()
  );

  const parsedDataCelo = {
    DepositedCelo: print(dataCelo.currentATokenBalance),
    BorrowedCelo: print(dataCelo.principalBorrowBalance),
    DebtCelo: print(dataCelo.currentBorrowBalance),
    // IsCollateral: dataCelo.usageAsCollateralEnabled,
  };

  const parsedDataCusd = {
    DepositedCusd: print(dataCusd.currentATokenBalance),
    BorrowedCusd: print(dataCusd.principalBorrowBalance),
    DebtCusd: print(dataCusd.currentBorrowBalance),
    // IsCollateral: dataCusd.usageAsCollateralEnabled,
  };
  return { ...parsedDataCelo, ...parsedDataCusd, user };
};
