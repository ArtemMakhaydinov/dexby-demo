import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

@Injectable()
export class GoogleSheetsService {
  doc: GoogleSpreadsheet;

  constructor(private readonly configService: ConfigService) {
    this.doc = null;
  }

  async handleDto(title: string, dtos: any): Promise<void> {
    if (!this.doc) await this.initDoc();
    const headerValues = Array.isArray(dtos)
      ? Object.keys(dtos[0])
      : Object.keys(dtos);
    const sheet =
      this.doc.sheetsByTitle[title] ||
      (await this.doc.addSheet({
        title,
        headerValues,
      }));
    if (!Array.isArray(dtos)) {
      await sheet.addRow(dtos);
      return;
    }

    let counter = 0;
    for (const dto of dtos) {
      await sheet.addRow(dto);
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });

      console.log(`Storing ${title} record in google sheet ${++counter}`);
    }
  }

  async initDoc(): Promise<void> {
    const serviceAccountAuth = new JWT({
      email: this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      key: this.configService.get<string>('GOOGLE_PRIVATE_KEY'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.doc = new GoogleSpreadsheet(
      this.configService.get<string>('GOOGLE_SHEET_ID'),
      serviceAccountAuth,
    );

    await this.doc.loadInfo();
  }
}
