// Console logs all information about current user

// utils
const {
  configureLending,
  configureReserve,
} = require("../utils/lendingPoolConfig");
const { retry } = require("../utils/functions");
const { getUserReserved, getUserData } = require("../utils/actions");

// Execute from terminal
async function execute(...params) {
  const { lendingPool } = await configureLending(...params);

  const { reserveCusd, reserveCelo } = await configureReserve();
  //   Actual User Data
  const userData = await getUserData(params[0], lendingPool);
  const userReservedData = await getUserReserved(params[0], lendingPool, null, {
    reserveCelo,
    reserveCusd,
  });
  console.log(
    "______________________________User info______________________________"
  );
  console.table(userData);
  console.log(
    "______________________________User reserved Data______________________________"
  );
  console.table(userReservedData);
}

execute(...process.argv.slice(2).map((arg) => arg.toLowerCase()));
