/**
 * Makes a key for the hot wallet, which mints receipts as CashTokens and pays partners' commissions:
 *   npm run new-hot-wallet
 * Put the line it prints in .env, send the address a little Bitcoin Cash (0.001 BCH is plenty to start: each
 * receipt costs about 0.000015 BCH, and commissions paid from it need what they pay), and keep a copy of the key
 * somewhere safe: it can be imported into Electron Cash or Cashonize. Keep only a little in it.
 */
import { keyWallet, newWalletKey } from "../src/bch-engine/bch.js";

const wif = newWalletKey();
const w = keyWallet(wif);
console.log(`BCH_HOT_WALLET_WIF=${wif}\n`);
console.log(`Its address (send it a little BCH): ${w.address}`);
