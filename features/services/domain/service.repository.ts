import type {
  Service,
  ServicePayment,
  ServiceStatus,
} from '@/features/services/domain/service.entity'

export interface CreateServiceData {
  userId: string
  name: string
  billingDay: number
  startPeriod: string
  paymentUrl?: string
  referenceCode?: string
  status: ServiceStatus
}

export interface UpdateServiceData {
  name?: string
  billingDay?: number
  startPeriod?: string
  paymentUrl?: string
  referenceCode?: string
  status?: ServiceStatus
}

export interface IServiceRepository {
  findByUserId(userId: string): Promise<Service[]>
  findPaymentsByUserId(userId: string): Promise<ServicePayment[]>
  findById(serviceId: string, userId: string): Promise<Service | null>
  create(serviceData: CreateServiceData): Promise<Service>
  update(
    serviceId: string,
    userId: string,
    data: UpdateServiceData
  ): Promise<Service>
  savePayments(payments: ServicePayment[]): Promise<void>
}

export interface UploadReceiptParams {
  userId: string
  serviceId: string
  period: string
  buffer: Buffer
  contentType: string
  extension: string
}

export interface UploadedReceiptResult {
  receiptUrl: string
  receiptPath: string
}

export interface IReceiptStorage {
  uploadReceipt(params: UploadReceiptParams): Promise<UploadedReceiptResult>
  getReceiptReadUrl(
    receiptPath: string,
    expiresInSeconds?: number
  ): Promise<string>
  deleteReceipt(receiptPath: string): Promise<void>
}
