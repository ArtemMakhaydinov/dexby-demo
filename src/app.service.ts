import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleSheetsService } from './google-sheets/google-sheets.service';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly googleSheetService: GoogleSheetsService,
  ) {}

  async getNew(degen: boolean) {
    const tokenList = await this.getBeTokenList(degen);
    console.log('Token list', tokenList.length);
    const creationInfo = await this.getBeTokenCreationInfo(tokenList, '>=');
    console.log('Creation info', creationInfo.length);
    const tradeData = await this.getBeTokenTradeData(creationInfo, degen);
    console.log('Trade data', tradeData.length);
    tradeData.sort((a, b) => b.createdAtUnix - a.createdAtUnix);
    await this.googleSheetService.handleDto(
      `New tokens${degen ? ' degen' : ''}`,
      tradeData,
    );
    return tradeData;
  }

  async getGrowing(degen: boolean) {
    const tokenList = await this.getBeTokenList(degen);
    console.log('Token list', tokenList.length);
    const creationInfo = await this.getBeTokenCreationInfo(tokenList, '<');
    console.log('Creation info', creationInfo.length);
    const tradeData = await this.getBeTokenTradeData(creationInfo, degen);
    console.log('Trade data', tradeData.length);
    tradeData.sort((a, b) => {
      return b.priceUsd24hChangePercent - a.priceUsd24hChangePercent;
    });
    await this.googleSheetService.handleDto(
      `Growing tokens${degen ? ' degen' : ''}`,
      tradeData.slice(0, 100),
    );
    return tradeData;
  }

  async getBest() {
    const tokenList = await this.getBeTokenList(false);
    console.log('Token list', tokenList.length);
    const tradeData = await this.getBeTokenTradeData(tokenList);
    console.log('Trade data', tradeData.length);
    const filtered = tradeData
      .filter((t) => t?.holders >= 1e4)
      .sort((a, b) => b.mCap - a.mCap);
    console.log('Filtered by holders', filtered.length);
    await this.googleSheetService.handleDto(
      'Best tokens',
      filtered.slice(0, 100),
    );

    return filtered;
  }

  async getPopular(degen: boolean) {
    const tokenList = await this.getBeTokenList(degen);
    console.log('Token list', tokenList.length);
    const tradeData = await this.getBeTokenTradeData(tokenList, degen);
    console.log('Trade data', tradeData.length);
    const scored = tradeData
      .map((t) => {
        const liqScore = degen ? t.liquidity / 1e4 : 0; //@@@
        return {
          ...t,
          pScore:
            t.volUsdChangePersent24h * 3 +
            t.makers24hChangePersent * 2 +
            t.makers24hChangePersent +
            liqScore,
        };
      })
      .sort((a, b) => b.pScore - a.pScore);
    console.log('Filtered by score', scored.length);
    await this.googleSheetService.handleDto(
      `Popular tokens${degen ? ' degen' : ''}`,
      scored.slice(0, 100),
    );
  }

  private async getBeTokenList(degen?: boolean, limit?: number) {
    const BIRDEYE_API = this.configService.get('BIRDEYE_API');
    const result = [];
    const promises = [];
    const amount = 3;
    let total = 0;
    let page = 1;
    while (total === 0 || total > page * 50) {
      const url = `${BIRDEYE_API}/defi/tokenlist?offset=${page++ * 50}&min_liquidity=${degen ? 10000 : 100000}&sort_by=mc&sort_type=desc`;
      promises.push(this.beFetcher(url));
      if (promises.length < amount && total > page * 50) continue;

      const res = await Promise.allSettled(promises).then((result) => {
        return result.map((r) => {
          if (r.status === 'fulfilled') return r.value;
          console.log('Token list promise rejected');
          return null;
        });
      });

      promises.length = 0;

      for (const batch of res) {
        if (total === 0) {
          total = batch?.total;
          console.log('Total', total);
        }

        for (const token of batch?.tokens) {
          if (degen && token.liquidity > 1e5) continue;
          if (token.lastTradeUnixTime < Date.now() / 1000 - 86_400) continue;

          const dto = {
            name: token.name,
            symbol: token.symbol,
            address: token.address,
            liquidity: token.liquidity,
            mCap: token.mc,
          };

          result.push(dto);
          if (result.length === limit) return result;
        }
      }
    }

    return result;
  }

  private async getBeTokenTradeData(tokens, degen?: boolean) {
    const BIRDEYE_API = this.configService.get('BIRDEYE_API');
    const result = [];
    const promises = [];
    const amount = 3;
    for (let i = 0; i < tokens.length; i += amount) {
      const tokensBatch = tokens?.slice(i, i + amount);
      tokensBatch.forEach((token) => {
        const url = `${BIRDEYE_API}/defi/v3/token/trade-data/single?address=${token.address}`;
        promises.push(this.beFetcher(url));
      });

      const res = await Promise.allSettled(promises).then((result) => {
        return result.map((r) => {
          if (r.status === 'fulfilled') return r.value;
          console.log('Trade info info promise rejected');
          return null;
        });
      });

      promises.length = 0;
      tokensBatch.forEach((token, i) => {
        if (!res?.[i]) {
          console.log(
            'NO TRADE DATA',
            token.name,
            token.symbol,
            token.address,
            res?.[i],
          );
          return;
        }

        if (degen && res?.[i]?.holder < 50) return;
        if (degen && res?.[i]?.unique_wallet_24h < 100) return;

        const dto = {
          ...token,
          holders: res[i].holder,
          makers24h: res[i].unique_wallet_24h,
          makers24hChangePersent: res[i].unique_wallet_24h_change_percent,
          priceUsd: res[i].price,
          priceUsd1h: res[i].history_1h_price,
          priceUsd1hChangePercent: res[i].price_change_1h_percent,
          priceUsd24h: res[i].history_24h_price,
          priceUsd24hChangePercent: res[i].price_change_24h_percent,
          volUsd24h: res[i].volume_24h_usd,
          volUsdChangePersent24h: res[i].volume_24h_change_percent,
        };

        result.push(dto);
      });
    }

    return result;
  }

  private async getBeTokenCreationInfo(tokens, operator) {
    const dayAgo = Date.now() - 8.64e7;
    const BIRDEYE_API = this.configService.get('BIRDEYE_API');
    const result = [];
    const promises = [];
    const amount = 3;
    for (let i = 0; i < tokens?.length; i += amount) {
      const tokensBatch = tokens?.slice(i, i + amount);
      tokensBatch.forEach((token) => {
        const url = `${BIRDEYE_API}/defi/token_creation_info?address=${token?.address}`;
        promises.push(this.beFetcher(url));
      });

      const res = await Promise.allSettled(promises).then((result) => {
        return result.map((r) => {
          if (r.status === 'fulfilled') return r.value;
          console.log('Creation info promise rejected');
          return null;
        });
      });

      promises.length = 0;
      tokensBatch.forEach((token, i) => {
        if (!res?.[i]) return;

        if (
          (operator === '>=' && res?.[i].blockUnixTime * 1000 >= dayAgo) ||
          (operator === '<' && res?.[i].blockUnixTime * 1000 < dayAgo)
        ) {
          const dto = {
            ...token,
            createdAtText: res[i].blockHumanTime,
            createdAtUnix: res[i].blockUnixTime,
          };

          result.push(dto);
        }
      });
    }

    return result;
  }

  private async getStPrice(tokens) {
    const SOLANA_TRACKER_API = this.configService.get('SOLANA_TRACKER_API');
    const result = [];
    const promises = [];
    const amount = 3;
    for (let i = 0; i < tokens.length; i += amount) {
      const tokensBatch = tokens?.slice(i, i + amount);
      tokensBatch.forEach((token) => {
        const url = `${SOLANA_TRACKER_API}/price?token=${token.address}`;
        promises.push(this.stFetcher(url));
      });

      const res = await Promise.allSettled(promises).then((result) => {
        return result.map((r) => {
          if (r.status === 'fulfilled') return r.value;
          console.log('Sp price promise rejected');
          return null;
        });
      });

      promises.length = 0;
      tokensBatch.forEach((token, idx) => {
        const tokenPrice = res?.[idx];
        if (!tokenPrice) return;

        const dto = {
          ...token,
          mCap: tokenPrice?.marketCap,
          liquidity: tokenPrice?.liquidity,
          updatedAt: new Date(tokenPrice?.lastUpdated),
        };

        result.push(dto);
      });
    }

    return result;
  }

  private async stFetcher(url: string) {
    const SOLANA_TRACKER_KEY = this.configService.get('SOLANA_TRACKER_KEY');
    const res = await axios({
      url,
      method: 'GET',
      headers: {
        'x-api-key': SOLANA_TRACKER_KEY,
        accept: 'application/json',
      },
    });

    return res.data;
  }

  private async beFetcher(url: string) {
    const BIRDEYE_KEY = this.configService.get('BIRDEYE_KEY');
    const res = await axios({
      url,
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': BIRDEYE_KEY,
        'x-chain': 'solana',
      },
    });

    return res.data.data;
  }
}
