# Moola-liquidation

Moola-liquidation is a test project for writing automatic liqudations.

## Installation

Use the package manager [npm](https://www.npmjs.com/) to install all necessary modules.

```bash
npm install
```

## Deploy locally

Bring database up (you will need Docker installed)    __(important step before running project)__

```bash
npm run up
```
Create empty tables for database     __(important step before running project)__

```bash
npm run init
```

Stop database in safe mode (keep data untill next launch)

```bash
npm run down
```

Fresh database (full database restart)

```bash
npm run clear
```

## Run the automatic liquidation

Run following command from the root project directory

```bash
npm start
```

## Configure user who will be liquidate others

In the root directory of project find file called config.env and pass your values

Without the private key, automated liquidation will be turned off.

```bash
USER_ADDRESS={YOUR_ADDRESS}
USER_PRIVATE_KEY={YOUR_PRIVATE_KEY}
```