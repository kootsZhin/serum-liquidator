export interface Config {
  programID: string;
  assets: Asset[];
  oracles: Oracles;
  markets: Market[];
}
export interface Asset {
  name: string;
  symbol: string;
  decimals: number;
  mintAddress: string;
}
export interface Oracles {
  pythProgramID: string;
  assets: OracleAsset[];
}
export interface OracleAsset {
  asset: string;
  priceAddress: string;
}
export interface Market {
  name: string;
  address: string;
  authority: string;
  reserves: Reserve[];
}
export interface Reserve {
  asset: string;
  address: string;
  collateralMintAddress: string;
  collateralSupplyAddress: string;
  liquidityAddress: string;
  liquidityFeeReceiverAddress: string;
}
