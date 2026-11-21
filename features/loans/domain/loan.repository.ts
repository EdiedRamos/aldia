import type {
  Loan,
  LoanDirection,
  LoanInstallment,
  LoanInterestModel,
  LoanPayment,
  LoanStatus,
} from '@/features/loans/domain/loan.entity'

export interface CreateLoanData {
  userId: string
  contactId: string
  direction: LoanDirection
  principalAmount: number
  interestRate: number
  interestModel: LoanInterestModel
  totalPrincipalDue: number
  totalInterestDue: number
  paidPrincipal: number
  paidInterest: number
  installments: LoanInstallment[]
  payments: LoanPayment[]
  disbursementDate: string
  disbursementReceiptPath: string | null
  monthlyBillingDay: number | null
  nextInterestDueDate: string | null
  status: LoanStatus
  parentLoanId: string | null
  notes: string | null
}

export interface UpdateLoanData {
  totalPrincipalDue?: number
  totalInterestDue?: number
  paidPrincipal?: number
  paidInterest?: number
  installments?: LoanInstallment[]
  payments?: LoanPayment[]
  disbursementReceiptPath?: string | null
  monthlyBillingDay?: number | null
  nextInterestDueDate?: string | null
  status?: LoanStatus
  notes?: string | null
}

export interface ILoanRepository {
  findByUserId(userId: string): Promise<Loan[]>
  findById(loanId: string, userId: string): Promise<Loan | null>
  findByContactId(userId: string, contactId: string): Promise<Loan[]>
  create(data: CreateLoanData): Promise<Loan>
  update(loanId: string, userId: string, data: UpdateLoanData): Promise<Loan>
}

export interface UploadLoanReceiptParams {
  userId: string
  loanId: string
  filePrefix: string
  buffer: Buffer
  contentType: string
  extension: string
}

export interface UploadedLoanReceiptResult {
  receiptPath: string
}

export interface ILoanReceiptStorage {
  uploadReceipt(
    params: UploadLoanReceiptParams
  ): Promise<UploadedLoanReceiptResult>
  getReceiptReadUrl(
    receiptPath: string,
    expiresInSeconds?: number
  ): Promise<string>
  deleteReceipt(receiptPath: string): Promise<void>
}
