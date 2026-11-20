import 'server-only'
import {
  FieldValue,
  Timestamp,
  type DocumentData,
} from 'firebase-admin/firestore'

import type {
  Loan,
  LoanDirection,
  LoanInstallment,
  LoanInstallmentStatus,
  LoanInterestModel,
  LoanPayment,
  LoanPaymentStatus,
  LoanStatus,
} from '@/features/loans/domain/loan.entity'
import type {
  CreateLoanData,
  ILoanRepository,
  UpdateLoanData,
} from '@/features/loans/domain/loan.repository'
import { getAdminDb } from '@/lib/firebase-admin'

const LOANS_COLLECTION = 'loans'

function toIsoDateString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string') {
    return value
  }

  return new Date().toISOString()
}

function mapRawInstallments(raw: unknown): LoanInstallment[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item, index) => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      installmentNumber: Number(record.installmentNumber ?? index + 1),
      dueDate: String(record.dueDate ?? ''),
      principalDue: Number(record.principalDue ?? 0),
      interestDue: Number(record.interestDue ?? 0),
      lateFeeDue: Number(record.lateFeeDue ?? 0),
      paidAmount: Number(record.paidAmount ?? 0),
      status: (record.status as LoanInstallmentStatus) ?? 'PENDING',
    }
  })
}

function mapRawPayments(raw: unknown): LoanPayment[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item, index) => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      id: String(record.id ?? `pay_${index + 1}`),
      amount: Number(record.amount ?? 0),
      principalApplied: Number(record.principalApplied ?? 0),
      interestApplied: Number(record.interestApplied ?? 0),
      lateFeeApplied: Number(record.lateFeeApplied ?? 0),
      paidAt: toIsoDateString(record.paidAt),
      receiptPath:
        typeof record.receiptPath === 'string' && record.receiptPath
          ? record.receiptPath
          : null,
      notes:
        typeof record.notes === 'string' && record.notes ? record.notes : null,
      status:
        record.status === 'VOIDED'
          ? ('VOIDED' as LoanPaymentStatus)
          : ('APPLIED' as LoanPaymentStatus),
      voidedAt: record.voidedAt ? toIsoDateString(record.voidedAt) : null,
      voidReason:
        typeof record.voidReason === 'string' && record.voidReason
          ? record.voidReason
          : null,
    }
  })
}

function mapDocToLoan(id: string, data: DocumentData): Loan {
  return {
    id,
    userId: String(data.userId ?? ''),
    contactId: String(data.contactId ?? ''),
    direction: (data.direction as LoanDirection) ?? 'LENT',
    principalAmount: Number(data.principalAmount ?? 0),
    interestRate: Number(data.interestRate ?? 0),
    interestModel: (data.interestModel as LoanInterestModel) ?? 'NO_INTEREST',
    totalPrincipalDue: Number(data.totalPrincipalDue ?? 0),
    totalInterestDue: Number(data.totalInterestDue ?? 0),
    paidPrincipal: Number(data.paidPrincipal ?? 0),
    paidInterest: Number(data.paidInterest ?? 0),
    installments: mapRawInstallments(data.installments),
    payments: mapRawPayments(data.payments),
    disbursementDate: String(data.disbursementDate ?? ''),
    disbursementReceiptPath:
      typeof data.disbursementReceiptPath === 'string' &&
      data.disbursementReceiptPath
        ? data.disbursementReceiptPath
        : null,
    monthlyBillingDay:
      typeof data.monthlyBillingDay === 'number' &&
      Number.isInteger(data.monthlyBillingDay)
        ? data.monthlyBillingDay
        : null,
    nextInterestDueDate:
      typeof data.nextInterestDueDate === 'string' && data.nextInterestDueDate
        ? data.nextInterestDueDate
        : null,
    status: (data.status as LoanStatus) ?? 'ACTIVE',
    parentLoanId:
      typeof data.parentLoanId === 'string' && data.parentLoanId
        ? data.parentLoanId
        : null,
    notes: typeof data.notes === 'string' && data.notes ? data.notes : null,
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt ?? data.createdAt),
  }
}

export class FirestoreLoanRepository implements ILoanRepository {
  async findByUserId(userId: string): Promise<Loan[]> {
    const snapshot = await getAdminDb()
      .collection(LOANS_COLLECTION)
      .where('userId', '==', userId)
      .get()

    return snapshot.docs
      .map((doc) => mapDocToLoan(doc.id, doc.data()))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  async findById(loanId: string, userId: string): Promise<Loan | null> {
    const doc = await getAdminDb()
      .collection(LOANS_COLLECTION)
      .doc(loanId)
      .get()

    if (!doc.exists) {
      return null
    }

    const data = doc.data()
    if (!data || data.userId !== userId) {
      return null
    }

    return mapDocToLoan(doc.id, data)
  }

  async findByContactId(userId: string, contactId: string): Promise<Loan[]> {
    const snapshot = await getAdminDb()
      .collection(LOANS_COLLECTION)
      .where('userId', '==', userId)
      .where('contactId', '==', contactId)
      .get()

    return snapshot.docs
      .map((doc) => mapDocToLoan(doc.id, doc.data()))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  async create(data: CreateLoanData): Promise<Loan> {
    const docRef = getAdminDb().collection(LOANS_COLLECTION).doc()
    const nowIso = new Date().toISOString()

    const payload: Record<string, unknown> = {
      userId: data.userId,
      contactId: data.contactId,
      direction: data.direction,
      principalAmount: data.principalAmount,
      interestRate: data.interestRate,
      interestModel: data.interestModel,
      totalPrincipalDue: data.totalPrincipalDue,
      totalInterestDue: data.totalInterestDue,
      paidPrincipal: data.paidPrincipal,
      paidInterest: data.paidInterest,
      installments: data.installments,
      payments: data.payments,
      disbursementDate: data.disbursementDate,
      disbursementReceiptPath: data.disbursementReceiptPath,
      monthlyBillingDay: data.monthlyBillingDay,
      nextInterestDueDate: data.nextInterestDueDate,
      status: data.status,
      parentLoanId: data.parentLoanId,
      notes: data.notes,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await docRef.set(payload)

    return {
      id: docRef.id,
      ...data,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  }

  async update(
    loanId: string,
    userId: string,
    data: UpdateLoanData
  ): Promise<Loan> {
    const existing = await this.findById(loanId, userId)
    if (!existing) {
      throw new Error('Loan not found or access denied')
    }

    const nowIso = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (data.totalPrincipalDue !== undefined) {
      updatePayload.totalPrincipalDue = data.totalPrincipalDue
    }
    if (data.totalInterestDue !== undefined) {
      updatePayload.totalInterestDue = data.totalInterestDue
    }
    if (data.paidPrincipal !== undefined) {
      updatePayload.paidPrincipal = data.paidPrincipal
    }
    if (data.paidInterest !== undefined) {
      updatePayload.paidInterest = data.paidInterest
    }
    if (data.installments !== undefined) {
      updatePayload.installments = data.installments
    }
    if (data.payments !== undefined) {
      updatePayload.payments = data.payments
    }
    if (data.disbursementReceiptPath !== undefined) {
      updatePayload.disbursementReceiptPath = data.disbursementReceiptPath
    }
    if (data.monthlyBillingDay !== undefined) {
      updatePayload.monthlyBillingDay = data.monthlyBillingDay
    }
    if (data.nextInterestDueDate !== undefined) {
      updatePayload.nextInterestDueDate = data.nextInterestDueDate
    }
    if (data.status !== undefined) {
      updatePayload.status = data.status
    }
    if (data.notes !== undefined) {
      updatePayload.notes = data.notes
    }

    await getAdminDb()
      .collection(LOANS_COLLECTION)
      .doc(loanId)
      .update(updatePayload)

    return {
      ...existing,
      totalPrincipalDue:
        data.totalPrincipalDue !== undefined
          ? data.totalPrincipalDue
          : existing.totalPrincipalDue,
      totalInterestDue:
        data.totalInterestDue !== undefined
          ? data.totalInterestDue
          : existing.totalInterestDue,
      paidPrincipal:
        data.paidPrincipal !== undefined
          ? data.paidPrincipal
          : existing.paidPrincipal,
      paidInterest:
        data.paidInterest !== undefined
          ? data.paidInterest
          : existing.paidInterest,
      installments:
        data.installments !== undefined
          ? data.installments
          : existing.installments,
      payments: data.payments !== undefined ? data.payments : existing.payments,
      disbursementReceiptPath:
        data.disbursementReceiptPath !== undefined
          ? data.disbursementReceiptPath
          : existing.disbursementReceiptPath,
      monthlyBillingDay:
        data.monthlyBillingDay !== undefined
          ? data.monthlyBillingDay
          : existing.monthlyBillingDay,
      nextInterestDueDate:
        data.nextInterestDueDate !== undefined
          ? data.nextInterestDueDate
          : existing.nextInterestDueDate,
      status: data.status !== undefined ? data.status : existing.status,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updatedAt: nowIso,
    }
  }
}

export const firestoreLoanRepository = new FirestoreLoanRepository()
