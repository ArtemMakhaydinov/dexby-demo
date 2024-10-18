import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('new/degen')
  async getNewDegen(): Promise<any> {
    return await this.appService.getNew(true);
  }

  @Get('new')
  async getNew(): Promise<any> {
    return await this.appService.getNew(false);
  }

  @Get('growing/degen')
  async getGrowingDegen(): Promise<any> {
    return await this.appService.getGrowing(true);
  }

  @Get('growing')
  async getGrowing(): Promise<any> {
    return await this.appService.getGrowing(false);
  }

  @Get('popular/degen')
  async getPopularDegen(): Promise<any> {
    return await this.appService.getPopular(true);
  }

  @Get('popular')
  async getPopular(): Promise<any> {
    return await this.appService.getPopular(false);
  }

  @Get('best')
  async getBest(): Promise<any> {
    return await this.appService.getBest();
  }
}
