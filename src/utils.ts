/* eslint-disable no-loop-func */
import { Config } from 'global';
import fs from 'fs';

const marketsPath = "markets.json"
export async function getConfig(): Promise<Config> {
  const markets = JSON.parse(fs.readFileSync(marketsPath, 'utf8'));
  return markets as Config;
}

export function readSecret(secretName) {
  try {
    return fs.readFileSync(`${secretName}`, 'utf8'); // /run/secrets/
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`An error occurred while trying to read the secret: ${secretName}. Err: ${err}`);
    } else {
      console.debug(`Could not find the secret,: ${secretName}. Err: ${err}`);
    }
    return '';
  }
}