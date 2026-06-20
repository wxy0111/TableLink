import { IsOptional, IsString } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';

export class CreatePaymentIntentDto extends CreatePaymentDto {}

export class MarkPaymentIntentPaidDto {
  @IsOptional()
  @IsString()
  providerTradeNo?: string;
}

export class MockPaymentWebhookDto extends MarkPaymentIntentPaidDto {
  @IsString()
  secret!: string;

  @IsString()
  paymentId!: string;
}
