export interface OnrampParams {
  walletAddress: string;
  chainId: number;
  chainName: string;
  asset: string;
  fiatAmount: number;
  fiatCurrency: string;
}

export interface OnrampResult {
  url: string;
  sessionToken?: string;
}

export interface OnrampProvider {
  generateOnrampUrl(params: OnrampParams): Promise<OnrampResult>;
}
