import { IsIn } from 'class-validator';

export class ListWalkRequestsDto {
  @IsIn(['received', 'sent'])
  box: 'received' | 'sent';
}
